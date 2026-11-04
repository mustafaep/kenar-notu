'use strict';
/* =========================================================
   Kenar Notu · yardımcılar, depolama, ayarlar
   ========================================================= */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-5);
const DPR = () => Math.min(window.devicePixelRatio || 1, 3);
const now = () => performance.now();
const EMBED = (() => { try { return window.parent !== window && /[?&]embed=1/.test(location.search); } catch (e) { return false; } })();

function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
    else if (k === 'html') e.innerHTML = v;
    else e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c != null && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
}
function icon(path, cls) { const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); s.setAttribute('viewBox', '0 0 24 24'); s.setAttribute('class', 'i' + (cls ? ' ' + cls : '')); s.setAttribute('aria-hidden', 'true'); s.innerHTML = path; return s; }
const IC = {
  back: '<path d="M15 5l-7 7 7 7"/>',
  pen: '<path d="M4 20l1.2-4.6L15.6 5a2.1 2.1 0 013 3L8.2 18.4z"/><path d="M13.5 7l3 3"/>',
  hl: '<path d="M15 4l5 5-8 8H7v-5z"/><path d="M7 17l-3 3h6"/><path d="M12 7l5 5"/>',
  eraser: '<path d="M4.6 14.6L13.9 5.3a2 2 0 012.8 0l3 3a2 2 0 010 2.8L11 19.8H8.1z"/><path d="M9.5 9.7l5.8 5.8"/><path d="M12 20h8"/>',
  lasso: '<path d="M7.6 16.6C4.9 15.6 3 13.5 3 11c0-3.9 4-7 9-7s9 3.1 9 7-4 7-9 7c-1.2 0-2.3-.2-3.4-.5" stroke-dasharray="2.6 2.4"/><path d="M8.6 17.6c0 1.5-1 2.4-2.3 2.4-1 0-1.8-.7-1.8-1.6 0-1.4 1.7-2.1 4.1-.8"/>',
  text: '<path d="M5 6.5V4.5h14v2"/><path d="M12 4.5v15"/><path d="M9 19.5h6"/>',
  image: '<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="10" r="1.6"/><path d="M21 16l-5-5-8 8"/>',
  capture: '<path d="M4 8V5a1 1 0 011-1h3M16 4h3a1 1 0 011 1v3M20 16v3a1 1 0 01-1 1h-3M8 20H5a1 1 0 01-1-1v-3"/><circle cx="12" cy="12" r="3"/>',
  undo: '<path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 010 11H11"/>',
  redo: '<path d="M15 14l5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 000 11H13"/>',
  pages: '<rect x="4" y="3" width="11" height="14" rx="1.5"/><path d="M9 21h9.5A1.5 1.5 0 0020 19.5V8"/>',
  more: '<circle cx="5" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.4" fill="currentColor" stroke="none"/>',
  dotsV: '<circle cx="12" cy="5" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none"/><circle cx="12" cy="19" r="1.4" fill="currentColor" stroke="none"/>',
  dl: '<path d="M12 4v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M5 19h14"/>',
  up: '<path d="M12 19V8"/><path d="M7.5 12.5L12 8l4.5 4.5"/><path d="M5 4h14"/>',
  cloud: '<path d="M7 18h10.5a4 4 0 00.6-7.95A6 6 0 006.6 9.1 4.5 4.5 0 007 18z"/>',
  cloudOk: '<path d="M7 18h10.5a4 4 0 00.6-7.95A6 6 0 006.6 9.1 4.5 4.5 0 007 18z"/><path d="M9.5 13.5l2 2 3.5-3.5"/>',
  cloudOff: '<path d="M7 18h10.5a4 4 0 00.6-7.95A6 6 0 006.6 9.1 4.5 4.5 0 007 18z"/><path d="M4 4l16 16"/>',
  sync: '<path d="M20 11a8 8 0 00-14.3-4.9L4 8"/><path d="M4 4v4h4"/><path d="M4 13a8 8 0 0014.3 4.9L20 16"/><path d="M20 20v-4h-4"/>',
  notes: '<rect x="4" y="3" width="13" height="17" rx="2"/><path d="M8 8h5M8 12h5"/><path d="M20 7v12a2 2 0 01-2 2H8"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 8v4l3 2"/>',
  star: '<path d="M12 4l2.4 5 5.4.6-4 3.7 1.1 5.4L12 16l-4.9 2.7 1.1-5.4-4-3.7 5.4-.6z"/>',
  shots: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 15l5-4 4 3 3-2 6 4"/>',
  folder: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/>',
  file: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/>',
  fileIn: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/><path d="M12 11v6"/><path d="M9.5 14.5L12 17l2.5-2.5"/>',
  blank: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M6 12h12"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>',
  chev: '<path d="M6 9l6 6 6-6"/>',
  chevR: '<path d="M9 6l6 6-6 6"/>',
  move: '<path d="M12 4v16M4 12h16M9 7l3-3 3 3M9 17l3 3 3-3M7 9l-3 3 3 3M17 9l3 3-3 3"/>',
  trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 002 2h6a2 2 0 002-2l1-12M9 7V4h6v3"/>',
  rename: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13 7l4 4"/>',
  copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  full: '<path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/>',
  gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
  check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
  paste: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M12 9v6M9 12h6"/>',
  rect: '<rect x="4" y="6" width="16" height="12" rx="1" stroke-dasharray="3 2"/>',
  free: '<path d="M6 15c-2-1-3-3-2-5 2-4 10-6 14-3s1 9-5 9c-2 0-4-.4-5-1" stroke-dasharray="3 2"/>',
  link: '<path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1"/><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1"/>',
  moon: '<path d="M20 14.5A8 8 0 019.5 4a8 8 0 1010.5 10.5z"/>',
  spark: '<path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8z"/><path d="M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z"/>',
  chart: '<path d="M4 20h16"/><path d="M7 16v-4"/><path d="M12 16V7"/><path d="M17 16v-7"/>',
  split: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M12 4v16"/>',
  upArrow: '<path d="M12 19V5M6 11l6-6 6 6"/>',
  downArrow: '<path d="M12 5v14M6 13l6 6 6-6"/>',
  rightArrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  leftArrow: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  send: '<path d="M4 12l16-8-6 16-2-6z"/>',
  logout: '<path d="M15 4h3a2 2 0 012 2v12a2 2 0 01-2 2h-3"/><path d="M10 17l-5-5 5-5"/><path d="M5 12h11"/>',
  bookmark: '<path d="M7 4h10a1 1 0 011 1v15l-6-4-6 4V5a1 1 0 011-1z"/>',
  toc: '<path d="M9 6h11M9 12h11M9 18h11"/><circle cx="4.5" cy="6" r="1" fill="currentColor"/><circle cx="4.5" cy="12" r="1" fill="currentColor"/><circle cx="4.5" cy="18" r="1" fill="currentColor"/>',
  gridI: '<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="7" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/><rect x="13" y="13" width="7" height="7" rx="1.5"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 018 0v3"/>',
  hand: '<path d="M3 17c2.5-4 4.5-9 6.5-9 1.6 0 .4 6 2 6s2.5-4 4-4c1.3 0 .5 3 1.7 3 1 0 1.6-1 2.8-2"/><path d="M3 21h18"/>',
  folderPlus: '<path d="M3 7a2 2 0 012-2h4l2 2h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z"/><path d="M12 10v6M9 13h6"/>',
  translate: '<path d="M4 5h9M8.5 3v2M6 5c.5 3 3 6 6 7.5M11 5c-.8 3.5-3.5 6.8-7 8.5"/><path d="M13 21l4-10 4 10M14.5 17.5h5"/>',
  expand: '<path d="M14 4h6v6M10 20H4v-6M20 4l-7 7M4 20l7-7"/>',
  shrink: '<path d="M10 4v6H4M14 20v-6h6M4 10l6-6M20 14l-6 6" transform="rotate(180 12 12)"/>',
  checkSq: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M8 12l3 3 5-6"/>',
  sticky: '<path d="M5 4h14a1 1 0 011 1v9l-6 6H5a1 1 0 01-1-1V5a1 1 0 011-1z"/><path d="M14 20v-5a1 1 0 011-1h5"/><path d="M8 9h8M8 12.5h5"/>',
  aisel: '<path d="M8.5 18.4C5.3 17.2 3 14.7 3 11.8 3 7.5 7 4 12 4s9 3.5 9 7.8c0 .8-.1 1.5-.4 2.2" stroke-dasharray="2.6 2.4"/><path d="M17 14.5l.9 2.3 2.3.9-2.3.9-.9 2.3-.9-2.3-2.3-.9 2.3-.9z"/>',
  dup: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M14 11v6M11 14h6"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>',
  speak: '<path d="M4 9.5v5h3.5L12 19V5L7.5 9.5z"/><path d="M15.5 9a4 4 0 010 6"/><path d="M18.2 6.5a7.5 7.5 0 010 11"/>',
  fixText: '<path d="M3 17c1.6-3 3-4.5 4.2-4.5 1.6 0 .4 4.5 2 4.5 1.3 0 2.3-3 3.6-3 1 0 1.2 1.8 2.2 1.8"/><path d="M14 6h7M17.5 6v7"/><path d="M4 6.5l1.6 1.6L9 4.7"/>',
  aSmall: '<path d="M5 17l3.5-9 3.5 9M6.4 14h4.2"/><path d="M15 12h5"/>',
  aBig: '<path d="M4 18l4.5-12L13 18M5.8 14h5.4"/><path d="M15.5 12h5M18 9.5v5"/>'
};
const LOGO_SVG = (size = 40, mono) => `<svg width="${size}" height="${size}" viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="15" fill="${mono ? '#FFFFFF' : 'var(--brand)'}"/><path d="M19.5 11.5H40.5L49 20V49.5A3 3 0 0 1 46 52.5H19.5A3 3 0 0 1 16.5 49.5V14.5A3 3 0 0 1 19.5 11.5Z" fill="${mono ? 'var(--brand)' : '#FFFFFF'}"/><path d="M40.5 11.5V17A3 3 0 0 0 43.5 20H49Z" fill="#C7D2F2"/><path d="M23.5 11.5V52.5" stroke="#EE5A43" stroke-width="1.6"/><path d="M19 41.5C23.5 44.5 28.5 35 34 33.6C38.4 32.5 39.6 36.6 44.5 30.5" fill="none" stroke="#2F5BEA" stroke-width="3.2" stroke-linecap="round"/></svg>`;

let toastT = 0;
function toast(msg, ms = 2600) {
  let t = $('.toast'); if (!t) { t = h('div', { class: 'toast', role: 'status', 'aria-live': 'polite' }); document.body.append(t); }
  t.textContent = msg; t.hidden = false; clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, ms);
}
function progress(label) {
  const bar = h('i'); const txt = h('span', null, label);
  const box = h('div', { class: 'prog' }, h('div', null, txt, h('div', { class: 'meter' }, bar)));
  document.body.append(box);
  return { set(f, l) { bar.style.width = Math.round(clamp(f, 0, 1) * 100) + '%'; if (l) txt.textContent = l; }, done() { box.remove(); } };
}
function modal({ title, text, body, actions, wide, onClose }) {
  const back = h('div', { class: 'modal-back' });
  const close = () => { back.remove(); if (onClose) onClose(); };
  const box = h('div', { class: 'modal' + (wide ? ' wide' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('h2', null, title), text ? h('p', null, text) : null, body || null,
    actions && actions.length ? h('div', { class: 'acts' }, actions.map(a => h('button', { class: 'btn ' + (a.kind || ''), type: 'button', onclick: async () => { if (a.onClick && (await a.onClick()) === false) return; close(); } }, a.label))) : null);
  back.append(box);
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  document.body.append(back);
  const inp = box.querySelector('input[type=text]'); if (inp) setTimeout(() => { inp.focus(); inp.select(); }, 30);
  return close;
}
function fmtDate(ts) {
  if (!ts) return '';
  const d = new Date(ts), n = new Date(); const diff = (n - d) / 1000;
  if (diff < 60) return 'az önce';
  if (diff < 3600) return Math.floor(diff / 60) + ' dk önce';
  if (d.toDateString() === n.toDateString()) return 'bugün ' + d.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit' });
  const y = new Date(n); y.setDate(n.getDate() - 1); if (d.toDateString() === y.toDateString()) return 'dün';
  try { return new Intl.DateTimeFormat('tr-TR', { day: 'numeric', month: 'short', year: d.getFullYear() === n.getFullYear() ? undefined : 'numeric' }).format(d); } catch (e) { return d.toLocaleDateString(); }
}
function fmtSize(b) { if (b == null) return ''; if (b < 1024) return b + ' B'; if (b < 1048576) return Math.round(b / 1024) + ' KB'; return (b / 1048576).toFixed(1).replace('.', ',') + ' MB'; }
function hexRgb(hex) { const n = parseInt(hex.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function safeName(n) { return (n || 'Not').replace(/[\\/:*?"<>|\u0000-\u001f]+/g, '-').trim().slice(0, 120) || 'Not'; }
async function copyText(t) { try { await navigator.clipboard.writeText(t); toast('Kopyalandı', 1200); } catch (e) { toast('Kopyalanamadı; metni seçip kopyalayın.'); } }

/* =========================================================
   Depolama (IndexedDB; olmazsa bellek)
   ========================================================= */
const STORES = ['meta', 'notes', 'pdfs', 'shots'];
const Store = {
  db: null, ok: false, mem: Object.fromEntries(STORES.map(s => [s, new Map()])),
  async open() {
    try {
      this.db = await new Promise((res, rej) => {
        const r = indexedDB.open('kenar-notu', 2);
        r.onupgradeneeded = () => { const d = r.result; for (const n of STORES) if (!d.objectStoreNames.contains(n)) d.createObjectStore(n, { keyPath: 'id' }); };
        r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); r.onblocked = () => rej(new Error('blocked'));
        setTimeout(() => rej(new Error('timeout')), 5000);
      });
      this.ok = true;
      try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { }
    } catch (e) { this.ok = false; }
  },
  req(store, mode, fn) {
    return new Promise((res, rej) => {
      const tx = this.db.transaction(store, mode); const r = fn(tx.objectStore(store));
      tx.oncomplete = () => res(r && r.result); tx.onerror = () => rej(tx.error); tx.onabort = () => rej(tx.error);
    });
  },
  async get(s, id) { if (!this.ok) return this.mem[s].get(id); try { return await this.req(s, 'readonly', o => o.get(id)); } catch (e) { return this.mem[s].get(id); } },
  async put(s, v) { if (!this.ok) { this.mem[s].set(v.id, v); return; } try { await this.req(s, 'readwrite', o => o.put(v)); } catch (e) { this.mem[s].set(v.id, v); if (e && e.name === 'QuotaExceededError') toast('Depolama alanı doldu. Eski notları silin.', 4000); } },
  async del(s, id) { this.mem[s].delete(id); if (!this.ok) return; try { await this.req(s, 'readwrite', o => o.delete(id)); } catch (e) { } },
  async all(s) { if (!this.ok) return [...this.mem[s].values()]; try { return await this.req(s, 'readonly', o => o.getAll()); } catch (e) { return [...this.mem[s].values()]; } }
};

/* =========================================================
   Ayarlar
   ========================================================= */
const PEN_TYPES = [
  { id: 'fountain', name: 'Dolma' }, { id: 'ballpoint', name: 'Tükenmez' }, { id: 'pencil', name: 'Kurşun' },
  { id: 'calli', name: 'Kaligrafi' }, { id: 'brush', name: 'Fırça' }
];
const PEN_NAMES = { fountain: 'Dolma kalem', ballpoint: 'Tükenmez kalem', pencil: 'Kurşun kalem', calli: 'Kaligrafi kalemi', brush: 'Fırça', hl: 'Fosforlu kalem' };
const PALETTE = ['#1a2033', '#5a6478', '#ffffff', '#c92a2a', '#e8590c', '#f2b705', '#2f9e44', '#0c8599', '#2f5bea', '#6741d9', '#c2255c', '#8a5a2b'];
const HL_PALETTE = ['#ffd43b', '#8ce99a', '#74c0fc', '#faa2c1', '#ffc078', '#b197fc'];
const DEF = {
  pen: { type: 'fountain', fountain: { size: 2.2, color: '#1a2033', o: 1 }, ballpoint: { size: 1.4, color: '#2f5bea', o: 1 }, pencil: { size: 2, color: '#5a6478', o: .9 }, calli: { size: 5, color: '#1a2033', o: 1 }, brush: { size: 7, color: '#c92a2a', o: 1 } },
  hl: { size: 14, color: '#ffd43b', o: .5 },
  eraser: { mode: 'area', size: 28, hlOnly: false },
  lasso: { mode: 'free' },
  text: { font: 'sans', size: 16, color: '#1a2033', bold: false, wt: 0 },
  capture: { mode: 'rect' },
  feel: { pressure: .75, stab: .2, tilt: true, shape: true, scratch: true },
  prefs: { finger: 'auto', side: 'eraser', twoTap: true, hover: true, penSeen: false, theme: 'system', invert: false, zoomCtl: true, pager: true, readOnly: false, splitPos: 'auto', pan: 'rd', panStep: 50 },
  toolbar: null, splitW: 0.42, splitH: 0.48, dictBox: null, folders: [], panelTab: 'pages',
  od: { clientId: '', saveMode: 'overwrite', auto: true },
  fav: [], recent: ['#1a2033', '#c92a2a', '#2f5bea', '#2f9e44', '#ffd43b'],
  lastTool: 'pen', panelOpen: false, libView: 'all', sort: 'updated',
  hand: { mode: 'off', lang: 'auto', font: 'hand', scale: 100, grammar: false, asked: false, style: null, ai: 'off', cont: true, where: 'both', model: 'best', mig: 0, engine: 'local', split: true },
  voice: { hold: true, rate: 0.95, name: '', lang: 'en-GB' }, favSeed: 0,
  pageFix: { first: 'gemini', fallback: true, gmodel: '', cmodel: '', when: 'manual', review: true, dest: 'replace', fixes: true,
    boost: { ex: false, explain: false, sheet: false, ask: '', answers: true, mark: true } },
  usage: { gFree: false, range: '30d' }
};
/* Ders notu kalem stilleri: kalem rengi + düzeltilen yazının yazı tipi/boyutu.
   Sayfa birimi PDF noktasıdır (A4 = 595 × 842 pt), bu yüzden pt değerleri birebir kullanılır. */
const STYLE_FAVS = [
  { name: 'Sayfa başlığı', color: '#1f2f5c', text: { font: 'kalam', wt: 700, size: 30 }, size: 2.6 },
  { name: 'Bölüm başlığı', color: '#1f2f5c', text: { font: 'kalam', wt: 700, size: 19 }, size: 2.2 },
  { name: 'Terim', color: '#1b6e3c', text: { font: 'kalam', wt: 700, size: 13.5 } },
  { name: 'Anlamı', color: '#167a7a', text: { font: 'kalam', wt: 400, size: 13.5 } },
  { name: 'İngilizce örnek', color: '#1f2f5c', text: { font: 'kalam', wt: 400, size: 12.5 } },
  { name: 'Türkçe çeviri', color: '#4f6b5a', text: { font: 'kalam', wt: 300, size: 11.5, prefix: '↳' } },
  { name: 'İpucu', color: '#6b3fa0', text: { font: 'kalam', wt: 400, size: 11.5, prefix: '★' } },
  { name: 'Hatalı', color: '#c0392b', text: { font: 'kalam', wt: 400, size: 12, prefix: '✗' } },
  { name: 'Doğru', color: '#1b6e3c', text: { font: 'kalam', wt: 400, size: 12, prefix: '✓' } },
  { name: 'Düzeltme açıklaması', color: '#8e2a20', text: { font: 'kalam', wt: 300, size: 11.5 } }
].map(f => ({ type: 'fountain', size: f.size || 1.8, o: 1, ...f }));
function merge(d, s) { if (Array.isArray(d)) return Array.isArray(s) ? s : d.slice(); if (typeof d !== 'object' || d === null) return s === undefined ? d : s; const o = {}; for (const k in d) o[k] = merge(d[k], s ? s[k] : undefined); return o; }
let S = merge(DEF, (() => { try { return JSON.parse(localStorage.getItem('kn.settings') || 'null'); } catch (e) { return null; } })());
window.__getS = () => S;
if (!S.favSeed) {
  const have = new Set(S.fav.map(f => f.name).filter(Boolean));
  S.fav = [...STYLE_FAVS.filter(f => !have.has(f.name)), ...S.fav].slice(0, 20);
  S.favSeed = 1; try { localStorage.setItem('kn.settings', JSON.stringify(S)); } catch (e) { }
}
let saveST = 0;
function saveSettings() { clearTimeout(saveST); saveST = setTimeout(() => { try { localStorage.setItem('kn.settings', JSON.stringify(S)); } catch (e) { } }, 250); }
function penCfg(type) { return type === 'hl' ? S.hl : S.pen[type]; }
function pushRecent(c) { c = c.toLowerCase(); S.recent = [c, ...S.recent.filter(x => x !== c)].slice(0, 8); saveSettings(); }
function applyTheme() { const t = S.prefs.theme; if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.setAttribute('data-theme', t); const m = $('meta[name=theme-color]'); if (m) m.content = getComputedStyle(document.documentElement).getPropertyValue('--chrome').trim() || '#ffffff'; }

/* =========================================================
   Açılır panel ve ortak kontroller
   ========================================================= */
let pop, popAnchor = null, popOnClose = null, popGuard = null;
/* Aynı düğmeye ikinci dokunuş paneli kapatır (pointerdown'da kapanır, ardından gelen click yeniden açmaz) */
function popAnchorTapped(anchor) { popGuard = { anchor, t: now() }; closePop(); }
function openPop(anchor, build, onClose) {
  if (popGuard && popGuard.anchor === anchor && now() - popGuard.t < 900) { popGuard = null; return; }
  popGuard = null;
  closePop();
  pop.innerHTML = ''; pop.append(build()); pop.hidden = false; pop.scrollTop = 0; popAnchor = anchor; popOnClose = onClose || null;
  placePop();
}
function placePop() {
  if (!pop || pop.hidden || !popAnchor) return;
  const r = popAnchor.getBoundingClientRect(), W = innerWidth, H = innerHeight;
  const pw = pop.offsetWidth; pop.style.left = clamp(r.left + r.width / 2 - pw / 2, 12, W - pw - 12) + 'px';
  const below = H - r.bottom - 12, above = r.top - 12;
  pop.style.maxHeight = Math.max(200, Math.max(below, above) - 8) + 'px';
  const ph = pop.offsetHeight;
  pop.style.top = (ph <= below || below >= above) ? (r.bottom + 8) + 'px' : Math.max(12, r.top - 8 - ph) + 'px';
}
function closePop() { if (!pop || pop.hidden) return; pop.hidden = true; pop.innerHTML = ''; const f = popOnClose; popAnchor = null; popOnClose = null; if (f) f(); }
function menu(items) {
  return h('div', { class: 'menu', role: 'menu' }, items.filter(Boolean).map(it => it === '-' ? h('hr', { class: 'sep' }) :
    h('button', { type: 'button', role: 'menuitem', class: it.danger ? 'danger' : '', disabled: it.disabled, onclick: () => { closePop(); it.onClick(); } }, icon(it.icon || IC.chevR), h('span', null, it.label, it.sub ? h('small', null, it.sub) : null))));
}
function rangeRow(id, label, min, max, step, val, fmt, onInput) {
  const out = h('output', { for: id }, fmt(val));
  const inp = h('input', { type: 'range', id, min, max, step, value: val });
  inp.addEventListener('input', () => { const v = parseFloat(inp.value); out.textContent = fmt(v); onInput(v); });
  return h('div', { class: 'range' }, h('label', { for: id }, label), out, inp);
}
/* Ayarlar ekranı: gruplu kartlar */
function sGroup(title, rows, foot) {
  return h('section', { class: 'sgroup' }, title ? h('h4', null, title) : null, h('div', { class: 'scard' }, ...rows.filter(Boolean)), foot ? (typeof foot === 'string' ? h('p', { class: 'sfoot' }, foot) : foot) : null);
}
function sRow(label, sub, control, stack) {
  return h('div', { class: 'srow' + (stack ? ' stack' : '') }, h('div', { class: 'stext' }, h('b', null, label), sub ? h('small', null, sub) : null), control || null);
}
function toggleRow(id, label, val, onChange, sub) {
  const inp = h('input', { type: 'checkbox', id, role: 'switch', class: 'switch' }); inp.checked = !!val;
  inp.addEventListener('change', () => onChange(inp.checked));
  return h('label', { class: 'toggle', for: id }, h('span', null, label, sub ? h('small', null, sub) : null), inp);
}
function segRow(opts, val, onChange, label) {
  const seg = h('div', { class: 'seg', role: 'radiogroup', 'aria-label': label || null });
  opts.forEach(([v, l, ic]) => {
    const b = h('button', { type: 'button', class: v === val ? 'on' : '', role: 'radio', 'aria-checked': v === val ? 'true' : 'false' }, ic ? icon(ic) : null, l);
    b.addEventListener('click', () => { [...seg.children].forEach(c => { c.classList.remove('on'); c.setAttribute('aria-checked', 'false'); }); b.classList.add('on'); b.setAttribute('aria-checked', 'true'); onChange(v); });
    seg.append(b);
  });
  return seg;
}
function swatchGrid(cur, first, onPick) {
  const grid = h('div', { class: 'swgrid' });
  const all = [...first, ...[...PALETTE, ...HL_PALETTE].filter(c => !first.includes(c))].slice(0, 17);
  const mk = c => { const b = h('button', { type: 'button', class: 'sw' + (c.toLowerCase() === (cur || '').toLowerCase() ? ' on' : ''), style: { background: c }, 'aria-label': 'Renk ' + c }); b.addEventListener('click', () => { $$('.sw', grid).forEach(x => x.classList.remove('on')); b.classList.add('on'); onPick(c); }); return b; };
  all.forEach(c => grid.append(mk(c)));
  const ci = h('input', { type: 'color', value: cur && cur.length === 7 ? cur : '#1a2033', 'aria-label': 'Özel renk' });
  ci.addEventListener('input', () => { $$('.sw', grid).forEach(x => x.classList.remove('on')); onPick(ci.value); });
  grid.append(h('label', { class: 'sw swcustom', title: 'Özel renk' }, ci));
  return grid;
}
