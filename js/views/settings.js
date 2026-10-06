/* Settings: thresholds, defaults, theme, data import/export and backups. */
(function () {
  'use strict';

  function html() {
    const s = Store.state.settings;
    const n = Store.state.submittals.length;
    const where = Store.mode === 'db'
      ? 'Saved to this artifact’s database. Your data follows you to any device where you open this page while signed in.'
      : 'Saved in this browser only (local storage). Clearing site data or switching browsers or computers starts empty, so download a backup regularly.';
    const lastBackup = UI.prefs.lastBackup;
    return `<div class="view-h"><h1>Settings</h1><p class="view-sub">Thresholds and defaults apply everywhere. Theme and table layout are remembered per browser.</p></div>
      <div class="settings">
        <section class="panel">
          <header class="panel-h"><h2>Flags & defaults</h2></header>
          <form class="form-grid" id="set-form">
            <label class="fld"><span>Your name <em>default internal lead</em></span><input id="set-name" data-s="myName" value="${U.esc(s.myName || '')}" placeholder="e.g. Matt"></label>
            <label class="fld"><span>Stale flag after <em>days in our or consultant’s court</em></span><input id="set-stale" data-s="staleDays" type="number" min="1" max="365" value="${U.esc(s.staleDays)}"></label>
            <label class="fld"><span>Default review turnaround <em>days, for new cycles</em></span><input id="set-tat" data-s="defaultTat" type="number" min="0" max="365" value="${U.esc(s.defaultTat)}"></label>
            <label class="fld"><span>Count turnaround in</span><select id="set-biz" data-s="bizDays">${UI.options([{ value: 'false', label: 'Calendar days' }, { value: 'true', label: 'Business days (Mon–Fri)' }], String(!!s.bizDays))}</select></label>
            <label class="fld"><span>Theme</span><select id="set-theme" data-p="theme">${UI.options([{ value: 'system', label: 'Match system' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }], UI.prefs.theme)}</select></label>
          </form>
        </section>

        <section class="panel">
          <header class="panel-h"><h2>Export</h2></header>
          <div class="btn-list">
            <button class="btn" data-act="xlsx">${UI.icon('download')}Excel workbook (.xlsx)</button>
            <button class="btn" data-act="csv">${UI.icon('download')}Submittals CSV</button>
            <button class="btn" data-act="cycles">${UI.icon('download')}Review cycles CSV</button>
          </div>
          <p class="muted">The workbook has three sheets: Submittals (current cycle per row), Review Cycles (every cycle), and Projects. ${n} submittals in total.</p>
        </section>

        <section class="panel">
          <header class="panel-h"><h2>Import from CSV</h2></header>
          <div class="btn-list">
            <button class="btn btn-primary" data-act="import">${UI.icon('upload')}Import CSV…</button>
            <button class="btn" data-act="template">${UI.icon('download')}Download CSV template</button>
          </div>
          <p class="muted">Columns match the CSV export. Rows with an ID that already exists update that submittal, so you can export, edit in Excel, and import back. Rows without an ID are added. Projects are matched by name; missing projects, phases and packages are created. You can undo an import right after it runs.</p>
        </section>

        <section class="panel">
          <header class="panel-h"><h2>Backup & storage</h2></header>
          <p class="storage-note"><b>${Store.mode === 'db' ? 'Cloud' : 'This browser'}</b> · ${where}</p>
          <div class="btn-list">
            <button class="btn" data-act="backup">${UI.icon('download')}Download full backup (.json)</button>
            <button class="btn" data-act="restore">${UI.icon('upload')}Restore from backup…</button>
          </div>
          <p class="muted">${lastBackup ? 'Last backup from this browser: ' + U.esc(U.fmtLong(lastBackup)) + '.' : 'No backup downloaded from this browser yet.'} A backup holds every project, submittal, review cycle, template and setting.</p>
          <div class="btn-list">
            <button class="btn" data-act="seed">Add my starter projects</button>
            <button class="btn btn-danger-ghost" data-act="wipe">Delete all data…</button>
          </div>
          <p class="muted">Starter projects: ${C.SEED_PROJECTS.map((p) => U.esc(p.name)).join(', ')}. Any already present are skipped.</p>
        </section>

        <section class="panel">
          <header class="panel-h"><h2>Keyboard</h2></header>
          <dl class="keys">
            <div><dt><kbd>N</kbd></dt><dd>New submittal</dd></div>
            <div><dt><kbd>/</kbd></dt><dd>Search (table and board)</dd></div>
            <div><dt><kbd>Esc</kbd></dt><dd>Close panel or dialog</dd></div>
            <div><dt><kbd>Ctrl</kbd> + <kbd>Enter</kbd></dt><dd>Save &amp; add another (in New submittal)</dd></div>
          </dl>
        </section>
      </div>`;
  }

  const view = {
    title: 'Settings',
    render(root) {
      root.innerHTML = html();
      if (root.dataset.bound) return;
      root.dataset.bound = '1';
      root.addEventListener('change', (e) => {
        const t = e.target;
        if (t.dataset.p === 'theme') { UI.setPref('theme', t.value); UI.applyTheme(); return; }
        const k = t.dataset.s;
        if (!k) return;
        let v = t.value;
        if (k === 'staleDays' || k === 'defaultTat') {
          v = Math.max(k === 'staleDays' ? 1 : 0, parseInt(v, 10) || 0);
          t.value = v;
        }
        if (k === 'bizDays') v = v === 'true';
        Store.putSettings({ [k]: v });
        UI.toast('Saved');
      });
      root.addEventListener('submit', (e) => e.preventDefault());
      root.addEventListener('click', async (e) => {
        const b = e.target.closest('[data-act]');
        if (!b) return;
        switch (b.dataset.act) {
          case 'xlsx': return IO.exportXlsx();
          case 'csv': return IO.exportCsv(Store.state.submittals, 'submittals');
          case 'cycles': return IO.exportCyclesCsv();
          case 'import': return IO.importCsv();
          case 'template': return IO.csvTemplate();
          case 'backup': IO.backup(); return view.render(root);
          case 'restore': return IO.restore();
          case 'seed': {
            const before = Store.state.projects.length;
            Store.seedProjects();
            const added = Store.state.projects.length - before;
            UI.toast(added ? 'Added ' + U.plural(added, 'project') : 'All starter projects are already here.');
            return;
          }
          case 'wipe': {
            const ok = await UI.confirm('Delete every project, submittal and custom template? Download a backup first if you might need them.', { title: 'Delete all data', ok: 'Delete everything', danger: true });
            if (!ok) return;
            Store.checkpoint('delete all data');
            Store.replaceAll({ projects: [], submittals: [], templates: [], settings: Store.state.settings });
            UI.undoToast('Deleted all data');
          }
        }
      });
    },
  };
  view.refresh = (root) => {
    // Avoid clobbering an input the user is typing in.
    if (root.contains(document.activeElement) && document.activeElement.matches('input,select,textarea')) return;
    view.render(root);
  };

  window.SettingsView = view;
})();
