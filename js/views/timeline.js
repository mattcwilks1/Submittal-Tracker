/* Timeline (Gantt): Project → Phase → Package → Submittal rows on a time scale.
 * Each submittal shows what happened (solid), the forecast to approval (hatched), its target window (thin bar below,
 * draggable), the baseline (gray), and a diamond at approval. A red line marks today.
 */
(function () {
  'use strict';

  const ZOOMS = {
    day: { px: 28, label: 'Days' },
    week: { px: 8, label: 'Weeks' },
    month: { px: 2.6, label: 'Months' },
    quarter: { px: 1.1, label: 'Quarters' },
  };
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const SEG_LABEL = {
    prep: 'Preparation',
    review: 'Agency review',
    late: 'Agency review, past due',
    turn: 'Comments with us / consultant',
    'fc-prep': 'Forecast: preparation',
    'fc-review': 'Forecast: agency review',
    'fc-turn': 'Forecast: resubmittal prep',
    wait: 'Waiting on predecessor',
  };

  const prefs = () => ({ zoom: 'week', projectId: '', show: 'open', ...(UI.prefs.tl || {}) });
  const setPrefs = (patch) => UI.setPref('tl', { ...prefs(), ...patch });

  let ctx = null; // geometry of the current render, used by drag + scroll

  /* ---------------- rows ---------------- */

  function taskVisible(s, show) {
    const f = Sched.get(s);
    if (show === 'all') return true;
    if (show === 'late') return f.variance != null && f.variance > 0;
    if (show === 'baseline') return f.baseVar != null && f.baseVar > 0;
    return !f.approvalActual || (f.approval && U.diffDays(f.approval, U.today()) <= 30); // open + approved in the last 30 days
  }

  function buildRows() {
    const p = prefs();
    const projects = Store.projects(false).filter((x) => !p.projectId || x.id === p.projectId);
    const rows = [];
    const collapsed = UI.prefs.collapsed || {};
    const sortTasks = (a, b) => U.cmp(Sched.get(a).start, Sched.get(b).start) || U.cmp(a.title, b.title);
    projects.forEach((proj) => {
      const subs = Store.state.submittals.filter((s) => s.projectId === proj.id && taskVisible(s, p.show));
      if (!subs.length && p.show !== 'all') return;
      const pk = 'tl:p:' + proj.id;
      rows.push({ type: 'project', key: pk, name: proj.name, sub: proj.caseNumbers.join(' · '), list: subs, depth: 0, collapsed: !!collapsed[pk], projectId: proj.id });
      if (collapsed[pk]) return;
      const phaseIds = new Set(proj.phases.map((x) => x.id));
      const groups = proj.phases.map((ph) => ({ ph, list: subs.filter((s) => s.phaseId === ph.id) }));
      const orphan = subs.filter((s) => !phaseIds.has(s.phaseId));
      if (orphan.length) groups.unshift({ ph: { id: '_none', name: 'Unassigned', packages: [] }, list: orphan });
      groups.forEach(({ ph, list }) => {
        if (!list.length) return;
        const hk = 'tl:ph:' + ph.id;
        rows.push({ type: 'phase', key: hk, name: ph.name, list, depth: 1, collapsed: !!collapsed[hk] });
        if (collapsed[hk]) return;
        const pkgIds = new Set(ph.packages.map((k) => k.id));
        ph.packages.forEach((k) => {
          const kl = list.filter((s) => s.packageId === k.id);
          if (!kl.length) return;
          const kk = 'tl:pk:' + k.id;
          rows.push({ type: 'package', key: kk, name: k.name, list: kl, depth: 2, collapsed: !!collapsed[kk] });
          if (!collapsed[kk]) kl.sort(sortTasks).forEach((s) => rows.push({ type: 'task', s, depth: 3 }));
        });
        list.filter((s) => !pkgIds.has(s.packageId)).sort(sortTasks).forEach((s) => rows.push({ type: 'task', s, depth: 2 }));
      });
    });
    return rows;
  }

  /* ---------------- scale ---------------- */

  function range(rows) {
    const today = U.today();
    let a = U.addDays(today, -21);
    let b = U.addDays(today, 90);
    rows.forEach((r) => {
      if (r.type !== 'task') return;
      const f = Sched.get(r.s);
      if (f.start && f.start < a) a = f.start;
      if (f.finish && f.finish > b) b = f.finish;
    });
    a = U.weekStart(U.addDays(a, -7));
    b = U.addDays(b, 35);
    const z = prefs().zoom;
    if (z === 'month' || z === 'quarter') {
      a = a.slice(0, 8) + '01';
      if (z === 'quarter') a = a.slice(0, 5) + String(Math.floor((+a.slice(5, 7) - 1) / 3) * 3 + 1).padStart(2, '0') + '-01';
    }
    return { a, b, days: U.diffDays(a, b) + 1 };
  }

  function headerHtml(R, px, zoom) {
    const top = [];
    const bot = [];
    const lines = [];
    const x = (d) => U.diffDays(R.a, d) * px;
    // top tier: months (day/week zoom) or years (month/quarter)
    let d = R.a;
    const yearly = zoom === 'month' || zoom === 'quarter';
    while (d <= R.b) {
      const y = +d.slice(0, 4);
      const m = +d.slice(5, 7);
      const next = yearly ? (y + 1) + '-01-01' : (m === 12 ? (y + 1) + '-01-01' : y + '-' + String(m + 1).padStart(2, '0') + '-01');
      const end = next > R.b ? U.addDays(R.b, 1) : next;
      top.push(`<span class="g-ht" style="left:${x(d)}px;width:${x(end) - x(d)}px">${yearly ? y : MON[m - 1] + ' ' + y}</span>`);
      d = next;
    }
    // bottom tier
    d = R.a;
    while (d <= R.b) {
      let next;
      let label;
      if (zoom === 'day') {
        next = U.addDays(d, 1);
        label = `${+d.slice(8)}<small>${'SMTWTFS'[U.weekday(d)]}</small>`;
      } else if (zoom === 'week') {
        next = U.addDays(d, 7);
        label = `${MON[+d.slice(5, 7) - 1]} ${+d.slice(8)}`;
      } else if (zoom === 'month') {
        const y = +d.slice(0, 4), m = +d.slice(5, 7);
        next = m === 12 ? (y + 1) + '-01-01' : y + '-' + String(m + 1).padStart(2, '0') + '-01';
        label = MON[m - 1];
      } else {
        const y = +d.slice(0, 4), m = +d.slice(5, 7);
        const nm = m + 3;
        next = nm > 12 ? (y + 1) + '-' + String(nm - 12).padStart(2, '0') + '-01' : y + '-' + String(nm).padStart(2, '0') + '-01';
        label = 'Q' + Math.ceil(m / 3);
      }
      const w = x(next > R.b ? U.addDays(R.b, 1) : next) - x(d);
      bot.push(`<span class="g-hb ${d === U.today() ? 'is-today' : ''}" style="left:${x(d)}px;width:${w}px">${label}</span>`);
      if (zoom !== 'day') lines.push(`<span class="g-vl" style="left:${x(d)}px"></span>`);
      d = next;
    }
    return { top: top.join(''), bot: bot.join(''), lines: lines.join('') };
  }

  /* ---------------- bars ---------------- */

  function tip(lines) {
    return U.esc(lines.filter(Boolean).join('\n'));
  }

  function taskTrack(s, X, px) {
    const f = Sched.get(s);
    const out = [];
    const span = (from, to) => {
      const l = X(from);
      return { l, w: Math.max(px * 0.6, X(to) - l) };
    };
    // baseline (gray, bottom)
    if (f.base && f.base.approval) {
      const b = span(f.base.submit || f.base.approval, f.base.approval);
      out.push(`<span class="g-base" style="left:${b.l}px;width:${b.w}px" data-tip="${tip(['Baseline (saved ' + U.fmtD(f.base.at) + ')', 'Submit ' + (U.fmtD(f.base.submit) || '—'), 'Approval ' + U.fmtD(f.base.approval)])}"></span>`);
    }
    // target window (accent, thin, draggable)
    if (f.plan.approval) {
      const from = f.plan.submit || f.plan.approval;
      const t = span(from, f.plan.approval);
      const tipT = tip(['Target', 'Submit ' + (U.fmtD(f.plan.submit) || '—'), 'Approval ' + U.fmtD(f.plan.approval) + (f.plan.auto ? ' (calculated)' : ''), 'Drag to reschedule · drag the end to change the approval target']);
      out.push(`<span class="g-plan" data-drag="move" style="left:${t.l}px;width:${t.w}px" data-tip="${tipT}"><span class="g-plan-end" data-drag="end" data-tip="${tip(['Target approval ' + U.fmtD(f.plan.approval), 'Drag to change'])}"></span></span>`);
    }
    // actual + forecast segments
    f.segs.forEach((g) => {
      const b = span(g.from, g.to);
      const days = U.diffDays(g.from, g.to);
      out.push(`<span class="g-seg g-${g.k}" style="left:${b.l}px;width:${b.w}px" data-tip="${tip([SEG_LABEL[g.k] + (g.n ? ' · ' + U.ordinal(g.n) + ' cycle' : ''), U.fmtD(g.from) + ' → ' + U.fmtD(g.to) + ' (' + days + 'd)', g.due ? 'Due back ' + U.fmtD(g.due) : '', g.on ? 'Starts after ' + g.on.join(', ') + ' is approved' : ''])}"></span>`);
    });
    // approval milestone
    if (f.approval) {
      const late = f.variance != null && f.variance > 0;
      const cls = f.approvalActual ? 'g-ms-done' : late ? 'g-ms-late' : 'g-ms-fc';
      out.push(`<span class="g-ms ${cls}" style="left:${X(f.approval)}px" data-tip="${tip([(f.approvalActual ? 'Approved ' : 'Forecast approval ') + U.fmtLong(f.approval), f.plan.approval ? 'Target ' + U.fmtD(f.plan.approval) + ' · ' + Sched.varText(f.variance) : 'No target set', f.baseVar != null ? 'vs. baseline: ' + Sched.varText(f.baseVar) : '', f.waitingOn ? 'Waiting on: ' + f.waitingOn.join(', ') : ''])}"></span>`);
      const lx = X(f.approval) + 10;
      out.push(`<span class="g-lbl ${late ? 'is-late' : ''}" style="left:${lx}px">${f.approvalActual ? '✓ ' : ''}${U.fmtD(f.approval)}${late ? ' · +' + f.variance + 'd' : ''}</span>`);
    } else if (f.hold) {
      const x0 = X(U.today());
      out.push(`<span class="g-lbl" style="left:${x0 + 8}px">‖ On hold, no forecast</span>`);
    }
    // predecessor connector hint
    return out.join('');
  }

  function summaryTrack(list, X, px, type) {
    const r = Sched.rollup(list);
    if (!r.start) return '';
    const pr = M.progress(list);
    const l = X(r.start);
    const w = Math.max(px, X(r.finish || r.start) - l);
    const late = r.variance != null && r.variance > 0;
    let h = `<span class="g-sum g-sum-${type}" style="left:${l}px;width:${w}px" data-tip="${tip([U.plural(list.length, 'submittal') + ' · ' + pr.pct + '% approved', U.fmtD(r.start) + ' → ' + U.fmtD(r.finish), r.target ? 'Latest target approval ' + U.fmtD(r.target) : '', r.target && r.forecast ? Sched.varText(r.variance) : ''])}"><span class="g-sum-fill" style="width:${pr.pct}%"></span></span>`;
    if (r.target) h += `<span class="g-sum-tgt" style="left:${X(r.target)}px" data-tip="${tip(['Latest target approval ' + U.fmtD(r.target)])}"></span>`;
    h += `<span class="g-lbl g-lbl-sum ${late ? 'is-late' : ''}" style="left:${l + w + 8}px">${pr.pct}%${r.forecast ? ' · ' + (r.done ? 'done ' : '') + U.fmtD(r.forecast) : ''}${late ? ' · +' + r.variance + 'd' : ''}</span>`;
    return h;
  }

  /* ---------------- render ---------------- */

  function leftCells(r) {
    if (r.type === 'task') {
      const s = r.s;
      const f = Sched.get(s);
      const st = C.STATUS_BY_KEY[s.status] || { glyph: '?', cls: 'idle' };
      return `<span class="g-name" style="--d:${r.depth}">
          <span class="g-glyph st-${st.cls}" title="${U.esc(s.status)}" aria-label="${U.esc(s.status)}">${st.glyph}</span>
          <button class="g-title" data-act="open" title="${U.esc(s.title)}">${U.esc(s.title)}</button>
        </span>
        <span class="g-c">${f.plan.approval ? `<span class="${f.plan.auto ? 'muted' : ''}" title="${f.plan.auto ? 'Calculated from target submittal date' : 'Target approval'}">${U.fmtD(f.plan.approval)}</span>` : '<span class="muted">—</span>'}</span>
        <span class="g-c">${f.approval ? (f.approvalActual ? `<b title="Approved">✓ ${U.fmtD(f.approval)}</b>` : U.fmtD(f.approval)) : f.hold ? '<span class="muted">hold</span>' : '<span class="muted">—</span>'}</span>
        <span class="g-c g-var">${Sched.varHtml(f.variance, true)}</span>`;
    }
    const roll = Sched.rollup(r.list);
    const pr = M.progress(r.list);
    return `<span class="g-name" style="--d:${r.depth}">
        <button class="g-tog" data-collapse="${U.esc(r.key)}" aria-expanded="${!r.collapsed}" aria-label="${r.collapsed ? 'Expand' : 'Collapse'} ${U.esc(r.name)}">${UI.icon('chev', 'ic-chev')}</button>
        ${r.type === 'project' ? `<button class="g-title g-title-p" data-open-project="${r.projectId}">${U.esc(r.name)}</button>` : `<span class="g-title">${U.esc(r.name)}</span>`}
        <span class="g-n">${r.list.length} · ${pr.pct}%</span>
      </span>
      <span class="g-c">${roll.target ? U.fmtD(roll.target) : '<span class="muted">—</span>'}</span>
      <span class="g-c">${roll.forecast ? U.fmtD(roll.forecast) : '<span class="muted">—</span>'}</span>
      <span class="g-c g-var">${Sched.varHtml(roll.variance, true)}</span>`;
  }

  function chartHtml() {
    const p = prefs();
    const rows = buildRows();
    if (!rows.length) {
      return `<div class="empty"><h3>${Store.state.submittals.length ? 'No submittals match this view.' : 'No submittals to schedule yet.'}</h3>
        <p>${Store.state.submittals.length ? 'Switch Show to “All submittals” or pick another project.' : 'Add submittals, then give them target dates to see the plan.'}</p></div>`;
    }
    const z = ZOOMS[p.zoom] || ZOOMS.week;
    const px = z.px;
    const R = range(rows);
    const X = (d) => U.diffDays(R.a, d) * px;
    const W = R.days * px;
    const H = headerHtml(R, px, p.zoom);
    ctx = { R, px, X, W };
    const weekend = p.zoom === 'day' || p.zoom === 'week'
      ? `background-image:linear-gradient(to right, transparent ${5 * px}px, var(--g-weekend) ${5 * px}px);background-size:${7 * px}px 100%;`
      : '';
    const body = rows.map((r) => `<div class="g-row g-row-${r.type} ${r.type === 'task' && Sched.get(r.s).variance > 0 ? 'is-late' : ''}" ${r.type === 'task' ? `data-id="${r.s.id}"` : ''}>
        <div class="g-left">${leftCells(r)}</div>
        <div class="g-track" style="width:${W}px">${r.type === 'task' ? taskTrack(r.s, X, px) : summaryTrack(r.list, X, px, r.type)}</div>
      </div>`).join('');
    const tx = X(U.today()) + px / 2;
    return `<div class="g-scroll" id="g-scroll" style="--W:${W}px">
        <div class="g-head">
          <div class="g-left g-left-h"><span class="g-name">Submittal</span><span class="g-c" title="Target approval">Target</span><span class="g-c" title="Forecast approval">Forecast</span><span class="g-c" title="Forecast vs. target">Var.</span></div>
          <div class="g-scale" style="width:${W}px"><div class="g-scale-top">${H.top}</div><div class="g-scale-bot">${H.bot}</div><span class="g-now" style="left:${tx}px">Today</span></div>
        </div>
        <div class="g-body">
          <div class="g-grid" style="width:${W}px;${weekend}">${H.lines}<span class="g-today" style="left:${tx}px"></span></div>
          ${body}
        </div>
      </div>`;
  }

  function legendHtml() {
    const sw = (cls, label) => `<span class="lg"><span class="lg-sw ${cls}"></span>${label}</span>`;
    return `<div class="g-legend" aria-label="Legend">
      ${sw('g-prep', 'Prep')}${sw('g-review', 'Agency review')}${sw('g-late', 'Past due')}${sw('g-turn', 'With us / consultant')}
      ${sw('g-fc-review lg-fc', 'Forecast')}${sw('g-wait', 'Waiting on predecessor')}${sw('lg-plan', 'Target window')}${sw('lg-base', 'Baseline')}
      <span class="lg"><span class="lg-ms g-ms-fc"></span>Forecast approval</span><span class="lg"><span class="lg-ms g-ms-done"></span>Approved</span><span class="lg"><span class="lg-ms g-ms-late"></span>Late vs. target</span>
    </div>`;
  }

  function toolbarHtml() {
    const p = prefs();
    const projects = Store.projects(false);
    return `<div class="toolbar">
      <select id="tl-project" aria-label="Project">${UI.options(projects.map((x) => ({ value: x.id, label: x.name })), p.projectId, 'All active projects')}</select>
      <select id="tl-show" aria-label="Show">${UI.options([
        { value: 'open', label: 'Open + approved in last 30 days' },
        { value: 'all', label: 'All submittals' },
        { value: 'late', label: 'Forecast later than target' },
        { value: 'baseline', label: 'Slipped vs. baseline' },
      ], p.show)}</select>
      <div class="seg" role="group" aria-label="Zoom">${Object.entries(ZOOMS).map(([k, v]) => `<button class="seg-b ${p.zoom === k ? 'is-on' : ''}" data-zoom="${k}" aria-pressed="${p.zoom === k}">${v.label}</button>`).join('')}</div>
      <button class="btn" data-act="tl-today">Today</button>
      <button class="btn btn-ghost" data-act="tl-expand">Expand all</button>
      <button class="btn btn-ghost" data-act="tl-collapse">Collapse to packages</button>
      <button class="btn tb-end" data-act="tl-baseline">Baseline…</button>
    </div>`;
  }

  const view = {
    title: 'Timeline',
    render(root) {
      root.innerHTML = `<div class="view-h"><h1>Timeline</h1><p class="view-sub">Where each submittal is today and when it should be approved. Solid bars are actual, hatched bars are the forecast, and the thin bar underneath is your target. Drag a target to reschedule it.</p></div>
        ${toolbarHtml()}${legendHtml()}<div id="tl-chart">${chartHtml()}</div>`;
      scrollToToday(root, true);
      if (!root.dataset.bound) bind(root);
    },
    refresh(root) {
      const sc = root.querySelector('#g-scroll');
      const pos = sc ? [sc.scrollLeft, sc.scrollTop] : null;
      root.querySelector('#tl-chart').innerHTML = chartHtml();
      const sc2 = root.querySelector('#g-scroll');
      if (sc2 && pos) { sc2.scrollLeft = pos[0]; sc2.scrollTop = pos[1]; }
    },
  };

  function scrollToToday(root, first) {
    const sc = root.querySelector('#g-scroll');
    if (!sc || !ctx) return;
    const lw = root.querySelector('.g-left').offsetWidth;
    const viewW = sc.clientWidth - lw;
    sc.scrollLeft = Math.max(0, ctx.X(U.today()) - viewW * (first ? 0.3 : 0.4));
  }

  /* ---------------- interactions ---------------- */

  function bind(root) {
    root.dataset.bound = '1';
    root.addEventListener('change', (e) => {
      if (e.target.id === 'tl-project') { setPrefs({ projectId: e.target.value }); view.refresh(root); scrollToToday(root); }
      if (e.target.id === 'tl-show') { setPrefs({ show: e.target.value }); view.refresh(root); }
    });
    root.addEventListener('click', (e) => {
      if (dragState && dragState.moved) return;
      const z = e.target.closest('[data-zoom]');
      if (z) {
        setPrefs({ zoom: z.dataset.zoom });
        root.querySelectorAll('[data-zoom]').forEach((b) => { b.classList.toggle('is-on', b === z); b.setAttribute('aria-pressed', b === z); });
        view.refresh(root);
        scrollToToday(root);
        return;
      }
      const tg = e.target.closest('[data-collapse]');
      if (tg) {
        const k = tg.dataset.collapse;
        UI.setPref('collapsed', { ...UI.prefs.collapsed, [k]: !UI.prefs.collapsed[k] });
        view.refresh(root);
        return;
      }
      const op = e.target.closest('[data-open-project]');
      if (op) { App.go('project/' + op.dataset.openProject); return; }
      const b = e.target.closest('[data-act]');
      const act = b && b.dataset.act;
      if (act === 'tl-today') return scrollToToday(root);
      if (act === 'tl-expand' || act === 'tl-collapse') {
        const c = { ...UI.prefs.collapsed };
        Object.keys(c).forEach((k) => { if (k.startsWith('tl:')) delete c[k]; });
        if (act === 'tl-collapse') Store.state.projects.forEach((p) => p.phases.forEach((ph) => ph.packages.forEach((k) => { c['tl:pk:' + k.id] = true; })));
        UI.setPref('collapsed', c);
        view.refresh(root);
        return;
      }
      if (act === 'tl-baseline') return baselineDialog();
      const row = e.target.closest('.g-row[data-id]');
      if (row && (act === 'open' || e.target.closest('.g-seg,.g-ms,.g-lbl'))) { App.openDrawer(row.dataset.id); }
    });

    // hover tooltip
    const tipEl = document.createElement('div');
    tipEl.className = 'g-tip';
    tipEl.hidden = true;
    root.appendChild(tipEl);
    root.addEventListener('mouseover', (e) => {
      const t = e.target.closest('[data-tip]');
      if (!t || dragState) { tipEl.hidden = true; return; }
      tipEl.innerHTML = t.dataset.tip.split('\n').map((l, i) => (i ? `<span>${U.esc(l)}</span>` : `<b>${U.esc(l)}</b>`)).join('');
      tipEl.hidden = false;
    });
    root.addEventListener('mousemove', (e) => {
      if (tipEl.hidden) return;
      const w = tipEl.offsetWidth;
      const h = tipEl.offsetHeight;
      tipEl.style.left = Math.min(window.innerWidth - w - 8, e.clientX + 14) + 'px';
      tipEl.style.top = (e.clientY + h + 20 > window.innerHeight ? e.clientY - h - 12 : e.clientY + 16) + 'px';
    });
    root.addEventListener('mouseout', (e) => { if (!e.relatedTarget || !e.relatedTarget.closest || !e.relatedTarget.closest('[data-tip]')) tipEl.hidden = true; });

    // drag targets
    root.addEventListener('pointerdown', (e) => {
      const h = e.target.closest('[data-drag]');
      if (!h || e.button !== 0) return;
      const row = h.closest('.g-row[data-id]');
      const s = row && Store.submittal(row.dataset.id);
      if (!s || !ctx) return;
      e.preventDefault();
      const bar = h.closest('.g-plan');
      const f = Sched.get(s);
      dragState = { s, mode: e.target.closest('.g-plan-end') ? 'end' : 'move', x0: e.clientX, bar, l0: parseFloat(bar.style.left), w0: parseFloat(bar.style.width), plan: f.plan, delta: 0, moved: false };
      tipEl.hidden = true;
      bar.classList.add('is-drag');
      bar.setPointerCapture && bar.setPointerCapture(e.pointerId);
    });
    root.addEventListener('pointermove', (e) => {
      if (!dragState) return;
      const delta = Math.round((e.clientX - dragState.x0) / ctx.px);
      if (delta === dragState.delta) return;
      dragState.delta = delta;
      dragState.moved = dragState.moved || delta !== 0;
      const dpx = delta * ctx.px;
      if (dragState.mode === 'move') dragState.bar.style.left = dragState.l0 + dpx + 'px';
      else dragState.bar.style.width = Math.max(ctx.px, dragState.w0 + dpx) + 'px';
      const row = dragState.bar.closest('.g-row');
      let lbl = row.querySelector('.g-drag-lbl');
      if (!lbl) { lbl = document.createElement('span'); lbl.className = 'g-drag-lbl'; dragState.bar.parentNode.appendChild(lbl); }
      const newEnd = U.addDays(dragState.plan.approval, delta);
      lbl.textContent = (dragState.mode === 'move' && dragState.plan.submit ? 'Submit ' + U.fmtD(U.addDays(dragState.plan.submit, delta)) + ' · ' : '') + 'Approve ' + U.fmtD(newEnd);
      lbl.style.left = parseFloat(dragState.bar.style.left) + parseFloat(dragState.bar.style.width) + 8 + 'px';
    });
    const endDrag = () => {
      if (!dragState) return;
      const { s, delta, mode, plan } = dragState;
      const ds = dragState;
      setTimeout(() => { if (dragState === ds) dragState = null; }, 0);
      ds.bar.classList.remove('is-drag');
      if (!delta) { dragState = null; return; }
      Store.checkpoint('reschedule ' + s.title);
      const patch = {};
      if (mode === 'move') {
        if (plan.submit) patch.planSubmit = U.addDays(plan.submit, delta);
        if (!plan.auto || !plan.submit) patch.planApproval = U.addDays(plan.approval, delta);
      } else {
        patch.planApproval = U.addDays(plan.approval, delta);
        if (plan.submit && patch.planApproval < plan.submit) patch.planApproval = plan.submit;
      }
      M.update(Store.submittal(s.id), patch, 'Target moved: approval ' + U.fmtD(patch.planApproval || Sched.plan({ ...s, ...patch }).approval));
      UI.undoToast(`${s.title}: target approval ${U.fmtD(patch.planApproval || Sched.plan({ ...s, ...patch }).approval)}`);
    };
    root.addEventListener('pointerup', endDrag);
    root.addEventListener('pointercancel', endDrag);
  }
  let dragState = null;

  function baselineDialog() {
    const rows = buildRows().filter((r) => r.type === 'task');
    const n = rows.length;
    const withBase = rows.filter((r) => r.s.baseline).length;
    UI.modal({
      title: 'Baseline',
      body: `<div class="stack">
        <p>A baseline freezes today’s plan so you can see later how far each submittal has slipped. It saves each submittal’s target dates, or its forecast where no target is set.</p>
        <p class="muted">Applies to the ${U.plural(n, 'submittal')} shown in this view. ${withBase ? withBase + ' already have a baseline; saving replaces it.' : ''}</p>
      </div>`,
      foot: `<button class="btn btn-danger-ghost" data-clear ${withBase ? '' : 'disabled'}>Clear baseline</button><span style="flex:1"></span><button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok ${n ? '' : 'disabled'}>Save baseline</button>`,
      onMount(el, api) {
        el.querySelector('[data-ok]').addEventListener('click', () => {
          Store.checkpoint('save baseline');
          const snaps = rows.map((r) => [r.s.id, Sched.baselineFor(r.s)]);
          snaps.forEach(([id, b]) => M.update(Store.submittal(id), { baseline: b }));
          api.close();
          UI.undoToast('Saved baseline for ' + U.plural(n, 'submittal'));
        });
        el.querySelector('[data-clear]').addEventListener('click', () => {
          Store.checkpoint('clear baseline');
          rows.forEach((r) => { if (r.s.baseline) M.update(Store.submittal(r.s.id), { baseline: null }); });
          api.close();
          UI.undoToast('Cleared baseline');
        });
      },
    });
  }

  window.TimelineView = view;
})();
