/* Scheduling: targets (plan), forecast to approval, baseline variance, predecessor links.
 *
 * A submittal's timeline is built from what has happened (actual review cycles) plus a forecast of what is left:
 *   prep → review (agency) → turnaround (us/consultant) → review … → approval
 * Remaining cycles = planned review cycles − cycles already submitted (at least the current one).
 */
(function () {
  'use strict';
  const S = {};

  const st = () => Store.state.settings;
  S.defaults = () => ({
    cycles: Math.max(1, +st().planCycles || 2),
    resub: Math.max(0, +(st().resubDays ?? 14)),
    prep: Math.max(0, +(st().prepDays ?? 14)),
    tat: Math.max(0, +(st().defaultTat ?? 21)),
  });

  /** Add a duration honoring the calendar / business-day setting. */
  S.add = (d, n) => (!d ? '' : n <= 0 ? d : st().bizDays ? U.addBizDays(d, n) : U.addDays(d, n));
  const maxD = (...ds) => ds.filter(Boolean).sort().pop() || '';
  const minD = (...ds) => ds.filter(Boolean).sort()[0] || '';
  S.maxD = maxD;
  S.minD = minD;

  S.plannedCycles = (s) => Math.max(1, +s.plannedCycles || S.defaults().cycles);
  S.tatOf = (s) => {
    const c = (s.cycles || []).slice().reverse().find((x) => x.tat !== '' && x.tat != null && !isNaN(+x.tat));
    return c ? +c.tat : S.defaults().tat;
  };

  /** "35, 28, 28" or [35, 28, 28] → [35, 28, 28] */
  S.parseList = (v) => (Array.isArray(v) ? v : String(v || '').split(/[,;\s]+/))
    .map((x) => parseInt(x, 10)).filter((x) => !isNaN(x) && x >= 0);
  const pick = (list, n) => (list.length ? list[Math.min(n, list.length) - 1] : null);

  /** Review days planned for review cycle n (1-based): submittal list → Settings list → last known turnaround. */
  S.reviewFor = (s, n) => pick(S.parseList(s.planReview), n) ?? pick(S.parseList(st().reviewDaysByCycle), n) ?? S.tatOf(s);
  /** Days to respond after review cycle n's comments, before resubmitting cycle n+1. */
  S.resubFor = (s, n) => pick(S.parseList(s.planResub), n) ?? pick(S.parseList(st().resubDaysByCycle), n) ?? S.defaults().resub;

  /** Target approval implied by a target submittal date: each planned review cycle plus the response time between them. */
  S.autoApproval = (s, from) => {
    if (!from) return '';
    const n = S.plannedCycles(s);
    let d = from;
    for (let i = 1; i <= n; i++) {
      if (i > 1) d = S.add(d, S.resubFor(s, i - 1));
      d = S.add(d, S.reviewFor(s, i));
    }
    return d;
  };

  S.plan = (s) => {
    const submit = s.planSubmit || '';
    const approval = s.planApproval || S.autoApproval(s, submit);
    return { submit, approval, auto: !s.planApproval && !!approval };
  };

  /* ---------- memoized per data revision ---------- */
  let cache = new Map();
  let cacheKey = '';
  const visiting = new Set();

  S.get = (s) => {
    const key = Store.rev + '|' + U.today();
    if (key !== cacheKey) { cache = new Map(); cacheKey = key; }
    const hit = cache.get(s.id);
    if (hit) return hit;
    if (visiting.has(s.id)) return { segs: [], approval: '', cyclic: true };
    visiting.add(s.id);
    let r;
    try { r = compute(s); } finally { visiting.delete(s.id); }
    cache.set(s.id, r);
    return r;
  };

  function compute(s) {
    const today = U.today();
    const D = S.defaults();
    const d = M.derive(s);
    const segs = [];
    const cycles = s.cycles || [];
    const created = (s.createdAt || '').slice(0, 10);
    const tat = S.tatOf(s);
    const planned = S.plannedCycles(s);

    // ---- what has happened ----
    if (d.first) {
      const prepFrom = s.planStart || (created && created < d.first ? created : '');
      if (prepFrom && prepFrom < d.first) segs.push({ k: 'prep', from: prepFrom, to: d.first });
    }
    cycles.forEach((c, i) => {
      if (!c.submitted) return;
      const next = cycles[i + 1];
      const isCur = i === cycles.length - 1;
      const due = M.dueFor(c);
      const clock = c.routed && c.routed > c.submitted ? c.routed : c.submitted;
      if (clock !== c.submitted) segs.push({ k: 'intake', from: c.submitted, to: clock > today && !c.received ? today : clock, n: c.n });
      if (c.received) {
        segs.push({ k: 'review', from: clock, to: c.received, n: c.n, due });
      } else if (isCur && !d.done && C.WITH_AGENCY.includes(s.status)) {
        if (due && due < today) {
          segs.push({ k: 'review', from: clock, to: due, n: c.n, due });
          segs.push({ k: 'late', from: due, to: today, n: c.n, due });
        } else if (today > clock) {
          segs.push({ k: 'review', from: clock, to: today, n: c.n, due });
        }
      } else {
        const end = (next && next.submitted) || (d.done && isCur ? s.approvedOn || due : due);
        if (end && end > clock) segs.push({ k: 'review', from: clock, to: end, n: c.n, due });
      }
      if (c.received && next && next.submitted && next.submitted > c.received) segs.push({ k: 'turn', from: c.received, to: next.submitted, n: c.n });
    });

    // ---- what is left ----
    const preds = (s.dependsOn || []).map(Store.submittal).filter(Boolean);
    let predFinish = '';
    const predInfo = preds.map((p) => {
      const f = S.get(p);
      predFinish = maxD(predFinish, f.approval);
      return { id: p.id, title: p.title, approval: f.approval, actual: !!f.approvalActual };
    });

    let approval = '';
    let approvalActual = false;
    let fcSubmit = '';
    let hold = false;
    let waitingOn = null;

    if (d.done) {
      approval = s.approvedOn || d.received || s.statusSince || '';
      approvalActual = true;
    } else if (s.status === 'On Hold') {
      hold = true;
    } else {
      let cursor;
      let remaining;
      let gap;
      let nextN = 1;
      const cur = d.cur;
      if (d.withAgency) {
        const due = d.due || S.add(cur.routed || cur.submitted, tat);
        if (due > today) segs.push({ k: 'fc-review', from: today, to: due, n: cur.n, due });
        cursor = maxD(due, today);
        remaining = Math.max(0, planned - d.cycleN);
        gap = true;
        nextN = d.cycleN + 1;
      } else if (cur && cur.submitted && cur.received) {
        if (today > cur.received) segs.push({ k: 'turn', from: cur.received, to: today, n: cur.n });
        const resubAt = maxD(today, S.add(cur.received, S.resubFor(s, d.cycleN)));
        if (resubAt > today) segs.push({ k: 'fc-turn', from: today, to: resubAt, n: d.cycleN });
        cursor = resubAt;
        remaining = Math.max(1, planned - d.cycleN);
        gap = false;
        nextN = d.cycleN + 1;
      } else {
        const sent = cycles.filter((c) => c.submitted).length;
        let submit = s.planSubmit ? maxD(s.planSubmit, today) : S.add(today, D.prep);
        const ready = submit;
        if (predFinish && predFinish > submit) { submit = predFinish; waitingOn = predInfo.filter((p) => p.approval === predFinish).map((p) => p.title); }
        if (s.status === 'In Prep' && created && created < today) segs.push({ k: 'prep', from: created, to: today });
        if (ready > today) segs.push({ k: 'fc-prep', from: today, to: ready });
        if (submit > ready) segs.push({ k: 'wait', from: ready, to: submit, on: waitingOn });
        fcSubmit = submit;
        cursor = submit;
        remaining = Math.max(1, planned - sent);
        gap = false;
        nextN = sent + 1;
      }
      for (let i = 0; i < remaining; i++, nextN++) {
        if (gap) {
          const r = S.add(cursor, S.resubFor(s, nextN - 1));
          segs.push({ k: 'fc-turn', from: cursor, to: r, n: nextN - 1 });
          cursor = r;
        }
        const e = S.add(cursor, S.reviewFor(s, nextN));
        segs.push({ k: 'fc-review', from: cursor, to: e, n: nextN, fc: true });
        cursor = e;
        gap = true;
      }
      approval = cursor;
    }

    const plan = S.plan(s);
    const base = s.baseline || null;
    const variance = approval && plan.approval ? U.diffDays(plan.approval, approval) : null;
    const baseVar = approval && base && base.approval ? U.diffDays(base.approval, approval) : null;
    const allDates = segs.flatMap((x) => [x.from, x.to]).concat([plan.submit, plan.approval, approval, fcSubmit, d.first, base && base.submit, base && base.approval]);
    return {
      segs,
      approval,
      approvalActual,
      hold,
      fcSubmit: fcSubmit || d.first,
      plan,
      base,
      variance,
      baseVar,
      preds: predInfo,
      waitingOn,
      start: minD(...allDates),
      finish: maxD(...allDates),
    };
  }

  /** Short variance text with sign; positive = later than target. */
  S.varText = (v) => (v == null ? '' : v === 0 ? 'on target' : v > 0 ? '+' + v + 'd late' : Math.abs(v) + 'd early');
  S.varHtml = (v, short) => {
    if (v == null) return '<span class="muted">—</span>';
    if (v === 0) return '<span class="var var-ok" title="Forecast matches target">0d</span>';
    return v > 0
      ? `<span class="var var-late" title="Forecast is ${v} days after target">▲${short ? '' : ' '}+${v}d</span>`
      : `<span class="var var-early" title="Forecast is ${-v} days before target">▼${short ? '' : ' '}${v}d</span>`;
  };

  /** Rollup for a set of submittals (package, phase, project). */
  S.rollup = (list) => {
    let start = '';
    let finish = '';
    let target = '';
    let anyOpen = false;
    list.forEach((s) => {
      const f = S.get(s);
      start = minD(start, f.start);
      finish = maxD(finish, f.approval || f.finish);
      if (f.approval) target = maxD(target, f.plan.approval);
      if (!f.approvalActual) anyOpen = true;
    });
    const fcFinish = list.length ? list.map((s) => S.get(s).approval).filter(Boolean).sort().pop() || '' : '';
    return { start, finish, target, forecast: fcFinish, variance: fcFinish && target ? U.diffDays(target, fcFinish) : null, done: !anyOpen && list.length > 0 };
  };

  /** Snapshot current targets (or forecasts where no target) as the baseline. */
  S.baselineFor = (s) => {
    const f = S.get(s);
    return { submit: f.plan.submit || f.fcSubmit || '', approval: f.plan.approval || f.approval || '', at: U.today() };
  };

  window.Sched = S;
})();
