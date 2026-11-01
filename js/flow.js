'use strict';
/* =========================================================
   Sayfaları akıt
   Düzeltilen yazı el yazısından küçük olduğu için not sayfalarında boşluk kalır. Bu işlem bu sayfadan başlayarak
   ardışık not sayfalarındaki satırları (metin, el yazısı, görsel) sıkıştırır; boşluk kapanır ve sonraki sayfanın
   yazıları bu sayfadan devam eder. Satırların yatay yeri ve sırası korunur; büyük boşluklar daraltılır.
   PDF sayfalarına uygulanmaz (yazılar basılı metne göre yerinde kalmalı). Tek adımda geri alınabilir.
   ========================================================= */
const FLOW_TOP = 48, FLOW_BOTTOM = 40;

function flowItems(pv) {
  const A = ann(pv.meta.id), items = [];
  for (const t of A.t) items.push({ kind: 't', o: t, bb: { x0: t.x, y0: t.y, x1: t.x + (t.w || 20), y1: t.y + (t.h || 20) } });
  for (const im of (A.i || [])) items.push({ kind: 'i', o: im, bb: { x0: im.x, y0: im.y, x1: im.x + im.w, y1: im.y + im.h } });
  if (A.s.length) for (const l of splitLines(A.s)) items.push({ kind: 's', strokes: l.strokes, bb: l.bb });
  return items;
}
/* Dikey olarak örtüşen parçalar aynı satırdır (birlikte taşınır) */
function flowRows(items) {
  const rows = [];
  for (const it of items.slice().sort((a, b) => a.bb.y0 - b.bb.y0)) {
    const hh = it.bb.y1 - it.bb.y0;
    const r = rows.find(r => Math.min(r.bb.y1, it.bb.y1) - Math.max(r.bb.y0, it.bb.y0) > Math.min(hh, r.bb.y1 - r.bb.y0) * .35);
    if (r) { r.items.push(it); r.bb = bbUnion(r.bb, it.bb); } else rows.push({ items: [it], bb: { ...it.bb } });
  }
  // birleşen satırlar başka satırlarla da örtüşebilir: kararlı hâle gelene kadar birleştir
  for (let changed = true; changed;) {
    changed = false;
    for (let i = 0; i < rows.length && !changed; i++) for (let j = i + 1; j < rows.length; j++) {
      const a = rows[i], b = rows[j], hh = Math.min(a.bb.y1 - a.bb.y0, b.bb.y1 - b.bb.y0);
      if (Math.min(a.bb.y1, b.bb.y1) - Math.max(a.bb.y0, b.bb.y0) > hh * .35) { a.items.push(...b.items); a.bb = bbUnion(a.bb, b.bb); rows.splice(j, 1); changed = true; break; }
    }
  }
  return rows.sort((a, b) => a.bb.y0 - b.bb.y0);
}
function flowRun(startIdx) {
  // bu sayfadan başlayan ardışık not sayfaları
  const run = [];
  for (let i = startIdx; i < ed.pvs.length && ed.pvs[i].meta.k !== 'pdf'; i++) run.push(ed.pvs[i]);
  return run;
}
function flowCan(i) { const pv = ed.pvs[i]; return !!(pv && pv.meta.k !== 'pdf'); }

function flowPages(startIdx = ed.pvs.indexOf(currentPage())) {
  const run = flowRun(startIdx);
  if (!run.length) { toast('Bu işlem yalnızca not sayfalarında yapılır (PDF sayfalarındaki notlar yerinde kalmalı).', 3600); return; }
  if (window.handReset) handReset();
  if (ed.sel) clearSel(); finishAll();
  const queue = [], limits = new Map();
  for (const pv of run) {
    const rows = flowRows(flowItems(pv));
    const top = rows.length ? Math.min(FLOW_TOP, rows[0].bb.y0) : FLOW_TOP;
    const bottom = Math.max(pv.meta.h - FLOW_BOTTOM, rows.length ? rows[rows.length - 1].bb.y1 : 0);
    limits.set(pv, { top, bottom });
    rows.forEach((row, k) => queue.push({ pv, row, gapBefore: k ? row.bb.y0 - rows[k - 1].bb.y1 : null }));
  }
  if (!queue.length) { toast('Akıtılacak yazı yok', 1500); return; }
  const before = new Map(run.map(pv => [pv, snap(pv.meta.id)]));
  const out = new Map(run.map(pv => [pv, { s: [], t: [], i: [] }]));
  let pi = 0, prevBottom = null, prevH = 14, moved = 0;
  for (let q = 0; q < queue.length; q++) {
    const it = queue[q], hh = it.row.bb.y1 - it.row.bb.y0;
    let gap;
    if (prevBottom == null) gap = 0;
    else if (it.gapBefore != null) gap = Math.max(2, Math.min(it.gapBefore, Math.max(6, prevH * .9 + 4))); // aynı sayfada: büyük boşlukları daralt
    else gap = Math.max(6, Math.min(prevH, hh) * .6);                                                       // sonraki sayfadan gelen ilk satır
    let target = prevBottom == null ? it.row.bb.y0 : prevBottom + gap;
    if (prevBottom != null && target + hh > limits.get(run[pi]).bottom && pi < run.length - 1) { pi++; target = limits.get(run[pi]).top; }
    const dest = run[pi], dy = target - it.row.bb.y0, o = out.get(dest);
    if (dest !== it.pv || Math.abs(dy) > .5) moved++;
    for (const x of it.row.items) {
      if (x.kind === 't') o.t.push(Math.abs(dy) > .01 || dest !== it.pv ? { ...x.o, y: x.o.y + dy, ink: null } : x.o);
      else if (x.kind === 'i') o.i.push(Math.abs(dy) > .01 || dest !== it.pv ? { ...x.o, y: x.o.y + dy } : x.o);
      else for (const s of x.strokes) o.s.push(Math.abs(dy) > .01 || dest !== it.pv ? transformStroke(s, [1, 0, 0, 1, 0, dy]) : s);
    }
    prevBottom = target + hh; prevH = Math.max(10, Math.min(hh, 60));
  }
  if (!moved) { toast('Sayfalar zaten sıkışık; kapatılacak boşluk yok', 2000); return; }
  const ops = [];
  for (const pv of run) {
    const A = ann(pv.meta.id), o = out.get(pv);
    A.s = o.s; A.t = o.t; A.i = o.i; // yapışkan notlar (A.n) yerinde kalır
    ops.push({ k: 'page', pid: pv.meta.id, b: before.get(pv), a: snap(pv.meta.id) });
    renderLayer(pv);
  }
  pushOp(ops.length === 1 ? ops[0] : { k: 'multi', ops });
  requestFrame(true); refreshPanel && refreshPanel();
  const empty = run.slice(1).filter(pv => { const A = ann(pv.meta.id); return !A.s.length && !A.t.length && !(A.i || []).length && !(A.n || []).length; }).map(pv => ed.pvs.indexOf(pv));
  if (empty.length) toastAction('Boşluklar kapatıldı. ' + empty.length + ' sayfa boş kaldı.', 'Boş sayfaları sil', () => deletePages(empty));
  else toast('Boşluklar kapatıldı; yazılar ' + (run.length > 1 ? 'sonraki sayfalardan buraya akıtıldı' : 'sıkıştırıldı') + ' · geri almak için ↶', 2600);
}
window.flowPages = flowPages;

/* Sayfa düzeltildikten sonra: sayfada yer açıldıysa ve sonraki sayfa da not sayfasıysa akıtmayı öner */
function flowSuggest(pv) {
  const i = ed.pvs.indexOf(pv); if (i < 0 || pv.meta.k === 'pdf') return;
  const next = ed.pvs[i + 1]; if (!next || next.meta.k === 'pdf') return;
  const NA = ann(next.meta.id); if (!NA.s.length && !NA.t.length && !(NA.i || []).length) return;
  const rows = flowRows(flowItems(pv)); const used = rows.length ? rows[rows.length - 1].bb.y1 : 0;
  let gaps = 0; rows.forEach((r, k) => { if (k) gaps += Math.max(0, r.bb.y0 - rows[k - 1].bb.y1 - 20); });
  const free = (pv.meta.h - FLOW_BOTTOM - used) + gaps;
  if (free > pv.meta.h * .2) setTimeout(() => toastAction('Bu sayfada yer açıldı.', 'Sonraki sayfa buradan devam etsin', () => flowPages(i)), 2800);
}
window.flowSuggest = flowSuggest;
