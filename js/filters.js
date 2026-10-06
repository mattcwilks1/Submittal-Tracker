/* Shared filter state + toolbar for the table, board and dashboard. */
(function () {
  'use strict';
  const F = {};

  const DEFAULTS = { q: '', projectId: '', phase: '', pkg: '', agency: '', department: '', status: [], ball: '', priority: '', discipline: '', flag: '', showArchived: false };

  F.get = () => ({ ...DEFAULTS, ...(UI.prefs.filters || {}) });
  F.set = (patch) => UI.setPref('filters', { ...F.get(), ...patch });
  F.clear = () => UI.setPref('filters', { ...DEFAULTS, q: '' });
  F.isActive = (f) => Object.keys(DEFAULTS).some((k) => k !== 'flag' && JSON.stringify(f[k]) !== JSON.stringify(DEFAULTS[k]));

  // Quick "flag" chips. Each is a predicate on (submittal, derived).
  F.FLAGS = [
    { key: '', label: 'All', test: () => true },
    { key: 'open', label: 'Open', test: (s, d) => !d.done },
    { key: 'overdue', label: 'Overdue reviews', test: (s, d) => d.overdue > 0, tone: 'over' },
    { key: 'us', label: 'In my court', test: (s, d) => s.ball === 'Us' && !d.done && s.status !== 'On Hold' },
    { key: 'consultant', label: "Consultant's court", test: (s, d) => s.ball === 'Consultant' && !d.done && s.status !== 'On Hold' },
    { key: 'agency', label: 'With agency', test: (s, d) => d.withAgency },
    { key: 'stale', label: 'Stale', test: (s, d) => d.stale, tone: 'stale' },
    { key: 'due7', label: 'Due back ≤ 7 days', test: (s, d) => d.dueIn != null && d.dueIn >= 0 && d.dueIn <= 7 },
    { key: 'late', label: 'Forecast late', test: (s) => { const x = Sched.get(s); return x.variance != null && x.variance > 0 && !x.approvalActual; }, tone: 'over' },
    { key: 'next7', label: 'Next actions ≤ 7 days', test: (s, d) => d.nextDue != null && d.nextDue <= 7 },
    { key: 'done', label: 'Approved / closed', test: (s, d) => d.done },
  ];
  F.FLAG_BY_KEY = Object.fromEntries(F.FLAGS.map((x) => [x.key, x]));

  const haystack = (s, w) =>
    [s.title, s.discipline, s.agency, s.department, s.reviewer, s.preparerFirm, s.preparerContact, s.trackingNo, s.nextAction, s.notes, s.status, s.ball,
      w.projectName, w.phaseName, w.pkgName, w.project ? w.project.caseNumbers.join(' ') : '']
      .join(' \u0001 ')
      .toLowerCase();

  /** Everything except the flag chip — chips show counts within this base set. */
  F.base = (f) => {
    f = f || F.get();
    const terms = String(f.q || '').toLowerCase().split(/\s+/).filter(Boolean);
    const archived = new Set(Store.state.projects.filter((p) => p.archived).map((p) => p.id));
    return Store.state.submittals.filter((s) => {
      if (!f.showArchived && archived.has(s.projectId) && f.projectId !== s.projectId) return false;
      if (f.projectId && s.projectId !== f.projectId) return false;
      if (f.status && f.status.length && !f.status.includes(s.status)) return false;
      if (f.ball && s.ball !== f.ball) return false;
      if (f.agency && s.agency !== f.agency) return false;
      if (f.department && s.department !== f.department) return false;
      if (f.priority && s.priority !== f.priority) return false;
      if (f.discipline && s.discipline !== f.discipline) return false;
      if (f.pkg && s.packageId !== f.pkg) return false;
      const w = f.phase || terms.length ? M.where(s) : null;
      if (f.phase && w.phaseName !== f.phase) return false;
      if (terms.length) {
        const h = haystack(s, w);
        if (!terms.every((t) => h.includes(t))) return false;
      }
      return true;
    });
  };

  F.apply = (f) => {
    f = f || F.get();
    const flag = F.FLAG_BY_KEY[f.flag] || F.FLAGS[0];
    return F.base(f).filter((s) => flag.test(s, M.derive(s)));
  };

  const uniq = (arr) => Array.from(new Set(arr.filter(Boolean))).sort((a, b) => U.cmp(a, b));

  F.toolbarHtml = ({ groupBy, columns, exportBtn } = {}) => {
    const f = F.get();
    const subs = Store.state.submittals;
    const projects = Store.projects(true);
    const phaseNames = uniq([].concat(C.DEFAULT_PHASES, ...Store.state.projects.map((p) => p.phases.map((x) => x.name))));
    const selP = f.projectId ? Store.project(f.projectId) : null;
    const pkgOpts = selP ? selP.phases.flatMap((ph) => ph.packages.map((k) => ({ value: k.id, label: ph.name + ' › ' + k.name }))) : [];
    const moreCount = ['phase', 'pkg', 'agency', 'department', 'discipline', 'priority'].filter((k) => f[k]).length + (f.showArchived ? 1 : 0);
    const stCount = (f.status || []).length;

    return `<div class="toolbar" role="search">
      <label class="search">${UI.icon('search')}<input id="flt-q" type="search" placeholder="Search title, tracking #, reviewer, case #…" value="${U.esc(f.q)}" aria-label="Search submittals" data-k="q"><kbd>/</kbd></label>
      <select id="flt-project" data-k="projectId" aria-label="Project">${UI.options(projects.map((p) => ({ value: p.id, label: p.name + (p.archived ? ' (archived)' : '') })), f.projectId, 'All projects')}</select>
      <details class="dd" id="dd-status">
        <summary class="btn ${stCount ? 'is-on' : ''}">Status${stCount ? ` <b class="count">${stCount}</b>` : ''} ${UI.icon('chevDown')}</summary>
        <div class="dd-panel">
          ${C.STATUSES.map((s) => `<label class="chk"><input type="checkbox" data-status="${U.esc(s.key)}" ${f.status.includes(s.key) ? 'checked' : ''}> ${UI.statusPill(s.key)}</label>`).join('')}
          <div class="dd-foot"><button class="btn btn-sm" data-act="status-open">Open only</button><button class="btn btn-sm" data-act="status-none">Any status</button></div>
        </div>
      </details>
      <select id="flt-ball" data-k="ball" aria-label="Ball in court">${UI.options(C.BALL.map((b) => ({ value: b, label: 'Court: ' + b })), f.ball, 'Any court')}</select>
      <details class="dd" id="dd-more">
        <summary class="btn ${moreCount ? 'is-on' : ''}">${UI.icon('filter')}More${moreCount ? ` <b class="count">${moreCount}</b>` : ''}</summary>
        <div class="dd-panel dd-form">
          <label class="fld"><span>Phase</span><select id="flt-phase" data-k="phase">${UI.options(phaseNames, f.phase, 'Any phase')}</select></label>
          <label class="fld"><span>Package${selP ? '' : ' (pick a project)'}</span><select id="flt-pkg" data-k="pkg" ${selP ? '' : 'disabled'}>${UI.options(pkgOpts, f.pkg, 'Any package')}</select></label>
          <label class="fld"><span>Agency</span><select id="flt-agency" data-k="agency">${UI.options(uniq(subs.map((s) => s.agency)), f.agency, 'Any agency')}</select></label>
          <label class="fld"><span>Department</span><select id="flt-dept" data-k="department">${UI.options(uniq(subs.map((s) => s.department)), f.department, 'Any department')}</select></label>
          <label class="fld"><span>Discipline</span><select id="flt-disc" data-k="discipline">${UI.options(uniq(subs.map((s) => s.discipline)), f.discipline, 'Any discipline')}</select></label>
          <label class="fld"><span>Priority</span><select id="flt-pri" data-k="priority">${UI.options(C.PRIORITY, f.priority, 'Any priority')}</select></label>
          <label class="chk"><input id="flt-arch" type="checkbox" data-k="showArchived" ${f.showArchived ? 'checked' : ''}> Include archived projects</label>
        </div>
      </details>
      ${groupBy || ''}
      ${columns || ''}
      <button class="btn btn-ghost" data-act="clear-filters" ${F.isActive(f) ? '' : 'hidden'}>${UI.icon('x')}Clear</button>
      ${exportBtn ? `<button class="btn btn-ghost tb-end" data-act="export-view" title="Export the rows shown to CSV">${UI.icon('download')}CSV</button>` : ''}
    </div>`;
  };

  F.chipsHtml = () => {
    const f = F.get();
    const base = F.base(f);
    const ds = base.map((s) => [s, M.derive(s)]);
    return `<div class="chips" role="group" aria-label="Quick filters">${F.FLAGS.map((fl) => {
      const n = ds.filter(([s, d]) => fl.test(s, d)).length;
      const on = (f.flag || '') === fl.key;
      return `<button class="chip ${on ? 'is-on' : ''} ${fl.tone && n ? 'chip-' + fl.tone : ''}" data-flag="${fl.key}" aria-pressed="${on}">${U.esc(fl.label)} <b>${n}</b></button>`;
    }).join('')}</div>`;
  };

  /** Wire a toolbar inside `root`; `onChange()` re-renders results. */
  F.bind = (root, onChange) => {
    const rerender = U.debounce(onChange, 120);
    root.addEventListener('input', (e) => {
      const k = e.target.dataset.k;
      if (k === 'q') { F.set({ q: e.target.value }); rerender(); }
    });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.status !== undefined) {
        const cur = new Set(F.get().status);
        t.checked ? cur.add(t.dataset.status) : cur.delete(t.dataset.status);
        F.set({ status: C.STATUS_KEYS.filter((k) => cur.has(k)) });
        onChange(true);
        return;
      }
      const k = t.dataset.k;
      if (!k || k === 'q') return;
      const patch = { [k]: t.type === 'checkbox' ? t.checked : t.value };
      if (k === 'projectId') patch.pkg = '';
      F.set(patch);
      onChange(true);
    });
    root.addEventListener('click', (e) => {
      const chip = e.target.closest('[data-flag]');
      if (chip) { F.set({ flag: chip.dataset.flag }); onChange(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      if (b.dataset.act === 'clear-filters') { F.clear(); onChange(true); }
      if (b.dataset.act === 'status-open') { F.set({ status: C.STATUS_KEYS.filter((k) => !C.DONE.includes(k)) }); onChange(true); }
      if (b.dataset.act === 'status-none') { F.set({ status: [] }); onChange(true); }
    });
  };

  window.F = F;
})();
