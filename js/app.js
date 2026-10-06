/* App shell: routing, navigation, shared row actions, popover menus, keyboard shortcuts, boot. */
(function () {
  'use strict';

  const ROUTES = {
    dashboard: { view: () => DashboardView, nav: 'dashboard' },
    table: { view: () => TableView, nav: 'table' },
    board: { view: () => BoardView, nav: 'board' },
    projects: { view: () => ProjectsView, nav: 'projects' },
    project: { view: () => ProjectView, nav: 'projects' },
    templates: { view: () => TemplatesView, nav: 'templates' },
    settings: { view: () => SettingsView, nav: 'settings' },
  };

  const App = { route: 'dashboard', arg: '', root: null };

  const parseHash = () => {
    let h = '';
    try { h = decodeURIComponent((location.hash || '').replace(/^#\/?/, '')); } catch (e) { h = ''; }
    const [r, ...rest] = h.split('/');
    return ROUTES[r] ? { r, arg: rest.join('/') } : null;
  };

  App.go = (path) => {
    const [r, ...rest] = String(path).split('/');
    App.route = ROUTES[r] ? r : 'dashboard';
    App.arg = rest.join('/');
    UI.setPref('route', App.route + (App.arg ? '/' + App.arg : ''));
    try {
      const h = '#/' + App.route + (App.arg ? '/' + App.arg : '');
      if (location.hash !== h) history.pushState(null, '', h);
    } catch (e) { /* sandboxed frames may refuse history changes */ }
    App.render();
    window.scrollTo(0, 0);
  };

  App.render = () => {
    const def = ROUTES[App.route];
    const view = def.view();
    const main = document.getElementById('view');
    main.innerHTML = '';
    App.root = document.createElement('div');
    App.root.className = 'view view-' + App.route;
    main.appendChild(App.root);
    view.render(App.root, App.arg);
    document.querySelectorAll('[data-nav]').forEach((a) => {
      const on = a.dataset.nav === def.nav;
      a.classList.toggle('is-on', on);
      if (on) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    const p = App.route === 'project' ? Store.project(App.arg) : null;
    document.title = (p ? p.name : view.title) + ' · Submittal Tracker';
    updateNavCounts();
  };

  App.refresh = () => {
    if (!App.root) return;
    const view = ROUTES[App.route].view();
    (view.refresh || view.render)(App.root, App.arg);
    if (Forms.drawerOpen()) Forms.refreshDrawer();
    updateNavCounts();
  };

  function updateNavCounts() {
    let over = 0;
    let mine = 0;
    const archived = new Set(Store.state.projects.filter((p) => p.archived).map((p) => p.id));
    Store.state.submittals.forEach((s) => {
      if (archived.has(s.projectId)) return;
      const d = M.derive(s);
      if (d.overdue) over++;
      if (s.ball === 'Us' && !d.done && s.status !== 'On Hold') mine++;
    });
    const el = document.getElementById('nav-alert');
    if (el) {
      el.hidden = !over;
      el.textContent = over;
      el.title = U.plural(over, 'overdue review');
    }
    const m = document.getElementById('nav-mine');
    if (m) {
      m.hidden = !mine;
      m.textContent = mine;
      m.title = U.plural(mine, 'item') + ' in my court';
    }
  }

  App.quickAdd = (prefill) => Forms.quickAdd(prefill);
  App.openDrawer = (id) => Forms.openDrawer(id);

  /** Status change with sensible side effects on cycles and ball in court. */
  App.applyStatus = (s, status) => {
    if (s.status === status) return s;
    const d = M.derive(s);
    let next;
    if (status === 'Submitted' && (!d.cur || !d.cur.submitted)) next = M.markSubmitted(s);
    else if (status === 'Submitted' && d.cur && d.cur.received) next = M.logResubmittal(s);
    else if (status === 'Comments Received' && d.cur && d.cur.submitted && !d.cur.received) next = M.markReceived(s);
    else {
      const patch = { status };
      if (C.WITH_AGENCY.includes(status) && d.cur && d.cur.submitted) patch.ball = 'Agency';
      if ((status === 'Comments Received' || status === 'Resubmittal in Prep') && s.ball === 'Agency') patch.ball = 'Us';
      next = M.update(s, patch);
    }
    if (next.status !== status) next = M.update(next, { status });
    return next;
  };
  App.setStatus = (s, status) => {
    if (s.status === status) return;
    Store.checkpoint('status change');
    const next = App.applyStatus(s, status);
    UI.undoToast(`${s.title}: ${status}${next.ball !== s.ball ? ' · ball to ' + next.ball : ''}`);
  };

  /** Shared row/card actions. */
  App.rowAct = (act, s, anchor) => {
    switch (act) {
      case 'open': return App.openDrawer(s.id);
      case 'received':
        Store.checkpoint('comments received');
        M.markReceived(s);
        return UI.undoToast(`Comments received on ${s.title}. Ball is in your court.`);
      case 'resubmit': {
        Store.checkpoint('log resubmittal');
        const n = M.logResubmittal(s);
        return UI.undoToast(`Logged ${U.ordinal(M.derive(n).cycleN)} submittal of ${s.title}. Due back ${U.fmtD(M.derive(n).due) || '—'}.`);
      }
      case 'submit': {
        Store.checkpoint('mark submitted');
        const n = M.markSubmitted(s);
        return UI.undoToast(`${s.title} submitted. Due back ${U.fmtD(M.derive(n).due) || '—'}.`);
      }
      case 'status-menu':
        return App.menu(anchor, C.STATUS_KEYS.map((k) => ({ label: UI.statusPill(k), html: true, checked: k === s.status, fn: () => App.setStatus(Store.submittal(s.id), k) })));
      case 'ball-menu':
        return App.menu(anchor, C.BALL.map((b) => ({ label: b === 'Us' ? 'Us (my court)' : b, checked: b === s.ball, fn: () => { Store.checkpoint('ball change'); M.update(Store.submittal(s.id), { ball: b }); UI.undoToast(`${s.title}: ball to ${b}`); } })));
      case 'row-menu': {
        const d = M.derive(s);
        return App.menu(anchor, [
          { label: 'Open', fn: () => App.openDrawer(s.id) },
          { label: d.cycleN && d.submitted ? 'Log resubmittal today' : 'Mark submitted today', fn: () => App.rowAct(d.cycleN && d.submitted ? 'resubmit' : 'submit', Store.submittal(s.id)) },
          { label: 'Comments received today', disabled: !(d.cur && d.cur.submitted && !d.cur.received), fn: () => App.rowAct('received', Store.submittal(s.id)) },
          { label: 'Duplicate', fn: () => { Store.checkpoint('duplicate'); const c = M.duplicate(Store.submittal(s.id)); UI.undoToast('Duplicated ' + s.title); App.openDrawer(c.id); } },
          { sep: true },
          { label: 'Delete…', danger: true, fn: async () => {
            if (!(await UI.confirm(`Delete <b>${U.esc(s.title)}</b>?`, { title: 'Delete submittal', ok: 'Delete', danger: true }))) return;
            Store.checkpoint('delete ' + s.title);
            Store.removeSubmittal(s.id);
            UI.undoToast('Deleted ' + s.title);
          } },
        ]);
      }
    }
  };

  /** Click handling for any list of [data-id] rows/cards. Returns true if handled. */
  App.handleRowClick = (e) => {
    const holder = e.target.closest('[data-id]');
    if (!holder) return false;
    const s = Store.submittal(holder.dataset.id);
    if (!s) return false;
    const b = e.target.closest('[data-act]');
    if (b && holder.contains(b)) {
      e.preventDefault();
      App.rowAct(b.dataset.act, s, b);
      return true;
    }
    if (e.target.closest('input,select,textarea,a,label,button')) return false;
    App.openDrawer(s.id);
    return true;
  };

  /* ---------- popover menu ---------- */

  let openMenu = null;
  const closeMenu = () => {
    if (openMenu) { openMenu.el.remove(); if (openMenu.anchor && document.contains(openMenu.anchor)) openMenu.anchor.focus(); openMenu = null; }
  };
  App.closeMenu = closeMenu;

  App.menu = (anchor, items) => {
    closeMenu();
    const el = document.createElement('div');
    el.className = 'menu';
    el.setAttribute('role', 'menu');
    el.innerHTML = items.map((it, i) => it.sep ? '<hr>' :
      `<button role="menuitem" data-i="${i}" class="${it.danger ? 'is-danger' : ''} ${it.checked ? 'is-checked' : ''}" ${it.disabled ? 'disabled' : ''}>${it.checked ? UI.icon('check', 'ic-check') : '<span class="ic-space"></span>'}${it.html ? it.label : U.esc(it.label)}</button>`).join('');
    document.body.appendChild(el);
    const r = anchor.getBoundingClientRect();
    const mw = el.offsetWidth;
    const mh = el.offsetHeight;
    let left = Math.min(window.innerWidth - mw - 8, Math.max(8, r.left));
    let top = r.bottom + 4;
    if (top + mh > window.innerHeight - 8) top = Math.max(8, r.top - mh - 4);
    el.style.left = left + 'px';
    el.style.top = top + 'px';
    openMenu = { el, anchor };
    el.addEventListener('click', (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      const it = items[+b.dataset.i];
      openMenu.anchor = null;
      closeMenu();
      it.fn();
    });
    el.addEventListener('keydown', (e) => {
      const btns = Array.from(el.querySelectorAll('button:not([disabled])'));
      const i = btns.indexOf(document.activeElement);
      if (e.key === 'ArrowDown') { e.preventDefault(); btns[(i + 1) % btns.length].focus(); }
      if (e.key === 'ArrowUp') { e.preventDefault(); btns[(i - 1 + btns.length) % btns.length].focus(); }
    });
    const first = el.querySelector('button.is-checked:not([disabled])') || el.querySelector('button:not([disabled])');
    if (first) first.focus();
  };

  /* ---------- global listeners ---------- */

  function bindGlobal() {
    document.addEventListener('click', (e) => {
      if (openMenu && !openMenu.el.contains(e.target) && !openMenu.anchor?.contains(e.target)) closeMenu();
      // close open dropdowns when clicking elsewhere
      document.querySelectorAll('details.dd[open]').forEach((d) => { if (!d.contains(e.target)) d.open = false; });
      const nav = e.target.closest('[data-nav]');
      if (nav) { e.preventDefault(); Forms.closeDrawer(true); App.go(nav.dataset.nav); return; }
      const go = e.target.closest('[data-goto]');
      if (go && !e.target.closest('.drawer-host')) { e.preventDefault(); App.go(go.dataset.goto); return; }
      if (e.target.closest('[data-global="new"]')) { App.quickAdd(); }
    });

    window.addEventListener('popstate', () => {
      const h = parseHash();
      if (h) { App.route = h.r; App.arg = h.arg; App.render(); }
    });

    window.addEventListener('resize', closeMenu);
    window.addEventListener('scroll', closeMenu, true);

    document.addEventListener('keydown', (e) => {
      const typing = e.target.closest('input,textarea,select,[contenteditable]');
      if (e.key === 'Escape') {
        if (openMenu) { closeMenu(); return; }
        const m = UI.topModal();
        if (m) { m.close(); return; }
        if (Forms.drawerOpen()) { Forms.closeDrawer(); return; }
        const dd = document.querySelector('details.dd[open]');
        if (dd) { dd.open = false; return; }
        return;
      }
      if (typing || e.ctrlKey || e.metaKey || e.altKey || UI.topModal()) return;
      if (e.key === 'n' || e.key === 'N') { e.preventDefault(); App.quickAdd(); }
      if (e.key === '/') {
        const q = document.getElementById('flt-q');
        if (q) { e.preventDefault(); q.focus(); q.select(); }
        else if (!Forms.drawerOpen()) { e.preventDefault(); App.go('table'); setTimeout(() => { const q2 = document.getElementById('flt-q'); if (q2) q2.focus(); }, 0); }
      }
    });
  }

  function bindStatus() {
    const el = document.getElementById('save-status');
    const show = (status, msg) => {
      el.dataset.state = status;
      el.textContent = status === 'saving' ? 'Saving…' : status === 'error' ? 'Not saved' : Store.mode === 'db' ? 'Saved' : 'Saved in this browser';
      el.title = msg || (Store.mode === 'db' ? 'Changes are saved to this artifact’s database.' : 'Changes are saved in this browser’s local storage. Download backups from Settings.');
      if (status === 'error' && msg) UI.toast(msg, { error: true, timeout: 8000 });
    };
    Store.onStatus(show);
    show(Store.status, Store.statusMsg);
  }

  /* ---------- boot ---------- */

  App.boot = async () => {
    UI.applyTheme();
    bindGlobal();
    try {
      await Store.init();
    } catch (e) {
      document.getElementById('view').innerHTML = '<div class="empty"><h3>Could not load your data.</h3><p>Reload the page to try again.</p></div>';
      console.error(e);
      return;
    }
    document.body.classList.remove('is-loading');
    document.getElementById('dl-agencies').innerHTML = C.AGENCIES.map((a) => `<option value="${U.esc(a)}">`).join('');
    bindStatus();
    Store.onChange(App.refresh);
    const h = parseHash();
    const saved = String(UI.prefs.route || 'dashboard').split('/');
    if (h) { App.route = h.r; App.arg = h.arg; }
    else if (ROUTES[saved[0]]) { App.route = saved[0]; App.arg = saved.slice(1).join('/'); }
    if (App.route === 'project' && !Store.project(App.arg)) { App.route = 'projects'; App.arg = ''; }
    App.render();
    if (Store.firstRun) UI.toast('Loaded your 6 active projects. Add submittals with New submittal or a package template.', { timeout: 7000 });
  };

  window.App = App;
  document.addEventListener('DOMContentLoaded', App.boot);
})();
