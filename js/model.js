/* Business rules: derived dates/flags, review-cycle transitions, duplication, templates. */
(function () {
  'use strict';
  const M = {};
  const LOG_CAP = 80;

  let cache = new WeakMap();
  let cacheDay = '';
  let cacheSettings = '';

  /** Derived, read-only facts about a submittal. Cached per object until it is replaced. */
  M.derive = (s) => {
    const today = U.today();
    const st = Store.state.settings;
    const sk = st.staleDays + '|' + st.bizDays;
    if (today !== cacheDay || sk !== cacheSettings) {
      cache = new WeakMap();
      cacheDay = today;
      cacheSettings = sk;
    }
    const hit = cache.get(s);
    if (hit) return hit;

    const cycles = s.cycles || [];
    const cur = cycles.length ? cycles[cycles.length - 1] : null;
    const first = cycles.find((c) => c.submitted);
    const due = M.dueFor(cur);
    const done = C.DONE.includes(s.status);
    const withAgency = !!(C.WITH_AGENCY.includes(s.status) && cur && cur.submitted && !cur.received);
    const overdue = withAgency && due && due < today ? U.diffDays(due, today) : 0;
    const ballDays = s.ballSince ? Math.max(0, U.diffDays(s.ballSince, today)) : null;
    const stale = !done && s.status !== 'On Hold' && (s.ball === 'Us' || s.ball === 'Consultant') && ballDays != null && ballDays > (+st.staleDays || 7);
    const d = {
      cur,
      cycleN: cur ? cur.n : 0,
      submitted: (cur && cur.submitted) || '',
      due,
      received: (cur && cur.received) || '',
      first: (first && first.submitted) || '',
      done,
      withAgency,
      overdue,
      dueIn: withAgency && due ? U.diffDays(today, due) : null,
      daysInStatus: s.statusSince ? Math.max(0, U.diffDays(s.statusSince, today)) : null,
      totalDays: first ? Math.max(0, U.diffDays(first.submitted, done && s.statusSince ? s.statusSince : today)) : null,
      ballDays,
      stale,
      nextDue: s.nextActionDate && !done ? U.diffDays(today, s.nextActionDate) : null,
    };
    cache.set(s, d);
    return d;
  };

  M.dueFor = (c) => {
    if (!c) return '';
    if (c.dueOverride) return c.dueOverride;
    if (!c.submitted || c.tat === '' || c.tat == null || isNaN(+c.tat)) return '';
    return Store.state.settings.bizDays ? U.addBizDays(c.submitted, +c.tat) : U.addDays(c.submitted, +c.tat);
  };

  M.cycleLabel = (n) => (n ? U.ordinal(n) : '—');

  /* ---------- creation & update ---------- */

  M.newSubmittal = (f) => {
    const today = U.today();
    return {
      id: U.uid('s'),
      projectId: '',
      phaseId: '',
      packageId: '',
      title: '',
      discipline: '',
      agency: '',
      department: '',
      reviewer: '',
      preparerFirm: '',
      preparerContact: '',
      trackingNo: '',
      status: 'Not Started',
      statusSince: today,
      ball: 'Us',
      ballSince: today,
      priority: 'Normal',
      feeAmount: '',
      feesPaid: '',
      nextAction: '',
      nextActionDate: '',
      notes: '',
      links: [],
      cycles: [],
      log: [{ at: U.nowIso(), t: 'Created' }],
      ...f,
    };
  };

  function addLog(s, text) {
    s.log = (s.log || []).concat({ at: U.nowIso(), t: text }).slice(-LOG_CAP);
  }

  /** Apply field changes; tracks when status / ball last changed. Returns the stored copy. */
  M.update = (s, patch, note) => {
    const next = { ...U.clone(s), ...patch };
    const today = U.today();
    if (patch.status && patch.status !== s.status) {
      if (!patch.statusSince) next.statusSince = today;
      addLog(next, 'Status: ' + s.status + ' → ' + patch.status);
    }
    const wasDone = C.DONE.includes(s.status);
    const isDone = C.DONE.includes(next.status);
    if (isDone && !wasDone && !next.approvedOn) next.approvedOn = patch.statusSince || today;
    if (!isDone && wasDone && patch.status) next.approvedOn = '';
    if (patch.ball && patch.ball !== s.ball) {
      if (!patch.ballSince) next.ballSince = today;
      addLog(next, 'Ball in court: ' + s.ball + ' → ' + patch.ball);
    }
    if (note) addLog(next, note);
    return Store.putSubmittal(next);
  };

  /** Edit one review cycle; the current cycle's dates drive status and ball. */
  M.setCycle = (s, cycleId, patch) => {
    const next = U.clone(s);
    const idx = next.cycles.findIndex((c) => c.id === cycleId);
    if (idx < 0) return s;
    const before = next.cycles[idx];
    const c = { ...before, ...patch };
    next.cycles[idx] = c;
    const isCur = idx === next.cycles.length - 1;
    const auto = {};
    if (isCur && patch.submitted && !before.submitted && C.NEEDS_SUBMIT.includes(s.status)) {
      auto.status = 'Submitted';
      auto.ball = 'Agency';
      auto.statusSince = auto.ballSince = patch.submitted < U.today() ? patch.submitted : U.today();
    }
    if (isCur && patch.received && !before.received && C.WITH_AGENCY.includes(s.status)) {
      auto.status = 'Comments Received';
      auto.ball = 'Us';
      auto.statusSince = auto.ballSince = patch.received < U.today() ? patch.received : U.today();
    }
    if (patch.received && !before.received) addLog(next, M.cycleLabel(c.n) + ' review comments received ' + U.fmtD(patch.received));
    return M.update(next, auto);
  };

  /** Start a new review cycle (1st submittal or resubmittal). */
  M.addCycle = (s, submitted) => {
    const next = U.clone(s);
    const last = next.cycles[next.cycles.length - 1];
    const today = U.today();
    if (last && submitted && !last.received && C.WITH_AGENCY.includes(s.status)) {
      // Resubmitting without logging comments: assume comments came back today.
      last.received = today;
    }
    const n = last ? (+last.n || next.cycles.length) + 1 : 1;
    next.cycles.push({
      id: U.uid('c'),
      n,
      submitted: submitted || '',
      tat: last && last.tat !== '' && last.tat != null ? last.tat : Store.state.settings.defaultTat,
      dueOverride: '',
      received: '',
      summary: '',
    });
    addLog(next, (n === 1 ? '1st submittal' : U.ordinal(n) + ' submittal (resubmittal)') + (submitted ? ' logged ' + U.fmtD(submitted) : ' cycle added'));
    const since = submitted && submitted < today ? submitted : today;
    return M.update(next, submitted ? { status: 'Submitted', ball: 'Agency', statusSince: since, ballSince: since } : {});
  };

  M.removeCycle = (s, cycleId) => {
    const next = U.clone(s);
    const c = next.cycles.find((x) => x.id === cycleId);
    next.cycles = next.cycles.filter((x) => x.id !== cycleId);
    if (c) addLog(next, 'Removed ' + M.cycleLabel(c.n) + ' cycle');
    return Store.putSubmittal(next);
  };

  /** One-click "submitted today": fills an unsent current cycle or starts the next one. */
  M.markSubmitted = (s, date) => {
    const d = date || U.today();
    const cur = s.cycles[s.cycles.length - 1];
    if (cur && !cur.submitted) return M.setCycle(s, cur.id, { submitted: d });
    return M.addCycle(s, d);
  };

  M.logResubmittal = (s) => M.addCycle(s, U.today());

  M.markReceived = (s, date) => {
    const cur = s.cycles[s.cycles.length - 1];
    if (!cur) return s;
    return M.setCycle(s, cur.id, { received: date || U.today() });
  };

  /** The one most useful next step for a row, shown as its quick-action button. */
  M.quickAction = (s) => {
    const d = M.derive(s);
    if (d.withAgency) return { act: 'received', label: 'Comments in', title: 'Log comments received today' };
    if (s.status === 'Comments Received' || s.status === 'Resubmittal in Prep') return { act: 'resubmit', label: 'Resubmit', title: 'Log resubmittal today (starts next review cycle)' };
    if ((s.status === 'Not Started' || s.status === 'In Prep') && !d.submitted) return { act: 'submit', label: 'Submitted', title: 'Mark submitted today (starts review cycle)' };
    return null;
  };

  /* ---------- copies ---------- */

  /** A clean copy for reuse: same scope and parties, no history. */
  M.blankCopy = (s, overrides) =>
    M.newSubmittal({
      projectId: s.projectId,
      phaseId: s.phaseId,
      packageId: s.packageId,
      title: s.title,
      discipline: s.discipline,
      agency: s.agency,
      department: s.department,
      reviewer: s.reviewer,
      preparerFirm: s.preparerFirm,
      preparerContact: s.preparerContact,
      priority: s.priority,
      ...overrides,
    });

  M.duplicate = (s) => Store.putSubmittal(M.blankCopy(s, { title: s.title + ' (copy)', log: [{ at: U.nowIso(), t: 'Duplicated from "' + s.title + '"' }] }));

  M.inPackage = (projectId, pkgId) => Store.state.submittals.filter((s) => s.projectId === projectId && s.packageId === pkgId);

  /** Copy a package (and its submittals, reset to Not Started) into a phase of any project. */
  M.duplicatePackage = (srcProject, pkgId, dstProjectId, dstPhaseId, name) => {
    const dst = U.clone(Store.project(dstProjectId));
    const ph = dst.phases.find((x) => x.id === dstPhaseId);
    const pkg = Store.newPackage(name);
    ph.packages.push(pkg);
    Store.putProject(dst);
    const items = M.inPackage(srcProject.id, pkgId);
    items.forEach((s) =>
      Store.putSubmittal(
        M.blankCopy(s, {
          projectId: dst.id,
          phaseId: ph.id,
          packageId: pkg.id,
          agency: dst.id === srcProject.id ? s.agency : s.agency === srcProject.jurisdiction ? dst.jurisdiction : s.agency,
          log: [{ at: U.nowIso(), t: 'Copied with package "' + name + '"' }],
        })
      )
    );
    return { pkg, count: items.length };
  };

  /** Create every item of a template inside a package. */
  M.applyTemplate = (tpl, projectId, phaseId, pkgId) => {
    const p = Store.project(projectId);
    const last = UI.lastUsed();
    tpl.items.forEach((it) =>
      Store.putSubmittal(
        M.newSubmittal({
          projectId,
          phaseId,
          packageId: pkgId,
          title: it.title,
          discipline: it.discipline || '',
          department: it.department || '',
          agency: it.agency || p.jurisdiction || '',
          preparerFirm: it.preparerFirm || '',
          log: [{ at: U.nowIso(), t: 'Created from template "' + tpl.name + '"' }],
        })
      )
    );
    UI.rememberLast({ ...last, projectId, phaseId, packageId: pkgId });
    return tpl.items.length;
  };

  M.templateFromPackage = (projectId, pkgId, name) => {
    const p = Store.project(projectId);
    const items = M.inPackage(projectId, pkgId)
      .sort(U.byKey('title'))
      .map((s) => ({
        title: s.title,
        discipline: s.discipline,
        department: s.department,
        agency: s.agency === p.jurisdiction ? '' : s.agency,
        preparerFirm: s.preparerFirm || '',
      }));
    return Store.putTemplate({ id: U.uid('t'), name, description: 'Saved from ' + p.name, items });
  };

  /** Find a phase and package by name in a project, creating either if missing. */
  M.ensurePhasePkg = (projectId, phaseName, pkgName) => {
    const p = U.clone(Store.project(projectId));
    let changed = false;
    const norm = (x) => String(x || '').trim().toLowerCase();
    let ph = p.phases.find((x) => norm(x.name) === norm(phaseName));
    if (!ph) {
      ph = Store.newPhase(phaseName.trim() || 'Unassigned');
      p.phases.push(ph);
      changed = true;
    }
    let pk = ph.packages.find((x) => norm(x.name) === norm(pkgName));
    if (!pk) {
      pk = Store.newPackage(pkgName.trim() || 'General');
      ph.packages.push(pk);
      changed = true;
    }
    if (changed) Store.putProject(p);
    return { phaseId: ph.id, packageId: pk.id };
  };

  M.progress = (list) => {
    const total = list.length;
    const done = list.filter((s) => C.DONE.includes(s.status)).length;
    return { total, done, pct: total ? Math.round((done / total) * 100) : 0 };
  };

  /** Readable names for a submittal's location in the hierarchy. */
  M.where = (s) => {
    const p = Store.project(s.projectId);
    const ph = Store.phase(p, s.phaseId);
    const pk = ph ? ph.packages.find((x) => x.id === s.packageId) : null;
    return { project: p, projectName: p ? p.name : '(no project)', phaseName: ph ? ph.name : '', pkgName: pk ? pk.name : '' };
  };

  window.M = M;
})();
