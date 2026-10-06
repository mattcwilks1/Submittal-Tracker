/* UI primitives: icons, pills, badges, modals, confirm/prompt, toasts, per-browser preferences, file saving. */
(function () {
  'use strict';
  const UI = {};
  const PREF_KEY = 'submittal-tracker:ui:v1';

  /* ---------- per-browser preferences (view settings, last used, collapsed sections) ---------- */

  UI.prefs = Object.assign(
    {
      theme: 'system',
      groupBy: 'project',
      sort: { key: 'due', dir: 'asc' },
      columns: {},
      collapsed: {},
      filters: {},
      lastUsed: {},
      boardHideDone: false,
      route: 'dashboard',
    },
    U.lsGet(PREF_KEY, {})
  );
  UI.savePrefs = U.debounce(() => U.lsSet(PREF_KEY, UI.prefs), 150);
  UI.setPref = (k, v) => {
    UI.prefs[k] = v;
    UI.savePrefs();
  };
  UI.lastUsed = () => UI.prefs.lastUsed || {};
  UI.rememberLast = (o) => UI.setPref('lastUsed', { ...UI.lastUsed(), ...o });

  UI.applyTheme = () => {
    const t = UI.prefs.theme;
    if (t === 'light' || t === 'dark') document.documentElement.setAttribute('data-theme', t);
    else document.documentElement.removeAttribute('data-theme');
  };

  /* ---------- icons (inline SVG, stroke = currentColor) ---------- */

  const P = {
    plus: 'M12 5v14M5 12h14',
    search: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2',
    x: 'M6 6l12 12M18 6L6 18',
    chev: 'M9 6l6 6-6 6',
    chevDown: 'M6 9l6 6 6-6',
    up: 'M12 19V5M6 11l6-6 6 6',
    down: 'M12 5v14M6 13l6 6 6-6',
    more: 'M5 12h.01M12 12h.01M19 12h.01',
    alert: 'M12 3l9.5 17h-19L12 3zM12 10v4M12 17.5h.01',
    clock: 'M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2',
    link: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1',
    copy: 'M9 9h10v10H9zM5 15V5h10',
    trash: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3',
    edit: 'M4 20h4L19 9l-4-4L4 16v4z',
    refresh: 'M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7',
    inbox: 'M3 13h5l1.5 3h5L16 13h5M5 5h14l2 8v6H3v-6l2-8z',
    send: 'M4 12l16-8-6 16-3-7-7-1z',
    grid: 'M4 4h16v16H4zM4 10h16M4 15h16M10 4v16',
    board: 'M4 4h4v16H4zM10 4h4v10h-4zM16 4h4v13h-4z',
    home: 'M3 11l9-7 9 7v9h-6v-6H9v6H3z',
    folder: 'M3 6h6l2 2h10v11H3z',
    layers: 'M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5',
    gear: 'M12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6zM19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-2.7 1.1V21a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-2.7-1.1l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1A1.6 1.6 0 0 0 3.6 15H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.1-2.7l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1A1.6 1.6 0 0 0 9.7 4.6V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 2.7 1.1l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0 1.1 2.7H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1.3z',
    download: 'M12 4v11M7 10l5 5 5-5M5 20h14',
    upload: 'M12 20V9M7 14l5-5 5 5M5 4h14',
    check: 'M5 12l5 5 9-10',
    filter: 'M4 5h16l-6 8v6l-4-2v-4z',
    user: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21a8 8 0 0 1 16 0',
  };
  UI.icon = (name, cls) =>
    `<svg class="ic ${cls || ''}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${P[name] || ''}"/></svg>`;

  /* ---------- badges ---------- */

  UI.statusPill = (status, extra) => {
    const s = C.STATUS_BY_KEY[status] || { cls: 'idle', glyph: '?' };
    return `<span class="pill st-${s.cls} ${extra || ''}"><span class="pill-g" aria-hidden="true">${s.glyph}</span>${U.esc(status || '—')}</span>`;
  };

  UI.ballChip = (ball, d) => {
    const cls = ball === 'Us' ? 'ball-us' : ball === 'Consultant' ? 'ball-con' : ball === 'Agency' ? 'ball-ag' : '';
    const days = d && d.ballDays != null && !d.done ? `<span class="ball-d">${d.ballDays}d</span>` : '';
    return `<span class="ball ${cls}" title="Ball in court: ${U.esc(ball)}${d && d.ballDays != null ? ' for ' + d.ballDays + ' days' : ''}">${U.esc(ball === 'Consultant' ? 'Consultant' : ball || '—')}${days}</span>`;
  };

  UI.flags = (s, d) => {
    const out = [];
    if (d.overdue) out.push(`<span class="flag flag-over" title="Review was due back ${U.esc(U.fmtLong(d.due))}">${UI.icon('alert')}${d.overdue}d overdue</span>`);
    else if (d.dueIn != null && d.dueIn <= 7) out.push(`<span class="flag flag-soon" title="Due back ${U.esc(U.fmtLong(d.due))}">${UI.icon('clock')}${d.dueIn === 0 ? 'due today' : 'due in ' + d.dueIn + 'd'}</span>`);
    if (d.stale) out.push(`<span class="flag flag-stale" title="With ${U.esc(s.ball === 'Us' ? 'us' : 'the consultant')} for ${d.ballDays} days">${UI.icon('clock')}${d.ballDays}d ${s.ball === 'Us' ? 'with us' : 'w/ consultant'}</span>`);
    if (s.priority === 'High') out.push('<span class="flag flag-hi" title="High priority">▲ High</span>');
    return out.join('');
  };

  UI.dateCell = (iso, cls) => (iso ? `<time class="${cls || ''}" datetime="${iso}" title="${U.esc(U.fmtLong(iso))}">${U.fmtD(iso)}</time>` : '<span class="muted">—</span>');

  UI.options = (list, sel, blank) =>
    (blank != null ? `<option value="">${U.esc(blank)}</option>` : '') +
    list
      .map((o) => {
        const v = typeof o === 'object' ? o.value : o;
        const l = typeof o === 'object' ? o.label : o;
        return `<option value="${U.esc(v)}"${String(v) === String(sel ?? '') ? ' selected' : ''}>${U.esc(l)}</option>`;
      })
      .join('');

  UI.progress = (pr, label) =>
    `<span class="prog" title="${pr.done} of ${pr.total} approved or closed"><span class="prog-bar"><span style="width:${pr.pct}%"></span></span><span class="prog-t">${pr.pct}%${label ? ' ' + label : ''}</span></span>`;

  /* ---------- modal stack ---------- */

  const stack = [];

  UI.modal = ({ title, body, foot, wide, onMount, onClose, cls }) => {
    const prevFocus = document.activeElement;
    const el = document.createElement('div');
    el.className = 'overlay';
    el.innerHTML = `<div class="modal ${wide ? 'modal-wide' : ''} ${cls || ''}" role="dialog" aria-modal="true" aria-label="${U.esc(title)}">
      <header class="modal-h"><h2>${U.esc(title)}</h2><button class="icon-btn" data-close aria-label="Close">${UI.icon('x')}</button></header>
      <div class="modal-b">${body || ''}</div>
      ${foot ? `<footer class="modal-f">${foot}</footer>` : ''}
    </div>`;
    document.body.appendChild(el);
    const api = {
      el,
      close(result) {
        const i = stack.indexOf(api);
        if (i >= 0) stack.splice(i, 1);
        el.remove();
        if (onClose) onClose(result);
        if (prevFocus && prevFocus.focus && document.contains(prevFocus)) prevFocus.focus();
      },
    };
    stack.push(api);
    el.addEventListener('mousedown', (e) => { if (e.target === el) api.close(); });
    el.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', () => api.close()));
    if (onMount) onMount(el, api);
    const f = el.querySelector('[autofocus]') || el.querySelector('input:not([type=hidden]),select,textarea,button.btn-primary');
    if (f) setTimeout(() => f.focus(), 0);
    return api;
  };
  UI.topModal = () => stack[stack.length - 1] || null;

  UI.confirm = (message, { title = 'Confirm', ok = 'OK', danger = false } = {}) =>
    new Promise((resolve) => {
      let done = false;
      UI.modal({
        title,
        body: `<p class="confirm-msg">${message}</p>`,
        foot: `<button class="btn" data-close>Cancel</button><button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-ok autofocus>${U.esc(ok)}</button>`,
        onMount(el, api) {
          el.querySelector('[data-ok]').addEventListener('click', () => { done = true; api.close(); resolve(true); });
        },
        onClose() { if (!done) resolve(false); },
      });
    });

  UI.prompt = (label, value, { title = label, ok = 'Save', placeholder = '', list = [] } = {}) =>
    new Promise((resolve) => {
      let done = false;
      const dl = list.length ? `<datalist id="prompt-dl">${list.map((x) => `<option value="${U.esc(x)}">`).join('')}</datalist>` : '';
      UI.modal({
        title,
        body: `<form class="stack" data-f><label class="fld"><span>${U.esc(label)}</span><input id="prompt-input" type="text" value="${U.esc(value || '')}" placeholder="${U.esc(placeholder)}" ${list.length ? 'list="prompt-dl"' : ''} autofocus></label>${dl}</form>`,
        foot: `<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>${U.esc(ok)}</button>`,
        onMount(el, api) {
          const inp = el.querySelector('input');
          const submit = (e) => {
            if (e) e.preventDefault();
            const v = inp.value.trim();
            if (!v) { inp.focus(); return; }
            done = true; api.close(); resolve(v);
          };
          el.querySelector('[data-ok]').addEventListener('click', submit);
          el.querySelector('[data-f]').addEventListener('submit', submit);
          setTimeout(() => inp.select(), 10);
        },
        onClose() { if (!done) resolve(null); },
      });
    });

  /* ---------- toasts ---------- */

  UI.toast = (msg, opts = {}) => {
    const host = document.getElementById('toasts');
    const el = document.createElement('div');
    el.className = 'toast' + (opts.error ? ' toast-err' : '');
    el.setAttribute('role', opts.error ? 'alert' : 'status');
    el.innerHTML = `<span>${U.esc(msg)}</span>${opts.action ? `<button class="toast-act">${U.esc(opts.action.label)}</button>` : ''}<button class="icon-btn toast-x" aria-label="Dismiss">${UI.icon('x')}</button>`;
    host.appendChild(el);
    while (host.children.length > 3) host.firstElementChild.remove();
    const close = () => el.remove();
    if (opts.action) el.querySelector('.toast-act').addEventListener('click', () => { opts.action.fn(); close(); });
    el.querySelector('.toast-x').addEventListener('click', close);
    setTimeout(close, opts.timeout || (opts.action ? 8000 : 3500));
  };

  /** Toast with an Undo button wired to the store's last checkpoint. */
  UI.undoToast = (msg) =>
    UI.toast(msg, {
      action: {
        label: 'Undo',
        fn: () => {
          const label = Store.undo();
          if (label) UI.toast('Undid: ' + label);
        },
      },
    });

  /* ---------- file output ---------- */

  let downloadsCap;
  UI.saveFile = async (filename, data, mime) => {
    if (downloadsCap === undefined) {
      downloadsCap = null;
      if (window.claude && typeof window.claude.use === 'function') {
        try { downloadsCap = await window.claude.use('downloads'); } catch (e) { downloadsCap = null; }
      }
    }
    if (downloadsCap) {
      try {
        await downloadsCap.save({ filename, data });
        UI.toast('Saved ' + filename);
      } catch (e) {
        if (e && e.code !== 'declined') UI.toast('Could not save the file (' + (e.code || 'error') + ').', { error: true });
      }
      return;
    }
    const blob = data instanceof Blob ? data : new Blob([data], { type: mime || 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  UI.pickFile = (accept) =>
    new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file';
      inp.accept = accept;
      inp.style.display = 'none';
      inp.addEventListener('change', () => { resolve(inp.files[0] || null); inp.remove(); });
      document.body.appendChild(inp);
      inp.click();
    });

  window.UI = UI;
})();
