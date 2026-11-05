'use strict';
/* =========================================================
   Sayfalar: küçük resim paneli (sol üst), içindekiler, yer imleri,
   belgede arama, tüm sayfalar ızgarası (sürükleyerek sıralama),
   sayfa ekleme / çoğaltma / silme
   ========================================================= */
const thumbCache = new Map(); let thumbIO = null;
const PTABS = [['pages', 'Sayfalar', IC.gridI], ['toc', 'İçindekiler', IC.toc], ['marks', 'Yer imleri', IC.bookmark], ['find', 'Ara', IC.search]];

function setPanel(open) {
  const p = $('#ppanel'); p.hidden = !open; S.panelOpen = open; saveSettings();
  $('#pagesBtn').classList.toggle('on', open);
  if (open) refreshPanel(true);
}
$('#pagesBtn').addEventListener('click', () => setPanel($('#ppanel').hidden));
function narrowPanel() { return innerWidth <= 760; }
function afterJump() { if (narrowPanel()) setPanel(false); }

function refreshPanel(force) {
  const p = $('#ppanel'); if (p.hidden || !ed.note) return;
  const tab = PTABS.some(t => t[0] === S.panelTab) ? S.panelTab : 'pages';
  const tabs = $('#ptabs'); tabs.innerHTML = '';
  for (const [id, name, ic] of PTABS) tabs.append(h('button', { type: 'button', role: 'tab', class: id === tab ? 'on' : '', 'aria-selected': id === tab ? 'true' : 'false', title: name, 'aria-label': name, onclick: () => { S.panelTab = id; saveSettings(); refreshPanel(true); } }, icon(ic)));
  $('#pfind').hidden = tab !== 'find';
  $('#pfoot').hidden = tab !== 'pages';
  if (tab === 'pages') renderPageList();
  else if (tab === 'marks') renderMarks();
  else if (force && tab === 'toc') renderToc();
  else if (force && tab === 'find') renderFind();
}

/* ---------- sayfa listesi ---------- */
function isMarked(pv) { return !!(ed.note.marks && ed.note.marks.includes(pv.meta.id)); }
function thumbItem(pv, i, big) {
  const holder = h('div', { class: 'pt', style: { aspectRatio: pv.meta.w + '/' + pv.meta.h } }); holder._pv = pv;
  const more = h('span', { class: 'pmore', role: 'button', 'aria-label': `Sayfa ${i + 1} seçenekleri`, tabindex: '0' }, icon(IC.dotsV));
  const b = h('div', { class: 'pitem' + (ed.curPage === i + 1 ? ' on' : '') + (big ? ' big' : ''), role: 'button', tabindex: '0', 'aria-label': 'Sayfa ' + (i + 1) },
    holder, h('span', { class: 'pn' }, isMarked(pv) ? h('i', { class: 'bm' }, icon(IC.bookmark)) : null, String(i + 1)), more);
  more.addEventListener('click', e => { e.stopPropagation(); pageMenu(more, i); });
  more.addEventListener('pointerdown', e => e.stopPropagation());
  return { b, holder };
}
function observeThumbs(root) {
  if (thumbIO) thumbIO.disconnect();
  thumbIO = new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) { thumbIO.unobserve(en.target); drawPanelThumb(en.target); } }), { root, rootMargin: '300px' });
  return thumbIO;
}
function renderPageList() {
  const list = $('#plist'); list.innerHTML = ''; list.className = 'plist';
  const io = observeThumbs(list);
  ed.pvs.forEach((pv, i) => {
    const { b, holder } = thumbItem(pv, i);
    let lt = 0, long = false;
    b.addEventListener('pointerdown', () => { long = false; clearTimeout(lt); lt = setTimeout(() => { long = true; pageMenu(b, i); }, 520); });
    ['pointerup', 'pointerleave', 'pointercancel', 'pointermove'].forEach(t => b.addEventListener(t, ev => { if (t !== 'pointermove' || Math.abs(ev.movementY) > 2) clearTimeout(lt); }));
    b.addEventListener('contextmenu', e => { e.preventDefault(); long = true; pageMenu(b, i); });
    b.addEventListener('click', () => { if (long) { long = false; return; } goToPage(i); afterJump(); });
    list.append(b); io.observe(holder);
  });
  const add = h('button', { type: 'button', class: 'padd', onclick: () => addPagePicker(add, ed.pvs.length) }, icon(IC.plus), 'Sayfa ekle');
  list.append(add);
  requestAnimationFrame(() => { const on = list.querySelector('.pitem.on'); if (on) on.scrollIntoView({ block: 'nearest' }); });
}
function cloneCanvas(c) { const n = document.createElement('canvas'); n.width = c.width; n.height = c.height; n.getContext('2d').drawImage(c, 0, 0); return n; }
function drawPanelThumb(holder) {
  const pv = holder._pv; const key = pv.meta.id + ':' + (ed.pageVer.get(pv.meta.id) || 0);
  const cached = thumbCache.get(key); if (cached) { holder.innerHTML = ''; holder.append(cloneCanvas(cached)); return; }
  enqueue(1e6, async () => { if (!holder.isConnected || !ed.note) return; const c = await renderThumb(pv.meta, ed.note.ann[pv.meta.id], ed.pdf, 240); thumbCache.set(key, c); holder.innerHTML = ''; holder.append(cloneCanvas(c)); });
}

/* ---------- sayfa işlemleri ---------- */
function rebuildAfterPages() {
  const v = ed.view; const cy = (ed.H / 2 - v.ty) / v.z;
  for (const pv of ed.pvs) pv.token++;
  buildPages(); ed.fitZ = computeFit(); setView(v.z, v.tx, ed.H / 2 - cy * v.z); refreshPanel(); if (pgridEl) renderPgrid();
}
function pagesOp(mutate) {
  finishAll(); const b = ed.note.pages.slice(); mutate(ed.note.pages); const a = ed.note.pages.slice();
  ed.undo.push({ k: 'pages', b, a }); ed.redo.length = 0; rebuildAfterPages(); changed(null);
}
function addPageAt(idx, bg) {
  const ref = (ed.pvs[Math.max(0, idx - 1)] || ed.pvs[0] || { meta: { w: 595, h: 842 } }).meta;
  const portrait = ref.w <= ref.h;
  const w = ref.k === 'pdf' ? (portrait ? 595 : 842) : ref.w, ht = ref.k === 'pdf' ? (portrait ? 842 : 595) : ref.h;
  pagesOp(pages => pages.splice(idx, 0, { id: uid(), k: 'blank', w, h: ht, bg }));
  requestAnimationFrame(() => goToPage(idx)); toast(`Sayfa ${idx + 1} eklendi`, 1400);
}
function addPagePicker(anchor, idx) {
  openPop(anchor, () => {
    const grid = h('div', { class: 'tpls' });
    for (const bg of ['plain', 'lined', 'grid', 'dots']) {
      const cv = h('canvas', { width: 96, height: 128 }); drawBg(cv.getContext('2d'), { w: 96, h: 128, bg }, 1);
      grid.append(h('button', { type: 'button', class: 'tpl', onclick: () => { closePop(); addPageAt(idx, bg); } }, cv, BG_NAMES[bg]));
    }
    return h('div', { class: 'col' }, h('h3', null, idx >= ed.pvs.length ? 'Sona sayfa ekle' : `Sayfa ${idx + 1} olarak ekle`), grid);
  });
}
function duplicatePage(i) {
  const pv = ed.pvs[i]; if (!pv) return;
  const meta = { ...pv.meta, id: uid() }; const A = ed.note.ann[pv.meta.id];
  if (A) ed.note.ann[meta.id] = { s: A.s.map(s => ({ ...s, id: uid(), p: new Float32Array(s.p) })), t: A.t.map(t => ({ ...t, id: uid() })), i: (A.i || []).map(im => ({ ...im, id: uid() })), n: (A.n || []).map(n => ({ ...n, id: uid() })) };
  pagesOp(p => p.splice(i + 1, 0, meta)); requestAnimationFrame(() => goToPage(i + 1)); toast(`Sayfa ${i + 1} çoğaltıldı`, 1400);
}
function movePage(i, j) {
  if (i === j || j < 0 || j >= ed.pvs.length) return;
  pagesOp(p => { const [x] = p.splice(i, 1); p.splice(j, 0, x); });
}
function deletePages(idxs, after) {
  idxs = [...new Set(idxs)].sort((a, b) => a - b);
  if (!idxs.length) return;
  if (idxs.length >= ed.pvs.length) { toast('Notta en az bir sayfa kalmalı.'); return; }
  const t = idxs.length === 1 ? `Sayfa ${idxs[0] + 1} silinsin mi?` : `${idxs.length} sayfa silinsin mi?`;
  modal({ title: t, text: 'Sayfalar ve üzerindeki notlar kaldırılır. Geri al ile geri getirebilirsiniz.', actions: [{ label: 'Vazgeç' }, { label: 'Sil', kind: 'danger', onClick: () => { const ids = new Set(idxs.map(i => ed.pvs[i].meta.id)); pagesOp(p => { for (let k = p.length - 1; k >= 0; k--) if (ids.has(p[k].id)) p.splice(k, 1); }); toast(idxs.length === 1 ? 'Sayfa silindi · Geri al ile geri getirin' : `${idxs.length} sayfa silindi`, 2200); if (after) after(); } }] });
}
function toggleMark(i) {
  const pv = ed.pvs[i]; if (!pv) return; const n = ed.note; n.marks = (n.marks || []).filter(id => n.pages.some(p => p.id === id));
  const on = n.marks.includes(pv.meta.id);
  n.marks = on ? n.marks.filter(x => x !== pv.meta.id) : [...n.marks, pv.meta.id];
  scheduleSave(); refreshPanel(); if (pgridEl) renderPgrid(); updateMarkBtn();
  toast(on ? 'Yer imi kaldırıldı' : `Sayfa ${i + 1} yer imlerine eklendi`, 1400);
}
function updateMarkBtn() { const pv = ed.note && currentPage(); const b = $('#pMark'); if (b) b.classList.toggle('on', !!(pv && isMarked(pv))); }
function clearPage(i) {
  const pv = ed.pvs[i]; if (!pv) return;
  modal({ title: `Sayfa ${i + 1} temizlensin mi?`, text: 'Sayfadaki tüm çizimler, metinler ve görseller kaldırılır. Sayfanın kendisi kalır.', actions: [{ label: 'Vazgeç' }, { label: 'Temizle', kind: 'danger', onClick: () => { const pid = pv.meta.id, b = snap(pid); const A = ann(pid); A.s = []; A.t = []; A.i = []; A.n = []; renderLayer(pv); pushOp({ k: 'page', pid, b, a: snap(pid) }); requestFrame(true); refreshPanel(); } }] });
}
function pageMenu(anchor, i) {
  const pv = ed.pvs[i]; if (!pv) return; const n = ed.pvs.length;
  openPop(anchor, () => menu([
    { label: 'Sayfaya git', icon: IC.chevR, sub: `Sayfa ${i + 1} / ${n}`, onClick: () => { closePgrid(); goToPage(i); afterJump(); } },
    { label: 'Sonrasına sayfa ekle…', icon: IC.plus, onClick: () => addPagePicker(anchor.isConnected ? anchor : $('#pagesBtn'), i + 1) },
    { label: 'Önüne sayfa ekle…', icon: IC.plus, onClick: () => addPagePicker(anchor.isConnected ? anchor : $('#pagesBtn'), i) },
    { label: 'Sayfayı düzelt', icon: IC.fixText, sub: 'El yazısını yapay zekâ ile oku ve düzelt', onClick: () => { if (typeof closePgrid === 'function') closePgrid(); goToPage(i); setTimeout(() => pageFixStart(ed.pvs[i]), 200); } },
    flowCan(i) && i < n - 1 ? { label: 'Boşlukları kapat', icon: IC.upArrow, sub: 'Sonraki not sayfaları buradan devam eder', onClick: () => { if (typeof closePgrid === 'function') closePgrid(); flowPages(i); } } : null,
    { label: 'Çoğalt', icon: IC.dup, onClick: () => duplicatePage(i) },
    { label: isMarked(pv) ? 'Yer imini kaldır' : 'Yer imi ekle', icon: IC.bookmark, onClick: () => toggleMark(i) },
    i > 0 ? { label: 'Yukarı taşı', icon: IC.upArrow, onClick: () => movePage(i, i - 1) } : null,
    i < n - 1 ? { label: 'Aşağı taşı', icon: IC.downArrow, onClick: () => movePage(i, i + 1) } : null,
    i > 1 ? { label: 'Başa taşı', icon: IC.upArrow, onClick: () => movePage(i, 0) } : null,
    i < n - 2 ? { label: 'Sona taşı', icon: IC.downArrow, onClick: () => movePage(i, n - 1) } : null,
    { label: 'Sayfayı temizle', icon: IC.eraser, sub: 'Notları kaldırır, sayfa kalır', onClick: () => clearPage(i) },
    '-',
    { label: 'Sayfayı sil', icon: IC.trash, danger: true, disabled: n <= 1, onClick: () => deletePages([i]) }
  ]));
}
$('#pAdd').addEventListener('click', () => { const cur = currentPage(); addPagePicker($('#pAdd'), cur ? ed.pvs.indexOf(cur) + 1 : ed.pvs.length); });
$('#pDel').addEventListener('click', () => { const i = ed.pvs.indexOf(currentPage()); if (i >= 0) deletePages([i]); });
$('#pMark').addEventListener('click', () => { const i = ed.pvs.indexOf(currentPage()); if (i >= 0) toggleMark(i); });
$('#pGrid').addEventListener('click', openPgrid);
$('#addEnd').addEventListener('click', () => addPagePicker($('#addEnd'), ed.pvs.length));

/* Belgenin sonunda "Sayfa ekle" düğmesi (çerçeve başına konumlanır) */
function placeAddEnd() {
  const b = $('#addEnd'); if (!ed.pvs.length) { b.hidden = true; return; }
  const last = ed.pvs[ed.pvs.length - 1], v = ed.view;
  const y = v.ty + (last.y + last.meta.h) * v.z + 14;
  const show = !S.prefs.readOnly && !PHONE && y > 40 && y < ed.H - 50 && !ed.capture;
  if (b.hidden === show) b.hidden = !show;
  $('#pager').classList.toggle('away', show);
  if (show) { b.style.top = y + 'px'; b.style.left = v.tx + 'px'; }
}

/* ---------- yer imleri ---------- */
function renderMarks() {
  const list = $('#plist'); list.innerHTML = ''; list.className = 'plist';
  const ids = (ed.note.marks || []);
  const marked = ed.pvs.map((pv, i) => ({ pv, i })).filter(x => ids.includes(x.pv.meta.id));
  if (!marked.length) { list.append(h('p', { class: 'notice pempty' }, 'Yer imi yok. Bir sayfadayken alttaki yer imi düğmesine ya da sayfanın ⋮ menüsüne dokunun.'), h('button', { type: 'button', class: 'btn small', onclick: () => { const i = ed.pvs.indexOf(currentPage()); if (i >= 0) toggleMark(i); } }, icon(IC.bookmark), 'Bu sayfayı ekle')); return; }
  const io = observeThumbs(list);
  for (const { pv, i } of marked) {
    const { b, holder } = thumbItem(pv, i);
    b.addEventListener('click', () => { goToPage(i); afterJump(); });
    list.append(b); io.observe(holder);
  }
}

/* ---------- içindekiler (PDF anahattı) ---------- */
async function renderToc() {
  const list = $('#plist'); list.innerHTML = ''; list.className = 'plist toc';
  if (!ed.pdf) { list.append(h('p', { class: 'notice pempty' }, 'Bu notta içindekiler yok. Önemli sayfalara yer imi ekleyerek hızlıca dönebilirsiniz.')); return; }
  list.append(h('p', { class: 'notice pempty' }, 'Yükleniyor…'));
  let ol = null; try { ol = await ed.pdf.getOutline(); } catch (e) { }
  if (S.panelTab !== 'toc') return;
  list.innerHTML = '';
  if (!ol || !ol.length) { list.append(h('p', { class: 'notice pempty' }, 'Bu PDF’te içindekiler (anahat) bulunmuyor.')); return; }
  const add = (items, depth) => {
    for (const it of items) {
      const b = h('button', { type: 'button', class: 'tocitem', style: { paddingLeft: (10 + Math.min(depth, 5) * 14) + 'px' } }, h('span', null, it.title || '—'));
      b.addEventListener('click', () => jumpDest(it.dest));
      list.append(b);
      if (it.items && it.items.length) add(it.items, depth + 1);
    }
  };
  add(ol, 0);
}
async function jumpDest(dest) {
  try {
    if (typeof dest === 'string') dest = await ed.pdf.getDestination(dest);
    if (!Array.isArray(dest)) return;
    const ref = dest[0]; const pi = typeof ref === 'number' ? ref : await ed.pdf.getPageIndex(ref);
    const idx = ed.pvs.findIndex(pv => pv.meta.k === 'pdf' && pv.meta.i === pi + 1);
    if (idx < 0) { toast('Bu bölümün sayfası notta yok (silinmiş olabilir).'); return; }
    const pv = ed.pvs[idx]; let yy = 0;
    if (dest[1] && dest[1].name === 'XYZ' && typeof dest[3] === 'number' && pv.meta.m) { const m = pv.meta.m; yy = clamp(m[1] * (dest[2] || 0) + m[3] * dest[3] + m[5], 0, pv.meta.h); }
    else if (dest[1] && dest[1].name === 'FitH' && typeof dest[2] === 'number' && pv.meta.m) { const m = pv.meta.m; yy = clamp(m[3] * dest[2] + m[5], 0, pv.meta.h); }
    stopInertia(); setView(ed.view.z, ed.view.tx, MARGIN - (pv.y + Math.max(0, yy - 12)) * ed.view.z); afterJump();
  } catch (e) { toast('Bu bölüme gidilemedi.'); }
}

/* ---------- belgede arama ---------- */
const normCh = s => s.toLocaleLowerCase('tr').replace(/\s+/g, '');
let findState = { q: '', results: [], busy: 0 };
function renderFind() {
  const box = $('#pfind'); box.innerHTML = '';
  const inp = h('input', { type: 'search', id: 'findIn', placeholder: 'Belgede ara', autocomplete: 'off', value: findState.q, enterkeyhint: 'search' });
  const form = h('form', { class: 'search', onsubmit: e => { e.preventDefault(); runFind(inp.value); } }, icon(IC.search), inp);
  box.append(form);
  let t = 0; inp.addEventListener('input', () => { clearTimeout(t); t = setTimeout(() => runFind(inp.value), 380); });
  renderFindResults();
  setTimeout(() => inp.focus(), 60);
}
async function pageTextIndex() {
  if (ed.textIdx && ed.textIdx.note === ed.note) return ed.textIdx;
  const idx = { note: ed.note, pdf: new Map() };
  if (ed.pdf) {
    for (let i = 1; i <= ed.pdf.numPages; i++) {
      try { const pg = await getPdfPage(i); const tc = await pg.getTextContent(); idx.pdf.set(i, tc.items.map(it => (it.str || '') + (it.hasEOL ? '\n' : '')).join('')); } catch (e) { idx.pdf.set(i, ''); }
      if (i % 20 === 0) { const r = $('#plist .findprog'); if (r) r.textContent = `Sayfalar taranıyor ${i}/${ed.pdf.numPages}…`; await new Promise(r2 => setTimeout(r2, 0)); }
    }
  }
  ed.textIdx = idx; return idx;
}
function looseRe(q) { return new RegExp([...q.replace(/\s+/g, '')].map(c => c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s*'), 'giu'); }
async function runFind(q) {
  q = (q || '').trim(); findState.q = q; const tok = ++findState.busy;
  if (q.length < 2) { findState.results = []; renderFindResults(); return; }
  const list = $('#plist'); list.innerHTML = ''; list.append(h('p', { class: 'notice pempty findprog' }, 'Aranıyor…'));
  const idx = await pageTextIndex(); if (tok !== findState.busy) return;
  const nq = normCh(q), re = looseRe(q.toLocaleLowerCase('tr')), out = [];
  ed.pvs.forEach((pv, i) => {
    const pdfText = pv.meta.k === 'pdf' ? (idx.pdf.get(pv.meta.i) || '') : '';
    if (pdfText) {
      const low = pdfText.toLocaleLowerCase('tr'); let k = 0; re.lastIndex = 0; let m;
      while ((m = re.exec(low)) && out.length < 300) { out.push({ i, kind: 'pdf', k: k++, snip: snippet(pdfText, m.index, m[0].length) }); if (m[0].length === 0) re.lastIndex++; }
    }
    const A = ed.note.ann[pv.meta.id];
    if (A) for (const t of [...A.t, ...(A.n || [])]) { const low = (t.text || '').toLocaleLowerCase('tr'); re.lastIndex = 0; const m = re.exec(low); if (m) out.push({ i, kind: 'note', t, snip: snippet(t.text, m.index, m[0].length) }); }
  });
  findState.results = out; renderFindResults();
}
function snippet(text, at, len) {
  const a = Math.max(0, at - 36), b = Math.min(text.length, at + len + 48);
  return { pre: (a > 0 ? '…' : '') + text.slice(a, at).replace(/\s+/g, ' '), hit: text.slice(at, at + len).replace(/\s+/g, ' '), post: text.slice(at + len, b).replace(/\s+/g, ' ') + (b < text.length ? '…' : '') };
}
function renderFindResults() {
  if (S.panelTab !== 'find') return;
  const list = $('#plist'); list.innerHTML = ''; list.className = 'plist finds';
  const r = findState.results;
  if (!findState.q || findState.q.length < 2) { list.append(h('p', { class: 'notice pempty' }, ed.pdf ? 'PDF metninde ve sayfaya yazdığınız metin kutularında arar. El yazısı ve taranmış sayfalar aranamaz.' : 'Sayfalara yazdığınız metin kutularında arar.')); return; }
  if (!r.length) { list.append(h('p', { class: 'notice pempty' }, `“${findState.q}” bulunamadı.`)); return; }
  list.append(h('p', { class: 'notice pempty' }, r.length >= 300 ? '300+ sonuç' : `${r.length} sonuç`));
  for (const x of r) {
    const b = h('button', { type: 'button', class: 'finditem' }, h('small', null, `Sayfa ${x.i + 1}${x.kind === 'note' ? ' · not' : ''}`), h('span', null, x.snip.pre, h('mark', null, x.snip.hit), x.snip.post));
    b.addEventListener('click', () => showFind(x));
    list.append(b);
  }
}
async function showFind(x) {
  const pv = ed.pvs[x.i]; if (!pv) return;
  if (x.kind === 'note') { stopInertia(); setView(ed.view.z, ed.view.tx, ed.H / 2 - (pv.y + x.t.y) * ed.view.z); afterJump(); return; }
  goToPage(x.i); afterJump();
  const div = await ensureTextLayer(pv); if (!div) return;
  // metin katmanındaki karakterleri boşluksuz dizip k'ıncı eşleşmeyi bul
  const nodes = []; const tw = document.createTreeWalker(div, NodeFilter.SHOW_TEXT); let n;
  while ((n = tw.nextNode())) nodes.push(n);
  const chars = []; let full = '';
  for (const nd of nodes) { const d = nd.data; for (let o = 0; o < d.length; o++) { if (/\s/.test(d[o])) continue; chars.push([nd, o]); full += d[o].toLocaleLowerCase('tr'); } }
  const nq = normCh(findState.q); let at = -1, from = 0;
  for (let k = 0; k <= x.k; k++) { at = full.indexOf(nq, from); if (at < 0) break; from = at + 1; }
  if (at < 0) at = full.indexOf(nq); if (at < 0) return;
  const s0 = chars[at], s1 = chars[Math.min(chars.length - 1, at + nq.length - 1)];
  const range = document.createRange(); range.setStart(s0[0], s0[1]); range.setEnd(s1[0], s1[1] + 1);
  textSelClear();
  TS.sel = { pv, div, anchor: null, focus: null, range, active: false };
  const rr = range.getBoundingClientRect(), sr = stage.getBoundingClientRect();
  const cy = (rr.top + rr.bottom) / 2 - sr.top;
  if (cy < 90 || cy > ed.H - 110) setView(ed.view.z, ed.view.tx, ed.view.ty + (ed.H * .4 - cy));
  requestAnimationFrame(() => { textSelDraw(); textSelBar(); });
}

/* =========================================================
   Tüm sayfalar ızgarası: dokun = git, basılı tut ve sürükle = sırala,
   Seç = çoklu silme / çoğaltma
   ========================================================= */
let pgridEl = null, pgridSel = null;
function openPgrid() {
  if (!ed.note) return; closePop(); if (narrowPanel()) setPanel(false);
  if (pgridEl) pgridEl.remove();
  pgridSel = null;
  pgridEl = h('div', { class: 'pgrid-back', role: 'dialog', 'aria-label': 'Tüm sayfalar' });
  $('#edView .ebody').append(pgridEl);
  renderPgrid();
}
function closePgrid() { if (pgridEl) { pgridEl.remove(); pgridEl = null; pgridSel = null; if (!$('#ppanel').hidden) refreshPanel(); } }
function renderPgrid() {
  const el = pgridEl; if (!el || !ed.note) return;
  const sc = el.querySelector('.pgrid'); const keepScroll = sc ? sc.scrollTop : 0;
  el.innerHTML = '';
  const sel = pgridSel;
  const head = h('div', { class: 'pgrid-head' },
    h('b', null, sel ? `${sel.size} sayfa seçildi` : `Tüm sayfalar · ${ed.pvs.length}`),
    sel ? h('button', { class: 'btn small', type: 'button', onclick: () => { pgridSel = sel.size === ed.pvs.length ? new Set() : new Set(ed.pvs.map((_, i) => i)); renderPgrid(); } }, sel.size === ed.pvs.length ? 'Hiçbiri' : 'Tümü') : null,
    h('button', { class: 'btn small' + (sel ? ' primary' : ''), type: 'button', onclick: () => { pgridSel = sel ? null : new Set(); renderPgrid(); } }, icon(IC.checkSq), sel ? 'Bitti' : 'Seç'),
    sel ? null : h('button', { class: 'btn small', type: 'button', onclick: e => addPagePicker(e.currentTarget, ed.pvs.length) }, icon(IC.plus), 'Sayfa ekle'),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: closePgrid }, icon(IC.close)));
  const grid = h('div', { class: 'pgrid' });
  const io = observeThumbs(grid);
  ed.pvs.forEach((pv, i) => {
    const { b, holder } = thumbItem(pv, i, true);
    if (sel) { b.classList.toggle('sel', sel.has(i)); b.append(h('span', { class: 'chk' }, icon(IC.check))); }
    gridGestures(b, i, grid);
    grid.append(b); io.observe(holder);
  });
  el.append(head, grid);
  if (sel) el.append(h('div', { class: 'pgrid-foot' },
    h('button', { class: 'btn', type: 'button', disabled: !sel.size, onclick: () => { const idx = [...sel].sort((a, b) => a - b); const metas = idx.map(i => ({ src: ed.pvs[i].meta })); pagesOp(p => { let off = 0; idx.forEach((i, k) => { const m = metas[k].src; const nm = { ...m, id: uid() }; const A = ed.note.ann[m.id]; if (A) ed.note.ann[nm.id] = { s: A.s.map(s => ({ ...s, id: uid(), p: new Float32Array(s.p) })), t: A.t.map(t => ({ ...t, id: uid() })), i: (A.i || []).map(im => ({ ...im, id: uid() })), n: (A.n || []).map(n => ({ ...n, id: uid() })) }; p.splice(i + 1 + off, 0, nm); off++; }); }); pgridSel = new Set(); renderPgrid(); toast(`${idx.length} sayfa çoğaltıldı`, 1400); } }, icon(IC.dup), 'Çoğalt'),
    h('button', { class: 'btn', type: 'button', disabled: !sel.size, onclick: () => { [...sel].forEach(i => { const pv = ed.pvs[i]; const n = ed.note; n.marks = n.marks || []; if (!n.marks.includes(pv.meta.id)) n.marks.push(pv.meta.id); }); scheduleSave(); renderPgrid(); toast('Yer imlerine eklendi', 1200); } }, icon(IC.bookmark), 'Yer imi'),
    h('button', { class: 'btn danger', type: 'button', disabled: !sel.size, onclick: () => deletePages([...sel], () => { pgridSel = new Set(); renderPgrid(); }) }, icon(IC.trash), 'Sil')));
  const g2 = el.querySelector('.pgrid'); if (g2) g2.scrollTop = keepScroll;
}
function gridGestures(cell, i, grid) {
  let st = null;
  cell.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    st = { id: e.pointerId, x: e.clientX, y: e.clientY, mode: 'wait', sy: grid.scrollTop, t: now(), vy: 0, ly: e.clientY, lt: now() };
    try { cell.setPointerCapture(e.pointerId); } catch (er) { }
    st.timer = setTimeout(() => { if (st && st.mode === 'wait' && !pgridSel) startGridDrag(e); }, 380);
  });
  const startGridDrag = () => {
    st.mode = 'drag'; try { navigator.vibrate && navigator.vibrate(10); } catch (e) { }
    const r = cell.getBoundingClientRect();
    st.ghost = cell.cloneNode(true); st.ghost.classList.add('ghost');
    Object.assign(st.ghost.style, { width: r.width + 'px', left: r.left + 'px', top: r.top + 'px' });
    const c0 = cell.querySelector('canvas'), c1 = st.ghost.querySelector('canvas'); if (c0 && c1) { c1.width = c0.width; c1.height = c0.height; c1.getContext('2d').drawImage(c0, 0, 0); }
    st.off = { x: st.x - r.left, y: st.y - r.top };
    document.body.append(st.ghost); cell.classList.add('lifted'); st.target = i;
  };
  cell.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.x, dy = e.clientY - st.y;
    if (st.mode === 'wait' && Math.hypot(dx, dy) > 8) { clearTimeout(st.timer); st.mode = 'scroll'; }
    if (st.mode === 'scroll') { const t = now(); st.vy = (e.clientY - st.ly) / Math.max(1, t - st.lt); st.ly = e.clientY; st.lt = t; grid.scrollTop = st.sy - dy; }
    else if (st.mode === 'drag') {
      st.ghost.style.left = (e.clientX - st.off.x) + 'px'; st.ghost.style.top = (e.clientY - st.off.y) + 'px';
      const gr = grid.getBoundingClientRect();
      if (e.clientY < gr.top + 50) grid.scrollTop -= 12; else if (e.clientY > gr.bottom - 50) grid.scrollTop += 12;
      const cells = [...grid.querySelectorAll('.pitem')]; let best = st.target, bd = 1e9;
      cells.forEach((c, k) => { const rr = c.getBoundingClientRect(); const d = Math.hypot(e.clientX - (rr.left + rr.width / 2), e.clientY - (rr.top + rr.height / 2)); if (d < bd) { bd = d; best = k; } });
      st.target = best; cells.forEach((c, k) => { c.classList.toggle('dropb', k === best && best < i); c.classList.toggle('dropa', k === best && best > i); });
    }
  });
  const end = e => {
    if (!st || e.pointerId !== st.id) return; clearTimeout(st.timer);
    const s = st; st = null;
    if (s.mode === 'drag') { s.ghost.remove(); cell.classList.remove('lifted'); if (e.type !== 'pointercancel' && s.target !== i) { movePage(i, s.target); toast(`Sayfa ${i + 1} → ${s.target + 1}`, 1200); } else renderPgrid(); return; }
    if (s.mode === 'scroll') { let vy = s.vy * 16; const step = () => { if (Math.abs(vy) < .5 || !grid.isConnected) return; grid.scrollTop -= vy; vy *= .93; requestAnimationFrame(step); }; if (now() - s.lt < 80) requestAnimationFrame(step); return; }
    if (e.type === 'pointercancel' || e.target.closest('.pmore')) return;
    if (pgridSel) { if (pgridSel.has(i)) pgridSel.delete(i); else pgridSel.add(i); renderPgrid(); return; }
    closePgrid(); goToPage(i);
  };
  cell.addEventListener('pointerup', end); cell.addEventListener('pointercancel', end);
  cell.addEventListener('contextmenu', e => e.preventDefault());
}
