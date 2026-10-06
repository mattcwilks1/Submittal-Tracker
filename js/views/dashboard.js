/* Dashboard: what needs attention today. */
(function () {
  'use strict';

  function scope() {
    const pid = UI.prefs.dashProject || '';
    const archived = new Set(Store.state.projects.filter((p) => p.archived).map((p) => p.id));
    return Store.state.submittals
      .filter((s) => (pid ? s.projectId === pid : !archived.has(s.projectId)))
      .map((s) => ({ s, d: M.derive(s), w: M.where(s) }));
  }

  function liHtml(r, metric, metricCls) {
    const { s, w } = r;
    return `<li class="li" data-id="${s.id}">
      <button class="li-main" data-act="open">
        <span class="li-title">${U.esc(s.title || '(untitled)')}</span>
        <span class="li-where">${U.esc(w.projectName)}${w.pkgName ? ' › ' + U.esc(w.pkgName) : ''}${s.agency ? ' · ' + U.esc(s.department || s.agency) : ''}</span>
      </button>
      <span class="li-side">${UI.statusPill(s.status, 'pill-sm')}<span class="li-metric ${metricCls || ''}">${metric}</span></span>
    </li>`;
  }

  function panel(title, sub, rows, render, { empty, flag, limit = 8 } = {}) {
    const more = rows.length > limit ? rows.length - limit : 0;
    return `<section class="panel">
      <header class="panel-h"><h2>${title} <span class="count-badge">${rows.length}</span></h2>${sub ? `<span class="panel-sub">${sub}</span>` : ''}</header>
      ${rows.length ? `<ul class="list">${rows.slice(0, limit).map(render).join('')}</ul>` : `<p class="panel-empty">${empty}</p>`}
      ${more || (flag && rows.length) ? `<footer class="panel-f"><button class="btn btn-ghost btn-sm" data-goto-flag="${flag || ''}">${more ? 'Show all ' + rows.length : 'Open in table'} ${UI.icon('chev')}</button></footer>` : ''}
    </section>`;
  }

  function render(root) {
    const today = U.today();
    const rows = scope();
    const open = rows.filter((r) => !r.d.done);
    const staleDays = Store.state.settings.staleDays;

    const overdue = rows.filter((r) => r.d.overdue).sort((a, b) => b.d.overdue - a.d.overdue);
    const withAgency = rows.filter((r) => r.d.withAgency);
    const mine = open.filter((r) => r.s.ball === 'Us' && r.s.status !== 'On Hold').sort((a, b) => (b.d.ballDays || 0) - (a.d.ballDays || 0));
    const cons = open.filter((r) => r.s.ball === 'Consultant' && r.s.status !== 'On Hold').sort((a, b) => (b.d.ballDays || 0) - (a.d.ballDays || 0));
    const stale = rows.filter((r) => r.d.stale);

    const wk = U.weekStart(today);
    const wkEnd = U.addDays(wk, 6);
    const nwk = U.addDays(wk, 7);
    const nwkEnd = U.addDays(wk, 13);
    const inRange = (r, a, b) => r.d.withAgency && r.d.due && r.d.due >= a && r.d.due <= b;
    const thisWeek = withAgency.filter((r) => inRange(r, wk, wkEnd)).sort((a, b) => U.cmp(a.d.due, b.d.due));
    const nextWeek = withAgency.filter((r) => inRange(r, nwk, nwkEnd)).sort((a, b) => U.cmp(a.d.due, b.d.due));
    const nextActs = open.filter((r) => r.d.nextDue != null && r.d.nextDue <= 7).sort((a, b) => a.d.nextDue - b.d.nextDue);

    const projects = Store.projects(false);
    const pid = UI.prefs.dashProject || '';

    const tile = (label, n, flag, tone, sub) =>
      `<button class="tile ${tone ? 'tile-' + tone : ''} ${n ? '' : 'is-zero'}" data-goto-flag="${flag}">
        <span class="tile-n">${n}</span><span class="tile-l">${label}</span>${sub ? `<span class="tile-s">${sub}</span>` : ''}
      </button>`;

    // Status distribution: one bar per status, labeled; identity is the label, not the bar color.
    const counts = C.STATUS_KEYS.map((k) => ({ k, n: rows.filter((r) => r.s.status === k).length }));
    const maxN = Math.max(1, ...counts.map((c) => c.n));
    const dist = `<section class="panel">
      <header class="panel-h"><h2>By status <span class="count-badge">${rows.length}</span></h2><span class="panel-sub">Click a status to filter the table</span></header>
      ${rows.length ? `<div class="bars" role="list">${counts.map((c) => `<button class="bar-row" role="listitem" data-goto-status="${U.esc(c.k)}" title="${U.esc(c.k)}: ${c.n}">
          <span class="bar-l">${UI.statusPill(c.k, 'pill-sm')}</span>
          <span class="bar-track"><span class="bar-fill st-bar-${C.STATUS_BY_KEY[c.k].cls}" style="width:${c.n ? Math.max(2, (c.n / maxN) * 100) : 0}%"></span></span>
          <span class="bar-n num">${c.n}</span>
        </button>`).join('')}</div>` : '<p class="panel-empty">No submittals yet.</p>'}
    </section>`;

    const projRows = (pid ? projects.filter((p) => p.id === pid) : projects).map((p) => {
      const ps = rows.filter((r) => r.s.projectId === p.id);
      const pr = M.progress(ps.map((r) => r.s));
      return `<tr data-project="${p.id}">
        <th scope="row"><button class="row-title" data-open-project="${p.id}">${U.esc(p.name)}</button><div class="row-sub mono">${U.esc(p.caseNumbers.join(' · '))}</div></th>
        <td class="c-num" data-label="Open">${ps.filter((r) => !r.d.done).length}</td>
        <td class="c-num" data-label="With agency">${ps.filter((r) => r.d.withAgency).length}</td>
        <td class="c-num ${ps.some((r) => r.d.overdue) ? 'txt-over' : ''}" data-label="Overdue">${ps.filter((r) => r.d.overdue).length}</td>
        <td class="c-num" data-label="My court">${ps.filter((r) => r.s.ball === 'Us' && !r.d.done).length}</td>
        <td data-label="Approved">${ps.length ? UI.progress(pr) : '<span class="muted">No submittals</span>'}</td>
      </tr>`;
    }).join('');

    root.innerHTML = `
      <div class="view-h view-h-row">
        <div><h1>Dashboard</h1><p class="view-sub">${U.esc(U.fmtLong(today))}${Store.state.settings.myName ? ' · ' + U.esc(Store.state.settings.myName) : ''}</p></div>
        <label class="inline-sel">Project<select id="dash-project">${UI.options(projects.map((p) => ({ value: p.id, label: p.name })), pid, 'All active projects')}</select></label>
      </div>
      <div class="tiles">
        ${tile('Open submittals', open.length, 'open')}
        ${tile('With agency', withAgency.length, 'agency')}
        ${tile('Overdue reviews', overdue.length, 'overdue', 'over', overdue.length ? 'oldest ' + overdue[0].d.overdue + 'd past due' : 'none past due')}
        ${tile('In my court', mine.length, 'us', 'us', mine.length ? 'longest ' + (mine[0].d.ballDays || 0) + 'd' : '')}
        ${tile("Consultant's court", cons.length, 'consultant', '', cons.length ? 'longest ' + (cons[0].d.ballDays || 0) + 'd' : '')}
        ${tile('Stale > ' + staleDays + ' days', stale.length, 'stale', 'stale', 'with us or consultant')}
      </div>
      <div class="dash-grid">
        <div class="dash-col">
          ${panel('Overdue reviews', 'Past due-back date, no comments yet', overdue, (r) => liHtml(r, r.d.overdue + 'd overdue', 'txt-over'), { empty: 'Nothing overdue. Every agency review is within its turnaround.', flag: 'overdue' })}
          ${panel('In my court', 'Longest waiting first', mine, (r) => liHtml(r, (r.d.ballDays || 0) + 'd', r.d.stale ? 'txt-stale' : ''), { empty: 'Nothing waiting on you.', flag: 'us' })}
          ${panel("Consultant's court", 'Longest waiting first', cons, (r) => liHtml(r, (r.d.ballDays || 0) + 'd' + (r.s.preparerFirm ? ' · ' + U.esc(r.s.preparerFirm) : ''), r.d.stale ? 'txt-stale' : ''), { empty: 'Nothing with consultants.', flag: 'consultant' })}
        </div>
        <div class="dash-col">
          ${panel('Due back this week', U.fmtD(wk) + ' – ' + U.fmtD(wkEnd), thisWeek, (r) => liHtml(r, U.fmtD(r.d.due) + (r.d.overdue ? ' · late' : ''), r.d.overdue ? 'txt-over' : ''), { empty: 'No reviews due back this week.', limit: 10 })}
          ${panel('Due back next week', U.fmtD(nwk) + ' – ' + U.fmtD(nwkEnd), nextWeek, (r) => liHtml(r, U.fmtD(r.d.due)), { empty: 'No reviews due back next week.', limit: 10 })}
          ${panel('Next actions', 'Due within 7 days or past due', nextActs, (r) => liHtml(r, U.esc(r.s.nextAction || 'Next action') + ' · ' + U.fmtD(r.s.nextActionDate), r.d.nextDue < 0 ? 'txt-over' : ''), { empty: 'No dated next actions in the coming week.', flag: 'next7' })}
          ${dist}
        </div>
      </div>
      <section class="panel panel-flush">
        <header class="panel-h"><h2>Projects</h2><span class="panel-sub">% approved counts Approved, Approved w/ Conditions and Recorded/Closed</span></header>
        <div class="table-wrap"><table class="grid grid-compact proj-table">
          <thead><tr><th>Project</th><th class="c-num">Open</th><th class="c-num">With agency</th><th class="c-num">Overdue</th><th class="c-num">My court</th><th>Approved</th></tr></thead>
          <tbody>${projRows || '<tr><td colspan="6" class="muted">No projects yet. Add one under Projects.</td></tr>'}</tbody>
        </table></div>
      </section>`;

    if (!root.dataset.bound) bind(root);
  }

  function bind(root) {
    root.dataset.bound = '1';
    root.addEventListener('change', (e) => {
      if (e.target.id === 'dash-project') { UI.setPref('dashProject', e.target.value); render(root); }
    });
    root.addEventListener('click', (e) => {
      const fl = e.target.closest('[data-goto-flag]');
      if (fl) {
        F.set({ ...blankFilters(), flag: fl.dataset.gotoFlag });
        App.go('table');
        return;
      }
      const st = e.target.closest('[data-goto-status]');
      if (st) {
        F.set({ ...blankFilters(), status: [st.dataset.gotoStatus] });
        App.go('table');
        return;
      }
      const pj = e.target.closest('[data-open-project]');
      if (pj) { App.go('project/' + pj.dataset.openProject); return; }
      App.handleRowClick(e);
    });
  }

  const blankFilters = () => ({ q: '', projectId: UI.prefs.dashProject || '', phase: '', pkg: '', agency: '', department: '', status: [], ball: '', priority: '', discipline: '', flag: '' });

  window.DashboardView = { title: 'Dashboard', render, refresh: render };
})();
