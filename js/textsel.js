'use strict';
/* =========================================================
   PDF metin seçimi: parmakla basılı tut → kelime seçilir,
   sürükleyerek genişlet; Kopyala / Fosforla
   ========================================================= */
const TS = { layers: new WeakMap(), sel: null, bar: null, hl: null };

function ensureTextLayer(pv) {
  if (!pv || pv.meta.k !== 'pdf' || !ed.pdf || !window.pdfjsLib) return Promise.resolve(null);
  const have = TS.layers.get(pv); if (have) return have;
  const div = h('div', { class: 'textLayer' }); pv.el.append(div);
  const ready = (async () => {
    try {
      const pg = await getPdfPage(pv.meta.i); const vp = pg.getViewport({ scale: 1 });
      const tc = await pg.getTextContent();
      div.style.setProperty('--scale-factor', '1');
      const task = pdfjsLib.renderTextLayer({ textContentSource: tc, container: div, viewport: vp, textDivs: [] });
      await task.promise;
      return div.querySelector('span') ? div : null;
    } catch (e) { return null; }
  })();
  TS.layers.set(pv, ready);
  return ready;
}
function caretAt(div, x, y) {
  div.style.pointerEvents = 'auto';
  let node = null, off = 0;
  try {
    if (document.caretRangeFromPoint) { const r = document.caretRangeFromPoint(x, y); if (r) { node = r.startContainer; off = r.startOffset; } }
    else if (document.caretPositionFromPoint) { const p = document.caretPositionFromPoint(x, y); if (p) { node = p.offsetNode; off = p.offset; } }
  } finally { div.style.pointerEvents = ''; }
  if (!node || node.nodeType !== 3 || !div.contains(node)) return null;
  return { node, off };
}
const isWordCh = ch => /[\p{L}\p{N}_'’\-]/u.test(ch);
function wordAt(c) {
  const t = c.node.data; let a = Math.min(c.off, t.length), b = a;
  if ((a >= t.length || !isWordCh(t[a])) && a > 0 && isWordCh(t[a - 1])) { a--; b = a; }
  if (a >= t.length || !isWordCh(t[a])) return null;
  while (a > 0 && isWordCh(t[a - 1])) a--;
  while (b < t.length && isWordCh(t[b])) b++;
  return { node: c.node, a, b };
}
function rangeOf(w1, w2) {
  const r = document.createRange();
  const s = document.createRange(); s.setStart(w1.node, w1.a); s.setEnd(w1.node, w1.a);
  const e = document.createRange(); e.setStart(w2.node, w2.a); e.setEnd(w2.node, w2.a);
  const forward = s.compareBoundaryPoints(Range.START_TO_START, e) <= 0;
  const first = forward ? w1 : w2, last = forward ? w2 : w1;
  r.setStart(first.node, first.a); r.setEnd(last.node, last.b);
  return r;
}
function rangeText(r) {
  const root = r.commonAncestorContainer.nodeType === 3 ? r.commonAncestorContainer.parentNode.parentNode : r.commonAncestorContainer;
  const tw = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let out = '', n;
  while ((n = tw.nextNode())) {
    if (!r.intersectsNode(n)) continue;
    if (n.nodeType === 3) { let s = n.data; if (n === r.endContainer) s = s.slice(0, r.endOffset); if (n === r.startContainer) s = s.slice(r.startOffset); out += s; }
    else if (n.tagName === 'BR') out += '\n';
  }
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

/* Uzun basma başladı: ilk kelimeyi seç */
async function textSelStart(pointerId, x, y) {
  const w = toWorld(x, y); const pv = pageAtWorld(w, true);
  if (!pv || pv.meta.k !== 'pdf') return false;
  const div = await ensureTextLayer(pv);
  if (!div) { toast('Bu sayfada seçilebilir metin yok (taranmış PDF olabilir)', 2200); return false; }
  let wd = null;
  for (const [dx, dy] of [[0, 0], [0, -6], [0, 6], [-6, 0], [6, 0], [0, -12], [0, 12]]) { const c = caretAt(div, x + dx, y + dy); wd = c && wordAt(c); if (wd) break; }
  if (!wd) return false;
  textSelClear();
  TS.sel = { pv, div, anchor: wd, focus: wd, range: rangeOf(wd, wd), pointerId, active: true };
  try { navigator.vibrate && navigator.vibrate(12); } catch (e) { }
  textSelDraw();
  if (S.voice.hold && window.speakText) { const w = wd.node.data.slice(wd.a, wd.b).replace(/^['’\-]+|['’\-]+$/g, ''); if (w) speakText(w); }
  return true;
}
function textSelMove(x, y) {
  const S2 = TS.sel; if (!S2 || !S2.active) return;
  const c = caretAt(S2.div, x, y); const wd = c && wordAt(c); if (!wd) return;
  S2.focus = wd; S2.range = rangeOf(S2.anchor, wd); textSelDraw();
}
function textSelEnd() { const S2 = TS.sel; if (!S2) return; S2.active = false; textSelDraw(); textSelBar(); }
function textSelClear() {
  TS.sel = null;
  if (TS.hl) { TS.hl.remove(); TS.hl = null; }
  if (TS.bar) { TS.bar.remove(); TS.bar = null; }
}
function lineRects(range) {
  const sr = stage.getBoundingClientRect();
  const rs = [...range.getClientRects()].filter(r => r.width > .5 && r.height > .5).map(r => ({ x0: r.left - sr.left, y0: r.top - sr.top, x1: r.right - sr.left, y1: r.bottom - sr.top }));
  const lines = [];
  for (const r of rs.sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0)) {
    const L = lines.find(l => Math.abs((l.y0 + l.y1) / 2 - (r.y0 + r.y1) / 2) < Math.max(3, (r.y1 - r.y0) * .45) && r.x0 <= l.x1 + (r.y1 - r.y0) * 1.2);
    if (L) { L.x0 = Math.min(L.x0, r.x0); L.x1 = Math.max(L.x1, r.x1); L.y0 = Math.min(L.y0, r.y0); L.y1 = Math.max(L.y1, r.y1); }
    else lines.push({ ...r });
  }
  return lines;
}
function textSelDraw() {
  const S2 = TS.sel; if (!S2) return;
  if (!S2.range.startContainer.isConnected) { textSelClear(); return; }
  if (!TS.hl) { TS.hl = h('div', { class: 'tsel' }); $('#ui').prepend(TS.hl); }
  TS.hl.innerHTML = '';
  for (const r of lineRects(S2.range)) TS.hl.append(h('i', { style: { left: r.x0 + 'px', top: r.y0 + 'px', width: (r.x1 - r.x0) + 'px', height: (r.y1 - r.y0) + 'px' } }));
  if (TS.bar) placeTextBar();
}
function textSelBar() {
  if (TS.bar) TS.bar.remove();
  const S2 = TS.sel; if (!S2) return;
  TS.bar = h('div', { class: 'floaty selbar tbar' },
    h('button', { class: 'btn', type: 'button', onclick: () => { const t = rangeText(S2.range); if (t) copyText(t); textSelClear(); } }, icon(IC.copy), 'Kopyala'),
    h('button', { class: 'btn', type: 'button', onclick: () => { const t = rangeText(S2.range); const ctx = selContext(S2, t); const place = selPlace(S2); textSelClear(); if (t) openDict(t, ctx, place); } }, icon(IC.spark), 'Anlamı'),
    h('button', { class: 'btn', type: 'button', onclick: () => { const t = rangeText(S2.range); const place = selPlace(S2); textSelClear(); if (t) openDict(t, '', place, 'translate'); } }, icon(IC.translate), 'Çevir'),
    h('button', { class: 'btn', type: 'button', onclick: () => { const t = rangeText(S2.range); if (t && window.speakText) speakText(t); } }, icon(IC.speak), 'Dinle'),
    h('button', { class: 'btn', type: 'button', onclick: () => { textSelHighlight(); textSelClear(); } }, icon(IC.hl), 'Fosforla'),
    h('button', { class: 'btn', type: 'button', onclick: () => { const t = rangeText(S2.range); textSelClear(); shareText(t); } }, icon(IC.up), 'Paylaş'),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Seçimi kapat', onclick: textSelClear }, icon(IC.close)));
  $('#ui').append(TS.bar);
  placeTextBar();
}
function placeTextBar() {
  const S2 = TS.sel, bar = TS.bar; if (!S2 || !bar) return;
  const ls = lineRects(S2.range); if (!ls.length) return;
  const top = Math.min(...ls.map(l => l.y0)), bot = Math.max(...ls.map(l => l.y1)), cx = (Math.min(...ls.map(l => l.x0)) + Math.max(...ls.map(l => l.x1))) / 2;
  const bw = bar.offsetWidth, bh = bar.offsetHeight;
  let y = top - bh - 14; if (y < 8) y = bot + 14; y = clamp(y, 8, ed.H - bh - 64);
  bar.style.left = clamp(cx - bw / 2, 8, ed.W - bw - 8) + 'px'; bar.style.top = y + 'px';
}
function textSelHighlight() {
  const S2 = TS.sel; if (!S2) return;
  const pv = S2.pv, pid = pv.meta.id, b = snap(pid);
  const v = ed.view, A = ann(pid);
  for (const r of lineRects(S2.range)) {
    const x0 = (r.x0 - v.tx) / v.z - pv.x, x1 = (r.x1 - v.tx) / v.z - pv.x, ym = ((r.y0 + r.y1) / 2 - v.ty) / v.z - pv.y, hh = (r.y1 - r.y0) / v.z;
    const pts = []; const n = Math.max(2, Math.ceil((x1 - x0) / 3));
    for (let i = 0; i <= n; i++) pts.push(x0 + hh * .15 + (x1 - x0 - hh * .3) * i / n, ym, hh * 1.05);
    A.s.push({ id: uid(), t: 'hl', c: S.hl.color, o: S.hl.o, p: new Float32Array(pts) });
  }
  pushOp({ k: 'page', pid, b, a: snap(pid) }); requestFrame(true);
}
async function shareText(t) {
  if (!t) return;
  if (window.KenarNative) { await shareBlob('Kenar Notu metin.txt', new Blob([t], { type: 'text/plain' })); return; }
  try { if (navigator.share) { await navigator.share({ text: t }); return; } } catch (e) { return; }
  copyText(t);
}

/* Seçimin geçtiği cümle (sözlük bağlamı için) */
function selContext(S2, sel) {
  try {
    const all = document.createRange(); all.selectNodeContents(S2.div);
    const full = rangeText(all).replace(/\s+/g, ' ');
    const pre = document.createRange(); pre.setStart(S2.div, 0); pre.setEnd(S2.range.startContainer, S2.range.startOffset);
    const at = rangeText(pre).replace(/\s+/g, ' ').length;
    let a = Math.max(0, at - 700), b = Math.min(full.length, at + sel.length + 700);
    const before = full.slice(a, at), after = full.slice(at, b);
    const sa = Math.max(before.lastIndexOf('. '), before.lastIndexOf('? '), before.lastIndexOf('! '));
    const m = after.slice(sel.length).search(/[.?!](\s|$)/);
    return (sa >= 0 ? before.slice(sa + 2) : before) + (m >= 0 ? after.slice(0, sel.length + m + 1) : after);
  } catch (e) { return ''; }
}
function selPlace(S2) {
  const ls = lineRects(S2.range); if (!ls.length) return null;
  const last = ls[ls.length - 1], v = ed.view, pv = S2.pv;
  const x0 = Math.min(...ls.map(l => l.x0)), x1 = Math.max(...ls.map(l => l.x1));
  return { pv, x: (x0 - v.tx) / v.z - pv.x, y: (last.y1 - v.ty) / v.z - pv.y, top: (ls[0].y0 - v.ty) / v.z - pv.y, w: (x1 - x0) / v.z, area: ls.length > 1 };
}
