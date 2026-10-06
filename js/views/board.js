/* Kanban board by status. Drag a card to another column to change its status. */
(function () {
  'use strict';

  function cardHtml(s) {
    const d = M.derive(s);
    const w = M.where(s);
    const qa = M.quickAction(s);
    return `<article class="card ${d.overdue ? 'is-over' : ''} ${d.stale ? 'is-stale' : ''}" data-id="${s.id}" draggable="true" tabindex="0" aria-label="${U.esc(s.title)}">
      <div class="card-top"><button class="row-title" data-act="open">${U.esc(s.title || '(untitled)')}</button><button class="icon-btn" data-act="row-menu" aria-label="More actions">${UI.icon('more')}</button></div>
      <div class="card-where">${U.esc(w.projectName)}${w.pkgName ? ' › ' + U.esc(w.pkgName) : ''}</div>
      <div class="card-meta">
        ${UI.ballChip(s.ball, d)}
        ${d.cycleN ? `<span class="tag">${U.ordinal(d.cycleN)} cycle</span>` : ''}
        ${s.agency ? `<span class="tag" title="${U.esc(s.agency + (s.department ? ' · ' + s.department : ''))}">${U.esc(s.department || s.agency)}</span>` : ''}
      </div>
      ${d.withAgency && d.due ? `<div class="card-due ${d.overdue ? 'is-over' : ''}">Due back ${U.fmtD(d.due)}</div>` : ''}
      <div class="row-flags">${UI.flags(s, d)}</div>
      ${qa ? `<div class="card-act"><button class="btn btn-sm btn-quick" data-act="${qa.act}" title="${U.esc(qa.title)}">${U.esc(qa.label)}</button></div>` : ''}
    </article>`;
  }

  function columnsHtml() {
    const list = F.apply();
    const hideDone = UI.prefs.boardHideDone;
    const by = Object.fromEntries(C.STATUS_KEYS.map((k) => [k, []]));
    list.forEach((s) => (by[s.status] || (by[s.status] = [])).push(s));
    const sortFn = (a, b) => {
      const da = M.derive(a), db = M.derive(b);
      return (db.overdue - da.overdue) || U.cmp(da.due, db.due) || (db.ballDays || 0) - (da.ballDays || 0) || U.cmp(a.title, b.title);
    };
    const cols = C.STATUSES.filter((st) => !(hideDone && C.DONE.includes(st.key)));
    return `${F.chipsHtml()}<div class="board" role="list">${cols
      .map((st) => {
        const items = by[st.key].sort(sortFn);
        return `<section class="col st-col-${st.cls}" data-status="${U.esc(st.key)}" role="listitem" aria-label="${U.esc(st.key)}">
          <header class="col-h">${UI.statusPill(st.key)}<span class="col-n">${items.length}</span></header>
          <div class="col-b">${items.map(cardHtml).join('') || '<p class="col-empty">Nothing here</p>'}</div>
        </section>`;
      })
      .join('')}</div>`;
  }

  const view = {
    title: 'Board',
    render(root) {
      const openDD = Array.from(root.querySelectorAll('details.dd[open]')).map((x) => x.id);
      root.innerHTML = `<div class="view-h"><h1>Board</h1><p class="view-sub">Drag cards between columns to change status. On a phone, open a card and change its status there.</p></div>
        ${F.toolbarHtml({ columns: `<label class="chk chk-inline"><input type="checkbox" id="board-hide-done" ${UI.prefs.boardHideDone ? 'checked' : ''}> Hide approved / closed columns</label>` })}
        <div id="board-results">${columnsHtml()}</div>`;
      openDD.forEach((id) => { const d = root.querySelector('#' + id); if (d) d.open = true; });
      if (!root.dataset.bound) bind(root);
    },
    refresh(root) {
      const r = root.querySelector('#board-results');
      if (!r) return view.render(root);
      const sc = Array.from(r.querySelectorAll('.col-b')).map((x) => x.scrollTop);
      const bx = r.querySelector('.board') ? r.querySelector('.board').scrollLeft : 0;
      r.innerHTML = columnsHtml();
      r.querySelectorAll('.col-b').forEach((x, i) => (x.scrollTop = sc[i] || 0));
      if (r.querySelector('.board')) r.querySelector('.board').scrollLeft = bx;
    },
  };

  function bind(root) {
    root.dataset.bound = '1';
    F.bind(root, (full) => (full ? view.render(root) : view.refresh(root)));
    root.addEventListener('change', (e) => {
      if (e.target.id === 'board-hide-done') { UI.setPref('boardHideDone', e.target.checked); view.refresh(root); }
    });
    root.addEventListener('click', (e) => {
      if (App.handleRowClick(e)) return;
    });
    root.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && e.target.classList.contains('card')) App.openDrawer(e.target.dataset.id);
    });

    let dragId = null;
    root.addEventListener('dragstart', (e) => {
      const card = e.target.closest('.card');
      if (!card) return;
      dragId = card.dataset.id;
      card.classList.add('is-drag');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', dragId); } catch (err) { /* some browsers */ }
    });
    root.addEventListener('dragend', (e) => {
      const card = e.target.closest('.card');
      if (card) card.classList.remove('is-drag');
      root.querySelectorAll('.col.is-target').forEach((c) => c.classList.remove('is-target'));
    });
    root.addEventListener('dragover', (e) => {
      const col = e.target.closest('.col');
      if (!col || !dragId) return;
      e.preventDefault();
      root.querySelectorAll('.col.is-target').forEach((c) => c !== col && c.classList.remove('is-target'));
      col.classList.add('is-target');
    });
    root.addEventListener('drop', (e) => {
      const col = e.target.closest('.col');
      if (!col || !dragId) return;
      e.preventDefault();
      const s = Store.submittal(dragId);
      dragId = null;
      col.classList.remove('is-target');
      if (!s || s.status === col.dataset.status) return;
      App.setStatus(s, col.dataset.status);
    });
  }

  window.BoardView = view;
})();
