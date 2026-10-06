/* Projects list and project detail (phases → packages → submittals). */
(function () {
  'use strict';

  const DETAIL_COLS = ['status', 'ball', 'cycle', 'submitted', 'due', 'total', 'next'];

  const subsOf = (pid) => Store.state.submittals.filter((s) => s.projectId === pid);
  const caseChips = (p) => p.caseNumbers.map((c) => `<span class="case">${U.esc(c)}</span>`).join('');

  /* ---------------- list ---------------- */

  function listHtml() {
    const showArch = !!UI.prefs.showArchivedProjects;
    const projects = Store.projects(true).filter((p) => showArch || !p.archived);
    const archivedN = Store.state.projects.filter((p) => p.archived).length;
    const cards = projects.map((p) => {
      const subs = subsOf(p.id);
      const ds = subs.map((s) => [s, M.derive(s)]);
      const pr = M.progress(subs);
      const over = ds.filter(([, d]) => d.overdue).length;
      const mine = ds.filter(([s, d]) => s.ball === 'Us' && !d.done).length;
      const phases = p.phases
        .map((ph) => ({ ph, list: subs.filter((s) => s.phaseId === ph.id) }))
        .filter((x) => x.list.length);
      return `<article class="pcard ${p.archived ? 'is-archived' : ''}">
        <header><button class="pcard-name" data-open-project="${p.id}">${U.esc(p.name)}</button>${p.archived ? '<span class="tag">Archived</span>' : ''}</header>
        <div class="cases">${caseChips(p) || '<span class="muted">No case numbers yet</span>'}</div>
        <div class="pcard-meta">${U.esc([p.jurisdiction, p.type, p.lead].filter(Boolean).join(' · '))}</div>
        <dl class="pcard-stats">
          <div><dt>Submittals</dt><dd class="num">${subs.length}</dd></div>
          <div><dt>Open</dt><dd class="num">${ds.filter(([, d]) => !d.done).length}</dd></div>
          <div><dt>Overdue</dt><dd class="num ${over ? 'txt-over' : ''}">${over}</dd></div>
          <div><dt>My court</dt><dd class="num">${mine}</dd></div>
        </dl>
        ${subs.length ? UI.progress(pr, 'approved') : ''}
        ${phases.length ? `<ul class="pcard-phases">${phases.map((x) => `<li><span>${U.esc(x.ph.name)}</span>${UI.progress(M.progress(x.list))}</li>`).join('')}</ul>` : '<p class="muted pcard-empty">No submittals yet. Open the project to add packages.</p>'}
      </article>`;
    });
    return `<div class="view-h view-h-row">
        <div><h1>Projects</h1><p class="view-sub">${U.plural(projects.length, 'project')}${archivedN ? ` · <label class="chk chk-inline"><input type="checkbox" id="show-arch" ${showArch ? 'checked' : ''}> Show ${archivedN} archived</label>` : ''}</p></div>
        <button class="btn btn-primary" data-act="new-project">${UI.icon('plus')}New project</button>
      </div>
      <div class="pgrid">${cards.join('') || '<div class="empty"><h3>No projects yet.</h3><p>Create a project to start tracking its phases, packages and submittals.</p><button class="btn btn-primary" data-act="new-project">' + UI.icon('plus') + 'New project</button></div>'}</div>`;
  }

  /* ---------------- detail ---------------- */

  function pkgHtml(p, ph, pkg, list) {
    const ck = 'pk:' + (pkg ? pkg.id : ph.id + ':none');
    const collapsed = !!UI.prefs.collapsed[ck];
    const pr = M.progress(list);
    const cols = [TableKit.COL_BY_KEY.title].concat(DETAIL_COLS.map((k) => TableKit.COL_BY_KEY[k]));
    const rows = TableKit.rows(list);
    const over = rows.filter((r) => r.d.overdue).length;
    return `<div class="pkg ${collapsed ? 'is-collapsed' : ''}" ${pkg ? `data-pkg="${pkg.id}"` : ''} data-phase="${ph.id}">
      <header class="pkg-h">
        <button class="grp-toggle" data-collapse="${ck}" aria-expanded="${!collapsed}">${UI.icon('chev', 'ic-chev')}<span class="pkg-name">${U.esc(pkg ? pkg.name : 'Not in a package')}</span></button>
        <span class="grp-meta">${U.plural(list.length, 'item')}${over ? ` · <span class="txt-over">${over} overdue</span>` : ''}</span>
        ${list.length ? UI.progress(pr) : ''}
        ${pkg ? `<span class="pkg-actions">
          <button class="btn btn-sm" data-act="pkg-add-sub" title="Add a submittal to this package">${UI.icon('plus')}Submittal</button>
          <button class="btn btn-sm" data-act="pkg-template" title="Create submittals from a template">Template</button>
          <button class="icon-btn" data-act="pkg-menu" aria-label="Package actions">${UI.icon('more')}</button>
        </span>` : ''}
      </header>
      ${collapsed ? '' : list.length
        ? `<div class="table-wrap"><table class="grid grid-compact">${TableKit.headHtml(cols, { noSelect: true })}<tbody>${rows.map((r) => TableKit.rowHtml(r, cols, { noSelect: true })).join('')}</tbody></table></div>`
        : `<p class="pkg-empty">Empty package. <button class="link" data-act="pkg-add-sub">Add a submittal</button> or <button class="link" data-act="pkg-template">apply a template</button>.</p>`}
    </div>`;
  }

  function phaseHtml(p, ph, i, subs) {
    const ck = 'ph:' + ph.id;
    const collapsed = !!UI.prefs.collapsed[ck];
    const list = subs.filter((s) => s.phaseId === ph.id);
    const pr = M.progress(list);
    const pkgIds = new Set(ph.packages.map((k) => k.id));
    const loose = list.filter((s) => !pkgIds.has(s.packageId));
    const over = list.filter((s) => M.derive(s).overdue).length;
    return `<section class="phase ${collapsed ? 'is-collapsed' : ''}" data-phase="${ph.id}">
      <header class="phase-h">
        <button class="grp-toggle" data-collapse="${ck}" aria-expanded="${!collapsed}">${UI.icon('chev', 'ic-chev')}<span class="phase-i">${i + 1}</span><h2>${U.esc(ph.name)}</h2></button>
        <span class="grp-meta">${U.plural(ph.packages.length, 'package')} · ${U.plural(list.length, 'submittal')}${over ? ` · <span class="txt-over">${over} overdue</span>` : ''}</span>
        <span class="phase-prog">${list.length ? UI.progress(pr, 'approved') : '<span class="muted">—</span>'}</span>
        <span class="pkg-actions">
          <button class="btn btn-sm" data-act="phase-add-pkg">${UI.icon('plus')}Package</button>
          <button class="icon-btn" data-act="phase-menu" aria-label="Phase actions">${UI.icon('more')}</button>
        </span>
      </header>
      ${collapsed ? '' : `<div class="phase-b">
        ${ph.packages.map((k) => pkgHtml(p, ph, k, list.filter((s) => s.packageId === k.id))).join('')}
        ${loose.length ? pkgHtml(p, ph, null, loose) : ''}
        ${!ph.packages.length && !loose.length ? '<p class="pkg-empty">No packages in this phase. <button class="link" data-act="phase-add-pkg">Add a package</button>, e.g. “Rough Grading 1st Submittal”.</p>' : ''}
      </div>`}
    </section>`;
  }

  function detailHtml(p) {
    const subs = subsOf(p.id);
    const ds = subs.map((s) => [s, M.derive(s)]);
    const pr = M.progress(subs);
    const phaseIds = new Set(p.phases.map((x) => x.id));
    const orphan = subs.filter((s) => !phaseIds.has(s.phaseId));
    const stat = (label, n, cls) => `<div><dt>${label}</dt><dd class="num ${cls || ''}">${n}</dd></div>`;
    return `<nav class="crumbs"><button class="link" data-goto="projects">${UI.icon('chev', 'ic-back')}Projects</button></nav>
      <div class="view-h view-h-row proj-h">
        <div class="proj-title">
          <h1>${U.esc(p.name)} ${p.archived ? '<span class="tag">Archived</span>' : ''}</h1>
          <div class="cases">${caseChips(p)}</div>
          <p class="view-sub">${U.esc([p.jurisdiction, p.type, p.lead ? 'Lead: ' + p.lead : ''].filter(Boolean).join(' · '))}</p>
          ${p.notes ? `<p class="proj-notes">${U.esc(p.notes)}</p>` : ''}
        </div>
        <div class="proj-actions">
          <button class="btn btn-primary" data-act="proj-add-sub">${UI.icon('plus')}New submittal</button>
          <button class="btn" data-act="edit-project">${UI.icon('edit')}Edit</button>
          <button class="icon-btn" data-act="proj-menu" aria-label="Project actions">${UI.icon('more')}</button>
        </div>
      </div>
      <dl class="stats-row">
        ${stat('Submittals', subs.length)}
        ${stat('Open', ds.filter(([, d]) => !d.done).length)}
        ${stat('With agency', ds.filter(([, d]) => d.withAgency).length)}
        ${stat('Overdue', ds.filter(([, d]) => d.overdue).length, ds.some(([, d]) => d.overdue) ? 'txt-over' : '')}
        ${stat('My court', ds.filter(([s, d]) => s.ball === 'Us' && !d.done).length)}
        <div class="stat-prog"><dt>Approved</dt><dd>${UI.progress(pr)}</dd></div>
      </dl>
      <div class="proj-tools"><button class="btn btn-ghost btn-sm" data-act="expand-all">Expand all</button><button class="btn btn-ghost btn-sm" data-act="collapse-all">Collapse all</button></div>
      ${orphan.length ? `<section class="phase"><header class="phase-h"><h2>Unassigned</h2><span class="grp-meta">${U.plural(orphan.length, 'submittal')} without a phase. Open one to assign it, or select them in the table and use Move.</span></header><div class="phase-b">${pkgHtml(p, { id: '_none', name: 'Unassigned', packages: [] }, null, orphan)}</div></section>` : ''}
      ${p.phases.map((ph, i) => phaseHtml(p, ph, i, subs)).join('')}
      <div class="add-phase"><button class="btn" data-act="add-phase">${UI.icon('plus')}Add phase</button></div>`;
  }

  /* ---------------- project editor ---------------- */

  function editProject(p) {
    const isNew = !p;
    const cur = p || Store.newProject({});
    UI.modal({
      title: isNew ? 'New project' : 'Edit project',
      body: `<form class="form-grid" id="proj-form">
        <label class="fld span-2"><span>Project name</span><input id="pj-name" required value="${U.esc(cur.name)}" placeholder="e.g. Bosma" autofocus></label>
        <label class="fld span-2"><span>Case / map numbers <em>separate with commas</em></span><input id="pj-cases" class="mono" value="${U.esc(cur.caseNumbers.join(', '))}" placeholder="PMTT26-001, TTM 20780"></label>
        <label class="fld"><span>Jurisdiction</span><input id="pj-jur" list="dl-agencies" value="${U.esc(cur.jurisdiction)}"></label>
        <label class="fld"><span>Project type</span><select id="pj-type">${UI.options(C.PROJECT_TYPES, cur.type)}</select></label>
        <label class="fld"><span>Internal lead</span><input id="pj-lead" value="${U.esc(cur.lead)}" placeholder="${U.esc(Store.state.settings.myName || 'Name')}"></label>
        <label class="fld span-2"><span>Notes</span><textarea id="pj-notes" rows="3">${U.esc(cur.notes || '')}</textarea></label>
        ${isNew ? `<p class="muted span-2">Starts with the standard phases: ${C.DEFAULT_PHASES.map(U.esc).join(', ')}. You can rename, reorder or add phases later.</p>` : ''}
      </form>`,
      foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>${isNew ? 'Create project' : 'Save'}</button>`,
      onMount(el, api) {
        const go = (e) => {
          e && e.preventDefault();
          const name = el.querySelector('#pj-name').value.trim();
          if (!name) { el.querySelector('#pj-name').focus(); return; }
          const next = {
            ...U.clone(cur),
            name,
            caseNumbers: el.querySelector('#pj-cases').value.split(',').map((x) => x.trim()).filter(Boolean),
            jurisdiction: el.querySelector('#pj-jur').value.trim(),
            type: el.querySelector('#pj-type').value,
            lead: el.querySelector('#pj-lead').value.trim(),
            notes: el.querySelector('#pj-notes').value.trim(),
          };
          Store.putProject(next);
          api.close();
          if (isNew) { UI.toast('Created ' + name); App.go('project/' + next.id); } else UI.toast('Saved project');
        };
        el.querySelector('[data-ok]').addEventListener('click', go);
        el.querySelector('#proj-form').addEventListener('submit', go);
      },
    });
  }

  /* ---------------- phase & package operations ---------------- */

  const mutateProject = (pid, fn) => {
    const p = U.clone(Store.project(pid));
    fn(p);
    Store.putProject(p);
    return p;
  };

  function pkgNameSuggestions() {
    const names = new Set(Store.templates().map((t) => t.name));
    Store.state.projects.forEach((p) => p.phases.forEach((ph) => ph.packages.forEach((k) => names.add(k.name))));
    return Array.from(names).sort(U.cmp);
  }

  function addPackage(p, phaseId) {
    const tpls = Store.templates();
    UI.modal({
      title: 'Add package',
      body: `<form class="stack" id="pk-form">
        <label class="fld"><span>Phase</span><select id="pk-phase">${UI.options(p.phases.map((x) => ({ value: x.id, label: x.name })), phaseId)}</select></label>
        <label class="fld"><span>Start from a template <em>optional</em></span><select id="pk-tpl">${UI.options(tpls.map((t) => ({ value: t.id, label: t.name + ' (' + t.items.length + ')' })), '', 'Empty package')}</select></label>
        <div id="pk-preview" class="tpl-preview" hidden></div>
        <label class="fld"><span>Package name</span><input id="pk-name" list="dl-pkgnames" placeholder="e.g. Rough Grading 1st Submittal" autofocus></label>
        <datalist id="dl-pkgnames">${pkgNameSuggestions().map((n) => `<option value="${U.esc(n)}">`).join('')}</datalist>
      </form>`,
      foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Add package</button>',
      onMount(el, api) {
        const name = el.querySelector('#pk-name');
        const tplSel = el.querySelector('#pk-tpl');
        const prev = el.querySelector('#pk-preview');
        let autoName = '';
        tplSel.addEventListener('change', () => {
          const t = Store.template(tplSel.value);
          if (t && (!name.value || name.value === autoName)) { name.value = t.name; autoName = t.name; }
          prev.hidden = !t;
          prev.innerHTML = t ? `<b>Creates ${U.plural(t.items.length, 'submittal')}:</b> ${t.items.map((x) => U.esc(x.title)).join(', ')}` : '';
        });
        const go = (e) => {
          e && e.preventDefault();
          const n = name.value.trim();
          if (!n) { name.focus(); return; }
          const phId = el.querySelector('#pk-phase').value;
          const pkg = Store.newPackage(n);
          mutateProject(p.id, (x) => x.phases.find((ph) => ph.id === phId).packages.push(pkg));
          const t = Store.template(tplSel.value);
          let msg = 'Added package ' + n;
          if (t) msg += ' with ' + U.plural(M.applyTemplate(t, p.id, phId, pkg.id), 'submittal');
          else UI.rememberLast({ projectId: p.id, phaseId: phId, packageId: pkg.id });
          api.close();
          UI.toast(msg);
        };
        el.querySelector('[data-ok]').addEventListener('click', go);
        el.querySelector('#pk-form').addEventListener('submit', go);
      },
    });
  }

  function applyTemplateDialog(p, phaseId, pkgId) {
    const tpls = Store.templates();
    const pkg = Store.pkg(p, phaseId, pkgId);
    UI.modal({
      title: 'Apply template to ' + (pkg ? pkg.name : 'package'),
      body: `<div class="stack">
        <label class="fld"><span>Template</span><select id="at-tpl">${UI.options(tpls.map((t) => ({ value: t.id, label: t.name + ' (' + t.items.length + ')' })), tpls[0] && tpls[0].id)}</select></label>
        <div id="at-preview" class="tpl-preview"></div>
        <p class="muted">Agency defaults to the project jurisdiction (${U.esc(p.jurisdiction || 'none')}) unless the template names one.</p>
      </div>`,
      foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Create submittals</button>',
      onMount(el, api) {
        const sel = el.querySelector('#at-tpl');
        const prev = el.querySelector('#at-preview');
        const show = () => {
          const t = Store.template(sel.value);
          prev.innerHTML = t ? `<ul class="tpl-items">${t.items.map((x) => `<li>${U.esc(x.title)} <span class="muted">${U.esc([x.discipline, x.department, x.agency].filter(Boolean).join(' · '))}</span></li>`).join('')}</ul>` : '';
        };
        sel.addEventListener('change', show);
        show();
        el.querySelector('[data-ok]').addEventListener('click', () => {
          const t = Store.template(sel.value);
          if (!t) return;
          Store.checkpoint('apply template ' + t.name);
          const n = M.applyTemplate(t, p.id, phaseId, pkgId);
          api.close();
          UI.undoToast('Created ' + U.plural(n, 'submittal') + ' from ' + t.name);
        });
      },
    });
  }

  function duplicatePackageDialog(p, phaseId, pkgId) {
    const pkg = Store.pkg(p, phaseId, pkgId);
    const projects = Store.projects(false);
    const count = M.inPackage(p.id, pkgId).length;
    UI.modal({
      title: 'Duplicate package',
      body: `<form class="stack" id="dp-form">
        <p class="muted">Copies ${U.plural(count, 'submittal')} with the same titles, disciplines, agencies and consultants. Copies start as Not Started with no review cycles.</p>
        <label class="fld"><span>Into project</span><select id="dp-proj">${UI.options(projects.map((x) => ({ value: x.id, label: x.name })), p.id)}</select></label>
        <label class="fld"><span>Phase</span><select id="dp-phase"></select></label>
        <label class="fld"><span>New package name</span><input id="dp-name" value="${U.esc(pkg.name)} (copy)" autofocus></label>
      </form>`,
      foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Duplicate</button>',
      onMount(el, api) {
        const pj = el.querySelector('#dp-proj');
        const ph = el.querySelector('#dp-phase');
        const fill = () => {
          const tp = Store.project(pj.value);
          const curName = (p.phases.find((x) => x.id === phaseId) || {}).name;
          const match = tp.phases.find((x) => x.name === curName);
          ph.innerHTML = UI.options(tp.phases.map((x) => ({ value: x.id, label: x.name })), match ? match.id : '');
        };
        pj.addEventListener('change', () => {
          fill();
          const nm = el.querySelector('#dp-name');
          if (pj.value !== p.id && nm.value === pkg.name + ' (copy)') nm.value = pkg.name;
        });
        fill();
        const go = (e) => {
          e && e.preventDefault();
          const name = el.querySelector('#dp-name').value.trim();
          if (!name) return;
          Store.checkpoint('duplicate package ' + pkg.name);
          const r = M.duplicatePackage(p, pkgId, pj.value, ph.value, name);
          api.close();
          UI.undoToast('Created ' + name + ' with ' + U.plural(r.count, 'submittal'));
        };
        el.querySelector('[data-ok]').addEventListener('click', go);
        el.querySelector('#dp-form').addEventListener('submit', go);
      },
    });
  }

  async function phaseMenu(p, phaseId, anchor) {
    const i = p.phases.findIndex((x) => x.id === phaseId);
    const ph = p.phases[i];
    App.menu(anchor, [
      { label: 'Rename phase', fn: async () => {
        const n = await UI.prompt('Phase name', ph.name, { title: 'Rename phase' });
        if (n) mutateProject(p.id, (x) => { x.phases[i].name = n; });
      } },
      { label: 'Move up', disabled: i === 0, fn: () => mutateProject(p.id, (x) => { [x.phases[i - 1], x.phases[i]] = [x.phases[i], x.phases[i - 1]]; }) },
      { label: 'Move down', disabled: i === p.phases.length - 1, fn: () => mutateProject(p.id, (x) => { [x.phases[i + 1], x.phases[i]] = [x.phases[i], x.phases[i + 1]]; }) },
      { label: 'Add package', fn: () => addPackage(p, phaseId) },
      { sep: true },
      { label: 'Delete phase…', danger: true, fn: async () => {
        const list = Store.state.submittals.filter((s) => s.projectId === p.id && s.phaseId === phaseId);
        const ok = await UI.confirm(list.length ? `Delete <b>${U.esc(ph.name)}</b>, its ${U.plural(ph.packages.length, 'package')} and ${U.plural(list.length, 'submittal')}?` : `Delete the empty phase <b>${U.esc(ph.name)}</b>?`, { title: 'Delete phase', ok: 'Delete', danger: true });
        if (!ok) return;
        Store.checkpoint('delete phase ' + ph.name);
        list.forEach((s) => Store.removeSubmittal(s.id));
        mutateProject(p.id, (x) => { x.phases.splice(i, 1); });
        UI.undoToast('Deleted phase ' + ph.name);
      } },
    ]);
  }

  function pkgMenu(p, phaseId, pkgId, anchor) {
    const ph = p.phases.find((x) => x.id === phaseId);
    const pkg = ph.packages.find((x) => x.id === pkgId);
    const pi = ph.packages.indexOf(pkg);
    App.menu(anchor, [
      { label: 'Rename package', fn: async () => {
        const n = await UI.prompt('Package name', pkg.name, { title: 'Rename package' });
        if (n) mutateProject(p.id, (x) => { x.phases.find((y) => y.id === phaseId).packages[pi].name = n; });
      } },
      { label: 'Duplicate package…', fn: () => duplicatePackageDialog(p, phaseId, pkgId) },
      { label: 'Save as template…', fn: async () => {
        const n = await UI.prompt('Template name', pkg.name, { title: 'Save package as template' });
        if (!n) return;
        const t = M.templateFromPackage(p.id, pkgId, n);
        UI.toast('Saved template ' + n + ' (' + U.plural(t.items.length, 'item') + ')');
      } },
      { label: 'Move up', disabled: pi === 0, fn: () => mutateProject(p.id, (x) => { const a = x.phases.find((y) => y.id === phaseId).packages; [a[pi - 1], a[pi]] = [a[pi], a[pi - 1]]; }) },
      { label: 'Move down', disabled: pi === ph.packages.length - 1, fn: () => mutateProject(p.id, (x) => { const a = x.phases.find((y) => y.id === phaseId).packages; [a[pi + 1], a[pi]] = [a[pi], a[pi + 1]]; }) },
      { label: 'Move to phase…', fn: () => {
        UI.modal({
          title: 'Move ' + pkg.name,
          body: `<label class="fld"><span>Phase</span><select id="mp-phase">${UI.options(p.phases.filter((x) => x.id !== phaseId).map((x) => ({ value: x.id, label: x.name })), '')}</select></label>`,
          foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Move</button>',
          onMount(el, api) {
            el.querySelector('[data-ok]').addEventListener('click', () => {
              const to = el.querySelector('#mp-phase').value;
              if (!to) return;
              mutateProject(p.id, (x) => {
                const from = x.phases.find((y) => y.id === phaseId);
                from.packages = from.packages.filter((k) => k.id !== pkgId);
                x.phases.find((y) => y.id === to).packages.push(pkg);
              });
              M.inPackage(p.id, pkgId).forEach((s) => M.update(s, { phaseId: to }));
              api.close();
              UI.toast('Moved ' + pkg.name);
            });
          },
        });
      } },
      { sep: true },
      { label: 'Delete package…', danger: true, fn: async () => {
        const list = M.inPackage(p.id, pkgId);
        const ok = await UI.confirm(list.length ? `Delete <b>${U.esc(pkg.name)}</b> and its ${U.plural(list.length, 'submittal')}?` : `Delete the empty package <b>${U.esc(pkg.name)}</b>?`, { title: 'Delete package', ok: 'Delete', danger: true });
        if (!ok) return;
        Store.checkpoint('delete package ' + pkg.name);
        list.forEach((s) => Store.removeSubmittal(s.id));
        mutateProject(p.id, (x) => { const y = x.phases.find((z) => z.id === phaseId); y.packages = y.packages.filter((k) => k.id !== pkgId); });
        UI.undoToast('Deleted package ' + pkg.name);
      } },
    ]);
  }

  function projMenu(p, anchor) {
    App.menu(anchor, [
      { label: 'Add phase', fn: () => addPhase(p) },
      { label: 'Export project (CSV)', fn: () => IO.exportCsv(subsOf(p.id), p.name.replace(/\W+/g, '-').toLowerCase()) },
      { label: p.archived ? 'Unarchive project' : 'Archive project', fn: () => { mutateProject(p.id, (x) => { x.archived = !x.archived; }); UI.toast(p.archived ? 'Unarchived ' + p.name : 'Archived ' + p.name + '. It is hidden from the dashboard and table.'); } },
      { sep: true },
      { label: 'Delete project…', danger: true, fn: async () => {
        const n = subsOf(p.id).length;
        const ok = await UI.confirm(`Delete <b>${U.esc(p.name)}</b>${n ? ' and its ' + U.plural(n, 'submittal') : ''}? Consider archiving instead.`, { title: 'Delete project', ok: 'Delete project', danger: true });
        if (!ok) return;
        Store.checkpoint('delete project ' + p.name);
        Store.removeProject(p.id);
        App.go('projects');
        UI.undoToast('Deleted project ' + p.name);
      } },
    ]);
  }

  async function addPhase(p) {
    const used = new Set(p.phases.map((x) => x.name));
    const n = await UI.prompt('Phase name', '', { title: 'Add phase', ok: 'Add phase', list: C.DEFAULT_PHASES.filter((x) => !used.has(x)), placeholder: 'e.g. Annexation, CFD Formation' });
    if (n) mutateProject(p.id, (x) => x.phases.push(Store.newPhase(n)));
  }

  /* ---------------- views ---------------- */

  const listView = {
    title: 'Projects',
    render(root) {
      root.innerHTML = listHtml();
      if (root.dataset.bound) return;
      root.dataset.bound = '1';
      root.addEventListener('click', (e) => {
        const o = e.target.closest('[data-open-project]');
        if (o) { App.go('project/' + o.dataset.openProject); return; }
        const b = e.target.closest('[data-act]');
        if (b && b.dataset.act === 'new-project') editProject(null);
      });
      root.addEventListener('change', (e) => {
        if (e.target.id === 'show-arch') { UI.setPref('showArchivedProjects', e.target.checked); listView.render(root); }
      });
    },
  };
  listView.refresh = listView.render;

  const detailView = {
    title: 'Project',
    render(root, pid) {
      root.dataset.pid = pid;
      const p = Store.project(pid);
      if (!p) {
        root.innerHTML = '<div class="empty"><h3>Project not found.</h3><p>It may have been deleted.</p><button class="btn" data-goto="projects">Back to projects</button></div>';
      } else root.innerHTML = detailHtml(p);
      if (root.dataset.bound) return;
      root.dataset.bound = '1';
      root.addEventListener('click', async (e) => {
        const p2 = Store.project(root.dataset.pid);
        if (!p2) return;
        const col = e.target.closest('[data-collapse]');
        if (col) {
          const k = col.dataset.collapse;
          UI.setPref('collapsed', { ...UI.prefs.collapsed, [k]: !UI.prefs.collapsed[k] });
          detailView.render(root, p2.id);
          return;
        }
        const sortBtn = e.target.closest('[data-sort]');
        if (sortBtn) {
          const k = sortBtn.dataset.sort;
          const cur = UI.prefs.sort || {};
          UI.setPref('sort', { key: k, dir: cur.key === k && cur.dir === 'asc' ? 'desc' : 'asc' });
          detailView.render(root, p2.id);
          return;
        }
        const b = e.target.closest('[data-act]');
        const act = b && b.dataset.act;
        const phEl = b && b.closest('[data-phase]');
        const pkEl = b && b.closest('[data-pkg]');
        const phaseId = phEl && phEl.dataset.phase;
        const pkgId = pkEl && pkEl.dataset.pkg;
        switch (act) {
          case 'edit-project': return editProject(p2);
          case 'proj-menu': return projMenu(p2, b);
          case 'add-phase': return addPhase(p2);
          case 'proj-add-sub': return App.quickAdd({ projectId: p2.id });
          case 'phase-add-pkg': return addPackage(p2, phaseId);
          case 'phase-menu': return phaseMenu(p2, phaseId, b);
          case 'pkg-add-sub': return App.quickAdd({ projectId: p2.id, phaseId, packageId: pkgId });
          case 'pkg-template': return applyTemplateDialog(p2, phaseId, pkgId);
          case 'pkg-menu': return pkgMenu(p2, phaseId, pkgId, b);
          case 'expand-all':
          case 'collapse-all': {
            const c = { ...UI.prefs.collapsed };
            p2.phases.forEach((ph) => {
              c['ph:' + ph.id] = act === 'collapse-all';
              ph.packages.forEach((k) => { c['pk:' + k.id] = false; });
            });
            UI.setPref('collapsed', c);
            return detailView.render(root, p2.id);
          }
        }
        App.handleRowClick(e);
      });
    },
    refresh(root) { detailView.render(root, root.dataset.pid); },
  };

  window.ProjectsView = listView;
  window.ProjectView = detailView;
  window.ProjectsKit = { editProject, addPackage, applyTemplateDialog };
})();
