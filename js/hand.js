'use strict';
/* =========================================================
   El yazısını düzelt
   Kalemle yazılan satırı metne çevirir ve yazım hatalarını düzeltir.
   - Android: cihazda ML Kit el yazısı tanıma (Türkçe + İngilizce) ve sistemin yazım denetleyicisi
     (HandwritingCorrector.java); modeller bir kez indirildikten sonra internetsiz çalışır.
   - Web / yedek: bağlı yapay zekâ (Gemini ya da Claude) görüntüden okur ve düzeltir.
   Mod: Kapalı · Düğmeyle (yazınca “Düzelt” düğmesi çıkar) · Otomatik (durunca kendisi düzeltir)
   Sonuç bir metin kutusu olur; çubuktaki A− / A+ ile küçültülüp büyütülür, “Geri al” ile mürekkep geri gelir.
   ========================================================= */
const HW = { group: null, timer: 0, chip: null, bar: null, last: null, reqs: new Map(), status: null, seq: 0, times: new WeakMap(), busy: 0 };
const HW_NATIVE = () => !!(window.KenarNative && window.KenarNative.inkRecognize);
const HW_TR = /[çğıöşüÇĞİÖŞÜ]/;
const HAND_FIX_SYSTEM = 'Görüntüde bir kişinin kalemle yazdığı el yazısı var. Yazıyı düz metne çevir ve yalnızca yazım hatalarını düzelt. Metin Türkçe, İngilizce ya da ikisi karışık olabilir: her kelimeyi kendi dilinde düzelt, başka dile çevirme, kelime ekleme ya da çıkarma, anlamı değiştirme. Türkçe karakterleri (ç ğ ı İ ö ş ü) doğru kullan. Yalnızca düzeltilmiş metni yaz; açıklama, tırnak ya da yorum ekleme. Görüntüde yazı yoksa hiçbir şey yazma.';
const GRAMMAR_SYSTEM = 'You are a careful proofreader. Fix only spelling and grammar mistakes in the user\'s English text with minimal changes. Keep any Turkish words exactly as they are. Do not translate, do not rephrase, do not add punctuation that changes meaning. Output only the corrected text.';

window.__inkStatus = j => { try { HW.status = JSON.parse(j); } catch (e) { } if (HW.onStatus) HW.onStatus(); };
window.__inkResult = j => { let r; try { r = JSON.parse(j); } catch (e) { return; } const f = HW.reqs.get(r.id); if (f) { HW.reqs.delete(r.id); f(r); } };

function handModelsReady() { const s = HW.status; return !!(s && (s.tr === 'ready' || s.en === 'ready')); }
function handCheckModels() { if (HW_NATIVE()) try { KenarNative.inkCheck(); } catch (e) { } }

/* ---------- tanıma ---------- */
/* strokes: [[x, y, t?], …] dizileri (sayfa ya da ekran koordinatı) */
function handNative(strokes, mode, pre) {
  return new Promise((res, rej) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const k = 3, now0 = Date.now();
    const payload = strokes.map((s, si) => { const a = []; s.forEach((p, i) => a.push(+((p[0] - x0) * k).toFixed(1), +((p[1] - y0) * k).toFixed(1), Math.round(p[2] || (now0 + si * 400 + i * 8)))); return a; });
    const id = 'ink' + (++HW.seq);
    const to = setTimeout(() => { HW.reqs.delete(id); rej(Object.assign(new Error('Tanıma zaman aşımına uğradı'), { code: 'timeout' })); }, 15000);
    HW.reqs.set(id, r => { clearTimeout(to); if (r.ok) res({ ...r, via: 'device' }); else rej(Object.assign(new Error(r.error === 'nomodel' ? 'El yazısı modelleri henüz indirilmedi' : r.error || 'Tanınamadı'), { code: r.error })); });
    try { KenarNative.inkRecognize(JSON.stringify({ id, strokes: payload, mode, pre: pre || '', w: Math.max(40, (x1 - x0) * k + 40), h: Math.max(40, (y1 - y0) * k + 40) })); }
    catch (e) { clearTimeout(to); HW.reqs.delete(id); rej(e); }
  });
}
function handImage(strokes) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const pad = 10, w = x1 - x0 + pad * 2, hh = y1 - y0 + pad * 2, k = Math.min(4, 1100 / Math.max(1, w), 500 / Math.max(1, hh));
  const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(w * k)); c.height = Math.max(8, Math.round(hh * k));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.setTransform(k, 0, 0, k, (pad - x0) * k, (pad - y0) * k);
  g.strokeStyle = '#111'; g.lineCap = g.lineJoin = 'round'; g.lineWidth = Math.max(1.4, 2.2 / k * 2);
  for (const s of strokes) { g.beginPath(); s.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); if (s.length === 1) g.lineTo(s[0][0] + .5, s[0][1]); g.stroke(); }
  return c.toDataURL('image/png').split(',')[1];
}
async function handAi(strokes, mode) {
  if (!aiReady()) throw Object.assign(new Error('Bu cihazda el yazısı tanıma yok; yapay zekâyı bağlayın'), { code: 'nokey' });
  const hint = mode === 'tr' ? ' Metin Türkçe.' : mode === 'en' ? ' Metin İngilizce.' : '';
  const { text } = await aiStream({ system: HAND_FIX_SYSTEM + hint, messages: [{ role: 'user', content: [{ type: 'image', mime: 'image/png', data: handImage(strokes) }, { type: 'text', text: 'Bu el yazısını metne çevir ve yazım hatalarını düzelt.' }] }], maxTokens: 300 });
  const t = (text || '').replace(/^["“”']+|["“”']+$/g, '').trim();
  if (!t) throw new Error('Yazı okunamadı');
  return { ok: true, lang: mode === 'tr' || mode === 'en' ? mode : HW_TR.test(t) ? 'tr' : 'en', text: t, corrected: t, kept: [], via: 'ai' };
}
async function handGrammar(r) {
  if (!S.hand.grammar || r.lang !== 'en' || !aiReady() || (r.kept && r.kept.length) || r.corrected.length > 600) return r;
  try {
    const { text } = await aiStream({ system: GRAMMAR_SYSTEM, messages: [{ role: 'user', content: r.corrected }], maxTokens: 400 });
    const t = (text || '').replace(/^["“”']+|["“”']+$/g, '').trim();
    if (t && t.length < r.corrected.length * 1.6 + 20) return { ...r, corrected: t, grammar: t !== r.corrected };
  } catch (e) { }
  return r;
}
/* Önce cihaz, olmazsa yapay zekâ */
async function handRecognize(strokes, mode = S.hand.lang, pre = '') {
  let r;
  if (HW_NATIVE()) {
    try { r = await handNative(strokes, mode, pre); }
    catch (e) {
      if (e.code === 'nomodel') { handCheckModels(); if (!aiReady()) throw Object.assign(new Error('El yazısı modelleri indiriliyor (yaklaşık 40 MB). Birkaç dakika sonra tekrar deneyin.'), { code: 'nomodel' }); }
      else if (!aiReady()) throw e;
      r = await handAi(strokes, mode);
    }
  } else r = await handAi(strokes, mode);
  return handGrammar(r);
}
window.handRecognize = handRecognize;

/* ---------- yazarken grup toplama ---------- */
function strokePts(s) {
  const p = s.p, n = p.length / 3, tm = HW.times.get(s); const out = [];
  const step = Math.max(1, Math.floor(n / 160));
  for (let i = 0; i < n; i += step) out.push([p[3 * i], p[3 * i + 1], tm ? Math.round(tm.t0 + (tm.t1 - tm.t0) * i / Math.max(1, n - 1)) : 0]);
  if ((n - 1) % step) out.push([p[3 * (n - 1)], p[3 * (n - 1) + 1], tm ? tm.t1 : 0]);
  return out;
}
function bbUnion(a, b) { return a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : { ...b }; }
function sameLine(g, bb) {
  const lh = Math.max(14, g.lineH);
  const ov = Math.min(g.bb.y1, bb.y1) - Math.max(g.bb.y0, bb.y0);
  const dx = Math.max(0, bb.x0 - g.bb.x1, g.bb.x0 - bb.x1);
  return (ov > -lh * .25 || (bb.y1 - bb.y0) < lh * .5 && bb.y0 > g.bb.y0 - lh && bb.y1 < g.bb.y1 + lh * .6) && dx < lh * 4;
}
window.handPenDown = () => { clearTimeout(HW.timer); };
window.handAfterStroke = (pv, s, t0p, t1p) => {
  if (S.hand.mode === 'off' || S.prefs.readOnly || s.t === 'hl') return;
  const t1 = Date.now(); HW.times.set(s, { t0: t1 - Math.max(1, t1p - t0p), t1 });
  const bb = strokeBB(s); const hgt = bb.y1 - bb.y0;
  let g = HW.group;
  if (g && (g.pv !== pv || !sameLine(g, bb) || t1 - g.at > 20000)) { const old = g; HW.group = g = null; hideHandChip(); if (S.hand.mode === 'auto') runGroup(old, true); }
  if (!g) g = HW.group = { pv, strokes: [], bb: null, lineH: Math.max(12, hgt), at: t1 };
  g.strokes.push(s); g.bb = bbUnion(g.bb, bb); g.at = t1;
  if (hgt > g.lineH * .6) g.lineH = Math.max(g.lineH * .7 + hgt * .3, 12);
  clearTimeout(HW.timer);
  if (S.hand.mode === 'auto') HW.timer = setTimeout(() => { const gg = HW.group; HW.group = null; if (gg) runGroup(gg, true); }, 1300);
  else HW.timer = setTimeout(showHandChip, 650);
};

function groupScreenBox(pv, bb) {
  const v = ed.view; return { x0: v.tx + (pv.x + bb.x0) * v.z, y0: v.ty + (pv.y + bb.y0) * v.z, x1: v.tx + (pv.x + bb.x1) * v.z, y1: v.ty + (pv.y + bb.y1) * v.z };
}
function showHandChip() {
  const g = HW.group; if (!g || !ed.note) return;
  hideHandChip();
  HW.chip = h('button', { class: 'floaty handchip', type: 'button', title: 'El yazısını metne çevir ve düzelt' }, icon(IC.fixText), 'Düzelt');
  HW.chip.addEventListener('pointerdown', e => e.stopPropagation());
  HW.chip.addEventListener('click', () => { const gg = HW.group; HW.group = null; hideHandChip(); if (gg) runGroup(gg, false); });
  $('#ui').append(HW.chip); placeHandUi();
}
function hideHandChip() { if (HW.chip) { HW.chip.remove(); HW.chip = null; } }

async function runGroup(g, auto) {
  const A = ann(g.pv.meta.id); const live = g.strokes.filter(s => A.s.includes(s));
  if (!live.length) return;
  const bb = live.reduce((b, s) => bbUnion(b, strokeBB(s)), null);
  if (auto && (bb.y1 - bb.y0 > 180 || (live.length < 2 && bb.x1 - bb.x0 < 40))) return; // çizim ya da tek işaret olabilir: otomatik dokunma
  const L = HW.last, pre = L && L.pv === g.pv && Date.now() - L.at < 60000 ? L.t.text : '';
  HW.busy++; showHandBusy(g.pv, bb);
  try {
    const r = await handRecognize(live.map(strokePts), S.hand.lang, pre);
    if (auto && r.corrected.replace(/\s/g, '').length < 2) return;
    applyHandResult(g.pv, live, r);
  } catch (e) {
    if (e.code === 'nokey') toastAction(e.message, 'Bağla', () => aiSettingsModal());
    else toast(e.message || 'El yazısı tanınamadı', 3200);
  } finally { HW.busy--; hideHandBusy(); }
}
function toastAction(msg, label, fn) {
  toast(msg, 5200);
  const t = $('.toast'); if (!t) return;
  t.append(' ', h('button', { class: 'btn small', type: 'button', style: { marginLeft: '8px', height: '30px' }, onclick: () => { t.hidden = true; fn(); } }, label));
}
function showHandBusy(pv, bb) {
  hideHandBusy();
  const sb = groupScreenBox(pv, bb);
  HW.busyEl = h('div', { class: 'handbusy', style: { left: sb.x0 - 6 + 'px', top: sb.y0 - 6 + 'px', width: sb.x1 - sb.x0 + 12 + 'px', height: sb.y1 - sb.y0 + 12 + 'px' } });
  $('#ui').prepend(HW.busyEl);
}
function hideHandBusy() { if (HW.busyEl) { HW.busyEl.remove(); HW.busyEl = null; } }

/* ---------- sonucu uygula ---------- */
function handFontSize(lineH, font) {
  const base = lineH * (font === 'hand' ? 0.95 : 0.72);
  return Math.round(clamp(base * (S.hand.scale || 100) / 100, 8, 96) * 2) / 2;
}
function applyHandResult(pv, strokes, r) {
  const pid = pv.meta.id, A = ann(pid);
  const live = strokes.filter(s => A.s.includes(s)); if (!live.length) return;
  const bb = live.reduce((b, s) => bbUnion(b, strokeBB(s)), null);
  const b = snap(pid);
  const font = S.hand.font || 'hand';
  const L = HW.last;
  // Aynı satırda az önce düzeltilen metnin devamıysa ona ekle
  const prevT = L && L.pv === pv && Date.now() - L.at < 90000 ? A.t.find(t => t.id === L.t.id) : null;
  const lineH = Math.max(10, bb.y1 - bb.y0);
  let nt, prefix = '', mark = '';
  if (prevT && bb.x0 > prevT.x && bb.x0 - (prevT.x + (prevT.w || 0)) < lineH * 3 && Math.min(prevT.y + (prevT.h || 20), bb.y1) - Math.max(prevT.y, bb.y0) > -lineH * .3) {
    prefix = prevT.text.replace(/\s+$/, '') + ' ';
    nt = { ...prevT, text: prefix + r.corrected, w: 0, h: 0 };
    A.t = A.t.map(t => t === prevT ? nt : t);
  } else {
    // Kalem stili seçiliyse (Terim, Anlamı…) onun yazı tipi, kalınlığı, boyutu ve işareti kullanılır
    const st = S.hand.style, fnt = st && st.font ? st.font : font;
    const size = st && st.size ? st.size : handFontSize(lineH, font);
    let text = r.corrected; mark = st && st.prefix && !text.startsWith(st.prefix) ? st.prefix : '';
    if (mark) text = mark + ' ' + text;
    const hand = fnt === 'hand' || fnt === 'kalam';
    nt = { id: uid(), x: Math.max(0, bb.x0), y: Math.max(0, bb.y0 - size * (hand ? .12 : .08)), text, size, color: live[0].c || S.text.color, font: fnt, bold: !!(st && st.wt >= 700), wt: st && st.wt ? st.wt : 0 };
    A.t.push(nt);
  }
  A.s = A.s.filter(s => !live.includes(s));
  const op = { k: 'page', pid, b, a: snap(pid) }; pushOp(op);
  renderLayer(pv); requestFrame(true); refreshPanel && refreshPanel();
  HW.last = { pv, t: nt, strokes: live, r, op, prefix, mark, at: Date.now() };
  showHandBar();
}
function curLastT() { const L = HW.last; if (!L || !ed.note) return null; const A = ann(L.pv.meta.id); return A.t.find(t => t.id === L.t.id) || null; }
function replaceLastT(fn) {
  const L = HW.last, t = curLastT(); if (!t) { hideHandBar(); return; }
  const pid = L.pv.meta.id, A = ann(pid), b = snap(pid);
  const nt = { ...t, ...fn(t), w: 0, h: 0 };
  A.t = A.t.map(x => x === t ? nt : x); L.t = nt;
  pushOp({ k: 'page', pid, b, a: snap(pid) }); renderLayer(L.pv); requestFrame(true);
  placeHandUi();
}
function handResize(k) { replaceLastT(t => ({ size: Math.round(clamp(t.size * k, 6, 120) * 2) / 2 })); }
async function handSwitchLang() {
  const L = HW.last; if (!L) return;
  const to = L.r.lang === 'tr' ? 'en' : 'tr';
  const bar = HW.bar; if (bar) bar.classList.add('busy');
  try {
    const r = await handRecognize(L.strokes.map(strokePts), to);
    L.r = r;
    replaceLastT(() => ({ text: (L.prefix || '') + (L.mark ? L.mark + ' ' : '') + r.corrected }));
    showHandBar();
  } catch (e) { toast(e.message || 'Tanınamadı', 2600); if (bar) bar.classList.remove('busy'); }
}
function handUndo() {
  const L = HW.last; if (!L) return;
  if (ed.undo[ed.undo.length - 1] === L.op) undo();
  else { const pid = L.pv.meta.id, A = ann(pid), b = snap(pid); const t = curLastT(); A.t = A.t.filter(x => x !== t); A.s.push(...L.strokes); pushOp({ k: 'page', pid, b, a: snap(pid) }); renderLayer(L.pv); requestFrame(true); }
  HW.last = null; hideHandBar();
}
function handSelect() {
  const L = HW.last, t = curLastT(); hideHandBar(); if (!L || !t) return;
  if (ed.tool !== 'pen' && ed.tool !== 'lasso') setTool('lasso');
  setSel(L.pv, new Set(), new Set([t]), new Set());
}
function handDelete() {
  const L = HW.last, t = curLastT(); hideHandBar(); if (!L || !t) return;
  const pid = L.pv.meta.id, A = ann(pid), b = snap(pid);
  A.t = A.t.filter(x => x !== t); pushOp({ k: 'page', pid, b, a: snap(pid) }); renderLayer(L.pv); requestFrame(true);
  HW.last = null; toast('Metin silindi', 1200);
}
function showHandBar() {
  hideHandBar(); const L = HW.last; if (!L) return;
  const r = L.r;
  const langBtn = h('button', { class: 'langb', type: 'button', title: (r.lang === 'tr' ? 'İngilizce' : 'Türkçe') + ' olarak yeniden oku', onclick: handSwitchLang }, (r.lang || '?').toUpperCase());
  const info = r.kept && r.kept.length ? 'Korundu: ' + r.kept.join(', ') : r.text && r.text !== r.corrected ? 'Düzeltildi: ' + r.text : r.via === 'ai' ? 'Yapay zekâ ile okundu' : 'Yazım hatası yok';
  HW.bar = h('div', { class: 'floaty handbar', role: 'toolbar', 'aria-label': 'El yazısı sonucu' },
    langBtn,
    h('div', { class: 'hinfo' }, h('b', null, L.t.text.length > 60 ? L.t.text.slice(0, 58) + '…' : L.t.text), h('small', null, info)),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Küçült', title: 'Küçült', onclick: () => handResize(1 / 1.12) }, icon(IC.aSmall)),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Büyüt', title: 'Büyüt', onclick: () => handResize(1.12) }, icon(IC.aBig)),
    window.speakText ? h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Sesli oku', title: 'Sesli oku', onclick: () => { const t = curLastT(); if (t) speakText(t.text); } }, icon(IC.speak)) : null,
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Seç ve taşı', title: 'Seç: taşı, büyüt/küçült', onclick: handSelect }, icon(IC.move)),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Metni sil', title: 'Metni sil', onclick: handDelete }, icon(IC.trash)),
    h('button', { class: 'btn small', type: 'button', onclick: handUndo }, icon(IC.undo), 'Geri al'),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: hideHandBar }, icon(IC.close)));
  HW.bar.addEventListener('pointerdown', e => e.stopPropagation());
  $('#ui').append(HW.bar); placeHandUi();
  clearTimeout(HW.barT); HW.barT = setTimeout(() => { if (HW.bar && !HW.bar.matches(':hover')) hideHandBar(); }, 9000);
}
function hideHandBar() { clearTimeout(HW.barT); if (HW.bar) { HW.bar.remove(); HW.bar = null; } }

function placeHandUi() {
  if (!ed.note) return;
  if (HW.chip) {
    const g = HW.group; if (!g || ed.tool !== 'pen') { hideHandChip(); }
    else { const sb = groupScreenBox(g.pv, g.bb); const c = HW.chip; c.style.left = clamp(sb.x1 + 10, 8, ed.W - c.offsetWidth - 8) + 'px'; c.style.top = clamp((sb.y0 + sb.y1) / 2 - c.offsetHeight / 2, 8, ed.H - c.offsetHeight - 8) + 'px'; }
  }
  if (HW.bar) {
    const t = curLastT(); if (!t) { hideHandBar(); return; }
    const L = HW.last, sb = groupScreenBox(L.pv, { x0: t.x, y0: t.y, x1: t.x + (t.w || 40), y1: t.y + (t.h || 20) });
    const bar = HW.bar, bw = bar.offsetWidth, bh = bar.offsetHeight;
    let y = sb.y1 + 12; if (y + bh > ed.H - 60) y = sb.y0 - bh - 12;
    bar.style.left = clamp(sb.x0, 8, ed.W - bw - 8) + 'px'; bar.style.top = clamp(y, 8, ed.H - bh - 8) + 'px';
  }
}
window.placeHandUi = placeHandUi;
window.handReset = () => { clearTimeout(HW.timer); HW.group = null; HW.last = null; hideHandChip(); hideHandBar(); hideHandBusy(); };

/* ---------- seçimden: “Yazıya dök” ve büyüt/küçült ---------- */
async function selToText() {
  const sel = ed.sel; if (!sel) return;
  commitSel();
  const strokes = [...sel.ids].filter(s => s.t !== 'hl');
  if (!strokes.length) { toast('Seçimde el yazısı yok', 1600); return; }
  const pv = sel.pv; clearSel();
  // satırlara ayır: üst üste binmeyenler ayrı satır
  const items = strokes.map(s => ({ s, bb: strokeBB(s) })).sort((a, b) => (a.bb.y0 + a.bb.y1) - (b.bb.y0 + b.bb.y1));
  const lines = [];
  for (const it of items) { const L = lines.find(l => sameLine(l, it.bb)); if (L) { L.strokes.push(it.s); L.bb = bbUnion(L.bb, it.bb); } else lines.push({ pv, strokes: [it.s], bb: { ...it.bb }, lineH: Math.max(12, it.bb.y1 - it.bb.y0) }); }
  lines.sort((a, b) => a.bb.y0 - b.bb.y0);
  for (const l of lines) { l.strokes.sort((a, b) => strokeBB(a).x0 - strokeBB(b).x0); HW.last = null; await runGroup(l, false); }
}
function scaleSelBy(k) {
  const sel = ed.sel; if (!sel) return;
  const bb = sel.bb, cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  sel.m = mul([k, 0, 0, k, cx - k * cx, cy - k * cy], sel.m);
  updateSelStyle(); moveSelItems(); commitSel(); placeSelbar();
}

/* ---------- kalem panelindeki ayarlar ---------- */
function handSettingsRows() {
  const st = h('p', { class: 'notice handst' });
  const showSt = () => {
    if (!st.isConnected && HW.onStatus === showSt) { HW.onStatus = null; return; }
    st.innerHTML = '';
    if (S.hand.mode === 'off') { st.textContent = 'Kalemle yazdığınız satır metne çevrilir; yazım hataları düzeltilir. Türkçe ve İngilizce karışık yazılabilir.'; return; }
    if (HW_NATIVE()) {
      const s = HW.status || {};
      const ok = s.tr === 'ready' && s.en === 'ready', dl = s.tr === 'downloading' || s.en === 'downloading';
      if (ok) st.textContent = 'Cihazda tanıma hazır (internetsiz). Yazım denetimi Samsung Klavye’nin Türkçe ve İngilizce sözlüklerini kullanır.';
      else if (dl) st.textContent = 'Türkçe ve İngilizce el yazısı modelleri indiriliyor (yaklaşık 40 MB)…';
      else if (s.tr === 'missing' || s.en === 'missing') st.append('Cihazda tanıma için iki dil modeli bir kez indirilmeli (yaklaşık 40 MB). ', h('button', { class: 'btn small', type: 'button', onclick: () => { try { KenarNative.inkPrepare(); } catch (e) { } } }, icon(IC.dl), 'Modelleri indir'));
      else st.textContent = 'Cihazdaki el yazısı modelleri kontrol ediliyor…';
    } else st.textContent = aiReady() ? 'Bu tarayıcıda el yazısı ' + aiName() + ' ile okunur (internet gerekir).' : 'Bu tarayıcıda el yazısını okumak için yapay zekâyı bağlayın.';
  };
  HW.onStatus = showSt;
  handCheckModels();
  const rows = h('div', { class: 'col handset' },
    h('hr', { class: 'sep' }), h('div', { class: 'lbl' }, 'El yazısını düzelt'),
    segRow([['off', 'Kapalı'], ['button', 'Düğmeyle'], ['auto', 'Otomatik']], S.hand.mode, v => { S.hand.mode = v; saveSettings(); handReset(); if (v !== 'off' && HW_NATIVE()) { const s = HW.status || {}; if (s.tr !== 'ready' || s.en !== 'ready') try { KenarNative.inkPrepare(); } catch (e) { } } showSt(); }),
    h('small', { class: 'segcap' }, 'Dil'),
    segRow([['auto', 'Otomatik'], ['tr', 'Türkçe'], ['en', 'İngilizce']], S.hand.lang, v => { S.hand.lang = v; saveSettings(); }),
    h('small', { class: 'segcap' }, 'Düzeltilen metnin yazı tipi'),
    segRow([['hand', 'El yazısı'], ['kalam', 'Kalam'], ['sans', 'Yalın'], ['serif', 'Tırnaklı']], S.hand.font, v => { S.hand.font = v; saveSettings(); }),
    rangeRow('hScale', 'Metin boyutu', 50, 200, 5, S.hand.scale, v => '%' + Math.round(v), v => { S.hand.scale = v; saveSettings(); }),
    S.hand.style ? h('p', { class: 'notice' }, 'Seçili kalem stili: ' + S.hand.style.name + ' (' + (FONT_LABEL[S.hand.style.font] || '') + ' ' + String(S.hand.style.size).replace('.', ',') + ' pt). Yazı tipi ve boyut bu stilden gelir; araç çubuğundaki stil düğmesinden değiştirin.') : null,
    toggleRow('hGram', 'İngilizce dil bilgisini de düzelt', S.hand.grammar, v => { S.hand.grammar = v; saveSettings(); }, 'Bağlı yapay zekâ ile; internet gerekir'),
    st);
  showSt();
  return rows;
}

/* seçim çubuğu düğmeleri */
(() => {
  const sh = $('#sHand'), ss = $('#sSmall'), sb = $('#sBig');
  if (sh) { sh.prepend(icon(IC.fixText)); sh.addEventListener('click', selToText); }
  if (ss) { ss.append(icon(IC.aSmall)); ss.addEventListener('click', () => scaleSelBy(1 / 1.15)); }
  if (sb) { sb.append(icon(IC.aBig)); sb.addEventListener('click', () => scaleSelBy(1.15)); }
})();
