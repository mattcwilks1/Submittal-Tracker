/* Shared helpers: ids, escaping, dates, CSV, file output. No dependencies. */
(function () {
  'use strict';
  const U = {};

  U.uid = (prefix) =>
    (prefix ? prefix + '-' : '') +
    Date.now().toString(36) +
    Math.random().toString(36).slice(2, 8);

  U.esc = (v) =>
    String(v == null ? '' : v)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');

  U.clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));
  U.nowIso = () => new Date().toISOString();

  U.debounce = (fn, ms) => {
    let t;
    return function (...args) {
      clearTimeout(t);
      t = setTimeout(() => fn.apply(this, args), ms);
    };
  };

  U.byKey = (key) => (a, b) => {
    const x = typeof key === 'function' ? key(a) : a[key];
    const y = typeof key === 'function' ? key(b) : b[key];
    return U.cmp(x, y);
  };

  U.cmp = (x, y) => {
    const ex = x == null || x === '';
    const ey = y == null || y === '';
    if (ex && ey) return 0;
    if (ex) return 1; // blanks sort last
    if (ey) return -1;
    if (typeof x === 'number' && typeof y === 'number') return x - y;
    return String(x).localeCompare(String(y), undefined, { numeric: true, sensitivity: 'base' });
  };

  U.ordinal = (n) => {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  };

  U.plural = (n, word, pl) => n + ' ' + (n === 1 ? word : pl || word + 's');

  /* ---------- Dates: stored as 'YYYY-MM-DD' strings, math in UTC ---------- */

  const DAY = 86400000;
  const pad = (n) => String(n).padStart(2, '0');

  U.today = () => {
    const d = new Date();
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  };

  U.isDate = (s) => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);

  U.toUtc = (s) => {
    const [y, m, d] = s.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };

  U.fromUtc = (ms) => {
    const d = new Date(ms);
    return d.getUTCFullYear() + '-' + pad(d.getUTCMonth() + 1) + '-' + pad(d.getUTCDate());
  };

  U.addDays = (s, n) => (U.isDate(s) ? U.fromUtc(U.toUtc(s) + n * DAY) : '');

  U.addBizDays = (s, n) => {
    if (!U.isDate(s)) return '';
    let ms = U.toUtc(s);
    let left = n;
    while (left > 0) {
      ms += DAY;
      const wd = new Date(ms).getUTCDay();
      if (wd !== 0 && wd !== 6) left--;
    }
    return U.fromUtc(ms);
  };

  /** Whole days from a to b (b - a). */
  U.diffDays = (a, b) => (U.isDate(a) && U.isDate(b) ? Math.round((U.toUtc(b) - U.toUtc(a)) / DAY) : null);

  U.weekday = (s) => new Date(U.toUtc(s)).getUTCDay();

  /** Monday of the week containing s. */
  U.weekStart = (s) => {
    const wd = U.weekday(s);
    return U.addDays(s, wd === 0 ? -6 : 1 - wd);
  };

  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  /** Compact display: "Oct 6" this year, "Oct 6 '25" otherwise. */
  U.fmtD = (s) => {
    if (!U.isDate(s)) return '';
    const [y, m, d] = s.split('-').map(Number);
    const cy = new Date().getFullYear();
    return MON[m - 1] + ' ' + d + (y === cy ? '' : " '" + String(y).slice(2));
  };

  U.fmtLong = (s) => {
    if (!U.isDate(s)) return '';
    const [y, m, d] = s.split('-').map(Number);
    return DOW[U.weekday(s)] + ', ' + MON[m - 1] + ' ' + d + ', ' + y;
  };

  U.fmtStamp = (iso) => {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return MON[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear() + ' ' +
      ((d.getHours() + 11) % 12 + 1) + ':' + pad(d.getMinutes()) + (d.getHours() < 12 ? 'a' : 'p');
  };

  /** Accepts YYYY-MM-DD, M/D/YYYY, M/D/YY, M-D-YYYY, ISO timestamps, Excel serials. */
  U.parseDateLoose = (v) => {
    if (v == null) return '';
    const s = String(v).trim();
    if (!s) return '';
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);
    if ((m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/))) {
      let y = +m[3];
      if (y < 100) y += 2000;
      return y + '-' + pad(+m[1]) + '-' + pad(+m[2]);
    }
    if (/^\d{5}(\.\d+)?$/.test(s)) return U.fromUtc(Date.UTC(1899, 11, 30) + Math.floor(+s) * DAY);
    const d = new Date(s);
    if (!isNaN(d)) return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
    return null; // unparseable
  };

  /* ---------- CSV ---------- */

  U.csvCell = (v) => {
    const s = v == null ? '' : String(v);
    return /[",\r\n]/.test(s) || /^\s|\s$/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };

  U.toCsv = (rows) => rows.map((r) => r.map(U.csvCell).join(',')).join('\r\n');

  /** RFC 4180 parser; tolerates BOM, CRLF/LF, quoted newlines. Returns array of arrays. */
  U.parseCsv = (text) => {
    const rows = [];
    let row = [];
    let field = '';
    let i = 0;
    let q = false;
    if (text.charCodeAt(0) === 0xfeff) i = 1;
    for (; i < text.length; i++) {
      const c = text[i];
      if (q) {
        if (c === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; } else q = false;
        } else field += c;
      } else if (c === '"') q = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        row.push(field); rows.push(row); row = []; field = '';
      } else field += c;
    }
    if (field !== '' || row.length) { row.push(field); rows.push(row); }
    return rows.filter((r) => r.some((c) => String(c).trim() !== ''));
  };

  /* ---------- Misc ---------- */

  U.splitList = (s) =>
    String(s || '')
      .split(/\s*[,;/]\s*|\n/)
      .map((x) => x.trim())
      .filter(Boolean);

  U.safeUrl = (u) => {
    const s = String(u || '').trim();
    if (!s) return '';
    if (/^(https?:|mailto:|file:)/i.test(s)) return s;
    if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(s)) return 'https://' + s;
    return ''; // network paths etc. are shown as text, never as hrefs
  };

  U.lsGet = (k, fallback) => {
    try {
      const v = localStorage.getItem(k);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  };
  U.lsSet = (k, v) => {
    try {
      localStorage.setItem(k, JSON.stringify(v));
      return true;
    } catch (e) {
      return false;
    }
  };

  U.readFileText = (file) =>
    new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = () => rej(r.error);
      r.readAsText(file);
    });

  window.U = U;
})();
