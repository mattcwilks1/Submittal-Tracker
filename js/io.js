/* Import / export: CSV (round-trips by ID), Excel workbook, full JSON backup. */
(function () {
  'use strict';
  const IO = {};

  const FIELDS = [
    ['id', 'ID'], ['project', 'Project'], ['caseNumbers', 'Case Numbers'], ['jurisdiction', 'Jurisdiction'], ['phase', 'Phase'], ['package', 'Package'],
    ['title', 'Title'], ['discipline', 'Discipline'], ['agency', 'Agency'], ['department', 'Department'], ['reviewer', 'Reviewer'],
    ['preparerFirm', 'Preparer Firm'], ['preparerContact', 'Preparer Contact'], ['trackingNo', 'Tracking No'],
    ['status', 'Status'], ['statusSince', 'Status Since'], ['ball', 'Ball in Court'], ['ballSince', 'Ball Since'], ['priority', 'Priority'],
    ['feeAmount', 'Fee Amount'], ['feesPaid', 'Fees Paid'], ['nextAction', 'Next Action'], ['nextActionDate', 'Next Action Date'],
    ['cycle', 'Cycle'], ['submitted', 'Date Submitted'], ['tat', 'Turnaround Days'], ['due', 'Due Back'], ['received', 'Comments Received'], ['summary', 'Comment Summary'],
    ['firstSubmitted', 'First Submitted'], ['daysInStatus', 'Days in Status'], ['totalDays', 'Total Days'], ['overdueDays', 'Overdue Days'],
    ['links', 'Links'], ['notes', 'Notes'],
  ];
  const DATE_FIELDS = new Set(['statusSince', 'ballSince', 'nextActionDate', 'submitted', 'due', 'received']);

  const norm = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const ALIAS = Object.fromEntries(FIELDS.map(([k, l]) => [norm(l), k]).concat(FIELDS.map(([k]) => [norm(k), k])));
  Object.assign(ALIAS, {
    submittal: 'title', name: 'title', submittaltitle: 'title', item: 'title',
    court: 'ball', ballincourt: 'ball', bic: 'ball',
    type: 'discipline', disciplinetype: 'discipline',
    dept: 'department', reviewdepartment: 'department',
    tracking: 'trackingNo', trackingnumber: 'trackingNo', permitno: 'trackingNo', permitnumber: 'trackingNo', planchecknumber: 'trackingNo', pcno: 'trackingNo',
    consultant: 'preparerFirm', preparer: 'preparerFirm', firm: 'preparerFirm', contact: 'preparerContact',
    submitted: 'submitted', submitteddate: 'submitted', datesubmitted: 'submitted',
    turnaround: 'tat', tat: 'tat', reviewdays: 'tat',
    received: 'received', commentsreceiveddate: 'received', datecommentsreceived: 'received',
    comments: 'summary', commentsummary: 'summary',
    cyclenumber: 'cycle', reviewcycle: 'cycle', submittalno: 'cycle',
    casenumber: 'caseNumbers', cases: 'caseNumbers', mapnumbers: 'caseNumbers',
    fees: 'feesPaid', fee: 'feeAmount',
    duebackdate: 'due', duedate: 'due',
  });

  const STATUS_ALIAS = Object.fromEntries(C.STATUS_KEYS.map((k) => [norm(k), k]));
  Object.assign(STATUS_ALIAS, {
    approvedwithconditions: 'Approved w/ Conditions', approvedconditions: 'Approved w/ Conditions', conditionallyapproved: 'Approved w/ Conditions',
    closed: 'Recorded/Closed', recorded: 'Recorded/Closed', complete: 'Recorded/Closed', completed: 'Recorded/Closed',
    hold: 'On Hold', notstarted: 'Not Started', prep: 'In Prep', inprogress: 'In Prep', review: 'In Review', underreview: 'In Review',
    comments: 'Comments Received', resubmittal: 'Resubmittal in Prep', resubmit: 'Resubmittal in Prep',
  });
  const BALL_ALIAS = { us: 'Us', me: 'Us', mine: 'Us', ours: 'Us', internal: 'Us', owner: 'Us', developer: 'Us', consultant: 'Consultant', engineer: 'Consultant', preparer: 'Consultant', agency: 'Agency', city: 'Agency', county: 'Agency', jurisdiction: 'Agency' };

  /* ---------------- export ---------------- */

  function rowFor(s, forXlsx) {
    const d = M.derive(s);
    const w = M.where(s);
    const p = w.project;
    const n = (v) => (forXlsx && v !== '' && v != null && !isNaN(+v) ? +v : v ?? '');
    const v = {
      id: s.id, project: w.projectName, caseNumbers: p ? p.caseNumbers.join(', ') : '', jurisdiction: p ? p.jurisdiction : '', phase: w.phaseName, package: w.pkgName,
      title: s.title, discipline: s.discipline, agency: s.agency, department: s.department, reviewer: s.reviewer,
      preparerFirm: s.preparerFirm, preparerContact: s.preparerContact, trackingNo: s.trackingNo,
      status: s.status, statusSince: s.statusSince, ball: s.ball, ballSince: s.ballSince, priority: s.priority,
      feeAmount: n(s.feeAmount), feesPaid: s.feesPaid, nextAction: s.nextAction, nextActionDate: s.nextActionDate,
      cycle: d.cycleN ? n(d.cycleN) : '', submitted: d.submitted, tat: d.cur ? n(d.cur.tat) : '', due: d.due, received: d.received, summary: d.cur ? d.cur.summary || '' : '',
      firstSubmitted: d.first, daysInStatus: n(d.daysInStatus), totalDays: n(d.totalDays), overdueDays: d.overdue ? n(d.overdue) : '',
      links: (s.links || []).map((l) => (l.label ? l.label + '|' : '') + l.url).join('; '), notes: s.notes,
    };
    return FIELDS.map(([k]) => v[k]);
  }

  const sortForExport = (list) => list.slice().sort((a, b) => {
    const wa = M.where(a), wb = M.where(b);
    return U.cmp(wa.projectName, wb.projectName) || U.cmp(wa.phaseName, wb.phaseName) || U.cmp(wa.pkgName, wb.pkgName) || U.cmp(a.title, b.title);
  });

  IO.exportCsv = (list, base) => {
    const rows = [FIELDS.map((f) => f[1])].concat(sortForExport(list || Store.state.submittals).map((s) => rowFor(s, false)));
    UI.saveFile((base || 'submittals') + '-' + U.today() + '.csv', '﻿' + U.toCsv(rows), 'text/csv;charset=utf-8');
  };

  IO.exportCyclesCsv = () => {
    const rows = [['Submittal ID', 'Project', 'Package', 'Title', 'Cycle', 'Date Submitted', 'Turnaround Days', 'Due Back', 'Comments Received', 'Review Days', 'Comment Summary']];
    sortForExport(Store.state.submittals).forEach((s) => {
      const w = M.where(s);
      s.cycles.forEach((c) => rows.push([s.id, w.projectName, w.pkgName, s.title, c.n, c.submitted, c.tat, M.dueFor(c), c.received, c.submitted && c.received ? U.diffDays(c.submitted, c.received) : '', c.summary]));
    });
    UI.saveFile('review-cycles-' + U.today() + '.csv', '﻿' + U.toCsv(rows), 'text/csv;charset=utf-8');
  };

  IO.csvTemplate = () => {
    const example = ['', 'Bosma', 'PMTT26-001, TTM 20780', 'City of Ontario', 'Design / Plan Check', 'Rough Grading 1st Submittal', 'Rough Grading Plan', 'Rough Grading', 'City of Ontario', 'Engineering', '', 'Civil Engineer Inc.', 'Jane Smith', 'PEN26-0000',
      'In Review', '', 'Agency', '', 'Normal', '', '', '', '', '1', U.today(), '21', '', '', '', '', '', '', '', 'Plans|https://example.com/plans.pdf', 'Example row. Delete before importing.'];
    UI.saveFile('submittal-import-template.csv', '﻿' + U.toCsv([FIELDS.map((f) => f[1]), example]), 'text/csv;charset=utf-8');
  };

  IO.exportXlsx = () => {
    const subs = sortForExport(Store.state.submittals);
    const sheet1 = [FIELDS.map((f) => f[1])].concat(subs.map((s) => rowFor(s, true)));
    const widths1 = FIELDS.map(([k]) => ({ id: 14, title: 34, project: 20, package: 26, phase: 20, notes: 40, summary: 40, links: 30, nextAction: 28, agency: 22, preparerFirm: 22 }[k] || 13));
    const cyc = [['Submittal ID', 'Project', 'Package', 'Title', 'Cycle', 'Date Submitted', 'Turnaround Days', 'Due Back', 'Comments Received', 'Review Days', 'Comment Summary']];
    subs.forEach((s) => {
      const w = M.where(s);
      s.cycles.forEach((c) => cyc.push([s.id, w.projectName, w.pkgName, s.title, +c.n || '', c.submitted, c.tat === '' ? '' : +c.tat, M.dueFor(c), c.received, c.submitted && c.received ? U.diffDays(c.submitted, c.received) : '', c.summary || '']));
    });
    const projs = [['Project', 'Case Numbers', 'Jurisdiction', 'Type', 'Lead', 'Archived', 'Phases', 'Submittals', 'Open', 'Overdue', '% Approved']];
    Store.projects(true).forEach((p) => {
      const list = Store.state.submittals.filter((s) => s.projectId === p.id);
      const pr = M.progress(list);
      projs.push([p.name, p.caseNumbers.join(', '), p.jurisdiction, p.type, p.lead, p.archived ? 'Yes' : '', p.phases.map((x) => x.name + ' (' + x.packages.length + ')').join('; '), list.length,
        list.filter((s) => !M.derive(s).done).length, list.filter((s) => M.derive(s).overdue).length, pr.pct]);
    });
    const bytes = XLSX_LITE.build([
      { name: 'Submittals', rows: sheet1, widths: widths1 },
      { name: 'Review Cycles', rows: cyc, widths: [14, 20, 26, 34, 7, 13, 10, 13, 13, 10, 50] },
      { name: 'Projects', rows: projs, widths: [26, 26, 18, 12, 16, 9, 60, 10, 8, 8, 10] },
    ]);
    UI.saveFile('submittal-tracker-' + U.today() + '.xlsx', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  };

  IO.backup = () => {
    UI.saveFile('submittal-tracker-backup-' + U.today() + '.json', JSON.stringify(Store.exportJson(), null, 1), 'application/json');
    UI.setPref('lastBackup', U.today());
  };

  IO.restore = async () => {
    const file = await UI.pickFile('.json,application/json');
    if (!file) return;
    let data;
    try {
      data = JSON.parse(await U.readFileText(file));
    } catch (e) {
      UI.toast('That file is not valid JSON. Pick a backup downloaded from Settings.', { error: true });
      return;
    }
    if (!data || !Array.isArray(data.projects) || !Array.isArray(data.submittals)) {
      UI.toast('That file is not a Submittal Tracker backup.', { error: true });
      return;
    }
    const ok = await UI.confirm(`Replace all current data with this backup (${U.plural(data.projects.length, 'project')}, ${U.plural(data.submittals.length, 'submittal')}${data.exportedAt ? ', saved ' + U.esc(U.fmtStamp(data.exportedAt)) : ''})?`, { title: 'Restore backup', ok: 'Replace my data', danger: true });
    if (!ok) return;
    Store.checkpoint('restore backup');
    Store.replaceAll(data);
    UI.undoToast('Restored backup');
  };

  /* ---------------- import ---------------- */

  function parseLinks(s) {
    return String(s || '')
      .split(/\s*;\s*|\n/)
      .map((x) => x.trim())
      .filter(Boolean)
      .map((x) => {
        const i = x.indexOf('|');
        return i >= 0 ? { label: x.slice(0, i).trim(), url: x.slice(i + 1).trim() } : { label: '', url: x };
      });
  }

  /** Parse CSV text into a plan; nothing is written until apply(). */
  IO.planImport = (text) => {
    const rows = U.parseCsv(text);
    if (rows.length < 2) return { error: 'The file has no data rows.' };
    const header = rows[0].map((h) => ALIAS[norm(h)] || null);
    if (!header.includes('title')) return { error: 'No "Title" column found. Download the CSV template from Settings to see the expected columns.' };
    const hasProjectCol = header.includes('project');
    const warnings = [];
    const items = [];
    const newProjects = new Set();
    const byName = new Map(Store.state.projects.map((p) => [p.name.trim().toLowerCase(), p]));

    rows.slice(1).forEach((r, ri) => {
      const line = ri + 2;
      const o = {};
      header.forEach((k, i) => { if (k) o[k] = String(r[i] == null ? '' : r[i]).trim(); });
      if (!o.title) { warnings.push(`Row ${line}: skipped (no title).`); return; }
      DATE_FIELDS.forEach((k) => {
        if (!o[k]) return;
        const d = U.parseDateLoose(o[k]);
        if (d === null) { warnings.push(`Row ${line}: "${o[k]}" is not a date (${k}); left blank.`); o[k] = ''; } else o[k] = d;
      });
      if (o.status) {
        const st = STATUS_ALIAS[norm(o.status)];
        if (!st) warnings.push(`Row ${line}: unknown status "${o.status}"; set from dates instead.`);
        o.status = st || '';
      }
      if (o.ball) {
        const b = BALL_ALIAS[norm(o.ball)];
        if (!b) warnings.push(`Row ${line}: unknown ball in court "${o.ball}"; ignored.`);
        o.ball = b || '';
      }
      if (o.priority) o.priority = C.PRIORITY.find((x) => norm(x) === norm(o.priority)) || 'Normal';
      if (o.feesPaid) o.feesPaid = C.FEES.find((x) => x && norm(x) === norm(o.feesPaid)) || (/^(y|yes|true|1)$/i.test(o.feesPaid) ? 'Paid' : /^(n|no|false|0)$/i.test(o.feesPaid) ? 'Unpaid' : o.feesPaid);

      const existing = o.id ? Store.submittal(o.id) : null;
      if (!existing) {
        if (!o.project) {
          warnings.push(`Row ${line}: skipped (${hasProjectCol ? 'project is blank' : 'no Project column'}).`);
          return;
        }
        if (!byName.has(o.project.toLowerCase())) newProjects.add(o.project);
      }
      items.push({ line, o, existing });
    });
    return { items, warnings, newProjects: Array.from(newProjects), creates: items.filter((x) => !x.existing).length, updates: items.filter((x) => x.existing).length };
  };

  IO.applyImport = (plan) => {
    const created = new Map();
    const projectFor = (o) => {
      const key = o.project.trim().toLowerCase();
      let p = Store.state.projects.find((x) => x.name.trim().toLowerCase() === key) || created.get(key);
      if (!p) {
        p = Store.putProject(Store.newProject({ name: o.project.trim(), caseNumbers: U.splitList(o.caseNumbers), jurisdiction: o.jurisdiction || 'City of Ontario' }));
        created.set(key, p);
      }
      return p;
    };
    const SIMPLE = ['title', 'discipline', 'agency', 'department', 'reviewer', 'preparerFirm', 'preparerContact', 'trackingNo', 'priority', 'feeAmount', 'feesPaid', 'nextAction', 'nextActionDate', 'notes'];

    plan.items.forEach(({ o, existing }) => {
      const today = U.today();
      const s = existing ? U.clone(existing) : M.newSubmittal({ log: [] });
      SIMPLE.forEach((k) => { if (o[k] !== undefined && o[k] !== '') s[k] = o[k]; });
      if (o.links) s.links = parseLinks(o.links);

      let moved = false;
      if (o.project) {
        const p = projectFor(o);
        if (p.id !== s.projectId) { s.projectId = p.id; moved = true; }
      }
      if (o.phase || o.package || moved) {
        const cur = moved ? {} : M.where(s);
        const loc = M.ensurePhasePkg(s.projectId, o.phase || cur.phaseName || 'Design / Plan Check', o.package || cur.pkgName || 'Imported');
        s.phaseId = loc.phaseId;
        s.packageId = loc.packageId;
      }
      if (!s.agency) {
        const p = Store.project(s.projectId);
        if (p) s.agency = p.jurisdiction;
      }

      // review cycle
      const n = o.cycle ? parseInt(o.cycle, 10) : NaN;
      const touchesCycle = o.submitted || o.received || o.tat || o.summary || o.due || !isNaN(n);
      if (touchesCycle) {
        let c = !isNaN(n) ? s.cycles.find((x) => +x.n === n) : s.cycles[s.cycles.length - 1];
        if (!c) {
          c = { id: U.uid('c'), n: !isNaN(n) ? n : s.cycles.length + 1, submitted: '', tat: Store.state.settings.defaultTat, dueOverride: '', received: '', summary: '' };
          s.cycles.push(c);
          s.cycles.sort((a, b) => a.n - b.n);
        }
        if (o.submitted) c.submitted = o.submitted;
        if (o.tat !== undefined && o.tat !== '' && !isNaN(+o.tat)) c.tat = +o.tat;
        if (o.received) c.received = o.received;
        if (o.summary) c.summary = o.summary;
        if (o.due && (o.tat === undefined || o.tat === '')) c.dueOverride = o.due;
      }

      const cur = s.cycles[s.cycles.length - 1];
      const prevStatus = existing ? existing.status : '';
      if (o.status) s.status = o.status;
      else if (!existing) s.status = cur && cur.submitted ? (cur.received ? 'Comments Received' : 'Submitted') : 'Not Started';
      if (o.ball) s.ball = o.ball;
      else if (!existing) s.ball = C.WITH_AGENCY.includes(s.status) ? 'Agency' : 'Us';

      if (o.statusSince) s.statusSince = o.statusSince;
      else if (!existing || prevStatus !== s.status) s.statusSince = (cur && (cur.received || cur.submitted)) || today;
      if (o.ballSince) s.ballSince = o.ballSince;
      else if (!existing || existing.ball !== s.ball) s.ballSince = s.statusSince || today;

      s.log = (s.log || []).concat({ at: U.nowIso(), t: existing ? 'Updated from CSV import' : 'Imported from CSV' });
      Store.putSubmittal(s);
    });
    return { projects: created.size };
  };

  IO.importCsv = async () => {
    const file = await UI.pickFile('.csv,text/csv');
    if (!file) return;
    const plan = IO.planImport(await U.readFileText(file));
    if (plan.error) { UI.toast(plan.error, { error: true, timeout: 7000 }); return; }
    if (!plan.items.length) {
      UI.toast('Nothing to import. ' + (plan.warnings[0] || ''), { error: true });
      return;
    }
    UI.modal({
      title: 'Import ' + file.name,
      body: `<div class="stack">
        <dl class="stats-row">
          <div><dt>New submittals</dt><dd class="num">${plan.creates}</dd></div>
          <div><dt>Updates (matched by ID)</dt><dd class="num">${plan.updates}</dd></div>
          <div><dt>New projects</dt><dd class="num">${plan.newProjects.length}</dd></div>
        </dl>
        ${plan.newProjects.length ? `<p>New projects will be created with the standard phases: <b>${plan.newProjects.map(U.esc).join(', ')}</b>. Check spelling if you expected these to match existing projects.</p>` : ''}
        ${plan.warnings.length ? `<details class="warn-box" ${plan.warnings.length < 6 ? 'open' : ''}><summary>${U.plural(plan.warnings.length, 'note')}</summary><ul>${plan.warnings.slice(0, 50).map((w) => `<li>${U.esc(w)}</li>`).join('')}</ul></details>` : ''}
        <p class="muted">Blank cells leave existing values unchanged. Missing phase or package names are created.</p>
      </div>`,
      foot: '<button class="btn" data-close>Cancel</button><button class="btn btn-primary" data-ok>Import</button>',
      onMount(el, api) {
        el.querySelector('[data-ok]').addEventListener('click', () => {
          Store.checkpoint('CSV import');
          const r = IO.applyImport(plan);
          api.close();
          UI.undoToast(`Imported ${U.plural(plan.creates, 'new submittal')}, updated ${plan.updates}${r.projects ? ', created ' + U.plural(r.projects, 'project') : ''}`);
        });
      },
    });
  };

  IO.FIELDS = FIELDS;
  window.IO = IO;
})();
