/* Package templates: built-in sets plus your own. */
(function () {
  'use strict';

  function itemsTable(t) {
    return `<table class="grid grid-compact tpl-table"><thead><tr><th>Submittal</th><th>Discipline</th><th>Department</th><th>Agency</th></tr></thead><tbody>
      ${t.items.map((x) => `<tr><td data-label="Submittal">${U.esc(x.title)}</td><td data-label="Discipline">${U.esc(x.discipline || '')}</td><td data-label="Department">${U.esc(x.department || '')}</td><td data-label="Agency">${x.agency ? U.esc(x.agency) : '<span class="muted">Project jurisdiction</span>'}</td></tr>`).join('')}
    </tbody></table>`;
  }

  function html() {
    const tpls = Store.templates();
    const mine = tpls.filter((t) => !t.builtin);
    const card = (t) => {
      const ck = 'tpl:' + t.id;
      const open = !!UI.prefs.collapsed[ck];
      return `<article class="tcard" data-tpl="${t.id}">
        <header class="tcard-h">
          <button class="grp-toggle" data-collapse="${ck}" aria-expanded="${open}">${UI.icon('chev', 'ic-chev')}<h3>${U.esc(t.name)}</h3></button>
          <span class="grp-meta">${U.plural(t.items.length, 'submittal')}${t.builtin ? ' · built-in' : ''}</span>
          <span class="pkg-actions">
            <button class="btn btn-sm btn-primary" data-act="tpl-apply">Use…</button>
            ${t.builtin ? '' : '<button class="btn btn-sm" data-act="tpl-edit">Edit</button>'}
            <button class="btn btn-sm" data-act="tpl-copy">Duplicate</button>
            ${t.builtin ? '' : `<button class="icon-btn" data-act="tpl-delete" aria-label="Delete template">${UI.icon('trash')}</button>`}
          </span>
        </header>
        ${t.description ? `<p class="tcard-d">${U.esc(t.description)}</p>` : ''}
        ${open ? `<div class="table-wrap">${itemsTable(t)}</div>` : `<p class="tcard-items">${t.items.map((x) => U.esc(x.title)).join(' · ')}</p>`}
      </article>`;
    };
    return `<div class="view-h view-h-row">
        <div><h1>Templates</h1><p class="view-sub">A template creates a full package of submittals at once. Use one from a project's package, or from here. Save any package as a template from its ⋯ menu.</p></div>
        <button class="btn btn-primary" data-act="tpl-new">${UI.icon('plus')}New template</button>
      </div>
      <h2 class="section-h">My templates</h2>
      ${mine.length ? mine.map(card).join('') : '<p class="muted section-empty">None yet. Duplicate a built-in template to customize it, or save a package as a template.</p>'}
      <h2 class="section-h">Built-in</h2>
      ${tpls.filter((t) => t.builtin).map(card).join('')}`;
  }

  function editTemplate(t) {
    const cur = t ? U.clone(t) : { id: U.uid('t'), name: '', description: '', items: [] };
    const dl = (id, list) => `<datalist id="${id}">${list.map((x) => `<option value="${U.esc(x)}">`).join('')}</datalist>`;
    const rowHtml = (x, i) => `<tr data-i="${i}">
      <td><input aria-label="Submittal title" data-f="title" value="${U.esc(x.title)}" placeholder="Submittal title"></td>
      <td><input aria-label="Discipline" data-f="discipline" list="te-disc" value="${U.esc(x.discipline || '')}"></td>
      <td><input aria-label="Department" data-f="department" list="te-dept" value="${U.esc(x.department || '')}"></td>
      <td><input aria-label="Agency" data-f="agency" list="dl-agencies" value="${U.esc(x.agency || '')}" placeholder="Project jurisdiction"></td>
      <td><button class="icon-btn" data-rm aria-label="Remove row">${UI.icon('x')}</button></td>
    </tr>`;
    UI.modal({
      title: t ? 'Edit template' : 'New template',
      wide: true,
      body: `<div class="stack">
        <div class="form-grid">
          <label class="fld"><span>Template name</span><input id="te-name" value="${U.esc(cur.name)}" placeholder="e.g. Ontario Precise Grading Set" autofocus></label>
          <label class="fld"><span>Description</span><input id="te-desc" value="${U.esc(cur.description || '')}"></label>
        </div>
        <div class="table-wrap"><table class="grid grid-compact grid-edit"><thead><tr><th>Submittal</th><th>Discipline</th><th>Department</th><th>Agency</th><th></th></tr></thead><tbody id="te-rows">${cur.items.map(rowHtml).join('')}</tbody></table></div>
        <div class="row-gap"><button class="btn btn-sm" id="te-add">${UI.icon('plus')}Add row</button></div>
        <label class="fld"><span>Paste titles <em>one per line, added as rows</em></span><textarea id="te-paste" rows="3" placeholder="Rough Grading Plan&#10;Erosion Control Plan"></textarea></label>
        ${dl('te-disc', C.DISCIPLINES.map((d) => d[0]))}${dl('te-dept', C.DEPARTMENTS)}
      </div>`,
      foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Save template</button>',
      onMount(el, api) {
        const tbody = el.querySelector('#te-rows');
        const read = () => Array.from(tbody.querySelectorAll('tr')).map((tr) => {
          const o = {};
          tr.querySelectorAll('[data-f]').forEach((inp) => { o[inp.dataset.f] = inp.value.trim(); });
          return o;
        });
        const redraw = (items) => { tbody.innerHTML = items.map(rowHtml).join(''); };
        el.querySelector('#te-add').addEventListener('click', () => {
          const items = read();
          items.push({ title: '', discipline: '', department: '', agency: '' });
          redraw(items);
          tbody.querySelector('tr:last-child input').focus();
        });
        tbody.addEventListener('click', (e) => {
          const rm = e.target.closest('[data-rm]');
          if (!rm) return;
          const items = read();
          items.splice(+rm.closest('tr').dataset.i, 1);
          redraw(items);
        });
        tbody.addEventListener('change', (e) => {
          if (e.target.dataset.f !== 'discipline') return;
          const dept = e.target.closest('tr').querySelector('[data-f=department]');
          if (!dept.value && C.DEPT_FOR[e.target.value]) dept.value = C.DEPT_FOR[e.target.value];
        });
        el.querySelector('[data-ok]').addEventListener('click', () => {
          const name = el.querySelector('#te-name').value.trim();
          if (!name) { el.querySelector('#te-name').focus(); return; }
          const pasted = el.querySelector('#te-paste').value.split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
            .map((title) => ({ title, discipline: '', department: '', agency: '' }));
          const items = read().concat(pasted).filter((x) => x.title);
          if (!items.length) { UI.toast('Add at least one submittal to the template.', { error: true }); return; }
          Store.putTemplate({ ...cur, builtin: undefined, name, description: el.querySelector('#te-desc').value.trim(), items });
          api.close();
          UI.toast('Saved template ' + name);
        });
      },
    });
  }

  /** Use a template from anywhere: pick project, phase, and an existing or new package. */
  function applyFromTemplate(t) {
    const projects = Store.projects(false);
    if (!projects.length) { UI.toast('Create a project first.', { error: true }); return; }
    const last = UI.lastUsed();
    const pid0 = projects.some((p) => p.id === last.projectId) ? last.projectId : projects[0].id;
    UI.modal({
      title: 'Use “' + t.name + '”',
      body: `<form class="stack" id="ua-form">
        <label class="fld"><span>Project</span><select id="ua-proj">${UI.options(projects.map((p) => ({ value: p.id, label: p.name })), pid0)}</select></label>
        <label class="fld"><span>Phase</span><select id="ua-phase"></select></label>
        <label class="fld"><span>Package</span><select id="ua-pkg"></select></label>
        <label class="fld" id="ua-new-wrap"><span>New package name</span><input id="ua-new" value="${U.esc(t.name)}"></label>
        <p class="muted">Creates ${U.plural(t.items.length, 'submittal')}, all Not Started.</p>
      </form>`,
      foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Create submittals</button>',
      onMount(el, api) {
        const pj = el.querySelector('#ua-proj');
        const ph = el.querySelector('#ua-phase');
        const pk = el.querySelector('#ua-pkg');
        const nw = el.querySelector('#ua-new-wrap');
        const fillPkg = () => {
          const p = Store.project(pj.value);
          const phase = p.phases.find((x) => x.id === ph.value);
          pk.innerHTML = '<option value="__new">New package…</option>' + UI.options((phase ? phase.packages : []).map((k) => ({ value: k.id, label: k.name })), '');
          pk.value = '__new';
          nw.hidden = false;
        };
        const fillPhase = () => {
          const p = Store.project(pj.value);
          const guess = p.phases.find((x) => x.id === last.phaseId) || p.phases.find((x) => x.name === 'Design / Plan Check') || p.phases[0];
          ph.innerHTML = UI.options(p.phases.map((x) => ({ value: x.id, label: x.name })), guess ? guess.id : '');
          fillPkg();
        };
        pj.addEventListener('change', fillPhase);
        ph.addEventListener('change', fillPkg);
        pk.addEventListener('change', () => { nw.hidden = pk.value !== '__new'; });
        fillPhase();
        el.querySelector('[data-ok]').addEventListener('click', () => {
          const p = U.clone(Store.project(pj.value));
          if (!ph.value) return;
          Store.checkpoint('use template ' + t.name);
          let pkgId = pk.value;
          if (pkgId === '__new') {
            const name = el.querySelector('#ua-new').value.trim() || t.name;
            const k = Store.newPackage(name);
            p.phases.find((x) => x.id === ph.value).packages.push(k);
            Store.putProject(p);
            pkgId = k.id;
          }
          const n = M.applyTemplate(t, p.id, ph.value, pkgId);
          api.close();
          UI.undoToast('Created ' + U.plural(n, 'submittal') + ' in ' + p.name);
        });
      },
    });
  }

  const view = {
    title: 'Templates',
    render(root) {
      root.innerHTML = html();
      if (root.dataset.bound) return;
      root.dataset.bound = '1';
      root.addEventListener('click', async (e) => {
        const col = e.target.closest('[data-collapse]');
        if (col) {
          const k = col.dataset.collapse;
          UI.setPref('collapsed', { ...UI.prefs.collapsed, [k]: !UI.prefs.collapsed[k] });
          view.render(root);
          return;
        }
        const b = e.target.closest('[data-act]');
        if (!b) return;
        const card = b.closest('[data-tpl]');
        const t = card ? Store.template(card.dataset.tpl) : null;
        switch (b.dataset.act) {
          case 'tpl-new': return editTemplate(null);
          case 'tpl-edit': return editTemplate(t);
          case 'tpl-copy': return editTemplate({ ...U.clone(t), id: U.uid('t'), builtin: undefined, name: t.name + ' (my copy)' });
          case 'tpl-apply': return applyFromTemplate(t);
          case 'tpl-delete':
            if (await UI.confirm(`Delete the template <b>${U.esc(t.name)}</b>? Submittals already created from it stay.`, { title: 'Delete template', ok: 'Delete', danger: true })) {
              Store.checkpoint('delete template ' + t.name);
              Store.removeTemplate(t.id);
              UI.undoToast('Deleted template ' + t.name);
            }
        }
      });
    },
  };
  view.refresh = view.render;

  window.TemplatesView = view;
})();
