/* State container + persistence.
 *
 * Two backends share one interface:
 *  - LocalBackend: whole state in this browser's localStorage (used when the app is opened as a file or hosted page).
 *  - DbBackend:    one document per record in the published artifact's database (used inside claude.ai),
 *                  so data follows you across devices.
 */
(function () {
  'use strict';

  const LS_KEY = 'submittal-tracker:data:v1';
  const COLLECTIONS = ['projects', 'submittals', 'templates'];

  const DEFAULT_SETTINGS = { staleDays: 7, defaultTat: 21, bizDays: false, myName: '', planCycles: 2, resubDays: 14, prepDays: 14 };

  /* ---------------- Local backend ---------------- */

  function LocalBackend(getState, setStatus) {
    let ok = true;
    const save = U.debounce(() => {
      const s = getState();
      ok = U.lsSet(LS_KEY, { v: 1, savedAt: U.nowIso(), ...s });
      setStatus(ok ? 'saved' : 'error', ok ? '' : 'Browser storage is full or blocked. Download a backup from Settings.');
    }, 250);

    return {
      mode: 'local',
      async load() {
        const d = U.lsGet(LS_KEY, null);
        if (!d) return null;
        return { projects: d.projects || [], submittals: d.submittals || [], templates: d.templates || [], settings: d.settings || {} };
      },
      write() {
        setStatus('saving');
        save();
      },
      subscribe(onExternal) {
        window.addEventListener('storage', (e) => {
          if (e.key !== LS_KEY || !e.newValue) return;
          try {
            onExternal(JSON.parse(e.newValue));
          } catch (err) { /* ignore malformed */ }
        });
      },
    };
  }

  /* ---------------- Artifact database backend ---------------- */

  function DbBackend(db, setStatus) {
    const pending = new Map(); // path -> body | null (delete)
    const inflight = new Set();
    let errors = 0;

    const pathFor = (kind, id) => (kind === 'meta' ? 'meta/' + id : kind + '/' + id);

    async function writeOne(path) {
      const body = pending.get(path);
      pending.delete(path);
      inflight.add(path);
      const ref = db.doc(path);
      const run = () => (body === null ? ref.delete() : ref.set(body));
      try {
        try {
          await run();
        } catch (e) {
          if (e && e.code === 'unavailable') {
            await new Promise((r) => setTimeout(r, 400 + Math.random() * 600));
            await run();
          } else throw e;
        }
      } catch (e) {
        errors++;
        const msg =
          e && e.code === 'quota_exceeded'
            ? 'Storage is full. Delete old records or export and archive a project.'
            : 'A change did not save (' + ((e && e.code) || 'error') + '). Keep this tab open and try again.';
        setStatus('error', msg);
      } finally {
        inflight.delete(path);
      }
      if (pending.has(path)) return writeOne(path);
    }

    function pump() {
      const jobs = [];
      for (const path of pending.keys()) if (!inflight.has(path)) jobs.push(writeOne(path));
      if (!jobs.length && !inflight.size) return;
      setStatus('saving');
      Promise.all(jobs).then(() => {
        if (!pending.size && !inflight.size) setStatus(errors ? 'error' : 'saved');
        errors = 0;
      });
    }
    const schedule = U.debounce(pump, 120);

    async function readAll(name) {
      const snap = await db.collection(name).get();
      return snap.docs.map((d) => U.clone(d.data()));
    }

    return {
      mode: 'db',
      async load() {
        const [projects, submittals, templates, settingsSnap] = await Promise.all([
          readAll('projects'),
          readAll('submittals'),
          readAll('templates'),
          db.doc('meta/settings').get(),
        ]);
        return {
          projects,
          submittals,
          templates,
          settings: settingsSnap.exists ? U.clone(settingsSnap.data()) : {},
          empty: !projects.length && !submittals.length,
        };
      },
      write(kind, id, body) {
        pending.set(pathFor(kind, id), body == null ? null : U.clone(body));
        schedule();
      },
      isBusy(kind, id) {
        const p = pathFor(kind, id);
        return pending.has(p) || inflight.has(p);
      },
      subscribe(onDocChange) {
        COLLECTIONS.forEach((name) => {
          db.collection(name).onSnapshot(
            (snap) => {
              if (snap.metadata.hasPendingWrites) return;
              snap.docChanges().forEach((ch) => onDocChange(name, ch.type, U.clone(ch.doc.data()), ch.doc.id));
            },
            () => setStatus('error', 'Live sync stopped. Reload the page to reconnect.')
          );
        });
        db.doc('meta/settings').onSnapshot(
          (snap) => {
            if (snap.exists && !snap.metadata.hasPendingWrites) onDocChange('meta', 'modified', U.clone(snap.data()), 'settings');
          },
          () => {}
        );
      },
    };
  }

  /* ---------------- Store ---------------- */

  const Store = {
    state: { projects: [], submittals: [], templates: [], settings: { ...DEFAULT_SETTINGS } },
    mode: 'local',
    rev: 0,
    status: 'saved',
    statusMsg: '',
    firstRun: false,
    _listeners: [],
    _statusListeners: [],
    _undo: null,
  };

  const setStatus = (status, msg) => {
    Store.status = status;
    Store.statusMsg = msg || '';
    Store._statusListeners.forEach((fn) => fn(status, msg));
  };

  let backend = null;

  Store.init = async function () {
    let db = null;
    if (window.claude && typeof window.claude.use === 'function') {
      try {
        db = await window.claude.use('db');
      } catch (e) {
        db = null;
      }
    }
    if (db) {
      backend = DbBackend(db, setStatus);
    } else {
      backend = LocalBackend(() => Store.state, setStatus);
    }
    Store.mode = backend.mode;

    let data = null;
    try {
      data = await backend.load();
    } catch (e) {
      // Database unreachable: fall back to this browser so the page still works.
      if (backend.mode === 'db') {
        backend = LocalBackend(() => Store.state, setStatus);
        Store.mode = 'local';
        data = await backend.load();
        setStatus('error', 'Could not reach saved data; working in this browser only.');
      }
    }

    if (data) {
      Store.state.projects = data.projects;
      Store.state.submittals = data.submittals;
      Store.state.templates = data.templates;
      Store.state.settings = { ...DEFAULT_SETTINGS, ...data.settings };
    }
    if (!data && Store.mode === 'local') {
      Store.firstRun = true;
      Store.seedProjects();
    }
    migrate();

    backend.subscribe(Store.mode === 'db' ? onRemoteDoc : onExternalLocal);
  };

  function migrate() {
    Store.state.submittals.forEach((s) => {
      if (!Array.isArray(s.cycles)) s.cycles = [];
      if (!Array.isArray(s.links)) s.links = [];
      if (!Array.isArray(s.log)) s.log = [];
    });
    Store.state.projects.forEach((p) => {
      if (!Array.isArray(p.phases)) p.phases = [];
      p.phases.forEach((ph) => { if (!Array.isArray(ph.packages)) ph.packages = []; });
      if (!Array.isArray(p.caseNumbers)) p.caseNumbers = U.splitList(p.caseNumbers);
    });
  }

  function onExternalLocal(d) {
    Store.state.projects = d.projects || [];
    Store.state.submittals = d.submittals || [];
    Store.state.templates = d.templates || [];
    Store.state.settings = { ...DEFAULT_SETTINGS, ...(d.settings || {}) };
    migrate();
    Store.emit();
  }

  function onRemoteDoc(kind, type, body, id) {
    if (kind === 'meta') {
      if (backend.isBusy('meta', 'settings')) return;
      Store.state.settings = { ...DEFAULT_SETTINGS, ...body };
      Store.emit();
      return;
    }
    if (backend.isBusy(kind, id)) return;
    const list = Store.state[kind];
    const i = list.findIndex((x) => x.id === id);
    if (type === 'removed') {
      if (i >= 0) { list.splice(i, 1); Store.emit(); }
      return;
    }
    if (!body) return;
    if (i < 0) list.push(body);
    else if ((list[i].updatedAt || '') < (body.updatedAt || '')) list[i] = body;
    else return;
    migrate();
    Store.emit();
  }

  Store.onChange = (fn) => Store._listeners.push(fn);
  Store.onStatus = (fn) => Store._statusListeners.push(fn);

  let emitQueued = false;
  Store.emit = () => {
    Store.rev++; // invalidates schedule caches synchronously
    if (emitQueued) return;
    emitQueued = true;
    requestAnimationFrame(() => {
      emitQueued = false;
      Store._listeners.forEach((fn) => fn());
    });
  };

  /* ---------- lookups ---------- */

  Store.project = (id) => Store.state.projects.find((p) => p.id === id) || null;
  Store.submittal = (id) => Store.state.submittals.find((s) => s.id === id) || null;
  Store.phase = (p, phaseId) => (p ? p.phases.find((ph) => ph.id === phaseId) || null : null);
  Store.pkg = (p, phaseId, pkgId) => {
    const ph = Store.phase(p, phaseId);
    return ph ? ph.packages.find((k) => k.id === pkgId) || null : null;
  };
  Store.findPkg = (p, pkgId) => {
    for (const ph of (p && p.phases) || []) {
      const k = ph.packages.find((x) => x.id === pkgId);
      if (k) return { phase: ph, pkg: k };
    }
    return null;
  };
  Store.projects = (includeArchived) =>
    Store.state.projects
      .filter((p) => includeArchived || !p.archived)
      .slice()
      .sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || U.cmp(a.name, b.name));
  Store.templates = () => C.BUILTIN_TEMPLATES.concat(Store.state.templates.slice().sort(U.byKey('name')));
  Store.template = (id) => Store.templates().find((t) => t.id === id) || null;

  /* ---------- writes ---------- */

  function upsert(kind, obj) {
    obj.updatedAt = U.nowIso();
    if (!obj.createdAt) obj.createdAt = obj.updatedAt;
    const list = Store.state[kind];
    const i = list.findIndex((x) => x.id === obj.id);
    if (i >= 0) list[i] = obj;
    else list.push(obj);
    backend.write(kind, obj.id, obj);
    Store.emit();
    return obj;
  }
  function remove(kind, id) {
    const list = Store.state[kind];
    const i = list.findIndex((x) => x.id === id);
    if (i >= 0) list.splice(i, 1);
    backend.write(kind, id, null);
    Store.emit();
  }

  Store.putProject = (p) => upsert('projects', p);
  Store.putSubmittal = (s) => upsert('submittals', s);
  Store.putTemplate = (t) => upsert('templates', t);
  Store.removeSubmittal = (id) => remove('submittals', id);
  Store.removeTemplate = (id) => remove('templates', id);
  Store.removeProject = (id) => {
    Store.state.submittals.filter((s) => s.projectId === id).forEach((s) => remove('submittals', s.id));
    remove('projects', id);
  };
  Store.putSettings = (patch) => {
    Store.state.settings = { ...Store.state.settings, ...patch, updatedAt: U.nowIso() };
    backend.write('meta', 'settings', Store.state.settings);
    Store.emit();
  };

  /** Replace everything (restore from backup). Writes deletes for records that disappear. */
  Store.replaceAll = (data) => {
    COLLECTIONS.forEach((kind) => {
      const next = (data[kind] || []).map((x) => ({ ...x }));
      const keep = new Set(next.map((x) => x.id));
      Store.state[kind].filter((x) => !keep.has(x.id)).forEach((x) => backend.write(kind, x.id, null));
      Store.state[kind] = next;
      next.forEach((x) => backend.write(kind, x.id, x));
    });
    Store.state.settings = { ...DEFAULT_SETTINGS, ...(data.settings || {}) };
    backend.write('meta', 'settings', Store.state.settings);
    migrate();
    Store.emit();
  };

  /* ---------- undo (one level, whole-state snapshot) ---------- */

  Store.checkpoint = (label) => {
    Store._undo = { label, data: U.clone({ projects: Store.state.projects, submittals: Store.state.submittals, templates: Store.state.templates }) };
  };
  Store.canUndo = () => !!Store._undo;
  Store.undo = () => {
    const u = Store._undo;
    if (!u) return false;
    Store._undo = null;
    COLLECTIONS.forEach((kind) => {
      const before = new Map(u.data[kind].map((x) => [x.id, x]));
      const now = new Map(Store.state[kind].map((x) => [x.id, x]));
      now.forEach((x, id) => { if (!before.has(id)) backend.write(kind, id, null); });
      before.forEach((x, id) => {
        const cur = now.get(id);
        if (!cur || JSON.stringify(cur) !== JSON.stringify(x)) {
          x.updatedAt = U.nowIso();
          backend.write(kind, id, x);
        }
      });
      Store.state[kind] = Array.from(before.values());
    });
    Store.emit();
    return u.label;
  };

  /* ---------- factories ---------- */

  Store.newPhase = (name) => ({ id: U.uid('ph'), name, packages: [] });
  Store.newPackage = (name) => ({ id: U.uid('pk'), name });

  Store.newProject = (fields) => ({
    id: U.uid('p'),
    name: '',
    caseNumbers: [],
    jurisdiction: 'City of Ontario',
    type: 'Residential',
    lead: Store.state.settings.myName || '',
    notes: '',
    archived: false,
    order: Store.state.projects.length,
    phases: C.DEFAULT_PHASES.map(Store.newPhase),
    ...fields,
  });

  Store.seedProjects = () => {
    C.SEED_PROJECTS.forEach((sp, i) => {
      if (Store.state.projects.some((p) => p.name.toLowerCase() === sp.name.toLowerCase())) return;
      Store.putProject(Store.newProject({ ...sp, caseNumbers: sp.caseNumbers.slice(), order: i }));
    });
  };

  Store.exportJson = () => ({
    app: 'submittal-tracker',
    v: 1,
    exportedAt: U.nowIso(),
    projects: Store.state.projects,
    submittals: Store.state.submittals,
    templates: Store.state.templates,
    settings: Store.state.settings,
  });

  window.Store = Store;
})();
