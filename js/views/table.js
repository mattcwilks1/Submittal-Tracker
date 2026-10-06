/* Table view: dense, sortable, groupable list with bulk edit. */
(function () {
  'use strict';

  const statusIdx = Object.fromEntries(C.STATUS_KEYS.map((k, i) => [k, i]));
  const ballIdx = { Us: 0, Consultant: 1, Agency: 2 };
  const priIdx = { High: 0, Normal: 1, Low: 2 };
  const phaseIdx = (n) => {
    const i = C.DEFAULT_PHASES.indexOf(n);
    return i < 0 ? 100 : i;
  };

  const EMPTY = '<span class="muted">—</span>';
  const num = (v, unit) => (v == null ? '<span class="muted">—</span>' : `<span class="num">${v}${unit || ''}</span>`);

  // Column definitions. `def` = visible by default.
  const COLS = [
    {
      key: 'title', label: 'Submittal', fixed: true, sort: (s) => s.title.toLowerCase(),
      td: (s, d) => `<button class="row-title" data-act="open">${U.esc(s.title || '(untitled)')}</button>
        <div class="row-sub">${U.esc([s.discipline, s.trackingNo].filter(Boolean).join(' · '))}${s.links && s.links.length ? ` <span class="muted" title="${s.links.length} file link(s)">${UI.icon('link')}${s.links.length}</span>` : ''}</div>
        <div class="row-flags">${UI.flags(s, d)}</div>`,
    },
    {
      key: 'project', label: 'Project / Package', def: true, sort: (s, d, w) => (w.projectName + ' ' + phaseIdx(w.phaseName) + ' ' + w.pkgName).toLowerCase(),
      td: (s, d, w) => `<div class="cell-2"><b>${U.esc(w.projectName)}</b><span>${U.esc(w.pkgName || w.phaseName || '—')}</span></div>`,
    },
    {
      key: 'agency', label: 'Agency / Dept', def: true, sort: (s) => (s.agency + ' ' + s.department).toLowerCase(),
      td: (s) => `<div class="cell-2"><span>${U.esc(s.agency || '—')}</span><span>${U.esc(s.department || '')}</span></div>`,
    },
    {
      key: 'status', label: 'Status', def: true, sort: (s) => statusIdx[s.status] ?? 99,
      td: (s, d) => `<button class="pill-btn" data-act="status-menu" title="Change status">${UI.statusPill(s.status)}</button>${d.daysInStatus != null ? `<div class="row-sub">${d.daysInStatus}d in status</div>` : ''}`,
    },
    {
      key: 'ball', label: 'Court', def: true, sort: (s, d) => (ballIdx[s.ball] ?? 9) * 10000 - (d.ballDays || 0),
      td: (s, d) => `<button class="pill-btn" data-act="ball-menu" title="Change ball in court">${UI.ballChip(s.ball, d)}</button>`,
    },
    { key: 'cycle', label: 'Cycle', def: true, cls: 'c-num', sort: (s, d) => d.cycleN, td: (s, d) => (d.cycleN ? `<span class="num">${U.ordinal(d.cycleN)}</span>` : '<span class="muted">—</span>') },
    { key: 'submitted', label: 'Submitted', def: true, sort: (s, d) => d.submitted, td: (s, d) => UI.dateCell(d.submitted) },
    {
      key: 'due', label: 'Due back', def: true, sort: (s, d) => (d.withAgency ? d.due : d.done ? '9999-12-31' : '9999-01-01'),
      td: (s, d) => (d.withAgency ? UI.dateCell(d.due, d.overdue ? 'is-over' : '') : d.received ? `<span class="muted" title="Comments received ${U.esc(U.fmtLong(d.received))}">in ${U.fmtD(d.received)}</span>` : '<span class="muted">—</span>'),
    },
    { key: 'total', label: 'Total days', def: true, cls: 'c-num', sort: (s, d) => d.totalDays, td: (s, d) => num(d.totalDays) },
    {
      key: 'next', label: 'Next action', def: true, sort: (s) => s.nextActionDate || (s.nextAction ? '9999' : ''),
      td: (s, d) => (s.nextAction || s.nextActionDate ? `<div class="cell-2 next"><span>${U.esc(s.nextAction || '')}</span>${s.nextActionDate ? `<span class="${d.nextDue != null && d.nextDue < 0 ? 'is-over' : ''}">${U.fmtD(s.nextActionDate)}</span>` : ''}</div>` : '<span class="muted">—</span>'),
    },
    { key: 'reviewer', label: 'Reviewer', sort: (s) => s.reviewer.toLowerCase(), td: (s) => U.esc(s.reviewer) || '<span class="muted">—</span>' },
    { key: 'preparer', label: 'Preparer', sort: (s) => s.preparerFirm.toLowerCase(), td: (s) => `<div class="cell-2"><span>${U.esc(s.preparerFirm || '—')}</span><span>${U.esc(s.preparerContact || '')}</span></div>` },
    { key: 'tracking', label: 'Tracking #', sort: (s) => s.trackingNo, td: (s) => (s.trackingNo ? `<span class="mono">${U.esc(s.trackingNo)}</span>` : '<span class="muted">—</span>') },
    { key: 'priority', label: 'Priority', sort: (s) => priIdx[s.priority] ?? 9, td: (s) => U.esc(s.priority || '') },
    { key: 'fees', label: 'Fees', sort: (s) => s.feesPaid, td: (s) => U.esc([s.feeAmount ? '$' + s.feeAmount : '', s.feesPaid].filter(Boolean).join(' · ')) || '<span class="muted">—</span>' },
    { key: 'inStatus', label: 'Days in status', cls: 'c-num', sort: (s, d) => d.daysInStatus, td: (s, d) => num(d.daysInStatus) },
    { key: 'updated', label: 'Updated', sort: (s) => s.updatedAt || '', td: (s) => UI.dateCell((s.updatedAt || '').slice(0, 10)) },
  ];
  const COL_BY_KEY = Object.fromEntries(COLS.map((c) => [c.key, c]));

  const GROUPS = {
    none: { label: 'No grouping' },
    project: { label: 'Project', key: (s, w) => w.projectName, order: (k) => { const p = Store.state.projects.find((x) => x.name === k); return p ? (p.order ?? 0) : 999; } },
    phase: { label: 'Phase', key: (s, w) => w.phaseName || '(no phase)', order: phaseIdx },
    package: { label: 'Package', key: (s, w) => w.projectName + ' › ' + (w.phaseName || '—') + ' › ' + (w.pkgName || '—') },
    agency: { label: 'Agency', key: (s) => s.agency || '(no agency)' },
    status: { label: 'Status', key: (s) => s.status, order: (k) => statusIdx[k] ?? 99 },
    ball: { label: 'Ball in court', key: (s) => s.ball, order: (k) => ballIdx[k] ?? 9 },
    discipline: { label: 'Discipline', key: (s) => s.discipline || '(none)' },
  };

  const visibleCols = () => {
    const pref = UI.prefs.columns || {};
    return COLS.filter((c) => c.fixed || (pref[c.key] != null ? pref[c.key] : c.def));
  };

  const T = { sel: new Set(), shown: [] };

  /** Sorted rows (with derived + location), honoring the current sort. */
  T.rows = (list) => {
    const { key, dir } = UI.prefs.sort || { key: 'due', dir: 'asc' };
    const col = COL_BY_KEY[key] || COL_BY_KEY.due;
    const rows = list.map((s) => ({ s, d: M.derive(s), w: M.where(s) }));
    rows.forEach((r) => { r.k = col.sort(r.s, r.d, r.w); });
    rows.sort((a, b) => {
      const c = U.cmp(a.k, b.k);
      return (dir === 'desc' ? -c : c) || U.cmp(a.s.title, b.s.title);
    });
    return rows;
  };

  T.rowHtml = (r, cols, opts = {}) => {
    const { s, d, w } = r;
    const qa = M.quickAction(s);
    return `<tr class="row ${d.overdue ? 'is-over' : ''} ${d.stale ? 'is-stale' : ''} ${d.done ? 'is-done' : ''} ${T.sel.has(s.id) ? 'is-sel' : ''}" data-id="${s.id}">
      ${opts.noSelect ? '' : `<td class="c-sel"><input type="checkbox" data-sel aria-label="Select ${U.esc(s.title)}" ${T.sel.has(s.id) ? 'checked' : ''}></td>`}
      ${cols.map((c) => { const h = c.td(s, d, w); return `<td class="c-${c.key} ${c.cls || ''} ${h === EMPTY ? 'td-empty' : ''}" data-label="${U.esc(c.label)}">${h}</td>`; }).join('')}
      <td class="c-act">${qa ? `<button class="btn btn-sm btn-quick" data-act="${qa.act}" title="${U.esc(qa.title)}">${U.esc(qa.label)}</button>` : ''}<button class="icon-btn" data-act="row-menu" aria-label="More actions">${UI.icon('more')}</button></td>
    </tr>`;
  };

  T.headHtml = (cols, opts = {}) => {
    const { key, dir } = UI.prefs.sort || {};
    return `<thead><tr>
      ${opts.noSelect ? '' : '<th class="c-sel"><input type="checkbox" data-sel-all aria-label="Select all shown"></th>'}
      ${cols.map((c) => `<th class="c-${c.key} ${c.cls || ''}" aria-sort="${key === c.key ? (dir === 'desc' ? 'descending' : 'ascending') : 'none'}"><button class="th-btn" data-sort="${c.key}">${U.esc(c.label)}${key === c.key ? UI.icon(dir === 'desc' ? 'down' : 'up', 'ic-sort') : ''}</button></th>`).join('')}
      <th class="c-act"><span class="sr">Actions</span></th>
    </tr></thead>`;
  };

  function groupBarHtml() {
    const g = UI.prefs.groupBy || 'project';
    return `<label class="inline-sel">Group<select id="tbl-group" data-group>${UI.options(Object.entries(GROUPS).map(([k, v]) => ({ value: k, label: v.label })), g)}</select></label>`;
  }

  function columnsHtml() {
    const vis = new Set(visibleCols().map((c) => c.key));
    return `<details class="dd" id="dd-cols"><summary class="btn">Columns ${UI.icon('chevDown')}</summary><div class="dd-panel">
      ${COLS.filter((c) => !c.fixed).map((c) => `<label class="chk"><input type="checkbox" data-col="${c.key}" ${vis.has(c.key) ? 'checked' : ''}> ${U.esc(c.label)}</label>`).join('')}
      <div class="dd-foot"><button class="btn btn-sm" data-act="cols-reset">Reset columns</button></div>
    </div></details>`;
  }

  function resultsHtml() {
    const list = F.apply();
    const rows = T.rows(list);
    T.shown = rows.map((r) => r.s.id);
    // drop selections that are no longer visible
    T.sel.forEach((id) => { if (!T.shown.includes(id)) T.sel.delete(id); });
    const cols = visibleCols();
    const g = UI.prefs.groupBy || 'project';
    const total = Store.state.submittals.length;

    if (!rows.length) {
      return `${F.chipsHtml()}<div class="empty">
        ${total ? '<h3>No submittals match these filters.</h3><p>Clear filters or pick a different quick filter.</p><button class="btn" data-act="clear-filters">Clear filters</button>'
          : '<h3>No submittals yet.</h3><p>Add one with <b>New submittal</b>, or open a project and apply a package template to create a full set at once.</p><button class="btn btn-primary" data-act="new">' + UI.icon('plus') + 'New submittal</button>'}
      </div>`;
    }

    let body = '';
    const colspan = cols.length + 2;
    if (g === 'none' || !GROUPS[g]) {
      body = `<tbody>${rows.map((r) => T.rowHtml(r, cols)).join('')}</tbody>`;
    } else {
      const G = GROUPS[g];
      const map = new Map();
      rows.forEach((r) => {
        const k = G.key(r.s, r.w);
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(r);
      });
      const keys = Array.from(map.keys()).sort((a, b) => (G.order ? U.cmp(G.order(a), G.order(b)) : 0) || U.cmp(a, b));
      body = keys.map((k) => {
        const rs = map.get(k);
        const ck = 'g:' + g + ':' + k;
        const collapsed = !!UI.prefs.collapsed[ck];
        const over = rs.filter((r) => r.d.overdue).length;
        const pr = M.progress(rs.map((r) => r.s));
        return `<tbody class="grp ${collapsed ? 'is-collapsed' : ''}">
          <tr class="grp-h"><th colspan="${colspan}">
            <div class="grp-row">
              <input type="checkbox" data-sel-group="${U.esc(k)}" aria-label="Select all in ${U.esc(k)}">
              <button class="grp-toggle" data-collapse="${U.esc(ck)}" aria-expanded="${!collapsed}">${UI.icon('chev', 'ic-chev')}<span class="grp-name">${g === 'status' ? UI.statusPill(k) : U.esc(k)}</span></button>
              <span class="grp-meta">${U.plural(rs.length, 'item')}${over ? ` · <span class="txt-over">${over} overdue</span>` : ''}</span>
              ${UI.progress(pr, 'approved')}
            </div>
          </th></tr>
          ${collapsed ? '' : rs.map((r) => T.rowHtml(r, cols)).join('')}
        </tbody>`;
      }).join('');
    }

    return `${F.chipsHtml()}
      <div class="table-meta"><span>${U.plural(rows.length, 'submittal')}${rows.length !== total ? ' of ' + total : ''}</span></div>
      <div class="table-wrap"><table class="grid" data-grouped="${g !== 'none'}">${T.headHtml(cols)}${body}</table></div>`;
  }

  function bulkBarHtml() {
    const n = T.sel.size;
    if (!n) return '';
    return `<div class="bulk" role="region" aria-label="Bulk edit">
      <b>${n} selected</b>
      <label class="inline-sel">Status<select id="bulk-status" data-bulk="status">${UI.options(C.STATUS_KEYS, '', 'Set…')}</select></label>
      <label class="inline-sel">Court<select id="bulk-ball" data-bulk="ball">${UI.options(C.BALL, '', 'Set…')}</select></label>
      <label class="inline-sel">Priority<select id="bulk-pri" data-bulk="priority">${UI.options(C.PRIORITY, '', 'Set…')}</select></label>
      <button class="btn btn-sm" data-act="bulk-move">Move to phase / package…</button>
      <button class="btn btn-sm" data-act="bulk-resubmit" title="Start a new review cycle today for each selected item">Log resubmittal</button>
      <button class="btn btn-sm" data-act="bulk-dup">Duplicate</button>
      <button class="btn btn-sm btn-danger-ghost" data-act="bulk-delete">Delete</button>
      <button class="btn btn-sm btn-ghost" data-act="bulk-clear">Clear selection</button>
    </div>`;
  }

  const view = {
    title: 'Submittals',
    render(root) {
      const openDD = Array.from(root.querySelectorAll('details.dd[open]')).map((x) => x.id);
      root.innerHTML = `<div class="view-h"><h1>Submittals</h1><p class="view-sub">Every submittal across your projects. Click a row to edit; use the chips for quick filters.</p></div>
        <div id="tbl-toolbar">${F.toolbarHtml({ groupBy: groupBarHtml(), columns: columnsHtml(), exportBtn: true })}</div>
        <div id="tbl-results">${resultsHtml()}</div>
        <div id="tbl-bulk">${bulkBarHtml()}</div>`;
      openDD.forEach((id) => { const d = root.querySelector('#' + id); if (d) d.open = true; });
      if (!root.dataset.bound) bind(root);
    },
    refresh(root) {
      const res = root.querySelector('#tbl-results');
      if (!res) return view.render(root);
      res.innerHTML = resultsHtml();
      root.querySelector('#tbl-bulk').innerHTML = bulkBarHtml();
    },
  };

  function bind(root) {
    root.dataset.bound = '1';
    F.bind(root, (full) => (full ? view.render(root) : view.refresh(root)));

    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.group !== undefined) { UI.setPref('groupBy', t.value); view.refresh(root); return; }
      if (t.dataset.col) {
        UI.setPref('columns', { ...UI.prefs.columns, [t.dataset.col]: t.checked });
        view.refresh(root);
        return;
      }
      if (t.matches('[data-sel]')) {
        const id = t.closest('tr').dataset.id;
        t.checked ? T.sel.add(id) : T.sel.delete(id);
        t.closest('tr').classList.toggle('is-sel', t.checked);
        root.querySelector('#tbl-bulk').innerHTML = bulkBarHtml();
        return;
      }
      if (t.matches('[data-sel-all]')) {
        T.shown.forEach((id) => (t.checked ? T.sel.add(id) : T.sel.delete(id)));
        view.refresh(root);
        return;
      }
      if (t.matches('[data-sel-group]')) {
        const ids = Array.from(t.closest('tbody').querySelectorAll('tr[data-id]')).map((r) => r.dataset.id);
        ids.forEach((id) => (t.checked ? T.sel.add(id) : T.sel.delete(id)));
        view.refresh(root);
        return;
      }
      if (t.dataset.bulk) {
        if (!t.value) return;
        const field = t.dataset.bulk;
        const val = t.value;
        Store.checkpoint('bulk ' + field + ' change');
        T.sel.forEach((id) => {
          const s = Store.submittal(id);
          if (!s) return;
          if (field === 'status') App.applyStatus(s, val);
          else M.update(s, { [field]: val });
        });
        UI.undoToast(`Set ${field === 'ball' ? 'ball in court' : field} to "${val}" on ${U.plural(T.sel.size, 'submittal')}`);
      }
    });

    root.addEventListener('click', async (e) => {
      const sortBtn = e.target.closest('[data-sort]');
      if (sortBtn) {
        const k = sortBtn.dataset.sort;
        const cur = UI.prefs.sort || {};
        UI.setPref('sort', { key: k, dir: cur.key === k && cur.dir === 'asc' ? 'desc' : 'asc' });
        view.refresh(root);
        return;
      }
      const col = e.target.closest('[data-collapse]');
      if (col) {
        const k = col.dataset.collapse;
        UI.setPref('collapsed', { ...UI.prefs.collapsed, [k]: !UI.prefs.collapsed[k] });
        view.refresh(root);
        return;
      }
      const b = e.target.closest('[data-act]');
      const act = b && b.dataset.act;
      if (act === 'cols-reset') { UI.setPref('columns', {}); view.render(root); return; }
      if (act === 'export-view') { IO.exportCsv(F.apply(), 'submittals-view'); return; }
      if (act === 'new') { App.quickAdd(); return; }
      if (act === 'bulk-clear') { T.sel.clear(); view.refresh(root); return; }
      if (act === 'bulk-move') { bulkMove(); return; }
      if (act === 'bulk-resubmit') {
        Store.checkpoint('bulk resubmittal');
        T.sel.forEach((id) => { const s = Store.submittal(id); if (s) M.logResubmittal(s); });
        UI.undoToast('Logged resubmittal for ' + U.plural(T.sel.size, 'submittal'));
        return;
      }
      if (act === 'bulk-dup') {
        Store.checkpoint('bulk duplicate');
        T.sel.forEach((id) => { const s = Store.submittal(id); if (s) M.duplicate(s); });
        UI.undoToast('Duplicated ' + U.plural(T.sel.size, 'submittal'));
        T.sel.clear();
        return;
      }
      if (act === 'bulk-delete') {
        const n = T.sel.size;
        if (!(await UI.confirm(`Delete ${U.plural(n, 'submittal')}? Their review cycles and notes go with them.`, { title: 'Delete submittals', ok: 'Delete', danger: true }))) return;
        Store.checkpoint('delete ' + U.plural(n, 'submittal'));
        T.sel.forEach((id) => Store.removeSubmittal(id));
        T.sel.clear();
        UI.undoToast('Deleted ' + U.plural(n, 'submittal'));
        return;
      }
      if (App.handleRowClick(e)) return;
    });
  }

  async function bulkMove() {
    const subs = Array.from(T.sel).map(Store.submittal).filter(Boolean);
    const projIds = Array.from(new Set(subs.map((s) => s.projectId)));
    const projs = projIds.map(Store.project).filter(Boolean);
    const phaseNames = Array.from(new Set(projs.flatMap((p) => p.phases.map((x) => x.name))));
    const pkgNamesFor = (phName) => Array.from(new Set(projs.flatMap((p) => (p.phases.find((x) => x.name === phName) || { packages: [] }).packages.map((k) => k.name))));
    UI.modal({
      title: 'Move ' + U.plural(subs.length, 'submittal'),
      body: `<form class="stack" id="move-form">
        <p class="muted">${projs.length > 1 ? 'Selected items span ' + projs.length + ' projects. Each stays in its project; the phase and package are matched by name and created where missing.' : 'Project: <b>' + U.esc(projs[0] ? projs[0].name : '') + '</b>'}</p>
        <label class="fld"><span>Phase</span><input id="mv-phase" list="mv-phases" value="${U.esc(phaseNames[1] || phaseNames[0] || '')}" required></label>
        <datalist id="mv-phases">${phaseNames.map((n) => `<option value="${U.esc(n)}">`).join('')}</datalist>
        <label class="fld"><span>Package</span><input id="mv-pkg" list="mv-pkgs" placeholder="e.g. Rough Grading 1st Submittal" required></label>
        <datalist id="mv-pkgs"></datalist>
      </form>`,
      foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Move</button>',
      onMount(el, api) {
        const ph = el.querySelector('#mv-phase');
        const dl = el.querySelector('#mv-pkgs');
        const fill = () => { dl.innerHTML = pkgNamesFor(ph.value).map((n) => `<option value="${U.esc(n)}">`).join(''); };
        ph.addEventListener('input', fill);
        fill();
        const go = (e) => {
          e && e.preventDefault();
          const phase = ph.value.trim();
          const pkg = el.querySelector('#mv-pkg').value.trim();
          if (!phase || !pkg) { (phase ? el.querySelector('#mv-pkg') : ph).focus(); return; }
          Store.checkpoint('move ' + U.plural(subs.length, 'submittal'));
          subs.forEach((s) => {
            const loc = M.ensurePhasePkg(s.projectId, phase, pkg);
            M.update(Store.submittal(s.id), { phaseId: loc.phaseId, packageId: loc.packageId }, 'Moved to ' + phase + ' › ' + pkg);
          });
          api.close();
          UI.undoToast('Moved ' + U.plural(subs.length, 'submittal') + ' to ' + phase + ' › ' + pkg);
        };
        el.querySelector('[data-ok]').addEventListener('click', go);
        el.querySelector('#move-form').addEventListener('submit', go);
      },
    });
  }

  window.TableView = view;
  window.TableKit = T;
  window.TableKit.COLS = COLS;
  window.TableKit.COL_BY_KEY = COL_BY_KEY;
})();
