/* Quick-add form and the submittal editor drawer. */
(function () {
  'use strict';

  const Forms = {};

  const datalists = () => {
    const subs = Store.state.submittals;
    const uniq = (arr) => Array.from(new Set(arr.filter(Boolean))).sort(U.cmp);
    return {
      firms: uniq(subs.map((s) => s.preparerFirm)),
      contacts: uniq(subs.map((s) => s.preparerContact)),
      reviewers: uniq(subs.map((s) => s.reviewer)),
      agencies: uniq(C.AGENCIES.concat(subs.map((s) => s.agency), Store.state.projects.map((p) => p.jurisdiction))),
      depts: uniq(C.DEPARTMENTS.concat(subs.map((s) => s.department))),
      discs: uniq(C.DISCIPLINES.map((d) => d[0]).concat(subs.map((s) => s.discipline))),
    };
  };
  const dl = (id, list) => `<datalist id="${id}">${list.map((x) => `<option value="${U.esc(x)}">`).join('')}</datalist>`;

  const phaseOpts = (p, sel) => UI.options((p ? p.phases : []).map((x) => ({ value: x.id, label: x.name })), sel);
  const pkgOpts = (p, phaseId, sel, withNew) => {
    const ph = Store.phase(p, phaseId);
    return UI.options((ph ? ph.packages : []).map((k) => ({ value: k.id, label: k.name })), sel, '(no package)') + (withNew ? '<option value="__new">+ New package…</option>' : '');
  };

  /* =================================================================
   * Quick add
   * ================================================================= */

  Forms.quickAdd = (prefill = {}) => {
    const projects = Store.projects(false);
    if (!projects.length) {
      UI.toast('Create a project first.', { error: true });
      App.go('projects');
      return;
    }
    const last = UI.lastUsed();
    const pid = prefill.projectId || (projects.some((p) => p.id === last.projectId) ? last.projectId : projects[0].id);
    const p = Store.project(pid);
    const samePrev = pid === last.projectId;
    const phaseId = prefill.phaseId || (samePrev && Store.phase(p, last.phaseId) ? last.phaseId : (p.phases.find((x) => x.name === 'Design / Plan Check') || p.phases[0] || {}).id);
    const pkgId = prefill.packageId || (samePrev && phaseId === last.phaseId && Store.pkg(p, phaseId, last.packageId) ? last.packageId : ((Store.phase(p, phaseId) || { packages: [] }).packages[0] || {}).id || '');
    const L = datalists();
    const st = Store.state.settings;
    const added = [];

    UI.modal({
      title: 'New submittal',
      wide: true,
      cls: 'modal-qa',
      body: `<form id="qa-form" class="qa" autocomplete="off">
        <div class="form-grid g3">
          <label class="fld"><span>Project</span><select id="qa-project">${UI.options(projects.map((x) => ({ value: x.id, label: x.name })), pid)}</select></label>
          <label class="fld"><span>Phase</span><select id="qa-phase">${phaseOpts(p, phaseId)}</select></label>
          <label class="fld"><span>Package</span><select id="qa-pkg">${pkgOpts(p, phaseId, pkgId, true)}</select></label>
          <label class="fld span-3" id="qa-newpkg-wrap" hidden><span>New package name</span><input id="qa-newpkg" list="dl-pkgsugg" placeholder="e.g. Wet Utility Plans"></label>
          <label class="fld span-3"><span>Title</span><input id="qa-title" required placeholder="e.g. Rough Grading Plan" autofocus></label>
          <label class="fld"><span>Discipline / type</span><input id="qa-disc" list="qa-dl-disc" value="${U.esc(prefill.discipline || '')}"></label>
          <label class="fld"><span>Agency</span><input id="qa-agency" list="qa-dl-ag" value="${U.esc(samePrev && last.agency ? last.agency : p.jurisdiction || '')}"></label>
          <label class="fld"><span>Department</span><input id="qa-dept" list="qa-dl-dept" value="${U.esc(samePrev ? last.department || '' : '')}"></label>
          <label class="fld"><span>Status</span><select id="qa-status">${UI.options(C.STATUS_KEYS, 'Not Started')}</select></label>
          <label class="fld"><span>Ball in court</span><select id="qa-ball">${UI.options(C.BALL, 'Us')}</select></label>
          <label class="fld"><span>Priority</span><select id="qa-pri">${UI.options(C.PRIORITY, 'Normal')}</select></label>
          <label class="fld"><span>Date submitted <em>starts 1st cycle</em></span><input id="qa-sub" type="date"></label>
          <label class="fld"><span>Turnaround days</span><input id="qa-tat" type="number" min="0" value="${U.esc(st.defaultTat)}"></label>
          <label class="fld"><span>Due back</span><output id="qa-due" class="out">—</output></label>
          <label class="fld"><span>Preparer / consultant firm</span><input id="qa-firm" list="qa-dl-firm" value="${U.esc(samePrev ? last.preparerFirm || '' : '')}"></label>
          <label class="fld"><span>Consultant contact</span><input id="qa-contact" list="qa-dl-contact" value="${U.esc(samePrev ? last.preparerContact || '' : '')}"></label>
          <label class="fld"><span>Agency reviewer</span><input id="qa-rev" list="qa-dl-rev"></label>
          <label class="fld"><span>Tracking / permit #</span><input id="qa-track" class="mono"></label>
          <label class="fld span-2"><span>Next action</span><input id="qa-next" placeholder="e.g. Send redlines to consultant"></label>
        </div>
        ${dl('qa-dl-disc', L.discs)}${dl('qa-dl-ag', L.agencies)}${dl('qa-dl-dept', L.depts)}${dl('qa-dl-firm', L.firms)}${dl('qa-dl-contact', L.contacts)}${dl('qa-dl-rev', L.reviewers)}
        <datalist id="dl-pkgsugg">${Store.templates().map((t) => `<option value="${U.esc(t.name)}">`).join('')}</datalist>
        <div id="qa-added" class="qa-added" aria-live="polite"></div>
      </form>`,
      foot: `<span class="foot-hint">Carries project, phase and package to the next one</span><button class="btn" data-close>Close</button><button class="btn" data-again title="Ctrl+Enter">Save &amp; add another</button><button class="btn btn-primary" data-ok>Save</button>`,
      onMount(el, api) {
        const $ = (id) => el.querySelector('#' + id);
        let deptTouched = !!$('qa-dept').value;
        let ballTouched = false;

        const curProject = () => Store.project($('qa-project').value);
        $('qa-project').addEventListener('change', () => {
          const pp = curProject();
          const ph = pp.phases.find((x) => x.name === (Store.phase(p, $('qa-phase').value) || {}).name) || pp.phases[0];
          $('qa-phase').innerHTML = phaseOpts(pp, ph && ph.id);
          $('qa-pkg').innerHTML = pkgOpts(pp, ph && ph.id, '', true);
          $('qa-agency').value = pp.jurisdiction || $('qa-agency').value;
          togglePkg();
        });
        $('qa-phase').addEventListener('change', () => {
          const ph = Store.phase(curProject(), $('qa-phase').value);
          $('qa-pkg').innerHTML = pkgOpts(curProject(), $('qa-phase').value, ph && ph.packages[0] ? ph.packages[0].id : '', true);
          togglePkg();
        });
        const togglePkg = () => {
          const isNew = $('qa-pkg').value === '__new';
          $('qa-newpkg-wrap').hidden = !isNew;
          if (isNew) $('qa-newpkg').focus();
        };
        $('qa-pkg').addEventListener('change', togglePkg);
        $('qa-dept').addEventListener('input', () => { deptTouched = true; });
        $('qa-disc').addEventListener('change', () => {
          const d = C.DEPT_FOR[$('qa-disc').value];
          if (d && (!deptTouched || !$('qa-dept').value)) $('qa-dept').value = d;
        });
        $('qa-ball').addEventListener('change', () => { ballTouched = true; });
        $('qa-status').addEventListener('change', () => {
          if (ballTouched) return;
          const s = $('qa-status').value;
          $('qa-ball').value = C.WITH_AGENCY.includes(s) ? 'Agency' : s === 'Comments Received' || s === 'Resubmittal in Prep' ? 'Us' : $('qa-ball').value;
        });
        const updDue = () => {
          const sub = $('qa-sub').value;
          if (sub && $('qa-status').value === 'Not Started') { $('qa-status').value = 'Submitted'; if (!ballTouched) $('qa-ball').value = 'Agency'; }
          const due = M.dueFor({ submitted: sub, tat: $('qa-tat').value });
          $('qa-due').textContent = due ? U.fmtLong(due) : '—';
        };
        $('qa-sub').addEventListener('change', updDue);
        $('qa-tat').addEventListener('input', updDue);

        const save = (again) => {
          const title = $('qa-title').value.trim();
          if (!title) { $('qa-title').focus(); $('qa-title').setAttribute('aria-invalid', 'true'); return; }
          const pp = curProject();
          const phase = $('qa-phase').value;
          let pkg = $('qa-pkg').value;
          if (pkg === '__new') {
            const name = $('qa-newpkg').value.trim();
            if (!name) { $('qa-newpkg').focus(); return; }
            const k = Store.newPackage(name);
            const cp = U.clone(pp);
            cp.phases.find((x) => x.id === phase).packages.push(k);
            Store.putProject(cp);
            pkg = k.id;
            $('qa-pkg').innerHTML = pkgOpts(Store.project(pp.id), phase, pkg, true);
            $('qa-newpkg-wrap').hidden = true;
            $('qa-newpkg').value = '';
          }
          const sub = $('qa-sub').value;
          const fields = {
            projectId: pp.id, phaseId: phase, packageId: pkg, title,
            discipline: $('qa-disc').value.trim(), agency: $('qa-agency').value.trim(), department: $('qa-dept').value.trim(),
            status: $('qa-status').value, ball: $('qa-ball').value, priority: $('qa-pri').value,
            preparerFirm: $('qa-firm').value.trim(), preparerContact: $('qa-contact').value.trim(), reviewer: $('qa-rev').value.trim(),
            trackingNo: $('qa-track').value.trim(), nextAction: $('qa-next').value.trim(),
          };
          if (sub) {
            fields.cycles = [{ id: U.uid('c'), n: 1, submitted: sub, tat: $('qa-tat').value === '' ? '' : +$('qa-tat').value, dueOverride: '', received: '', summary: '' }];
            fields.statusSince = sub;
            fields.ballSince = sub;
            fields.log = [{ at: U.nowIso(), t: 'Created · 1st submittal ' + U.fmtD(sub) }];
          }
          const s = Store.putSubmittal(M.newSubmittal(fields));
          UI.rememberLast({ projectId: pp.id, phaseId: phase, packageId: pkg, agency: fields.agency, department: fields.department, preparerFirm: fields.preparerFirm, preparerContact: fields.preparerContact });
          if (!again) {
            api.close();
            UI.toast('Added ' + title, { action: { label: 'Open', fn: () => App.openDrawer(s.id) } });
            return;
          }
          added.push(title);
          $('qa-added').innerHTML = `${UI.icon('check')} Added ${added.length}: ${added.slice(-4).map(U.esc).join(', ')}${added.length > 4 ? '…' : ''}`;
          ['qa-title', 'qa-track', 'qa-rev', 'qa-next', 'qa-sub'].forEach((id) => { $(id).value = ''; });
          $('qa-title').removeAttribute('aria-invalid');
          $('qa-due').textContent = '—';
          $('qa-title').focus();
        };
        el.querySelector('[data-ok]').addEventListener('click', () => save(false));
        el.querySelector('[data-again]').addEventListener('click', () => save(true));
        $('qa-form').addEventListener('submit', (e) => { e.preventDefault(); save(false); });
        el.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); save(true); }
        });
      },
    });
  };

  /* =================================================================
   * Editor drawer
   * ================================================================= */

  const D = { id: null, el: null };

  function headerHtml(s, d, w) {
    const qa = M.quickAction(s);
    const rec = qa ? qa.act : '';
    const canReceive = !!(d.cur && d.cur.submitted && !d.cur.received);
    const firstSubmit = !d.cur || !d.cur.submitted;
    return `<div class="dr-crumbs">${w.project ? `<button class="link" data-goto="project/${w.project.id}">${U.esc(w.projectName)}</button>` : U.esc(w.projectName)}${w.phaseName ? ' › ' + U.esc(w.phaseName) : ''}${w.pkgName ? ' › ' + U.esc(w.pkgName) : ''}</div>
      <div class="dr-badges">${UI.statusPill(s.status)}${UI.ballChip(s.ball, d)}${d.cycleN ? `<span class="tag">${U.ordinal(d.cycleN)} cycle</span>` : ''}${UI.flags(s, d)}</div>
      <div class="dr-stats">
        <span><b class="num">${d.daysInStatus ?? '—'}</b> days in status</span>
        <span><b class="num">${d.ballDays ?? '—'}</b> days in ${U.esc((s.ball || '').toLowerCase() === 'us' ? 'our' : s.ball === 'Consultant' ? "consultant's" : "agency's")} court</span>
        <span><b class="num">${d.totalDays ?? '—'}</b> days since 1st submittal</span>
        ${d.withAgency && d.due ? `<span class="${d.overdue ? 'txt-over' : ''}">Due back <b>${U.fmtD(d.due)}</b></span>` : ''}
      </div>
      <div class="dr-actions">
        ${firstSubmit
          ? `<button class="btn btn-sm ${rec === 'submit' ? 'btn-primary' : ''}" data-act="submit" title="Mark submitted today (starts the review cycle)">${UI.icon('send')}Mark submitted</button>`
          : `<button class="btn btn-sm ${rec === 'resubmit' ? 'btn-primary' : ''}" data-act="resubmit" title="Start the next review cycle, submitted today">${UI.icon('send')}Log resubmittal</button>`}
        <button class="btn btn-sm ${rec === 'received' ? 'btn-primary' : ''}" data-act="received" ${canReceive ? '' : 'disabled'} title="Record comments received today on the current cycle">${UI.icon('inbox')}Comments received</button>
        <button class="btn btn-sm" data-act="duplicate">${UI.icon('copy')}Duplicate</button>
        <button class="btn btn-sm btn-danger-ghost" data-act="delete">${UI.icon('trash')}Delete</button>
      </div>`;
  }

  function cyclesHtml(s) {
    const cur = s.cycles[s.cycles.length - 1];
    const rows = s.cycles.map((c) => {
      const due = M.dueFor(c);
      const rd = c.submitted && c.received ? U.diffDays(c.submitted, c.received) : null;
      const isCur = c === cur;
      return `<tr data-cid="${c.id}" class="${isCur ? 'is-cur' : ''}">
        <th scope="row" data-label="Cycle"><span class="num">${U.ordinal(c.n)}</span>${isCur ? '<span class="cur-tag">current</span>' : ''}</th>
        <td data-label="Submitted"><input type="date" aria-label="Date submitted" data-cf="submitted" value="${U.esc(c.submitted || '')}"></td>
        <td data-label="Turnaround"><input type="number" min="0" class="num-in" aria-label="Turnaround days" data-cf="tat" value="${U.esc(c.tat ?? '')}"></td>
        <td data-label="Due back"><div class="due-in"><input type="date" aria-label="Due back" data-cf="dueOverride" value="${U.esc(due)}"><span class="due-mode" data-due-mode>${c.dueOverride ? `<button class="link" data-act="due-auto" title="Go back to the calculated date">set · use calc</button>` : 'calc'}</span></div></td>
        <td data-label="Comments in"><input type="date" aria-label="Comments received" data-cf="received" value="${U.esc(c.received || '')}"></td>
        <td data-label="Review days" class="c-num" data-rd>${rd == null ? '<span class="muted">—</span>' : rd}</td>
        <td data-label="Comment summary" class="c-sum"><textarea rows="1" aria-label="Comment summary" data-cf="summary" placeholder="Key comments…">${U.esc(c.summary || '')}</textarea></td>
        <td><button class="icon-btn" data-act="cycle-del" aria-label="Remove ${U.ordinal(c.n)} cycle">${UI.icon('x')}</button></td>
      </tr>`;
    }).join('');
    return `<div class="sec-h"><h3>Review cycles</h3><span class="muted">The current (last) cycle drives status and due dates.</span></div>
      ${s.cycles.length ? `<div class="table-wrap"><table class="grid grid-compact cycles"><thead><tr><th>Cycle</th><th>Submitted</th><th>TAT days</th><th>Due back</th><th>Comments in</th><th class="c-num">Review days</th><th>Comment summary</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<p class="muted">No review cycles yet. Mark it submitted to start the 1st cycle.</p>'}
      <div class="row-gap">
        <button class="btn btn-sm" data-act="${s.cycles.length && !cur.submitted ? 'submit' : s.cycles.length ? 'resubmit' : 'submit'}">${UI.icon('send')}${s.cycles.length && cur.submitted ? 'Log resubmittal today' : 'Mark submitted today'}</button>
        <button class="btn btn-sm btn-ghost" data-act="cycle-add">${UI.icon('plus')}Add cycle without a date</button>
      </div>`;
  }

  function linksHtml(s) {
    return `<div class="sec-h"><h3>Links to files</h3><span class="muted">Plan sets, comment letters, folders</span></div>
      <ul class="links">${(s.links || []).map((l, i) => {
        const href = U.safeUrl(l.url);
        return `<li data-li="${i}">
          ${href ? `<a href="${U.esc(href)}" target="_blank" rel="noopener noreferrer">${UI.icon('link')}${U.esc(l.label || l.url)}</a>` : `<span class="path" title="Paste a web link (https://…) to make this clickable">${UI.icon('folder')}<span>${U.esc(l.label ? l.label + ' — ' : '')}<code>${U.esc(l.url)}</code></span></span>`}
          <button class="icon-btn" data-act="link-del" aria-label="Remove link">${UI.icon('x')}</button>
        </li>`;
      }).join('')}</ul>
      <form class="link-add" data-link-form>
        <input id="dr-link-label" placeholder="Label (e.g. 2nd submittal plans)" aria-label="Link label">
        <input id="dr-link-url" placeholder="https://… or S:\\Projects\\…" aria-label="Link URL or path">
        <button class="btn btn-sm" type="submit">${UI.icon('plus')}Add link</button>
      </form>`;
  }

  function logHtml(s) {
    const log = (s.log || []).slice().reverse();
    return `<details class="activity"><summary>Activity (${log.length})</summary><ol>${log.map((x) => `<li><time>${U.esc(U.fmtStamp(x.at))}</time> ${U.esc(x.t)}</li>`).join('')}</ol></details>`;
  }

  function bodyHtml(s) {
    const p = Store.project(s.projectId);
    const L = datalists();
    const f = (k, label, opts = {}) => `<label class="fld ${opts.span ? 'span-' + opts.span : ''}"><span>${label}</span><input id="dr-${k}" data-f="${k}" value="${U.esc(s[k] || '')}" ${opts.list ? `list="${opts.list}"` : ''} ${opts.type ? `type="${opts.type}"` : ''} class="${opts.cls || ''}" ${opts.ph ? `placeholder="${U.esc(opts.ph)}"` : ''}></label>`;
    return `
      <section class="dr-sec">
        <div class="form-grid g3">
          <label class="fld span-3"><span>Title</span><input id="dr-title" data-f="title" class="in-title" value="${U.esc(s.title)}"></label>
          <label class="fld"><span>Status</span><select id="dr-status" data-f="status">${UI.options(C.STATUS_KEYS, s.status)}</select></label>
          <label class="fld"><span>Ball in court</span><select id="dr-ball" data-f="ball">${UI.options(C.BALL, s.ball)}</select></label>
          <label class="fld"><span>Priority</span><select id="dr-priority" data-f="priority">${UI.options(C.PRIORITY, s.priority)}</select></label>
          ${f('nextAction', 'Next action', { span: 2, ph: 'e.g. Follow up with reviewer' })}
          ${f('nextActionDate', 'Next action date', { type: 'date' })}
        </div>
      </section>
      <section class="dr-sec" id="dr-cycles">${cyclesHtml(s)}</section>
      <section class="dr-sec">
        <div class="sec-h"><h3>Details</h3></div>
        <div class="form-grid g3">
          <label class="fld"><span>Project</span><select id="dr-projectId" data-move="project">${UI.options(Store.projects(true).map((x) => ({ value: x.id, label: x.name })), s.projectId)}</select></label>
          <label class="fld"><span>Phase</span><select id="dr-phaseId" data-move="phase">${phaseOpts(p, s.phaseId)}</select></label>
          <label class="fld"><span>Package</span><select id="dr-packageId" data-move="package">${pkgOpts(p, s.phaseId, s.packageId, false)}</select></label>
          ${f('discipline', 'Discipline / type', { list: 'dr-dl-disc' })}
          ${f('agency', 'Agency', { list: 'dr-dl-ag' })}
          ${f('department', 'Department', { list: 'dr-dl-dept' })}
          ${f('reviewer', 'Agency reviewer', { list: 'dr-dl-rev' })}
          ${f('trackingNo', 'Tracking / permit #', { cls: 'mono' })}
          <span></span>
          ${f('preparerFirm', 'Preparer / consultant firm', { list: 'dr-dl-firm' })}
          ${f('preparerContact', 'Consultant contact', { list: 'dr-dl-contact', ph: 'Name, phone, email' })}
          <span></span>
          ${f('feeAmount', 'Fee amount ($)', { ph: '0.00' })}
          <label class="fld"><span>Fees paid</span><select id="dr-feesPaid" data-f="feesPaid">${UI.options(C.FEES.map((x) => ({ value: x, label: x || '—' })), s.feesPaid)}</select></label>
        </div>
        ${dl('dr-dl-disc', L.discs)}${dl('dr-dl-ag', L.agencies)}${dl('dr-dl-dept', L.depts)}${dl('dr-dl-firm', L.firms)}${dl('dr-dl-contact', L.contacts)}${dl('dr-dl-rev', L.reviewers)}
      </section>
      <section class="dr-sec" id="dr-links">${linksHtml(s)}</section>
      <section class="dr-sec">
        <label class="fld"><span>Notes</span><textarea id="dr-notes" data-f="notes" rows="4">${U.esc(s.notes || '')}</textarea></label>
      </section>
      <section class="dr-sec" id="dr-log">${logHtml(s)}</section>`;
  }

  Forms.openDrawer = (id) => {
    const s = Store.submittal(id);
    if (!s) return;
    if (D.el) Forms.closeDrawer(true);
    D.id = id;
    D.prevFocus = document.activeElement;
    const host = document.createElement('div');
    host.className = 'drawer-host';
    host.innerHTML = `<div class="drawer-scrim" data-dr-close></div>
      <aside class="drawer" role="dialog" aria-modal="true" aria-label="Edit submittal">
        <header class="drawer-h"><div class="dr-top"><span class="eyebrow">Submittal</span><span class="save-ind" id="dr-save"></span><button class="icon-btn" data-dr-close aria-label="Close">${UI.icon('x')}</button></div><div id="dr-head"></div></header>
        <div class="drawer-b" id="dr-body"></div>
      </aside>`;
    document.body.appendChild(host);
    document.body.classList.add('has-drawer');
    D.el = host;
    renderAll();
    bindDrawer(host);
    setTimeout(() => { const t = host.querySelector('.drawer'); if (t) t.focus(); }, 0);
    host.querySelector('.drawer').setAttribute('tabindex', '-1');
  };

  function renderAll() {
    const s = Store.submittal(D.id);
    if (!s) return Forms.closeDrawer();
    D.el.querySelector('#dr-head').innerHTML = headerHtml(s, M.derive(s), M.where(s));
    D.el.querySelector('#dr-body').innerHTML = bodyHtml(s);
    autosize(D.el);
  }

  function autosize(root) {
    root.querySelectorAll('textarea[data-cf="summary"]').forEach((t) => {
      t.style.height = 'auto';
      t.style.height = Math.min(160, t.scrollHeight + 2) + 'px';
    });
  }

  /** Bring the open drawer in line with the store without disturbing the field being edited. */
  Forms.refreshDrawer = () => {
    if (!D.el) return;
    const s = Store.submittal(D.id);
    if (!s) { Forms.closeDrawer(); return; }
    const d = M.derive(s);
    D.el.querySelector('#dr-head').innerHTML = headerHtml(s, d, M.where(s));
    const active = document.activeElement;
    D.el.querySelectorAll('[data-f]').forEach((inp) => {
      if (inp === active) return;
      const v = s[inp.dataset.f] ?? '';
      if (inp.value !== String(v)) inp.value = v;
    });
    const cyc = D.el.querySelector('#dr-cycles');
    const ids = Array.from(cyc.querySelectorAll('tr[data-cid]')).map((r) => r.dataset.cid).join();
    if (!cyc.contains(active) || ids !== s.cycles.map((c) => c.id).join()) {
      cyc.innerHTML = cyclesHtml(s);
    } else {
      s.cycles.forEach((c) => {
        const tr = cyc.querySelector(`tr[data-cid="${c.id}"]`);
        const dueIn = tr.querySelector('[data-cf="dueOverride"]');
        if (dueIn !== active) dueIn.value = M.dueFor(c);
        tr.querySelector('[data-due-mode]').innerHTML = c.dueOverride ? '<button class="link" data-act="due-auto" title="Go back to the calculated date">set · use calc</button>' : 'calc';
        const rd = c.submitted && c.received ? U.diffDays(c.submitted, c.received) : null;
        tr.querySelector('[data-rd]').innerHTML = rd == null ? '<span class="muted">—</span>' : rd;
        tr.querySelectorAll('[data-cf]').forEach((inp) => {
          if (inp === active || inp.dataset.cf === 'dueOverride') return;
          const v = c[inp.dataset.cf] ?? '';
          if (inp.value !== String(v)) inp.value = v;
        });
      });
    }
    const links = D.el.querySelector('#dr-links');
    if (!links.contains(active)) links.innerHTML = linksHtml(s);
    const logEl = D.el.querySelector('#dr-log');
    const logOpen = !!logEl.querySelector('details[open]');
    logEl.innerHTML = logHtml(s);
    if (logOpen) logEl.querySelector('details').open = true;
    // keep move selects consistent
    ['projectId', 'phaseId', 'packageId'].forEach((k) => {
      const sel = D.el.querySelector('#dr-' + k);
      if (sel && sel !== active && sel.value !== s[k]) {
        const p = Store.project(s.projectId);
        if (k === 'phaseId') sel.innerHTML = phaseOpts(p, s.phaseId);
        else if (k === 'packageId') sel.innerHTML = pkgOpts(p, s.phaseId, s.packageId, false);
        else sel.value = s.projectId;
      }
    });
  };

  Forms.closeDrawer = (silent) => {
    if (!D.el) return;
    const a = document.activeElement;
    if (a && D.el.contains(a) && a.blur) a.blur(); // commits a pending change event
    D.el.remove();
    D.el = null;
    D.id = null;
    document.body.classList.remove('has-drawer');
    if (!silent && D.prevFocus && document.contains(D.prevFocus)) D.prevFocus.focus();
  };
  Forms.drawerOpen = () => !!D.el;
  Forms.drawerId = () => D.id;

  function bindDrawer(host) {
    host.addEventListener('click', async (e) => {
      if (e.target.closest('[data-dr-close]')) { Forms.closeDrawer(); return; }
      const go = e.target.closest('[data-goto]');
      if (go) { Forms.closeDrawer(true); App.go(go.dataset.goto); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const s = Store.submittal(D.id);
      if (!s) return;
      const act = b.dataset.act;
      if (act === 'cycle-del') {
        const cid = b.closest('tr').dataset.cid;
        const c = s.cycles.find((x) => x.id === cid);
        if (!(await UI.confirm(`Remove the ${U.ordinal(c.n)} review cycle and its dates?`, { title: 'Remove cycle', ok: 'Remove', danger: true }))) return;
        Store.checkpoint('remove cycle');
        M.removeCycle(s, cid);
        UI.undoToast('Removed ' + U.ordinal(c.n) + ' cycle');
        return;
      }
      if (act === 'cycle-add') { M.addCycle(s, ''); return; }
      if (act === 'due-auto') {
        const cid = b.closest('tr').dataset.cid;
        M.setCycle(s, cid, { dueOverride: '' });
        return;
      }
      if (act === 'link-del') {
        const i = +b.closest('[data-li]').dataset.li;
        const links = s.links.slice();
        const [gone] = links.splice(i, 1);
        M.update(s, { links }, 'Removed link ' + (gone.label || gone.url));
        return;
      }
      if (act === 'delete') {
        if (!(await UI.confirm(`Delete <b>${U.esc(s.title)}</b>? Its review cycles, links and notes go with it.`, { title: 'Delete submittal', ok: 'Delete', danger: true }))) return;
        Store.checkpoint('delete ' + s.title);
        Store.removeSubmittal(s.id);
        Forms.closeDrawer();
        UI.undoToast('Deleted ' + s.title);
        return;
      }
      if (act === 'duplicate') {
        const copy = M.duplicate(s);
        UI.toast('Duplicated. Now editing the copy.');
        Forms.openDrawer(copy.id);
        setTimeout(() => { const t = document.getElementById('dr-title'); if (t) { t.focus(); t.select(); } }, 30);
        return;
      }
      App.rowAct(act, s, b);
    });

    host.addEventListener('submit', (e) => {
      if (!e.target.matches('[data-link-form]')) return;
      e.preventDefault();
      const s = Store.submittal(D.id);
      const label = host.querySelector('#dr-link-label').value.trim();
      const url = host.querySelector('#dr-link-url').value.trim();
      if (!url) { host.querySelector('#dr-link-url').focus(); return; }
      M.update(s, { links: (s.links || []).concat({ label, url }) }, 'Added link ' + (label || url));
      setTimeout(() => { const i = document.getElementById('dr-link-label'); if (i) i.focus(); }, 30);
    });

    host.addEventListener('change', (e) => {
      const t = e.target;
      const s = Store.submittal(D.id);
      if (!s) return;
      if (t.dataset.f) {
        const k = t.dataset.f;
        const v = t.value.trim ? (k === 'notes' ? t.value : t.value.trim()) : t.value;
        if (String(s[k] ?? '') === v) return;
        if (k === 'title' && !v) { t.value = s.title; return; }
        if (k === 'status') { App.setStatus(s, v); return; }
        const patch = { [k]: v };
        if (k === 'discipline' && !s.department && C.DEPT_FOR[v]) patch.department = C.DEPT_FOR[v];
        M.update(s, patch);
        flashSaved();
        return;
      }
      if (t.dataset.cf) {
        const cid = t.closest('tr').dataset.cid;
        const c = s.cycles.find((x) => x.id === cid);
        const k = t.dataset.cf;
        let v = t.value;
        if (k === 'tat') v = v === '' ? '' : Math.max(0, parseInt(v, 10) || 0);
        if (k === 'dueOverride') {
          // Typing the calculated date back clears the override.
          const calc = M.dueFor({ ...c, dueOverride: '' });
          v = v && v !== calc ? v : '';
        }
        if (String(c[k] ?? '') === String(v)) return;
        M.setCycle(s, cid, { [k]: v });
        flashSaved();
        return;
      }
      if (t.dataset.move) {
        const p = Store.project(t.dataset.move === 'project' ? t.value : s.projectId);
        if (t.dataset.move === 'project') {
          const oldPh = M.where(s).phaseName;
          const ph = p.phases.find((x) => x.name === oldPh) || p.phases[0];
          M.update(s, { projectId: p.id, phaseId: ph ? ph.id : '', packageId: '' }, 'Moved to project ' + p.name);
          const phs = host.querySelector('#dr-phaseId');
          phs.innerHTML = phaseOpts(p, ph && ph.id);
          host.querySelector('#dr-packageId').innerHTML = pkgOpts(p, ph && ph.id, '', false);
        } else if (t.dataset.move === 'phase') {
          M.update(s, { phaseId: t.value, packageId: '' }, 'Moved to phase ' + (Store.phase(p, t.value) || {}).name);
          host.querySelector('#dr-packageId').innerHTML = pkgOpts(p, t.value, '', false);
        } else {
          M.update(s, { packageId: t.value }, t.value ? 'Moved to package ' + (Store.pkg(p, s.phaseId, t.value) || {}).name : 'Removed from package');
        }
        flashSaved();
      }
    });

    host.addEventListener('input', (e) => {
      if (e.target.matches('textarea[data-cf="summary"]')) autosize(host);
    });
  }

  function flashSaved() {
    const el = D.el && D.el.querySelector('#dr-save');
    if (!el) return;
    el.textContent = 'Saved';
    el.classList.add('is-on');
    clearTimeout(flashSaved.t);
    flashSaved.t = setTimeout(() => el.classList.remove('is-on'), 1400);
  }

  window.Forms = Forms;
})();
