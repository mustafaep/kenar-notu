'use strict';
/* =========================================================
   Düzenleyici: görünüm, katmanlar, S Pen girdisi, araçlar
   ========================================================= */
const libView = $('#libView'), edView = $('#edView');
const stage = $('#stage'), world = $('#world'), selw = $('#selw');
const hlc = $('#hlc'), inkc = $('#inkc'), livec = $('#livec');
const hlx = hlc.getContext('2d'), inkx = inkc.getContext('2d');
let livex = null; try { livex = livec.getContext('2d', { desynchronized: true }); } catch (e) { } if (!livex) livex = livec.getContext('2d');
const GAP = 28, MARGIN = 24, MAXPX = 8e6;
const ed = {
  note: null, pdf: null, pdfBytes: null, pvs: [], view: { z: 1, tx: 0, ty: 0 }, W: 0, H: 0, rect: null, fitZ: 1, maxW: 595, totalH: 0,
  tool: 'pen', undo: [], redo: [], sel: null, editing: null, live: null, lasso: null, erase: null, capture: null,
  ptrs: new Map(), touches: new Map(), pinch: null, touchMax: 0, tapStart: 0, tapMoved: 0, inertia: 0,
  lastPen: -1e9, inkDirty: false, frameReq: 0, settleT: 0, saveT: 0, syncT: 0, pageVer: new Map(), readout: null, curPage: 0
};
function ann(pid) { let a = ed.note.ann[pid]; if (!a) a = ed.note.ann[pid] = { s: [], t: [], i: [], n: [] }; if (!a.i) a.i = []; if (!a.n) a.n = []; return a; }

/* ---------- sayfa düzeni ---------- */
function buildPages() {
  world.innerHTML = ''; stickw.innerHTML = ''; ed.pvs = [];
  for (const meta of ed.note.pages) {
    const el = h('div', { class: 'page' }); const tl = h('div', { class: 'tl' }); el.append(tl);
    ed.pvs.push({ meta, el, tl, cv: null, cvS: 0, token: 0, pending: 0, x: 0, y: 0, tmap: new Map(), imap: new Map() });
    world.append(el);
  }
  layout();
  for (const pv of ed.pvs) renderLayer(pv);
}
function layout() {
  let y = 0, maxW = 0;
  for (const pv of ed.pvs) {
    const { w, h: ht } = pv.meta; pv.x = -w / 2; pv.y = y; y += ht + GAP; maxW = Math.max(maxW, w);
    Object.assign(pv.el.style, { left: pv.x + 'px', top: pv.y + 'px', width: w + 'px', height: ht + 'px' });
  }
  ed.totalH = Math.max(0, y - GAP); ed.maxW = maxW || 595;
}
function computeFit() { return Math.max(.05, Math.min((ed.W - 2 * MARGIN) / ed.maxW, 1000 / ed.maxW)); }
function clampView() {
  const v = ed.view, cw = ed.maxW * v.z, ch = ed.totalH * v.z;
  v.tx = cw + 2 * MARGIN <= ed.W ? ed.W / 2 : clamp(v.tx, ed.W - MARGIN - cw / 2, MARGIN + cw / 2);
  v.ty = ch + 2 * MARGIN + 64 <= ed.H ? Math.max(MARGIN, (ed.H - ch - 64) / 2) : clamp(v.ty, ed.H - MARGIN - 64 - ch, MARGIN);
}
function zLimits() { return [Math.max(.08, ed.fitZ * .4), Math.max(ed.fitZ * 6, 5)]; }
function setView(z, tx, ty) { const [a, b] = zLimits(); ed.view.z = clamp(z, a, b); ed.view.tx = tx; ed.view.ty = ty; clampView(); applyView(); }
function zoomAt(z, sx, sy) { const v = ed.view; const [a, b] = zLimits(); z = clamp(z, a, b); const wx = (sx - v.tx) / v.z, wy = (sy - v.ty) / v.z; setView(z, sx - wx * z, sy - wy * z); }
function fitWidth() { const v = ed.view; const cy = (ed.H / 2 - v.ty) / v.z; const z = ed.fitZ; setView(z, ed.W / 2, ed.H / 2 - cy * z); }
function applyView() {
  const { z, tx, ty } = ed.view; const tr = `translate(${tx}px,${ty}px) scale(${z})`;
  world.style.transform = tr; selw.style.transform = tr; stickw.style.transform = tr;
  stage.style.setProperty('--inv', (1 / z).toFixed(4));
  updateSelStyle();
  $('#zLbl').textContent = Math.round(z / ed.fitZ * 100) + '%';
  requestFrame(true);
  clearTimeout(ed.settleT); ed.settleT = setTimeout(settle, 170);
}
function requestFrame(ink) { if (ink) ed.inkDirty = true; if (!ed.frameReq) ed.frameReq = requestAnimationFrame(frame); }
function frame() {
  ed.frameReq = 0; if (!ed.note) return;
  updateVisible(false);
  if (ed.inkDirty) { ed.inkDirty = false; redrawInk(); }
  updatePager(); placeSelbar(); placeGrip(); placeAddEnd(); placeAiBar(); if (window.placeHandUi) placeHandUi(); if (window.placePageFixUi) placePageFixUi(); panSync();
  if (TS.sel) textSelDraw();
}
function settle() { if (ed.note) { updateVisible(true); savePos(); } }

/* ---------- kaldığın yer ---------- */
function readPos(id) { try { return (JSON.parse(localStorage.getItem('kn.pos') || '{}'))[id] || null; } catch (e) { return null; } }
function savePos() {
  if (!ed.note || !ed.W || !ed.pvs.length) return;
  const v = ed.view, topY = -v.ty / v.z;
  let pv = ed.pvs.find(p => p.y + p.meta.h > topY) || ed.pvs[ed.pvs.length - 1];
  const pos = { p: ed.pvs.indexOf(pv), r: +((topY - pv.y) / pv.meta.h).toFixed(4), z: +(v.z / ed.fitZ).toFixed(3), n: ed.pvs.length };
  try { const all = JSON.parse(localStorage.getItem('kn.pos') || '{}'); all[ed.note.id] = pos; localStorage.setItem('kn.pos', JSON.stringify(all)); } catch (e) { }
}
function restorePos() {
  const pos = ed.note && readPos(ed.note.id); if (!pos) return false;
  const pv = ed.pvs[Math.min(pos.p, ed.pvs.length - 1)]; if (!pv) return false;
  const z = ed.fitZ * clamp(pos.z || 1, .4, 6);
  setView(z, ed.W / 2, -(pv.y + (pos.r || 0) * pv.meta.h) * z);
  if (pos.p > 0) toast(`Sayfa ${pos.p + 1}’de kaldığınız yerden devam ediyorsunuz`, 2200);
  return true;
}
function sizeCanvases() {
  const d = DPR(), W = ed.W, H = ed.H;
  for (const c of [hlc, inkc, livec]) { c.width = Math.round(W * d); c.height = Math.round(H * d); c.style.width = W + 'px'; c.style.height = H + 'px'; }
}
function onResize() {
  if (edView.hidden || !ed.note) return;
  const r = stage.getBoundingClientRect(); if (r.width < 10 || r.height < 10) return;
  const oldFit = ed.fitZ, oldW = ed.W, v = ed.view; const cy = ed.H ? (ed.H / 2 - v.ty) / v.z : 0;
  ed.W = r.width; ed.H = r.height; ed.rect = r; sizeCanvases(); ed.fitZ = computeFit();
  if (oldW) { const z = v.z * ed.fitZ / oldFit; setView(z, ed.W / 2, ed.H / 2 - cy * z); } else applyView();
  requestFrame(true);
  if (ed.capture) captureResize();
  fitEbar();
}
/* Üst çubuk sığmazsa önce Kaydet yazısı gizlenir ve başlık daralır; yine sığmazsa araçlar alt satıra iner */
function fitEbar() {
  const bar = $('#edView .ebar'), t = $('#tools'); if (!bar || !t || !bar.offsetWidth) return;
  bar.classList.remove('tight', 'tight2');
  if (t.scrollWidth > t.clientWidth + 1) { bar.classList.add('tight'); if (t.scrollWidth > t.clientWidth + 1) bar.classList.replace('tight', 'tight2'); }
}
window.fitEbar = fitEbar;
new ResizeObserver(onResize).observe(stage);

/* ---------- sayfa raster katmanı (PDF/arka plan) ---------- */
const rq = []; let rqBusy = false;
function enqueue(pri, fn) { rq.push({ pri, fn }); runQueue(); }
async function runQueue() {
  if (rqBusy) return; rqBusy = true;
  while (rq.length) { rq.sort((a, b) => a.pri - b.pri); const t = rq.shift(); try { await t.fn(); } catch (e) { } }
  rqBusy = false;
}
const pdfPageCache = new Map();
function getPdfPage(i) { let p = pdfPageCache.get(i); if (!p) { p = ed.pdf.getPage(i); pdfPageCache.set(i, p); } return p; }
function wantScale(pv) { return Math.min(ed.view.z * DPR(), Math.sqrt(MAXPX / (pv.meta.w * pv.meta.h))); }
function updateVisible(settled) {
  const v = ed.view; const top = -ed.H * .6, bot = ed.H * 1.6;
  for (const pv of ed.pvs) {
    const sy = v.ty + pv.y * v.z, ey = sy + pv.meta.h * v.z; const vis = ey > top && sy < bot;
    if (!vis) { if (pv.cv || pv.pending) { if (pv.cv) pv.cv.remove(); pv.cv = null; pv.cvS = 0; pv.pending = 0; pv.token++; } continue; }
    const s = wantScale(pv);
    if (!pv.cv || (settled && Math.abs(pv.cvS - s) / s > .18)) {
      if (pv.pending === s) continue; pv.pending = s; const tok = ++pv.token;
      enqueue(Math.abs((sy + ey) / 2 - ed.H / 2), async () => {
        if (tok !== pv.token) return;
        const c = document.createElement('canvas');
        if (pv.meta.k === 'pdf' && ed.pdf) {
          const pg = await getPdfPage(pv.meta.i); if (tok !== pv.token) return;
          const vp = pg.getViewport({ scale: s }); c.width = Math.max(1, Math.floor(vp.width)); c.height = Math.max(1, Math.floor(vp.height));
          const ctx = c.getContext('2d', { alpha: false }); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
          await pg.render({ canvasContext: ctx, viewport: vp }).promise;
        } else { c.width = Math.max(1, Math.round(pv.meta.w * s)); c.height = Math.max(1, Math.round(pv.meta.h * s)); drawBg(c.getContext('2d'), pv.meta, s); }
        if (tok !== pv.token) return;
        pv.pending = 0;
        if (pv.cv) pv.cv.replaceWith(c); else pv.el.prepend(c);
        pv.cv = c; pv.cvS = s;
      });
    }
  }
}

/* ---------- mürekkep katmanı (ekran çözünürlüğünde) ---------- */
function pageTransform(ctx, pv) { const d = DPR(), v = ed.view; ctx.setTransform(d * v.z, 0, 0, d * v.z, d * (v.tx + pv.x * v.z), d * (v.ty + pv.y * v.z)); }
function clipPage(ctx, pv) { ctx.beginPath(); ctx.rect(0, 0, pv.meta.w, pv.meta.h); ctx.clip(); }
function redrawInk() {
  const v = ed.view;
  for (const c of [hlx, inkx]) { c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, hlc.width, hlc.height); }
  for (const pv of ed.pvs) {
    const sy = v.ty + pv.y * v.z; if (sy > ed.H || sy + pv.meta.h * v.z < 0) continue;
    const A = ed.note.ann[pv.meta.id]; if (!A || !A.s.length) continue;
    const vx0 = -v.tx / v.z - pv.x, vy0 = -v.ty / v.z - pv.y, vx1 = vx0 + ed.W / v.z, vy1 = vy0 + ed.H / v.z;
    for (const c of [hlx, inkx]) { c.save(); pageTransform(c, pv); clipPage(c, pv); }
    for (const s of A.s) {
      const ctx = s.t === 'hl' ? hlx : inkx; const m = ed.sel && ed.sel.ids.has(s) ? ed.sel.m : null;
      if (m) { ctx.save(); ctx.transform(m[0], m[1], m[2], m[3], m[4], m[5]); paintStroke(ctx, s); ctx.restore(); continue; }
      const b = strokeBB(s); if (b.x1 < vx0 || b.x0 > vx1 || b.y1 < vy0 || b.y0 > vy1) continue;
      paintStroke(ctx, s);
    }
    hlx.restore(); inkx.restore();
  }
}
function paintCommitted(pv, s) { const ctx = s.t === 'hl' ? hlx : inkx; ctx.save(); pageTransform(ctx, pv); clipPage(ctx, pv); paintStroke(ctx, s); ctx.restore(); }

/* ---------- metin ve görsel katmanı ---------- */
/* metin kutusunun en geniş hâli: düzenlenen sayfada sağ boşluk korunur (t.mw), yoksa sayfa kenarına kadar */
const tMaxW = (pv, t) => t.mw ? Math.max(40, Math.min(t.mw, pv.meta.w - t.x - 2)) : Math.max(40, pv.meta.w - t.x - 6);
function styleTbox(el, t) { Object.assign(el.style, { left: t.x + 'px', top: t.y + 'px', fontSize: t.size + 'px', color: t.color, fontFamily: FONTS[t.font] || FONTS.sans, fontWeight: String(tWeight(t)) }); }
function styleIbox(el, im) { Object.assign(el.style, { left: im.x + 'px', top: im.y + 'px', width: im.w + 'px', height: im.h + 'px' }); }
function renderLayer(pv) {
  pv.tl.innerHTML = ''; pv.tmap.clear(); pv.imap.clear();
  const A = ed.note.ann[pv.meta.id]; if (!A) { renderStickies(pv); return; }
  for (const im of A.i || []) { const el = h('img', { class: 'ibox', src: im.src, alt: '', draggable: 'false' }); styleIbox(el, im); pv.tl.append(el); pv.imap.set(im.id, el); }
  for (const t of A.t) {
    const el = h('div', { class: 'tbox' }); el.textContent = t.text; el.dataset.id = t.id; styleTbox(el, t);
    el.style.maxWidth = tMaxW(pv, t) + 'px';
    pv.tl.append(el); pv.tmap.set(t.id, el);
    if (!t.w) { t.w = el.offsetWidth; t.h = el.offsetHeight; }
  }
  renderStickies(pv);
}

/* =========================================================
   Geri al / yinele ve değişiklik takibi
   ========================================================= */
function snap(pid) { const A = ann(pid); return { s: A.s.slice(), t: A.t.slice(), i: A.i.slice(), n: A.n.slice() }; }
function pvById(pid) { return ed.pvs.find(p => p.meta.id === pid); }
function pushOp(op) { ed.undo.push(op); if (ed.undo.length > 300) ed.undo.shift(); ed.redo.length = 0; changed(op); }
function changed(op) {
  const bump = pid => ed.pageVer.set(pid, (ed.pageVer.get(pid) || 0) + 1);
  if (op) { if (op.k === 'page') bump(op.pid); if (op.k === 'multi') op.ops.forEach(o => bump(o.pid)); }
  updateUndoBtns(); scheduleSave(); bumpNoteVer(ed.note);
  if (ed.note.od) { ed.note.od.dirty = true; if (ed.note.od.state !== 'conflict' && ed.note.od.state !== 'readonly' && !syncRuns.get(ed.note)) renderStatus('pending'); if (S.od.auto) { clearTimeout(ed.syncT); ed.syncT = setTimeout(autoSync, ed.note.od.kind === 'saf' && ed.note.od.place === 'OneDrive' ? 30000 : 12000); } }
  else renderStatus('local');
}
function applyOp(op, side) {
  if (op.k === 'multi') { op.ops.forEach(o => applyOp(o, side)); return; }
  if (op.k === 'page') { const A = ann(op.pid); const d = op[side]; A.s = d.s.slice(); A.t = d.t.slice(); A.i = (d.i || []).slice(); A.n = (d.n || []).slice(); const pv = pvById(op.pid); if (pv) renderLayer(pv); }
  if (op.k === 'pages') { ed.note.pages = op[side].slice(); rebuildAfterPages(); }
}
function undo() { finishAll(); const op = ed.undo.pop(); if (!op) return; applyOp(op, 'b'); ed.redo.push(op); changed(op); requestFrame(true); refreshPanel(); }
function redo() { finishAll(); const op = ed.redo.pop(); if (!op) return; applyOp(op, 'a'); ed.undo.push(op); changed(op); requestFrame(true); refreshPanel(); }
function updateUndoBtns() { $('#undoBtn').disabled = !ed.undo.length; $('#redoBtn').disabled = !ed.redo.length; }
function finishAll() { finishText(); finishSticky(); clearSel(); }

/* ---------- kaydetme ve OneDrive eşitleme ---------- */
function scheduleSave() { clearTimeout(ed.saveT); ed.saveT = setTimeout(() => saveNote(), 900); }
async function saveNote(withThumb) {
  clearTimeout(ed.saveT); if (!ed.note) return;
  const n = ed.note; n.updated = Date.now();
  let thumb;
  if (withThumb) { try { const c = await renderThumb(n.pages[0], n.ann[n.pages[0].id], ed.pdf, 240); thumb = c.toDataURL('image/jpeg', .82); } catch (e) { } }
  await persistNoteRecord(n, thumb);
}
async function autoSync() {
  if (!ed.note || !ed.note.od || !ed.note.od.dirty || ed.note.od.state === 'conflict' || ed.note.od.state === 'readonly' || ed.note.od.canWrite === false && ed.note.od.mode !== 'copy') { if (ed.note && ed.note.od && ed.note.od.canWrite === false) renderStatus('readonly'); return; }
  if (ed.live || ed.editing || ed.ptrs.size) { clearTimeout(ed.syncT); ed.syncT = setTimeout(autoSync, 4000); return; }
  await saveNote(); await syncNote(ed.note, ed.pdfBytes);
}
async function syncNow() {
  if (!ed.note) return; finishAll();
  if (!ed.note.od) { openOneDrive({ mode: 'save', note: ed.note, bytes: ed.pdfBytes }); return; }
  if (ed.note.od.kind !== 'saf' && !OD.signedIn()) { openOneDrive(); return; }
  await saveNote();
  const r = await syncNote(ed.note, ed.pdfBytes);
  if (r === 'ok') toast((ed.note.od.kind === 'saf' && ed.note.od.place !== 'OneDrive' ? 'Dosyaya' : 'OneDrive’a') + ' kaydedildi');
  else if (r === 'wait') toast('OneDrive önceki kaydı hâlâ yüklüyor; bitince otomatik kaydedilecek.', 3200);
  else if (r === 'conflict') resolveConflict(ed.note, ed.pdfBytes);
  else if ((r === 'error' || r === 'readonly') && ed.note.od.kind === 'saf') safErrorDialog(ed.note, ed.pdfBytes);
}
let busyTick = 0;
function renderStatus(st, err) {
  const el = $('#status'); if (!el || !ed.note) return;
  if (st !== 'busy') { clearInterval(busyTick); busyTick = 0; ed.busyAt = 0; }
  else if (!busyTick) { ed.busyAt = Date.now(); busyTick = setInterval(() => { const sp = $('#status span'); const n = Math.round((Date.now() - ed.busyAt) / 1000); if (sp && ed.note && ed.note.od && n >= 3) sp.textContent = (ed.note.od.kind === 'saf' && ed.note.od.place !== 'OneDrive' ? 'Dosyaya' : 'OneDrive’a') + ' kaydediliyor… ' + n + ' sn' + (n > 20 ? ' · durum için dokunun' : ''); }, 1000); }
  const od = ed.note.od; el.className = 'status'; el.innerHTML = ''; el.title = '';
  let ic = IC.check, txt = 'Bu tablete kaydedildi';
  if (od) {
    st = st || od.state || (od.dirty ? 'pending' : 'synced');
    const P = od.kind === 'saf' && od.place !== 'OneDrive' ? 'Dosyaya' : 'OneDrive’a';
    const map = {
      synced: [IC.cloudOk, P + ' kaydedildi' + (od.syncedAt ? ' · ' + fmtDate(od.syncedAt) : ''), 'ok'],
      pending: [IC.cloud, S.od.auto ? 'Değişiklikler birazdan ' + P + ' yazılacak' : P + ' kaydetmek için dokunun', ''],
      busy: [IC.sync, P + ' kaydediliyor…', 'busy'],
      uploading: [IC.cloud, 'OneDrive önceki kaydı yüklüyor · bitince kaydedilecek', ''],
      conflict: [IC.cloudOff, 'Dosya başka bir yerde değişmiş · çözmek için dokunun', 'warn'],
      error: [IC.cloudOff, P + ' yazılamadı · tekrar denemek için dokunun', 'warn'],
      offline: [IC.cloudOff, 'Çevrimdışı · bağlantı gelince eşitlenecek', 'warn'],
      signin: [IC.cloudOff, 'OneDrive’a giriş yapın · dokunun', 'warn'],
      readonly: [IC.cloudOff, 'Salt okunur · kaydetmek için dokunun', 'warn'],
      local: [IC.cloud, 'Bekliyor', '']
    };
    const m = map[st] || map.pending; ic = m[0]; txt = (od.mode === 'copy' ? 'Notlu kopya · ' : '') + m[1]; if (m[2]) el.classList.add(m[2]);
    if (err && err.message) el.title = err.message;
  }
  el.append(icon(ic), h('span', null, txt));
}
$('#status').addEventListener('click', () => {
  if (!ed.note || !ed.note.od) return;
  if (syncRuns.get(ed.note)) { busyDialog(ed.note, ed.pdfBytes); return; }
  if (ed.note.od.state === 'conflict') resolveConflict(ed.note, ed.pdfBytes);
  else if ((ed.note.od.state === 'error' || ed.note.od.state === 'readonly') && ed.note.od.kind === 'saf') safErrorDialog(ed.note, ed.pdfBytes);
  else syncNow();
});
function busyDialog(note, bytes) {
  const n = ed.busyAt ? Math.round((Date.now() - ed.busyAt) / 1000) : 0;
  modal({ title: 'Kaydetme sürüyor', text: `Dosya ${n} saniyedir ${note.od.place === 'OneDrive' || note.od.kind !== 'saf' ? 'OneDrive’a' : 'konumuna'} yazılıyor. Büyük PDF’lerde OneDrive uygulaması yüklemeyi bitirene kadar bekletebilir; 2 dakika içinde bitmezse işlem durdurulur ve size seçenek sunulur. Notlarınız tablette zaten kayıtlı.`,
    actions: [{ label: 'Beklemeye devam' }, note.od.kind === 'saf' ? { label: 'OneDrive uygulamasıyla kopya yükle', onClick: async () => { const out = await buildPdf(note, bytes); toast('OneDrive aynı adlı dosya varsa yanına “… 1.pdf” gibi yeni bir kopya oluşturur.', 4500); await uploadToOneDriveApp(safeName(note.od.name), new Blob([out], { type: 'application/pdf' })); } } : null].filter(Boolean) });
}
addEventListener('online', () => { if (ed.note && ed.note.od && ed.note.od.dirty && S.od.auto) autoSync(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && ed.note) { finishText(); saveNote(true); } });

/* =========================================================
   Not açma / kapama
   ========================================================= */
async function openNote(id) {
  const running = syncById.get(id);
  if (running) { const pr = progress('Önceki OneDrive kaydı bitiriliyor…'); try { await running; } catch (e) { } pr.done(); }
  const note = await Store.get('notes', id); if (!note) { toast('Not bulunamadı.'); renderLibrary(); return; }
  note.ann = note.ann || {};
  let pdf = null, bytes = null;
  if (note.pages.some(p => p.k === 'pdf')) {
    const rec = await Store.get('pdfs', id);
    if (rec) { bytes = rec.bytes; try { pdf = await loadPdf(bytes); } catch (e) { toast(e.message || 'PDF yüklenemedi.', 4000); } }
  }
  if (ed.pdf && ed.pdf !== pdf) { try { ed.pdf.destroy(); } catch (e) { } }
  Object.assign(ed, { note, pdf, pdfBytes: bytes, undo: [], redo: [], sel: null, editing: null, live: null, lasso: null, erase: null, W: 0, H: 0 });
  ed.pageVer = new Map(); pdfPageCache.clear(); thumbCache.clear(); rq.length = 0;
  const m = await Store.get('meta', id); if (m) { m.opened = Date.now(); await Store.put('meta', m); }
  libView.hidden = true; edView.hidden = false; closePop();
  $('#titleIn').value = note.name;
  buildPages(); buildTools(); updateUndoBtns(); setTool(S.lastTool || 'pen'); renderStatus(); setInvert(S.prefs.invert);
  $('#ppanel').hidden = !(S.panelOpen && innerWidth > 760); $('#pagesBtn').classList.toggle('on', !$('#ppanel').hidden);
  ed.textIdx = null; findState.results = []; findState.q = ''; closePgrid(); applyViewPrefs();
  requestAnimationFrame(() => {
    const r = stage.getBoundingClientRect(); ed.W = r.width; ed.H = r.height; ed.rect = r; sizeCanvases(); ed.fitZ = computeFit();
    if (!restorePos()) setView(ed.fitZ, ed.W / 2, MARGIN);
    refreshPanel();
  });
}
async function closeEditor() {
  if (ed.capture) captureEnd();
  savePos(); textSelClear(); if (window.handReset) handReset(); if (window.pageFixReset) pageFixReset(); if (window.speakStop) speakStop();
  finishAll(); closePop(); clearTimeout(ed.syncT);
  const n = ed.note; if (!n) return;
  const pr = progress('Kaydediliyor…');
  try {
    await saveNote(true);
    if (n.od && n.od.dirty && S.od.auto && (n.od.kind === 'saf' || (OD.signedIn() && navigator.onLine)) && n.od.state !== 'conflict') {
      // arka planda yaz: kitaplığa hemen dön, kart üzerindeki bulut simgesi durumu gösterir
      const bytes = ed.pdfBytes, P = n.od.kind === 'saf' && n.od.place !== 'OneDrive' ? 'Dosyaya' : 'OneDrive’a';
      toast(P + ' arka planda kaydediliyor…', 1800);
      syncNote(n, bytes).then(r => { if (r === 'ok') toast('“' + n.name + '” ' + (P === 'Dosyaya' ? 'dosyaya' : 'OneDrive’a') + ' kaydedildi', 2200); else if (r === 'readonly') toast('Not tablette kayıtlı. Dosya salt okunur; OneDrive’a kaydetmek için notu açıp durum satırına dokunun.', 5000); else if (r === 'wait') toast('OneDrive önceki kaydı yüklüyor; bitince “' + n.name + '” otomatik kaydedilecek.', 3200); else if (r !== 'skip') toast(P + ' yazılamadı; not tablette kayıtlı. Notu açıp durum satırına dokunarak tekrar deneyin.', 5000); if (!libView.hidden) renderLibrary(); });
      setTimeout(() => { if (!libView.hidden) renderLibrary(); }, 50);
    }
  } catch (e) { }
  pr.done();
  if (ed.pdf) { try { ed.pdf.destroy(); } catch (e) { } }
  ed.note = null; ed.pdf = null; ed.pdfBytes = null; world.innerHTML = ''; selw.innerHTML = ''; stickw.innerHTML = ''; ed.aiArea = null; ed.stickyEdit = null;
  edView.hidden = true; libView.hidden = false; renderLibrary();
}
$('#backBtn').addEventListener('click', closeEditor);
$('#titleIn').addEventListener('change', () => { const v = $('#titleIn').value.trim(); if (v && ed.note) { ed.note.name = v; scheduleSave(); } else if (ed.note) $('#titleIn').value = ed.note.name; });
$('#titleIn').addEventListener('keydown', e => { if (e.key === 'Enter') e.target.blur(); });

/* =========================================================
   Araç çubuğu
   ========================================================= */
const TOOL_DEF = [['pen', 'Kalem (P)', IC.pen], ['hl', 'Fosforlu kalem (H)', IC.hl], ['eraser', 'Silgi (E)', IC.eraser], ['lasso', 'Kement seçimi (L)', IC.lasso], ['text', 'Metin (T)', IC.text]];
/* Araç çubuğu öğeleri: kullanıcı sırasını ve görünürlüğünü değiştirebilir */
const TB_ITEMS = {
  pen: { name: 'Kalem', ic: IC.pen, tool: true }, hl: { name: 'Fosforlu kalem', ic: IC.hl, tool: true }, eraser: { name: 'Silgi', ic: IC.eraser, tool: true },
  lasso: { name: 'Kement seçimi', ic: IC.lasso, tool: true }, text: { name: 'Metin', ic: IC.text, tool: true },
  image: { name: 'Görsel ekle', ic: IC.image }, capture: { name: 'Ekran görüntüsü', ic: IC.capture }, invert: { name: 'Renkleri ters çevir', ic: IC.moon },
  dict: { name: 'Sözlük (yapay zekâ)', ic: IC.spark }, split: { name: 'Yan yana belge', ic: IC.split },
  readonly: { name: 'Okuma modu', ic: IC.lock }, aisel: { name: 'Alanı çevrele (YZ)', ic: IC.aisel, tool: true }, pagefix: { name: 'Sayfayı düzelt (YZ)', ic: IC.fixText }, sticky: { name: 'Yapışkan not', ic: IC.sticky }, find: { name: 'Belgede ara', ic: IC.search }, pgrid: { name: 'Tüm sayfalar', ic: IC.gridI }
};
const TB_DEFAULT = { order: ['pen', 'hl', 'eraser', 'lasso', 'aisel', 'pagefix', 'text', 'sticky', 'image', 'capture', 'invert', 'dict', 'split', 'readonly', 'find', 'pgrid'], hidden: ['invert', 'dict', 'readonly', 'find', 'pgrid', 'pagefix'], colors: true, favs: true };
function tbCfg() {
  const t = S.toolbar || {}; const order = (t.order || []).filter(k => TB_ITEMS[k]);
  TB_DEFAULT.order.forEach((k, i) => { if (order.includes(k)) return; const prev = TB_DEFAULT.order.slice(0, i).reverse().find(x => order.includes(x)); order.splice(prev ? order.indexOf(prev) + 1 : 0, 0, k); });
  return { order, hidden: (t.hidden || TB_DEFAULT.hidden).filter(k => TB_ITEMS[k]), colors: t.colors !== false, favs: t.favs !== false };
}
function buildTools() {
  const box = $('#tools'); box.innerHTML = '';
  const cfg = tbCfg();
  const pill = h('div', { class: 'pill', role: 'toolbar', 'aria-label': 'Araçlar' });
  let sepDone = false;
  for (const id of cfg.order) {
    if (cfg.hidden.includes(id)) continue;
    if (id === 'split' && EMBED) continue;
    const it = TB_ITEMS[id];
    if (!it.tool && !sepDone) { pill.append(h('span', { class: 'vsep' })); sepDone = true; }
    const b = h('button', { class: 'tool' + (id === 'capture' ? ' cap' : ''), type: 'button', 'aria-label': it.name, title: it.name, 'data-item': id }, icon(it.ic));
    if (it.tool) {
      b.dataset.tool = id; b.append(h('span', { class: 'caret' }));
      if (id === 'pen' || id === 'hl' || id === 'text') b.append(h('span', { class: 'tip' }));
      b.addEventListener('click', () => { if (ed.tool === id) openToolPop(id, b); else setTool(id); });
    } else b.addEventListener('click', () => toolbarAction(id, b));
    pill.append(b);
  }
  box.append(pill);
  if (cfg.colors) box.append(h('div', { class: 'quick', id: 'quick' }));
  if (cfg.favs) box.append(h('div', { class: 'favs', id: 'favs' }));
  refreshToolbar();
}
function toolbarAction(id, b) {
  if (id === 'image') { finishAll(); $('#imgIn').click(); }
  else if (id === 'capture') captureStart();
  else if (id === 'invert') setInvert(!S.prefs.invert);
  else if (id === 'dict') openDict('');
  else if (id === 'split') toggleSplit();
  else if (id === 'readonly') setReadOnly(!S.prefs.readOnly);
  else if (id === 'sticky') { finishAll(); addSticky(currentPage(), { edit: true }); }
  else if (id === 'find') { S.panelTab = 'find'; setPanel(true); }
  else if (id === 'pgrid') openPgrid();
  else if (id === 'pagefix') pageFixStart();
}
function setReadOnly(on, quiet) {
  S.prefs.readOnly = !!on; saveSettings(); if (ed.note) finishAll();
  $('#roChip').hidden = !S.prefs.readOnly;
  $$('.tool[data-item="readonly"]').forEach(x => x.classList.toggle('on', S.prefs.readOnly));
  stage.classList.toggle('ro', S.prefs.readOnly); requestFrame();
  if (on && !quiet) toast('Okuma modu: kalem sayfayı kaydırır, yazmaz', 2000);
}
$('#roOff').addEventListener('click', () => setReadOnly(false));
function applyViewPrefs() {
  $('#zoomCtl').hidden = !S.prefs.zoomCtl; $('#pager').hidden = !S.prefs.pager;
  setReadOnly(S.prefs.readOnly, true);
}
function setInvert(on) {
  S.prefs.invert = !!on; saveSettings();
  stage.classList.toggle('invert', S.prefs.invert);
  $$('.tool[data-item="invert"]').forEach(x => x.classList.toggle('on', S.prefs.invert));
}
function toolbarEditor() {
  const wrap = h('div', { class: 'col' });
  const render = () => {
    const cfg = tbCfg(); wrap.innerHTML = '';
    wrap.append(h('h3', null, 'Araç çubuğunu düzenle'), h('p', { class: 'notice' }, 'Göstermek istediklerinizi açın, okla sıralayın.'));
    const list = h('div', { class: 'tblist' });
    cfg.order.forEach((id, i) => {
      if (id === 'split' && EMBED) return;
      const it = TB_ITEMS[id], shown = !cfg.hidden.includes(id);
      const sw = h('input', { type: 'checkbox', class: 'switch', 'aria-label': it.name + ' görünsün' }); sw.checked = shown;
      sw.addEventListener('change', () => { const c = tbCfg(); c.hidden = sw.checked ? c.hidden.filter(x => x !== id) : [...c.hidden, id]; S.toolbar = c; saveSettings(); buildTools(); });
      const mv = d => { const c = tbCfg(); const j = i + d; if (j < 0 || j >= c.order.length) return; [c.order[i], c.order[j]] = [c.order[j], c.order[i]]; S.toolbar = c; saveSettings(); buildTools(); render(); };
      list.append(h('div', { class: 'tbrow' }, icon(it.ic), h('span', null, it.name),
        h('button', { class: 'ibtn', type: 'button', 'aria-label': it.name + ' yukarı', disabled: i === 0 ? true : null, onclick: () => mv(-1) }, icon(IC.upArrow)),
        h('button', { class: 'ibtn', type: 'button', 'aria-label': it.name + ' aşağı', disabled: i === cfg.order.length - 1 ? true : null, onclick: () => mv(1) }, icon(IC.downArrow)), sw));
    });
    wrap.append(list,
      EMBED ? null : h('small', { class: 'segcap' }, 'Kaydırma düğmeleri (sağ üstte)'),
      EMBED ? null : segRow([['off', 'Kapalı'], ['rd', 'Sağa ve aşağı'], ['all', 'Dört yön']], S.prefs.pan || 'rd', v => { S.prefs.pan = v; saveSettings(); buildPanBtns(); }, 'Kaydırma düğmeleri'),
      toggleRow('tbColors', 'Son kullanılan renkler', cfg.colors, v => { const c = tbCfg(); c.colors = v; S.toolbar = c; saveSettings(); buildTools(); }),
      toggleRow('tbFavs', 'Favori kalemler', cfg.favs, v => { const c = tbCfg(); c.favs = v; S.toolbar = c; saveSettings(); buildTools(); }));
    wrap.append(h('div', { class: 'lbl' }, 'Favori kalemler'));
    if (!S.fav.length) wrap.append(h('p', { class: 'notice' }, 'Henüz favori yok. Kalem ayarlarında “Favorilere ekle”ye dokunun.'));
    S.fav.forEach((fv, i) => {
      const cv = h('canvas', { width: 44, height: 28, style: { width: '44px', height: '28px' } });
      wrap.append(h('div', { class: 'tbrow' }, cv, h('span', null, fv.name ? fv.name + ' · ' + (FONT_LABEL[fv.text && fv.text.font] || '') + ' ' + String(fv.text ? fv.text.size : '').replace('.', ',') + ' pt' : (PEN_NAMES[fv.type] || 'Kalem') + ' · ' + String(fv.size).replace('.', ',') + ' pt'),
        h('button', { class: 'btn small danger', type: 'button', onclick: () => { S.fav.splice(i, 1); saveSettings(); refreshToolbar(); render(); toast('Favori kaldırıldı', 1200); } }, icon(IC.trash), 'Kaldır')));
      requestAnimationFrame(() => miniStroke(cv, fv.type, { size: Math.min(fv.size, fv.type === 'hl' ? 8 : 4), color: fv.color, o: fv.o }));
    });
    wrap.append(h('button', { class: 'btn small', type: 'button', onclick: () => { S.toolbar = JSON.parse(JSON.stringify(TB_DEFAULT)); saveSettings(); buildTools(); render(); } }, 'Varsayılana dön'));
  };
  render();
  return wrap;
}
function curColorTool() { return ed.tool === 'hl' ? S.hl : ed.tool === 'text' ? S.text : S.pen[S.pen.type]; }
function refreshToolbar() {
  $$('.tool[data-tool]').forEach(b => {
    const id = b.dataset.tool; b.classList.toggle('on', id === ed.tool); b.setAttribute('aria-pressed', id === ed.tool ? 'true' : 'false');
    const tip = b.querySelector('.tip'); if (tip) tip.style.background = id === 'pen' ? S.pen[S.pen.type].color : id === 'hl' ? S.hl.color : S.text.color;
  });
  const q = $('#quick'); if (q) {
    q.innerHTML = '';
    if (['pen', 'hl', 'text'].includes(ed.tool)) {
      const cur = curColorTool();
      S.recent.slice(0, S.fav.some(x => x.name) ? 3 : 5).forEach(c => q.append(h('button', { type: 'button', class: 'sw' + (c === (cur.color || '').toLowerCase() ? ' on' : ''), style: { background: c }, 'aria-label': 'Renk ' + c, onclick: () => setColor(c) })));
    }
  }
  const f = $('#favs'); if (f) {
    f.innerHTML = '';
    // stilli favoriler (adı olanlar) tek bir “stil” düğmesinde toplanır
    if (S.fav.some(x => x.name)) {
      const st = S.hand.style, cur = st && S.fav.find(x => x.name === st.name);
      const chip = h('button', { class: 'stylechip' + (cur ? ' on' : ''), type: 'button', title: 'Kalem stilleri', 'aria-label': 'Kalem stili: ' + (cur ? cur.name : 'seçilmedi') },
        h('i', { class: 'dot', style: { background: cur ? cur.color : 'conic-gradient(#1f2f5c 0 25%,#1b6e3c 0 50%,#167a7a 0 75%,#6b3fa0 0)' } }), h('span', null, cur ? cur.name : 'Stiller'), h('i', { class: 'caret' }));
      chip.addEventListener('pointerdown', () => { if (popAnchor === chip) popAnchorTapped(chip); });
      chip.addEventListener('click', () => openPop(chip, stylePicker));
      f.append(chip);
    }
    S.fav.forEach((fv, i) => {
      if (fv.name) return;
      const cv = h('canvas', { width: 30, height: 30 });
      const fb = h('button', { class: 'fav', type: 'button', title: (PEN_NAMES[fv.type] || '') + ' · favori (kaldırmak için basılı tutun)', 'aria-label': 'Favori kalem ' + (i + 1) }, cv);
      let lt = 0, long = false;
      fb.addEventListener('pointerdown', () => { long = false; clearTimeout(lt); lt = setTimeout(() => { long = true; favMenu(fb, i); }, 520); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => fb.addEventListener(t, () => clearTimeout(lt)));
      fb.addEventListener('contextmenu', e => { e.preventDefault(); long = true; favMenu(fb, i); });
      fb.addEventListener('click', () => { if (!long) applyFav(fv); long = false; });
      f.append(fb);
      requestAnimationFrame(() => miniStroke(cv, fv.type, { size: Math.min(fv.size, fv.type === 'hl' ? 8 : 4), color: fv.color, o: fv.o }));
    });
  }
  fitEbar();
}
function stylePicker() {
  const wrap = h('div', { class: 'col stylepick' }, h('h3', null, 'Kalem stilleri'),
    h('p', { class: 'notice' }, 'Kalem rengi ve düzeltilen yazının yazı tipi/boyutu birlikte seçilir. Boyutlar pt (sayfa birimi).'));
  const grid = h('div', { class: 'stylegrid' });
  S.fav.forEach((fv, i) => {
    if (!fv.name) return;
    const tx = fv.text || {}, on = S.hand.style && S.hand.style.name === fv.name;
    const sample = h('span', { class: 'sample', style: { color: fv.color, fontFamily: FONTS[tx.font] || FONTS.sans, fontWeight: String(tx.wt || 400), fontSize: Math.min(26, Math.max(15, (tx.size || 13) * 1.15)) + 'px' } }, (tx.prefix ? tx.prefix + ' ' : '') + fv.name);
    const meta = h('small', null, (FONT_LABEL[tx.font] || '') + ' ' + ({ 300: 'Light', 400: '', 700: 'Bold' }[tx.wt || 400] || '') + ' · ' + String(tx.size || '').replace('.', ',') + ' pt');
    const b = h('button', { class: 'styleitem' + (on ? ' on' : ''), type: 'button', onclick: () => { closePop(); applyFav(fv); } }, h('i', { class: 'dot', style: { background: fv.color } }), h('span', { class: 'st' }, sample, meta));
    let lt = 0; b.addEventListener('pointerdown', () => { clearTimeout(lt); lt = setTimeout(() => { closePop(); favMenu($('.stylechip') || b, i); }, 600); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => clearTimeout(lt)));
    grid.append(b);
  });
  wrap.append(grid,
    h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button', { class: 'btn small', type: 'button', onclick: () => { S.hand.style = null; saveSettings(); refreshToolbar(); closePop(); toast('Stil kapatıldı · düz kalem', 1400); } }, icon(IC.close), 'Stili kapat'),
      h('button', { class: 'btn small', type: 'button', onclick: () => { const have = new Set(S.fav.map(x => x.name).filter(Boolean)); S.fav = [...STYLE_FAVS.filter(x => !have.has(x.name)), ...S.fav]; saveSettings(); refreshToolbar(); closePop(); toast('Ders notu stilleri eklendi', 1400); } }, icon(IC.sync), 'Hazır stilleri geri yükle')));
  return wrap;
}
function favMenu(anchor, i) {
  const fv = S.fav[i]; if (!fv) return;
  openPop(anchor, () => menu([
    { label: 'Bu kalemi kullan', icon: IC.pen, onClick: () => applyFav(fv) },
    { label: 'Favorilerden kaldır', icon: IC.trash, danger: true, onClick: () => { S.fav.splice(i, 1); saveSettings(); refreshToolbar(); toast('Favori kaldırıldı', 1200); } },
    { label: 'Araç çubuğunu düzenle…', icon: IC.gear, onClick: () => openPop($('#moreBtn'), toolbarEditor) }
  ]));
}
function setColor(c) {
  if (ed.tool === 'text') { S.text.color = c; if (ed.editing) { ed.editing.t.color = c; styleTbox(ed.editing.el, ed.editing.t); } }
  else curColorTool().color = c;
  if (S.hand.style) S.hand.style = null;
  pushRecent(c); saveSettings(); refreshToolbar(); updateCursorStyle();
}
function applyFav(fv) {
  if (fv.type === 'hl') { Object.assign(S.hl, { size: fv.size, color: fv.color, o: fv.o }); setTool('hl'); }
  else { S.pen.type = fv.type; Object.assign(S.pen[fv.type], { size: fv.size, color: fv.color, o: fv.o }); setTool('pen'); }
  // Stilli favori: düzeltilen el yazısı ve Metin aracı bu yazı tipi ve boyutla yazar
  if (fv.text) { S.hand.style = { ...fv.text, name: fv.name || '', color: fv.color }; Object.assign(S.text, { font: fv.text.font, size: fv.text.size, color: fv.color, bold: (fv.text.wt || 400) >= 700, wt: fv.text.wt || 0 }); }
  else S.hand.style = null;
  saveSettings(); refreshToolbar();
  toast(fv.name ? fv.name + ' · ' + (FONT_LABEL[fv.text && fv.text.font] || 'Kalem') + ' ' + String(fv.text ? fv.text.size : fv.size).replace('.', ',') + ' pt' : (PEN_NAMES[fv.type] || 'Kalem') + ' seçildi', 1600);
}
function setTool(t) {
  if (t !== 'lasso' && ed.sel) clearSel();
  if (t !== 'text') finishText();
  finishSticky(); if (ed.aiArea) aiAreaClear();
  ed.tool = t; S.lastTool = t; saveSettings(); if (window.placeHandUi) placeHandUi();
  stage.classList.toggle('textmode', t === 'text');
  refreshToolbar(); closePop(); updateCursorStyle();
}

/* ---------- araç panelleri ---------- */
function openToolPop(id, anchor) {
  if (id === 'pen' || id === 'hl') openPop(anchor, () => penPanel(id));
  else if (id === 'eraser') openPop(anchor, eraserPanel);
  else if (id === 'lasso') openPop(anchor, () => h('div', { class: 'col' }, h('h3', null, 'Kement seçimi'), segRow([['free', 'Serbest', IC.free], ['rect', 'Dikdörtgen', IC.rect]], S.lasso.mode, v => { S.lasso.mode = v; saveSettings(); }), h('p', { class: 'notice' }, 'Çizgileri, metinleri ve görselleri çevreleyin ya da üzerine dokunun. Seçimi sürükleyerek taşıyın, köşeden boyutlandırın, üstteki tutamaçtan döndürün.')));
  else if (id === 'text') openPop(anchor, textPanel);
  else if (id === 'aisel') openPop(anchor, () => h('div', { class: 'col' }, h('h3', null, 'Alanı çevrele'), h('p', { class: 'notice' }, 'S Pen ile bir paragrafın, tablonun ya da cümlelerin etrafını çizin. Açılan çubuktan “Açıkla”, “Çevir” ya da “Not yapıştır”ı seçin. Taranmış sayfalarda alanın görüntüsü yapay zekâya gönderilir.'), h('p', { class: 'notice' }, 'Yanıtı “Yapışkan not” ile seçtiğiniz alanın üzerine yapıştırabilirsiniz.')));
}
function penPanel(tool) {
  const isHl = tool === 'hl';
  const type = () => isHl ? 'hl' : S.pen.type, cfg = () => penCfg(type());
  const wrap = h('div', { class: 'col' });
  const preview = h('canvas', { class: 'preview' });
  const drawPrev = () => requestAnimationFrame(() => { miniStroke(preview, type(), cfg(), true); refreshToolbar(); });
  let sizeRow, opRow;
  const rebuildRows = () => {
    const c = cfg();
    const nSize = rangeRow('pSize', 'Kalınlık', isHl ? 4 : .4, isHl ? 40 : (type() === 'brush' ? 30 : 16), isHl ? 1 : .1, c.size, v => v.toFixed(1).replace('.', ',') + ' pt', v => { cfg().size = v; saveSettings(); drawPrev(); });
    const nOp = rangeRow('pOp', 'Opaklık', 10, 100, 1, Math.round(c.o * 100), v => '%' + Math.round(v), v => { cfg().o = v / 100; saveSettings(); drawPrev(); });
    if (sizeRow) { sizeRow.replaceWith(nSize); opRow.replaceWith(nOp); } sizeRow = nSize; opRow = nOp;
    const ng = swatchGrid(c.color, isHl ? HL_PALETTE : PALETTE.slice(0, 9), col => { cfg().color = col; pushRecent(col); saveSettings(); drawPrev(); updateCursorStyle(); });
    if (wrap._sw) wrap._sw.replaceWith(ng); wrap._sw = ng;
  };
  wrap.append(h('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: '8px' } }, h('h3', null, isHl ? 'Fosforlu kalem' : PEN_NAMES[S.pen.type]), h('small', null, 'S Pen basınç ve eğim')));
  if (!isHl) {
    const types = h('div', { class: 'ptypes' });
    PEN_TYPES.forEach(pt => {
      const cv = h('canvas'); const b = h('button', { type: 'button', class: 'ptype' + (pt.id === S.pen.type ? ' on' : ''), 'aria-label': PEN_NAMES[pt.id], 'aria-pressed': pt.id === S.pen.type ? 'true' : 'false' }, cv, pt.name);
      b.addEventListener('click', () => { S.pen.type = pt.id; saveSettings(); [...types.children].forEach(x => { x.classList.remove('on'); x.setAttribute('aria-pressed', 'false'); }); b.classList.add('on'); b.setAttribute('aria-pressed', 'true'); wrap.querySelector('h3').textContent = PEN_NAMES[pt.id]; rebuildRows(); drawPrev(); updateCursorStyle(); });
      types.append(b); requestAnimationFrame(() => miniStroke(cv, pt.id, { ...S.pen[pt.id], color: getComputedStyle(document.body).getPropertyValue('--ink').trim() || '#1a2033' }));
    });
    wrap.append(types);
  }
  wrap.append(preview);
  rebuildRows();
  wrap.append(sizeRow, opRow, h('div', { class: 'lbl' }, 'Renk'), wrap._sw);
  if (!isHl) {
    wrap.append(h('hr', { class: 'sep' }), h('div', { class: 'lbl' }, 'S Pen hissi'),
      rangeRow('pPress', 'Basınç duyarlılığı', 0, 100, 1, Math.round(S.feel.pressure * 100), v => '%' + Math.round(v), v => { S.feel.pressure = v / 100; saveSettings(); drawPrev(); }),
      rangeRow('pStab', 'Titremeyi azalt', 0, 100, 1, Math.round(S.feel.stab * 100), v => v ? '%' + Math.round(v) : 'Kapalı', v => { S.feel.stab = v / 100; saveSettings(); }),
      toggleRow('pTilt', 'Eğimle gölgelendirme', S.feel.tilt, v => { S.feel.tilt = v; saveSettings(); drawPrev(); }, 'Kurşun kalemi yatırınca çizgi genişler'));
  }
  wrap.append(toggleRow('pShape', 'Bekletince şekle dönüştür', S.feel.shape, v => { S.feel.shape = v; saveSettings(); }, 'Çizgi, daire, üçgen, dörtgen'));
  if (!isHl) wrap.append(toggleRow('pScratch', 'Karalayarak sil', S.feel.scratch !== false, v => { S.feel.scratch = v; saveSettings(); }, 'Yazının üzerini zikzakla karalayınca silinir'));
  const favRow = h('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
    h('button', { type: 'button', class: 'btn small', onclick: () => { const c = cfg(); S.fav = [{ type: type(), size: c.size, color: c.color, o: c.o }, ...S.fav].slice(0, 20); saveSettings(); refreshToolbar(); toast('Favori kalemlere eklendi', 1500); } }, icon(IC.star), 'Favorilere ekle'));
  if (S.fav.length) { const clr = h('button', { type: 'button', class: 'btn small' }, 'Favorileri temizle'); clr.addEventListener('click', () => { S.fav = []; saveSettings(); refreshToolbar(); clr.remove(); }); favRow.append(clr); }
  wrap.append(favRow);
  if (!isHl && window.handSettingsRows) wrap.append(handSettingsRows());
  drawPrev();
  return wrap;
}
function eraserPanel() {
  const clearBtn = h('button', { type: 'button', class: 'btn small danger' }, icon(IC.trash), 'Bu sayfayı temizle');
  clearBtn.addEventListener('click', () => {
    closePop(); const pv = currentPage(); if (!pv) return;
    modal({ title: 'Sayfa temizlensin mi?', text: `Sayfa ${ed.pvs.indexOf(pv) + 1} üzerindeki tüm çizimler, metinler, görseller ve yapışkan notlar kaldırılır. Geri al ile geri getirebilirsiniz.`, actions: [{ label: 'Vazgeç' }, { label: 'Temizle', kind: 'danger', onClick: () => { const b = snap(pv.meta.id); const A = ann(pv.meta.id); A.s = []; A.t = []; A.i = []; A.n = []; renderLayer(pv); pushOp({ k: 'page', pid: pv.meta.id, b, a: snap(pv.meta.id) }); requestFrame(true); } }] });
  });
  return h('div', { class: 'col' },
    h('h3', null, 'Silgi'),
    segRow([['area', 'Alan silgisi'], ['stroke', 'Çizgi silgisi']], S.eraser.mode, v => { S.eraser.mode = v; saveSettings(); }),
    rangeRow('eSize', 'Boyut', 8, 90, 1, S.eraser.size, v => Math.round(v) + ' px', v => { S.eraser.size = v; saveSettings(); }),
    toggleRow('eHl', 'Yalnızca fosforlu kalemi sil', S.eraser.hlOnly, v => { S.eraser.hlOnly = v; saveSettings(); }),
    h('p', { class: 'notice' }, 'S Pen yan tuşuna basılı tutarak yazarsanız silgi geçici olarak açılır.'),
    clearBtn);
}
function textPanel() {
  const applyT = () => { if (ed.editing) { Object.assign(ed.editing.t, { font: S.text.font, size: S.text.size, color: S.text.color, bold: S.text.bold, wt: S.text.wt || 0 }); styleTbox(ed.editing.el, ed.editing.t); } saveSettings(); refreshToolbar(); };
  return h('div', { class: 'col' },
    h('h3', null, 'Metin'),
    segRow([['sans', 'Yalın'], ['serif', 'Tırnaklı'], ['hand', 'El yazısı'], ['kalam', 'Kalam']], S.text.font, v => { S.text.font = v; S.text.wt = 0; applyT(); }),
    rangeRow('tSize', 'Yazı boyutu', 8, 60, 1, S.text.size, v => Math.round(v) + ' pt', v => { S.text.size = v; applyT(); }),
    toggleRow('tBold', 'Kalın', S.text.bold, v => { S.text.bold = v; S.text.wt = 0; applyT(); }),
    h('div', { class: 'lbl' }, 'Renk'),
    swatchGrid(S.text.color, PALETTE.slice(0, 9), c => { S.text.color = c; pushRecent(c); applyT(); }),
    h('p', { class: 'notice' }, 'Sayfaya dokunarak metin kutusu ekleyin. Mavi tutamaçtan sürükleyerek taşıyın.'));
}

/* ---------- dışa aktarma ve ayarlar menüsü ---------- */
$('#exportBtn').addEventListener('click', () => {
  if (!ed.note) return; finishAll();
  const od = ed.note.od;
  openPop($('#exportBtn'), () => menu([
    od ? { label: (od.kind === 'saf' && od.place !== 'OneDrive' ? 'Dosyaya' : 'OneDrive’a') + ' şimdi kaydet', icon: IC.cloudOk, sub: od.mode === 'copy' ? (od.copyName || 'Notlu kopya') : od.name, onClick: syncNow } : { label: 'OneDrive’a kaydet…', icon: IC.cloud, sub: 'Klasör seçin', onClick: () => openOneDrive({ mode: 'save', note: ed.note, bytes: ed.pdfBytes }) },
    { label: 'PDF olarak indir', icon: IC.dl, sub: 'Notlar vektör olarak işlenir', onClick: () => exportNote(ed.note, ed.pdfBytes) },
    navigator.canShare ? { label: 'Paylaş', icon: IC.up, onClick: () => exportNote(ed.note, ed.pdfBytes, true) } : null,
    od && od.kind !== 'saf' ? { label: od.mode === 'copy' ? 'Asıl dosyanın üzerine yazmaya geç' : 'Notlu kopyaya kaydetmeye geç', icon: IC.sync, onClick: () => { od.mode = od.mode === 'copy' ? 'overwrite' : 'copy'; od.dirty = true; scheduleSave(); renderStatus('pending'); toast(od.mode === 'copy' ? 'Sonraki kayıtlar “(notlu)” kopyasına yazılacak' : 'Sonraki kayıtlar asıl dosyaya yazılacak', 3200); } } : null
  ]));
});
$('#moreBtn').addEventListener('click', () => openPop($('#moreBtn'), settingsPanel, () => { ed.readout = null; }));
function settingsPanel() {
  ed.readout = null;
  // yan yana belgede sağ taraf etkinse sayfa işlemleri orada çalışır
  const W = (typeof activeSide === 'function' && activeSide()) || window, side = W !== window, E = W.__ed || ed;
  let cur = null; try { cur = W.currentPage(); } catch (e) { }
  const canFlow = !!(W.flowCan && cur && W.flowCan(E.pvs.indexOf(cur)));
  const tile = (ic, label, fn) => h('button', { type: 'button', class: 'mtile', onclick: () => { closePop(); fn(); } }, h('span', { class: 'ico' }, icon(ic)), h('span', null, label));
  const full = async () => { try { if (document.fullscreenElement) await document.exitFullscreen(); else await document.documentElement.requestFullscreen(); } catch (e) { toast('Tam ekran bu görünümde kullanılamıyor.'); } };
  return h('div', { class: 'col mpanel' },
    side ? h('div', { class: 'mside' }, icon(IC.split), h('span', null, 'Sağdaki belge: ', h('b', null, E.note ? E.note.name : ''))) : null,
    h('div', { class: 'lbl' }, side ? 'Sağdaki sayfa' : 'Bu sayfa'),
    h('div', { class: 'mtiles' },
      tile(IC.fixText, 'Sayfayı düzelt', () => W.pageFixStart()),
      canFlow ? tile(IC.upArrow, 'Boşlukları kapat', () => W.flowPages()) : null,
      tile(IC.gridI, 'Tüm sayfalar', () => toolbarAction('pgrid')),
      tile(IC.search, 'Belgede ara', () => toolbarAction('find')),
      tile(IC.spark, 'Sözlük', () => openDict('')),
      EMBED ? null : tile(IC.split, typeof splitOpen === 'function' && splitOpen() ? 'Yan belgeyi kapat' : 'Yan yana belge', () => toggleSplit()),
      tile(IC.full, 'Tam ekran', full)),
    h('div', { class: 'lbl' }, 'Hızlı ayarlar'),
    h('div', { class: 'mtoggles' },
      toggleRow('sRead', 'Okuma modu', S.prefs.readOnly, v => setReadOnly(v), 'Kalem ve parmak yalnızca kaydırır'),
      toggleRow('sInvert', 'PDF renklerini ters çevir', S.prefs.invert, v => setInvert(v), 'Gece okumak için'),
      toggleRow('sVoice', 'Basılı tutunca sesli oku', S.voice.hold, v => { S.voice.hold = v; saveSettings(); }, 'İngiliz kadın sesi'),
      toggleRow('sCont', 'Metnin devamına ekle', S.hand.cont !== false, v => { S.hand.cont = v; saveSettings(); }, 'El yazısı düzeltilmiş metnin arkasına eklenir')),
    h('div', { class: 'mfoot' },
      h('button', { type: 'button', class: 'btn small', onclick: () => openPop($('#moreBtn'), toolbarEditor) }, icon(IC.gear), 'Araç çubuğu'),
      h('button', { type: 'button', class: 'btn small primary', onclick: () => { closePop(); openSettings(); } }, icon(IC.gear), 'Tüm ayarlar')));
}
function renderReadout(e) {
  const ro = ed.readout; if (!ro) return;
  if (!e) { ro.innerHTML = S.prefs.penSeen ? 'Kalemi ekrana yaklaştırın veya dokundurun.' : 'Henüz kalem algılanmadı. S Pen ile ekrana dokunun.'; return; }
  const tilt = Math.round(Math.hypot(e.tiltX || 0, e.tiltY || 0));
  const btn = (e.buttons & 32) ? 'silgi ucu' : (e.buttons & 2) ? '<b>yan tuş basılı</b>' : e.buttons ? 'temas' : 'havada';
  ro.innerHTML = `tür <b>${e.pointerType}</b> · ${btn}<br>basınç <b>${(e.pressure || 0).toFixed(3)}</b> · eğim <b>${tilt}°</b><div class="meter"><i style="width:${Math.round((e.pressure || 0) * 100)}%"></i></div>`;
}

/* =========================================================
   Görünüm yardımcıları
   ========================================================= */
function toWorld(cx, cy) { const r = ed.rect, v = ed.view; return { x: (cx - r.left - v.tx) / v.z, y: (cy - r.top - v.ty) / v.z }; }
function pageAtWorld(w, strict) {
  for (const pv of ed.pvs) {
    if (w.x >= pv.x && w.x <= pv.x + pv.meta.w && w.y >= pv.y && w.y <= pv.y + pv.meta.h) return pv;
    if (!strict && w.y >= pv.y - GAP / 2 && w.y <= pv.y + pv.meta.h + GAP / 2) return pv;
  }
  return null;
}
function local(pv, w) { return { x: w.x - pv.x, y: w.y - pv.y }; }
function currentPage() {
  const v = ed.view, cy = (ed.H / 2 - v.ty) / v.z; let best = null, bd = 1e12;
  for (const pv of ed.pvs) { const d = cy < pv.y ? pv.y - cy : cy > pv.y + pv.meta.h ? cy - pv.y - pv.meta.h : 0; if (d < bd) { bd = d; best = pv; } }
  return best;
}
function updatePager() {
  const pv = currentPage(); if (!pv) return; const i = ed.pvs.indexOf(pv) + 1;
  $('#pager').textContent = `${i} / ${ed.pvs.length}`;
  if (ed.curPage !== i) { ed.curPage = i; $$('#plist .pitem:not(.mk), .pgrid .pitem').forEach(b => b.classList.toggle('on', b.getAttribute('aria-label') === 'Sayfa ' + i)); updateMarkBtn(); }
}
function goToPage(i) { const pv = ed.pvs[i]; if (!pv) return; stopInertia(); setView(ed.view.z, ed.view.tx, MARGIN - pv.y * ed.view.z); }

/* ---------- imleç (havada) ---------- */
const cursorEl = $('#cursor');
function hideCursor() { cursorEl.hidden = true; }
function updateCursorStyle() {
  const t = ed.tool; cursorEl.classList.toggle('er', t === 'eraser');
  if (t === 'pen' || t === 'hl') { const c = penCfg(t === 'hl' ? 'hl' : S.pen.type); cursorEl.style.borderColor = c.color === '#ffffff' ? '#5a6478' : c.color; }
  else cursorEl.style.borderColor = '';
}
function showCursor(e, toolOverride) {
  if (!S.prefs.hover && !toolOverride) return hideCursor();
  const t = toolOverride || ed.tool; let d;
  if (t === 'eraser') d = S.eraser.size;
  else if (t === 'pen') d = Math.max(4, S.pen[S.pen.type].size * ed.view.z);
  else if (t === 'hl') d = Math.max(4, S.hl.size * ed.view.z);
  else return hideCursor();
  const r = ed.rect; cursorEl.hidden = false;
  cursorEl.style.width = cursorEl.style.height = d + 'px';
  cursorEl.style.left = (e.clientX - r.left) + 'px'; cursorEl.style.top = (e.clientY - r.top) + 'px';
  cursorEl.classList.toggle('er', t === 'eraser');
}

/* =========================================================
   Girdi: S Pen, parmak, fare
   ========================================================= */
function fingerDraws() { if (S.prefs.readOnly) return false; const f = S.prefs.finger; return f === 'finger' || (f === 'auto' && !S.prefs.penSeen); }
function lastPenAny() {
  let t = ed.lastPenAt || 0;
  try { if (EMBED && parent.__ed) t = Math.max(t, parent.__ed.lastPenAt || 0); } catch (e) { }
  try { const sw = typeof sideWin === 'function' && sideWin(); if (sw && sw.__ed) t = Math.max(t, sw.__ed.lastPenAt || 0); } catch (e) { }
  return t;
}
function isPalm(e) { return Date.now() - lastPenAny() < 700 || (e.width > 44 && e.height > 44); }
function eventsOf(e) { let a = []; try { a = e.getCoalescedEvents ? e.getCoalescedEvents() : []; } catch (er) { } return a.length ? a : [e]; }
function pressureOf(e) { if (e.pointerType === 'pen') return e.pressure > 0 ? e.pressure : (e.buttons ? .5 : 0); if (e.pointerType === 'touch') return e.pressure > .05 && e.pressure < .95 ? e.pressure : .5; return .5; }
function tiltOf(e) {
  if (e.pointerType !== 'pen') return 0;
  if (typeof e.altitudeAngle === 'number' && e.altitudeAngle > 0 && e.altitudeAngle < Math.PI / 2 - .001) return clamp(1 - e.altitudeAngle / (Math.PI / 2), 0, 1);
  return clamp(Math.hypot(e.tiltX || 0, e.tiltY || 0) / 70, 0, 1);
}
function capture(e) { try { stage.setPointerCapture(e.pointerId); } catch (er) { } }

stage.addEventListener('contextmenu', e => e.preventDefault());
stage.addEventListener('pointerdown', onDown);
addEventListener('pointermove', onMove, { passive: false });
addEventListener('pointerup', onUp);
addEventListener('pointercancel', e => onUp(e, true));
stage.addEventListener('pointerleave', e => { if (e.pointerType !== 'touch') hideCursor(); });
stage.addEventListener('pointerover', e => { if (e.pointerType === 'pen') { ed.lastPen = now(); ed.lastPenAt = Date.now(); } });

function onDown(e) {
  if (!ed.note || ed.capture) return;
  if (e.target.closest('#ui button, #ui output, .floaty, .uiwin')) return;
  if (TS.sel && !TS.sel.active) textSelClear();
  ed.rect = stage.getBoundingClientRect();
  if (ed.stickyEdit && !e.target.closest('.sticky.editing')) finishSticky();
  { const sk = e.target.closest('.sticky'); if (sk) { if (e.target.closest('.sticky button') || (e.pointerType === 'touch' && isPalm(e))) return; stickyDown(e, sk); return; } }
  if (ed.aiArea) aiAreaClear();
  if (ed.readout) renderReadout(e);
  const pt = e.pointerType;
  if (pt === 'pen') { ed.lastPen = now(); ed.lastPenAt = Date.now(); if (!S.prefs.penSeen) { S.prefs.penSeen = true; saveSettings(); } }
  if (e.target.closest('.selh')) { e.preventDefault(); capture(e); startSelHandle(e, e.target.closest('.selh').dataset.h); return; }
  if (e.target.closest('.tgrip')) { e.preventDefault(); capture(e); startGrip(e); return; }
  if (ed.tool === 'text' && e.target.closest('.tbox')) { const el = e.target.closest('.tbox'); if (!el.classList.contains('editing')) { e.preventDefault(); ed.ptrs.set(e.pointerId, { g: 'tboxtap', el, sx: e.clientX, sy: e.clientY }); capture(e); } return; }
  e.preventDefault();
  if (pt === 'touch') return touchDown(e);
  stopInertia();
  if (pt === 'mouse' && e.button === 1) { capture(e); ed.ptrs.set(e.pointerId, { g: 'pan', lx: e.clientX, ly: e.clientY }); return; }
  let tool = ed.tool;
  if (pt === 'pen' && ((e.buttons & 32) || e.button === 5)) tool = 'eraser';
  else if ((pt === 'pen' && ((e.buttons & 2) || e.button === 2 || penBtnNative)) || (pt === 'mouse' && e.button === 2)) { if (S.prefs.side !== 'off') tool = S.prefs.side; }
  capture(e); startTool(e, tool);
}
function startTool(e, tool) {
  const w = toWorld(e.clientX, e.clientY);
  if (ed.sel) {
    const l = local(ed.sel.pv, w);
    if (insideSel(l)) { startSelMove(e, l); return; }
    clearSel();
  }
  if (ed.editing && tool !== 'text') finishText();
  const pv = pageAtWorld(w, true);
  if (!pv || (S.prefs.readOnly && tool !== 'lasso' && tool !== 'aisel')) { if (ed.editing) finishText(); ed.ptrs.set(e.pointerId, { g: 'pan', lx: e.clientX, ly: e.clientY }); return; }
  const P = local(pv, w);
  if (tool === 'pen' || tool === 'hl') return startDraw(e, pv, P, tool);
  if (tool === 'eraser') return startErase(e, pv, P);
  if (tool === 'lasso') return startLasso(e, pv, P);
  if (tool === 'aisel') return startLasso(e, pv, P, true);
  if (tool === 'text') { ed.ptrs.set(e.pointerId, { g: 'texttap', pv, P, sx: e.clientX, sy: e.clientY }); if (ed.editing) finishText(); }
}
function onMove(e) {
  if (!ed.note || edView.hidden || ed.capture) return;
  const st = ed.ptrs.get(e.pointerId);
  if (e.pointerType === 'pen') { ed.lastPen = now(); ed.lastPenAt = Date.now(); if (ed.readout) renderReadout(e); }
  if (!st) {
    if (e.pointerType === 'pen' && !(e.buttons & 1) && e.target && stage.contains(e.target)) { ed.rect = ed.rect || stage.getBoundingClientRect(); showCursor(e, (penBtnNative || (e.buttons & 2)) && S.prefs.side === 'eraser' ? 'eraser' : undefined); }
    else if (e.pointerType === 'touch' && ed.touches.has(e.pointerId)) touchMove(e);
    return;
  }
  e.preventDefault();
  switch (st.g) {
    case 'draw': moveDraw(e, st); break;
    case 'erase': moveErase(e, st); break;
    case 'lasso': moveLasso(e, st); break;
    case 'selmove': case 'selscale': case 'selrot': moveSel(e, st); break;
    case 'grip': moveGrip(e, st); break;
    case 'sticky': case 'stickyrz': moveSticky(e, st); break;
    case 'pan': { stopInertia(); const dx = e.clientX - st.lx, dy = e.clientY - st.ly; st.lx = e.clientX; st.ly = e.clientY; setView(ed.view.z, ed.view.tx + dx, ed.view.ty + dy); break; }
  }
}
function onUp(e, cancel) {
  if (!ed.note || ed.capture) return;
  const st = ed.ptrs.get(e.pointerId);
  if (e.pointerType === 'touch' && (!st || st.g === 'ignore')) { touchUp(e, cancel); return; }
  if (!st) return; ed.ptrs.delete(e.pointerId);
  switch (st.g) {
    case 'draw': endDraw(st, cancel); break;
    case 'erase': endErase(); hideCursor(); break;
    case 'lasso': endLasso(); break;
    case 'selmove': case 'selscale': case 'selrot': endSel(); break;
    case 'grip': endGrip(); break;
    case 'sticky': case 'stickyrz': endSticky(st, cancel); break;
    case 'texttap': if (!cancel && Math.hypot(e.clientX - st.sx, e.clientY - st.sy) < 12) newText(st.pv, st.P); break;
    case 'tboxtap': if (!cancel && Math.hypot(e.clientX - st.sx, e.clientY - st.sy) < 12) editExisting(st.el); break;
  }
  if (e.pointerType === 'pen' && !cancel) showCursor(e);
}

/* ---------- dokunma: kaydırma, yakınlaştırma, parmak hareketleri ---------- */
function touchDown(e) {
  if (isPalm(e)) { ed.ptrs.set(e.pointerId, { g: 'ignore' }); return; }
  capture(e); stopInertia();
  ed.touches.set(e.pointerId, { x: e.clientX, y: e.clientY, sx: e.clientX, sy: e.clientY });
  const n = ed.touches.size;
  if (n === 1) { ed.tapStart = now(); ed.tapMoved = 0; ed.touchMax = 1; ed.panSamples = []; }
  ed.touchMax = Math.max(ed.touchMax, n);
  if (n === 1) {
    if (fingerDraws() || (ed.sel && insideSel(local(ed.sel.pv, toWorld(e.clientX, e.clientY))))) {
      startTool(e, ed.tool);
      const st = ed.ptrs.get(e.pointerId);
      if (st && st.g !== 'pan') { ed.ptrs.delete(e.pointerId); ed.fingerTool = { id: e.pointerId, st, t: now() }; return; }
      ed.ptrs.delete(e.pointerId);
    }
    ed.pinch = null;
    clearTimeout(ed.lpT);
    const id = e.pointerId, lx = e.clientX, ly = e.clientY;
    ed.lpT = setTimeout(async () => {
      const t = ed.touches.get(id); if (!t || ed.touches.size !== 1 || ed.tapMoved > 10) return;
      stopInertia();
      { // parmakla metin kutusuna/görsele basılı tut: seç ve sürükleyerek taşı
        const w = toWorld(t.x, t.y), pv = pageAtWorld(w, true);
        const hit = pv && hitObjAt(pv, local(pv, w));
        if (hit) { const P = local(pv, w); selectObj(pv, hit); ed.fingerTool = { id, st: { g: 'selmove', P0: P, m0: ed.sel.m.slice() }, t: now() }; return; }
      }
      if (await textSelStart(id, t.x, t.y)) ed.textSelPtr = id;
    }, 480);
    return;
  }
  clearTimeout(ed.lpT);
  if (ed.textSelPtr != null) { ed.textSelPtr = null; textSelClear(); }
  if (ed.fingerTool) {
    const ft = ed.fingerTool;
    if (now() - ft.t < 300 && ft.st.g === 'draw') { if (ft.st.live) clearTimeout(ft.st.live.holdT); ed.live = null; renderLive(); ed.fingerTool = null; }
    else if (['draw', 'erase', 'lasso'].includes(ft.st.g)) { ed.touches.delete(e.pointerId); return; }
    else ed.fingerTool = null;
  }
  startPinch();
}
function startPinch() {
  const ts = [...ed.touches.values()].slice(0, 2); if (ts.length < 2) return;
  const c = { x: (ts[0].x + ts[1].x) / 2, y: (ts[0].y + ts[1].y) / 2 }, d = Math.max(10, Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y));
  const r = ed.rect, v = ed.view;
  ed.pinch = { d0: d, z0: v.z, wx: (c.x - r.left - v.tx) / v.z, wy: (c.y - r.top - v.ty) / v.z };
}
function touchMove(e) {
  const t = ed.touches.get(e.pointerId); if (!t) return;
  e.preventDefault();
  if (ed.fingerTool && ed.fingerTool.id === e.pointerId) { const st = ed.fingerTool.st; if (st.g === 'draw') moveDraw(e, st); else if (st.g === 'erase') moveErase(e, st); else if (st.g === 'lasso') moveLasso(e, st); else if (st.g.startsWith('sel')) moveSel(e, st); return; }
  if (ed.textSelPtr === e.pointerId) { t.x = e.clientX; t.y = e.clientY; textSelMove(e.clientX, e.clientY); return; }
  const dx = e.clientX - t.x, dy = e.clientY - t.y; t.x = e.clientX; t.y = e.clientY;
  ed.tapMoved = Math.max(ed.tapMoved, Math.hypot(t.x - t.sx, t.y - t.sy));
  if (ed.tapMoved > 10) clearTimeout(ed.lpT);
  if (ed.touches.size >= 2 && ed.pinch) {
    const ts = [...ed.touches.values()].slice(0, 2);
    const c = { x: (ts[0].x + ts[1].x) / 2, y: (ts[0].y + ts[1].y) / 2 }, d = Math.max(10, Math.hypot(ts[0].x - ts[1].x, ts[0].y - ts[1].y));
    const [a, b] = zLimits(); const z = clamp(ed.pinch.z0 * d / ed.pinch.d0, a, b); const r = ed.rect;
    setView(z, c.x - r.left - ed.pinch.wx * z, c.y - r.top - ed.pinch.wy * z);
  } else if (ed.touches.size === 1) {
    setView(ed.view.z, ed.view.tx + dx, ed.view.ty + dy);
    const s = ed.panSamples; s.push({ t: now(), dx, dy }); while (s.length && now() - s[0].t > 90) s.shift();
  }
}
function touchUp(e, cancel) {
  const st = ed.ptrs.get(e.pointerId); if (st && st.g === 'ignore') { ed.ptrs.delete(e.pointerId); return; }
  if (!ed.touches.has(e.pointerId)) return;
  ed.touches.delete(e.pointerId);
  clearTimeout(ed.lpT);
  if (ed.textSelPtr === e.pointerId) { ed.textSelPtr = null; textSelEnd(); return; }
  if (ed.fingerTool && ed.fingerTool.id === e.pointerId) {
    const ft = ed.fingerTool; ed.fingerTool = null; const s = ft.st;
    if (s.g === 'draw') endDraw(s, cancel); else if (s.g === 'erase') endErase(); else if (s.g === 'lasso') endLasso(); else if (s.g.startsWith('sel')) endSel();
    else if (s.g === 'texttap' && !cancel && Math.hypot(e.clientX - s.sx, e.clientY - s.sy) < 12) newText(s.pv, s.P);
    return;
  }
  if (ed.touches.size === 0) {
    const quick = now() - ed.tapStart < 320 && ed.tapMoved < 14;
    if (quick && S.prefs.twoTap && !cancel) { if (ed.touchMax === 2) { if (ed.undo.length) { undo(); toast('Geri alındı', 900); } } else if (ed.touchMax === 3) { if (ed.redo.length) { redo(); toast('Yinelendi', 900); } } }
    else if (ed.touchMax === 1 && ed.panSamples && ed.panSamples.length > 1) {
      const s = ed.panSamples, dt = Math.max(16, now() - s[0].t); let vx = 0, vy = 0; s.forEach(q => { vx += q.dx; vy += q.dy; });
      startInertia(vx / dt, vy / dt);
    }
    ed.pinch = null;
  } else if (ed.touches.size >= 2) startPinch();
  else ed.pinch = null;
}
function startInertia(vx, vy) {
  if (Math.hypot(vx, vy) < .25) return;
  let last = now();
  const step = () => {
    const t = now(), dt = t - last; last = t;
    const f = Math.pow(.94, dt / 16); vx *= f; vy *= f;
    const bx = ed.view.tx, by = ed.view.ty;
    setView(ed.view.z, ed.view.tx + vx * dt, ed.view.ty + vy * dt);
    if (Math.hypot(vx, vy) < .02 || (bx === ed.view.tx && by === ed.view.ty)) { ed.inertia = 0; return; }
    ed.inertia = requestAnimationFrame(step);
  };
  ed.inertia = requestAnimationFrame(step);
}
function stopInertia() { if (ed.inertia) { cancelAnimationFrame(ed.inertia); ed.inertia = 0; } panFinish(); }
stage.addEventListener('wheel', e => {
  if (!ed.note || ed.capture) return; e.preventDefault(); stopInertia(); ed.rect = stage.getBoundingClientRect();
  const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? ed.H : 1;
  if (e.ctrlKey || e.metaKey) zoomAt(ed.view.z * Math.exp(-e.deltaY * k * .0022), e.clientX - ed.rect.left, e.clientY - ed.rect.top);
  else setView(ed.view.z, ed.view.tx - (e.shiftKey ? e.deltaY : e.deltaX) * k, ed.view.ty - (e.shiftKey ? 0 : e.deltaY) * k);
}, { passive: false });

/* ---------- çizim ---------- */
function startDraw(e, pv, P, tool) {
  const type = tool === 'hl' ? 'hl' : S.pen.type; const cfg = penCfg(type);
  ed.live = { pv, type, size: cfg.size, color: cfg.color, o: cfg.o, pts: [], raw: [], last: null, sm: null, pred: null, shape: null, holdT: 0, anchor: { x: e.clientX, y: e.clientY }, t0: now() };
  livec.style.mixBlendMode = type === 'hl' ? 'multiply' : 'normal';
  const st = { g: 'draw', live: ed.live };
  ed.ptrs.set(e.pointerId, st);
  if (e.pointerType === 'pen') hideCursor();
  addInputs(e, st); armHold(st);
  if (window.handPenDown) handPenDown();
  // Metin kutusuna ya da görsele kalemle basılı tutmak: seç ve sürükleyerek taşı (kulplarla büyüt/küçült)
  const hit = type !== 'hl' ? hitObjAt(pv, P) : null;
  if (hit) st.lpT = setTimeout(() => {
    const L = st.live; if (ed.live !== L || st.g !== 'draw') return;
    let ext = 0; for (const q of L.raw) ext = Math.max(ext, Math.hypot(q.x - P.x, q.y - P.y));
    if (ext * ed.view.z > 9) return;
    clearTimeout(L.holdT); ed.live = null; renderLive();
    selectObj(pv, hit);
    st.g = 'selmove'; st.P0 = L.raw.length ? L.raw[L.raw.length - 1] : P; st.m0 = ed.sel.m.slice();
  }, 430);
}
/* Noktadaki en üstteki metin kutusu ya da görsel */
function hitObjAt(pv, P) {
  const A = ann(pv.meta.id), pad = 5 / ed.view.z;
  const t = [...A.t].reverse().find(t => P.x >= t.x - pad && P.x <= t.x + (t.w || 20) + pad && P.y >= t.y - pad && P.y <= t.y + (t.h || 20) + pad);
  if (t) return { t };
  const im = [...(A.i || [])].reverse().find(im => P.x >= im.x && P.x <= im.x + im.w && P.y >= im.y && P.y <= im.y + im.h);
  return im ? { im } : null;
}
function selectObj(pv, hit) {
  setSel(pv, new Set(), new Set(hit.t ? [hit.t] : []), new Set(hit.im ? [hit.im] : []));
  $('#selbar').hidden = true;
  try { navigator.vibrate && navigator.vibrate(12); } catch (e) { }
}
function addInputs(e, st) {
  const L = st.live; if (!L || L !== ed.live) return;
  if (L.shape) { if (L.shape.kind === 'line') { L.shape.pts[1] = local(L.pv, toWorld(e.clientX, e.clientY)); setShapePts(L); renderLive(); } return; }
  for (const ev of eventsOf(e)) {
    const P = local(L.pv, toWorld(ev.clientX, ev.clientY));
    if (!L.sm) L.sm = { x: P.x, y: P.y };
    else { const a = 1 - S.feel.stab * .82; L.sm.x += (P.x - L.sm.x) * a; L.sm.y += (P.y - L.sm.y) * a; }
    pushPoint(L, L.sm.x, L.sm.y, pressureOf(ev), tiltOf(ev), ev.timeStamp || now());
  }
  L.pred = null;
  try { if (e.getPredictedEvents && S.feel.stab < .3) { const pe = e.getPredictedEvents(); if (pe && pe.length && L.last) { const q = local(L.pv, toWorld(pe[pe.length - 1].clientX, pe[pe.length - 1].clientY)); L.pred = [q.x, q.y, L.last.w]; } } } catch (er) { }
  renderLive();
}
function pushPoint(L, x, y, p, tilt, t) {
  const last = L.last; const z = ed.view.z;
  L.raw.push({ x, y });
  if (last && Math.hypot(x - last.x, y - last.y) < Math.max(.3 / z, (last.w || 1) * .18)) return;
  const dir = last ? Math.atan2(y - last.y, x - last.x) : null;
  const speed = last ? Math.hypot(x - last.x, y - last.y) / Math.max(1, t - last.t) : 0;
  let w = penWidth(L.type, L.size, p, tilt, dir, speed);
  if (last) w = last.w + (w - last.w) * .45;
  const n = L.pts.length / 3;
  if (L.type === 'brush' && n < 6) w *= .35 + .65 * n / 6;
  if (last) { const d = Math.hypot(x - last.x, y - last.y), steps = Math.floor(d / 3); for (let i = 1; i < steps; i++) { const f = i / steps; L.pts.push(last.x + (x - last.x) * f, last.y + (y - last.y) * f, last.w + (w - last.w) * f); } }
  L.pts.push(x, y, w); L.last = { x, y, w, t };
}
function moveDraw(e, st) {
  const L = st.live; if (!L) return;
  if (Math.hypot(e.clientX - L.anchor.x, e.clientY - L.anchor.y) > 5) { L.anchor = { x: e.clientX, y: e.clientY }; armHold(st); }
  addInputs(e, st);
}
function armHold(st) {
  const L = st.live; clearTimeout(L.holdT);
  if (!S.feel.shape || L.shape) return;
  L.holdT = setTimeout(() => {
    if (ed.live !== L || L.shape) return;
    const sh = recognize(L.raw.filter((q, i) => i % 2 === 0 || i === L.raw.length - 1)); if (!sh) return;
    const ws = []; for (let i = 2; i < L.pts.length; i += 3) ws.push(L.pts[i]); ws.sort((a, b) => a - b);
    L.shapeW = ws[ws.length >> 1] || L.size; L.shape = sh; setShapePts(L); renderLive();
    try { navigator.vibrate && navigator.vibrate(8); } catch (e) { }
  }, 520);
}
function setShapePts(L) { const out = []; for (const q of shapePoints(L.shape)) out.push(q.x, q.y, L.shapeW); L.pts = out; }
function renderLive() {
  const c = livex; c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, livec.width, livec.height);
  const L = ed.live;
  if (L && L.pts.length) {
    c.save(); pageTransform(c, L.pv); clipPage(c, L.pv);
    const arr = L.pred ? L.pts.concat(L.pred) : L.pts;
    paintStroke(c, { t: L.type, c: L.color, o: L.o }, buildPath(arr, arr.length / 3));
    c.restore();
  }
  const S2 = ed.lasso;
  if (S2 && S2.pts.length > 1) {
    c.save(); pageTransform(c, S2.pv); c.beginPath();
    if (S2.rect) { const a = S2.pts[0], b = S2.pts[S2.pts.length - 1]; c.rect(Math.min(a.x, b.x), Math.min(a.y, b.y), Math.abs(b.x - a.x), Math.abs(b.y - a.y)); }
    else { c.moveTo(S2.pts[0].x, S2.pts[0].y); for (const q of S2.pts) c.lineTo(q.x, q.y); c.closePath(); }
    c.fillStyle = S2.ai ? 'rgba(238,90,67,.08)' : 'rgba(47,91,234,.07)'; c.fill();
    c.setLineDash([6 / ed.view.z, 5 / ed.view.z]); c.lineWidth = 1.6 / ed.view.z; c.strokeStyle = S2.ai ? '#EE5A43' : '#2F5BEA'; c.stroke();
    c.restore();
  }
  const AA = ed.aiArea;
  if (AA && AA.poly.length > 2) {
    c.save(); pageTransform(c, AA.pv); c.beginPath(); c.moveTo(AA.poly[0].x, AA.poly[0].y); for (const q of AA.poly) c.lineTo(q.x, q.y); c.closePath();
    c.fillStyle = 'rgba(238,90,67,.09)'; c.fill(); c.setLineDash([7 / ed.view.z, 5 / ed.view.z]); c.lineWidth = 2 / ed.view.z; c.strokeStyle = '#EE5A43'; c.stroke(); c.restore();
  }
}
function endDraw(st, cancel) {
  const L = st.live; clearTimeout(L.holdT); clearTimeout(st.lpT);
  if (ed.live !== L) return;
  ed.live = null;
  if (cancel || !L.pts.length) { renderLive(); return; }
  if (!L.shape && L.raw.length) { const r = L.raw[L.raw.length - 1]; if (Math.hypot(r.x - L.last.x, r.y - L.last.y) > .2) L.pts.push(r.x, r.y, L.last.w); }
  if (!L.shape && L.type === 'brush') { const n = L.pts.length / 3, k = Math.min(5, n - 1); for (let i = 0; i < k; i++) L.pts[(n - 1 - i) * 3 + 2] *= .4 + .6 * i / k; }
  const s = { id: uid(), t: L.type, c: L.color, o: L.o, p: new Float32Array(L.pts) };
  // Karalayarak sil: yazının üzerini zikzakla karalayınca altındaki yazı silinir, karalama çizilmez
  if (!L.shape && L.type !== 'hl' && S.feel.scratch !== false && scratchErase(L.pv, s)) { renderLive(); return; }
  const pid = L.pv.meta.id, b = snap(pid); ann(pid).s.push(s);
  pushOp({ k: 'page', pid, b, a: snap(pid) });
  paintCommitted(L.pv, s); renderLive();
  if (!L.shape && window.handAfterStroke) handAfterStroke(L.pv, s, L.t0, now());
}

/* ---------- karalayarak silme ----------
   Profesyonel uygulamalardaki “scratch out / scribble to erase” gibi: aynı alanda en az 4 kez ileri-geri giden,
   toplam yolu genişliğinin ~3 katından uzun bir zikzak çizgi karalama sayılır. Altında yazı yoksa normal çizgi kalır. */
function reversals(vals, th) {
  let dir = 0, ext = vals[0], cnt = 0;
  for (const v of vals) {
    if (!dir) { if (Math.abs(v - ext) > th) { dir = v > ext ? 1 : -1; ext = v; } continue; }
    if (dir > 0) { if (v > ext) ext = v; else if (ext - v > th) { cnt++; dir = -1; ext = v; } }
    else { if (v < ext) ext = v; else if (v - ext > th) { cnt++; dir = 1; ext = v; } }
  }
  return cnt;
}
function isScratch(s) {
  const p = s.p, n = p.length / 3; if (n < 14) return false;
  const xs = [], ys = []; let tx = 0, ty = 0;
  for (let i = 0; i < n; i++) { xs.push(p[3 * i]); ys.push(p[3 * i + 1]); if (i) { tx += Math.abs(p[3 * i] - p[3 * i - 3]); ty += Math.abs(p[3 * i + 1] - p[3 * i - 2]); } }
  const w = Math.max(...xs) - Math.min(...xs), hg = Math.max(...ys) - Math.min(...ys);
  if (Math.max(w, hg) < 6) return false;
  const rx = reversals(xs, Math.max(1.5, w * .22)), ry = reversals(ys, Math.max(1.5, hg * .22));
  return (rx >= 4 && tx >= w * 3) || (ry >= 4 && ty >= hg * 3 && w < hg * 2.5);
}
function convexHull(pts) {
  const P = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (P.length < 3) return P;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], up = [];
  for (const q of P) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  for (let i = P.length - 1; i >= 0; i--) { const q = P[i]; while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  up.pop(); lo.pop(); return lo.concat(up);
}
function scratchErase(pv, s) {
  if (!isScratch(s)) return false;
  const p = s.p, n = p.length / 3, pts = [];
  for (let i = 0; i < n; i++) pts.push([p[3 * i], p[3 * i + 1]]);
  const hull = convexHull(pts); if (hull.length < 3) return false;
  const sb = strokeBB(s);
  const cx = hull.reduce((a, q) => a + q[0], 0) / hull.length, cy = hull.reduce((a, q) => a + q[1], 0) / hull.length;
  const grow = Math.max(3 / ed.view.z + 1, Math.min(sb.x1 - sb.x0, sb.y1 - sb.y0) * .15);
  const poly = hull.map(q => { const dx = q[0] - cx, dy = q[1] - cy, d = Math.hypot(dx, dy) || 1; return { x: q[0] + dx / d * grow, y: q[1] + dy / d * grow }; });
  const A = ann(pv.meta.id), dead = new Set(), deadT = new Set();
  const cover = (x0, y0, x1, y1) => { const ox = Math.max(0, Math.min(x1, sb.x1) - Math.max(x0, sb.x0)), oy = Math.max(0, Math.min(y1, sb.y1) - Math.max(y0, sb.y0)); return ox * oy / Math.max(1e-6, (x1 - x0) * (y1 - y0)); };
  for (const o of A.s) {
    if (o.t === 'hl') continue;
    const b = strokeBB(o); if (b.x1 < sb.x0 || b.x0 > sb.x1 || b.y1 < sb.y0 || b.y0 > sb.y1) continue;
    const q = o.p, m = q.length / 3, step = Math.max(1, Math.floor(m / 30)); let ins = 0, tot = 0;
    for (let i = 0; i < m; i += step) { tot++; if (pip(q[3 * i], q[3 * i + 1], poly)) ins++; }
    const f = tot ? ins / tot : 0;
    if (f >= .35 || (f >= .15 && cover(b.x0, b.y0, Math.max(b.x1, b.x0 + 1), Math.max(b.y1, b.y0 + 1)) >= .6)) dead.add(o);
  }
  for (const t of A.t) {
    const tw = t.w || 20, th = t.h || 20, c = cover(t.x, t.y, t.x + tw, t.y + th);
    if ((pip(t.x + tw / 2, t.y + th / 2, poly) && c >= .2) || c >= .45) deadT.add(t);
  }
  if (!dead.size && !deadT.size) return false;
  const pid = pv.meta.id, b = snap(pid);
  A.s = A.s.filter(o => !dead.has(o)); A.t = A.t.filter(t => !deadT.has(t));
  pushOp({ k: 'page', pid, b, a: snap(pid) });
  if (deadT.size) renderLayer(pv);
  requestFrame(true);
  toast('Karalanan yazı silindi · geri almak için ↶', 1600);
  return true;
}

/* ---------- silgi ---------- */
function startErase(e, pv, P) { ed.erase = { pages: new Map(), last: { pv, x: P.x, y: P.y } }; ed.ptrs.set(e.pointerId, { g: 'erase' }); showCursor(e, 'eraser'); eraseSeg(pv, P.x, P.y, P.x, P.y); }
function moveErase(e) {
  const E = ed.erase; if (!E) return; showCursor(e, 'eraser');
  for (const ev of eventsOf(e)) {
    const w = toWorld(ev.clientX, ev.clientY); const pv = pageAtWorld(w, false) || E.last.pv; const P = local(pv, w);
    if (pv !== E.last.pv) E.last = { pv, x: P.x, y: P.y };
    eraseSeg(pv, E.last.x, E.last.y, P.x, P.y); E.last = { pv, x: P.x, y: P.y };
  }
}
function eraseSeg(pv, ax, ay, bx, by) {
  const pid = pv.meta.id; const A = ann(pid); if (!A.s.length && !A.t.length) return;
  const r = S.eraser.size / 2 / ed.view.z; const mode = S.eraser.mode, hlOnly = S.eraser.hlOnly;
  const sx0 = Math.min(ax, bx) - r, sx1 = Math.max(ax, bx) + r, sy0 = Math.min(ay, by) - r, sy1 = Math.max(ay, by) + r;
  let changedAny = false; const out = [];
  for (const s of A.s) {
    if (hlOnly && s.t !== 'hl') { out.push(s); continue; }
    const bb = strokeBB(s); if (bb.x1 < sx0 || bb.x0 > sx1 || bb.y1 < sy0 || bb.y0 > sy1) { out.push(s); continue; }
    const p = s.p, n = p.length / 3; let hit = null;
    for (let i = 0; i < n; i++) { if (segDist(p[3 * i], p[3 * i + 1], ax, ay, bx, by) < r + p[3 * i + 2] * .5) { (hit || (hit = new Uint8Array(n)))[i] = 1; if (mode === 'stroke') break; } }
    if (!hit) { out.push(s); continue; }
    if (!changedAny && !ed.erase.pages.has(pid)) ed.erase.pages.set(pid, snap(pid));
    changedAny = true;
    if (mode === 'stroke' || n === 1) continue;
    let i0 = -1;
    for (let i = 0; i <= n; i++) {
      const keep = i < n && !hit[i];
      if (keep && i0 < 0) i0 = i;
      if (!keep && i0 >= 0) { if (i - i0 >= 2) out.push({ id: uid(), t: s.t, c: s.c, o: s.o, p: p.slice(3 * i0, 3 * i) }); i0 = -1; }
    }
  }
  // metin kutuları (düzeltilmiş el yazısı dahil): silgi değerse kutu tümüyle silinir
  let tOut = null;
  if (!hlOnly && A.t.length) {
    for (const t of A.t) {
      const tw = t.w || 20, th = t.h || (t.size || 16) * 1.4;
      if (segHitsRect(ax, ay, bx, by, t.x - r, t.y - r, t.x + tw + r, t.y + th + r)) {
        if (!changedAny && !ed.erase.pages.has(pid)) ed.erase.pages.set(pid, snap(pid));
        changedAny = true; if (!tOut) tOut = A.t.filter(x => x !== t); else tOut = tOut.filter(x => x !== t);
      }
    }
  }
  if (changedAny) { A.s = out; if (tOut) { A.t = tOut; renderLayer(pv); } requestFrame(true); }
}
function segHitsRect(ax, ay, bx, by, x0, y0, x1, y1) {
  const n = Math.max(1, Math.ceil(Math.hypot(bx - ax, by - ay) / 3));
  for (let i = 0; i <= n; i++) { const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n; if (x >= x0 && x <= x1 && y >= y0 && y <= y1) return true; }
  return false;
}
function endErase() {
  const E = ed.erase; ed.erase = null; if (!E || !E.pages.size) return;
  const ops = []; for (const [pid, b] of E.pages) ops.push({ k: 'page', pid, b, a: snap(pid) });
  pushOp(ops.length === 1 ? ops[0] : { k: 'multi', ops });
}

/* ---------- kement seçimi ---------- */
function startLasso(e, pv, P, ai) { if (ai) aiAreaClear(); ed.lasso = { pv, pts: [P], rect: !ai && S.lasso.mode === 'rect', ai: !!ai }; ed.ptrs.set(e.pointerId, { g: 'lasso' }); if (e.pointerType === 'pen') hideCursor(); }
function moveLasso(e) {
  const S2 = ed.lasso; if (!S2) return;
  for (const ev of eventsOf(e)) { const P = local(S2.pv, toWorld(ev.clientX, ev.clientY)); const l = S2.pts[S2.pts.length - 1]; if (Math.hypot(P.x - l.x, P.y - l.y) > 1.5 / ed.view.z) S2.pts.push(P); }
  renderLive();
}
function pip(x, y, poly) { let ins = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const a = poly[i], b = poly[j]; if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) ins = !ins; } return ins; }
function endLasso() {
  const S2 = ed.lasso; ed.lasso = null; renderLive(); if (!S2) return;
  if (S2.ai) { aiAreaEnd(S2); return; }
  const A = ann(S2.pv.meta.id);
  let ext = 0; const p0 = S2.pts[0]; S2.pts.forEach(q => { ext = Math.max(ext, Math.hypot(q.x - p0.x, q.y - p0.y)); });
  if (ext < 8 / ed.view.z) {
    // dokunarak seçim: en üstteki görsel ya da metin
    const hitT = [...A.t].reverse().find(t => p0.x >= t.x && p0.x <= t.x + (t.w || 20) && p0.y >= t.y && p0.y <= t.y + (t.h || 20));
    const hitI = hitT ? null : [...A.i].reverse().find(im => p0.x >= im.x && p0.x <= im.x + im.w && p0.y >= im.y && p0.y <= im.y + im.h);
    if (hitT || hitI) setSel(S2.pv, new Set(), new Set(hitT ? [hitT] : []), new Set(hitI ? [hitI] : []));
    return;
  }
  let poly = S2.pts;
  if (S2.rect) { const a = S2.pts[0], b = S2.pts[S2.pts.length - 1]; const x0 = Math.min(a.x, b.x), x1 = Math.max(a.x, b.x), y0 = Math.min(a.y, b.y), y1 = Math.max(a.y, b.y); poly = [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]; }
  if (poly.length < 3) return;
  const ids = new Set(), tids = new Set(), iids = new Set();
  for (const s of A.s) { const p = s.p, n = p.length / 3, step = Math.max(1, Math.floor(n / 40)); let inside = 0, tot = 0; for (let i = 0; i < n; i += step) { tot++; if (pip(p[3 * i], p[3 * i + 1], poly)) inside++; } if (inside / tot >= .6) ids.add(s); }
  for (const t of A.t) if (pip(t.x + (t.w || 20) / 2, t.y + (t.h || 20) / 2, poly)) tids.add(t);
  for (const im of A.i) if (pip(im.x + im.w / 2, im.y + im.h / 2, poly)) iids.add(im);
  if (!ids.size && !tids.size && !iids.size) { toast('Seçim alanında içerik yok', 1200); return; }
  setSel(S2.pv, ids, tids, iids);
}
function selBBox(sel) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const s of sel.ids) { const b = strokeBB(s); x0 = Math.min(x0, b.x0); y0 = Math.min(y0, b.y0); x1 = Math.max(x1, b.x1); y1 = Math.max(y1, b.y1); }
  for (const t of sel.tids) { x0 = Math.min(x0, t.x); y0 = Math.min(y0, t.y); x1 = Math.max(x1, t.x + (t.w || 20)); y1 = Math.max(y1, t.y + (t.h || 20)); }
  for (const im of sel.iids) { x0 = Math.min(x0, im.x); y0 = Math.min(y0, im.y); x1 = Math.max(x1, im.x + im.w); y1 = Math.max(y1, im.y + im.h); }
  const pad = 4; return { x0: x0 - pad, y0: y0 - pad, x1: x1 + pad, y1: y1 + pad };
}
function setSel(pv, ids, tids, iids) {
  ed.sel = { pv, ids, tids, iids: iids || new Set(), m: [1, 0, 0, 1, 0, 0] }; ed.sel.bb = selBBox(ed.sel);
  buildSelDom(); requestFrame(true); $('#selbar').hidden = false; $('#sCol').hidden = !ids.size && !tids.size; { const ink = [...ids].some(x => x.t !== 'hl'), nt = tids.size; const al = nt >= 2 || (nt >= 1 && ink); $('#sAlign').hidden = !al; $('#sHand').hidden = !ink || al; } placeSelbar();
}
function buildSelDom() {
  $$('.selg', selw).forEach(n => n.remove());
  const sel = ed.sel; if (!sel) return;
  const g = h('div', { class: 'selg' }); const bb = sel.bb, w = bb.x1 - bb.x0, ht = bb.y1 - bb.y0;
  g.append(h('div', { class: 'selbox', style: { left: bb.x0 + 'px', top: bb.y0 + 'px', width: w + 'px', height: ht + 'px' } }),
    h('div', { class: 'selh', 'data-h': 'scale', style: { left: bb.x1 + 'px', top: bb.y1 + 'px' } }));
  if (sel.ids.size) g.append(h('div', { class: 'selh rot', 'data-h': 'rot', style: { left: (bb.x0 + w / 2) + 'px', top: bb.y0 + 'px', transform: 'translateY(calc(-34px * var(--si,1)))' } }));
  sel.g = g; selw.append(g); updateSelStyle();
}
function updateSelStyle() {
  const sel = ed.sel; if (!sel || !sel.g) return; const m = sel.m;
  sel.g.style.left = sel.pv.x + 'px'; sel.g.style.top = sel.pv.y + 'px';
  sel.g.style.transform = `matrix(${m.join(',')})`;
  const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) || 1;
  sel.g.style.setProperty('--si', (1 / (ed.view.z * k)).toFixed(4));
}
function insideSel(P) {
  const sel = ed.sel; if (!sel) return false; const m = sel.m, det = m[0] * m[3] - m[1] * m[2]; if (!det) return false;
  const x = P.x - m[4], y = P.y - m[5]; const lx = (m[3] * x - m[2] * y) / det, ly = (-m[1] * x + m[0] * y) / det;
  const bb = sel.bb, pad = 10 / ed.view.z; return lx >= bb.x0 - pad && lx <= bb.x1 + pad && ly >= bb.y0 - pad && ly <= bb.y1 + pad;
}
const mul = (a, b) => [a[0] * b[0] + a[2] * b[1], a[1] * b[0] + a[3] * b[1], a[0] * b[2] + a[2] * b[3], a[1] * b[2] + a[3] * b[3], a[0] * b[4] + a[2] * b[5] + a[4], a[1] * b[4] + a[3] * b[5] + a[5]];
const xf = (m, x, y) => ({ x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] });
function startSelMove(e, P) { ed.ptrs.set(e.pointerId, { g: 'selmove', P0: P, m0: ed.sel.m.slice() }); $('#selbar').hidden = true; }
function startSelHandle(e, kind) {
  const sel = ed.sel; if (!sel) return; const P = local(sel.pv, toWorld(e.clientX, e.clientY)); const bb = sel.bb;
  const st = { g: kind === 'rot' ? 'selrot' : 'selscale', P0: P, m0: sel.m.slice() };
  st.anchor = xf(sel.m, bb.x0, bb.y0); st.center = xf(sel.m, (bb.x0 + bb.x1) / 2, (bb.y0 + bb.y1) / 2);
  ed.ptrs.set(e.pointerId, st); $('#selbar').hidden = true;
}
function moveSel(e, st) {
  const sel = ed.sel; if (!sel) return; const P = local(sel.pv, toWorld(e.clientX, e.clientY));
  if (st.g === 'selmove') sel.m = mul([1, 0, 0, 1, P.x - st.P0.x, P.y - st.P0.y], st.m0);
  else if (st.g === 'selscale') {
    const a = st.anchor; const d0 = Math.hypot(st.P0.x - a.x, st.P0.y - a.y), d1 = Math.hypot(P.x - a.x, P.y - a.y); let k = d0 > 1 ? d1 / d0 : 1;
    const k0 = Math.sqrt(Math.abs(st.m0[0] * st.m0[3] - st.m0[1] * st.m0[2])); k = Math.max(k, 6 / Math.max(1, (sel.bb.x1 - sel.bb.x0) * k0));
    sel.m = mul([k, 0, 0, k, a.x - k * a.x, a.y - k * a.y], st.m0);
  } else {
    const c = st.center; let ang = Math.atan2(P.y - c.y, P.x - c.x) - Math.atan2(st.P0.y - c.y, st.P0.x - c.x);
    const base = Math.atan2(st.m0[1], st.m0[0]); const tot = base + ang; const sa = Math.round(tot / (Math.PI / 2)) * (Math.PI / 2); if (Math.abs(tot - sa) < .05) ang = sa - base;
    const co = Math.cos(ang), si = Math.sin(ang); sel.m = mul([co, si, -si, co, c.x - co * c.x + si * c.y, c.y - si * c.x - co * c.y], st.m0);
  }
  updateSelStyle(); moveSelItems(); requestFrame(true);
}
function moveSelItems() {
  const sel = ed.sel; const m = sel.m, k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  for (const t of sel.tids) { const el = sel.pv.tmap.get(t.id); if (!el) continue; const q = xf(m, t.x, t.y); el.style.left = q.x + 'px'; el.style.top = q.y + 'px'; el.style.fontSize = t.size * k + 'px'; }
  for (const im of sel.iids) { const el = sel.pv.imap.get(im.id); if (!el) continue; const c = xf(m, im.x + im.w / 2, im.y + im.h / 2); styleIbox(el, { x: c.x - im.w * k / 2, y: c.y - im.h * k / 2, w: im.w * k, h: im.h * k }); }
}
function endSel() { commitSel(); if (ed.sel) { $('#selbar').hidden = false; placeSelbar(); } }
function commitSel() {
  const sel = ed.sel; if (!sel) return; const m = sel.m; if (m.every((v, i) => Math.abs(v - [1, 0, 0, 1, 0, 0][i]) < 1e-6)) return;
  const pid = sel.pv.meta.id, A = ann(pid), b = snap(pid), k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  const nids = new Set(), ntids = new Set(), niids = new Set();
  A.s = A.s.map(s => { if (!sel.ids.has(s)) return s; const ns = transformStroke(s, m); nids.add(ns); return ns; });
  A.t = A.t.map(t => { if (!sel.tids.has(t)) return t; const q = xf(m, t.x, t.y); const nt = { ...t, x: q.x, y: q.y, size: t.size * k, w: (t.w || 20) * k, h: (t.h || 20) * k, ink: null }; if (t.mw) nt.mw = t.mw * k; ntids.add(nt); return nt; });
  A.i = A.i.map(im => { if (!sel.iids.has(im)) return im; const c = xf(m, im.x + im.w / 2, im.y + im.h / 2); const ni = { ...im, x: c.x - im.w * k / 2, y: c.y - im.h * k / 2, w: im.w * k, h: im.h * k }; niids.add(ni); return ni; });
  sel.ids = nids; sel.tids = ntids; sel.iids = niids; sel.m = [1, 0, 0, 1, 0, 0];
  renderLayer(sel.pv); sel.bb = selBBox(sel); buildSelDom();
  pushOp({ k: 'page', pid, b, a: snap(pid) }); requestFrame(true);
}
function clearSel() { if (!ed.sel) return; commitSel(); ed.sel = null; $$('.selg', selw).forEach(n => n.remove()); $('#selbar').hidden = true; requestFrame(true); }
function placeSelbar() {
  const bar = $('#selbar'); const sel = ed.sel; if (!sel || bar.hidden) return;
  const v = ed.view, bb = sel.bb; const pts = [[bb.x0, bb.y0], [bb.x1, bb.y0], [bb.x0, bb.y1], [bb.x1, bb.y1]].map(([x, y]) => xf(sel.m, x, y));
  const sx0 = Math.min(...pts.map(p => p.x)), sx1 = Math.max(...pts.map(p => p.x)), sy0 = Math.min(...pts.map(p => p.y)), sy1 = Math.max(...pts.map(p => p.y));
  const left = v.tx + (sel.pv.x + (sx0 + sx1) / 2) * v.z, top = v.ty + (sel.pv.y + sy0) * v.z, bottom = v.ty + (sel.pv.y + sy1) * v.z;
  const bw = bar.offsetWidth, bh = bar.offsetHeight;
  let y = top - bh - 62; if (y < 8) y = bottom + 28; y = clamp(y, 8, ed.H - bh - 64);
  bar.style.left = clamp(left - bw / 2, 8, ed.W - bw - 8) + 'px'; bar.style.top = y + 'px';
}
$('#sDel').addEventListener('click', () => {
  const sel = ed.sel; if (!sel) return; commitSel(); const pid = sel.pv.meta.id, A = ann(pid), b = snap(pid);
  A.s = A.s.filter(s => !sel.ids.has(s)); A.t = A.t.filter(t => !sel.tids.has(t)); A.i = A.i.filter(im => !sel.iids.has(im));
  ed.sel = null; $$('.selg', selw).forEach(n => n.remove()); $('#selbar').hidden = true;
  renderLayer(sel.pv); pushOp({ k: 'page', pid, b, a: snap(pid) }); requestFrame(true);
});
$('#sDup').addEventListener('click', () => {
  const sel = ed.sel; if (!sel) return; commitSel(); const pid = sel.pv.meta.id, A = ann(pid), b = snap(pid); const off = [1, 0, 0, 1, 14, 14];
  const ns = [...sel.ids].map(s => transformStroke(s, off)), nt = [...sel.tids].map(t => ({ ...t, id: uid(), x: t.x + 14, y: t.y + 14 })), ni = [...sel.iids].map(im => ({ ...im, id: uid(), x: im.x + 14, y: im.y + 14 }));
  A.s.push(...ns); A.t.push(...nt); A.i.push(...ni); renderLayer(sel.pv); pushOp({ k: 'page', pid, b, a: snap(pid) });
  ed.sel = null; setSel(sel.pv, new Set(ns), new Set(nt), new Set(ni));
});
$('#sCol').addEventListener('click', () => {
  openPop($('#sCol'), () => h('div', { class: 'col' }, h('h3', null, 'Seçimin rengi'), swatchGrid('#000000', PALETTE.slice(0, 9), c => {
    const sel = ed.sel; if (!sel) return; commitSel(); const pid = sel.pv.meta.id, A = ann(pid), b = snap(pid); const nids = new Set(), ntids = new Set();
    A.s = A.s.map(s => { if (!sel.ids.has(s)) return s; const n = { ...s, id: uid(), c }; nids.add(n); return n; });
    A.t = A.t.map(t => { if (!sel.tids.has(t)) return t; const n = { ...t, color: c }; ntids.add(n); return n; });
    sel.ids = nids; sel.tids = ntids; renderLayer(sel.pv); pushOp({ k: 'page', pid, b, a: snap(pid) }); requestFrame(true); pushRecent(c);
  })));
});
$('#sDone').addEventListener('click', clearSel);

/* ---------- görsel ekleme ---------- */
function insertImage(src, iw, ih, pv) {
  pv = pv || currentPage(); if (!pv) return;
  const v = ed.view; const maxW = Math.min(pv.meta.w * .7, ed.W / v.z * .7), maxH = Math.min(pv.meta.h * .6, ed.H / v.z * .6);
  const k = Math.min(1, maxW / iw, maxH / ih); const w = iw * k, ht = ih * k;
  const cx = clamp((ed.W / 2 - v.tx) / v.z - pv.x, w / 2, pv.meta.w - w / 2), cy = clamp((ed.H / 2 - v.ty) / v.z - pv.y, ht / 2, pv.meta.h - ht / 2);
  const im = { id: uid(), src, x: cx - w / 2, y: cy - ht / 2, w, h: ht };
  const pid = pv.meta.id, b = snap(pid); ann(pid).i.push(im); renderLayer(pv); pushOp({ k: 'page', pid, b, a: snap(pid) });
  setTool('lasso'); setSel(pv, new Set(), new Set(), new Set([im]));
}
$('#imgIn').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f || !ed.note) return;
  try { const r = await fileToDataUrl(f); insertImage(r.src, r.w / DPR(), r.h / DPR()); toast('Görsel eklendi. Sürükleyerek taşıyın, köşeden boyutlandırın.', 2600); }
  catch (er) { toast('Görsel açılamadı.'); }
});

/* ---------- metin ---------- */
function newText(pv, P) {
  const t = { id: uid(), x: Math.max(0, P.x), y: Math.max(0, P.y - S.text.size * .65), text: '', size: S.text.size, color: S.text.color, font: S.text.font, bold: S.text.bold, wt: S.text.wt || 0 };
  const el = h('div', { class: 'tbox' }); el.dataset.id = t.id; styleTbox(el, t); el.style.maxWidth = Math.max(40, pv.meta.w - t.x - 6) + 'px';
  pv.tl.append(el); pv.tmap.set(t.id, el);
  beginEdit(pv, t, el);
}
function editExisting(el) {
  const pv = ed.pvs.find(p => p.tl.contains(el)); if (!pv) return; const t = ann(pv.meta.id).t.find(x => x.id === el.dataset.id); if (!t) return;
  finishText(); beginEdit(pv, { ...t }, el);
  Object.assign(S.text, { font: t.font, size: t.size, color: t.color, bold: t.bold }); refreshToolbar();
}
function beginEdit(pv, t, el) {
  ed.editing = { pv, t, el, before: snap(pv.meta.id) };
  try { el.contentEditable = 'plaintext-only'; } catch (e) { } if (el.contentEditable !== 'plaintext-only') el.contentEditable = 'true';
  el.classList.add('editing'); el.focus();
  try { const r = document.createRange(); r.selectNodeContents(el); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { }
  const grip = h('div', { class: 'tgrip', title: 'Taşı' }, icon(IC.move)); ed.editing.grip = grip; selw.append(grip); placeGrip();
}
function placeGrip() { const E = ed.editing; if (!E || !E.grip) return; const inv = 1 / ed.view.z; E.grip.style.left = (E.pv.x + E.t.x - 34 * inv) + 'px'; E.grip.style.top = (E.pv.y + E.t.y) + 'px'; }
function startGrip(e) { const E = ed.editing; if (!E) return; ed.ptrs.set(e.pointerId, { g: 'grip', w0: toWorld(e.clientX, e.clientY), x0: E.t.x, y0: E.t.y }); }
function moveGrip(e, st) { const E = ed.editing; if (!E) return; const w = toWorld(e.clientX, e.clientY); E.t.x = clamp(st.x0 + w.x - st.w0.x, 0, E.pv.meta.w - 10); E.t.y = clamp(st.y0 + w.y - st.w0.y, 0, E.pv.meta.h - 10); E.el.style.left = E.t.x + 'px'; E.el.style.top = E.t.y + 'px'; E.el.style.maxWidth = tMaxW(E.pv, E.t) + 'px'; placeGrip(); }
function endGrip() { const E = ed.editing; if (E) E.el.focus(); }
function finishText() {
  const E = ed.editing; if (!E) return; ed.editing = null;
  if (E.grip) E.grip.remove();
  const el = E.el; el.contentEditable = 'false'; el.classList.remove('editing'); try { el.blur(); } catch (e) { }
  const text = (el.innerText || '').replace(/\n+$/, '');
  const pid = E.pv.meta.id, A = ann(pid);
  const idx = A.t.findIndex(x => x.id === E.t.id);
  if (!text.trim()) {
    if (idx >= 0) { A.t.splice(idx, 1); renderLayer(E.pv); pushOp({ k: 'page', pid, b: E.before, a: snap(pid) }); }
    else { el.remove(); E.pv.tmap.delete(E.t.id); }
    return;
  }
  const nt = { ...E.t, text, w: el.offsetWidth, h: el.offsetHeight };
  if (idx >= 0) { const o = A.t[idx]; if (['text', 'x', 'y', 'size', 'color', 'font', 'bold'].every(k => o[k] === nt[k])) { renderLayer(E.pv); return; } A.t[idx] = nt; }
  else A.t.push(nt);
  renderLayer(E.pv); pushOp({ k: 'page', pid, b: E.before, a: snap(pid) });
}

/* ---------- klavye kısayolları ---------- */
addEventListener('keydown', e => {
  if (edView.hidden || !ed.note) return;
  if (ed.capture) { if (e.key === 'Escape') captureEnd(); return; }
  const typing = ed.editing || ed.stickyEdit || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName);
  if (e.key === 'Escape') { if (ed.editing) finishText(); else if (ed.sel) clearSel(); else if (pgridEl) closePgrid(); else closePop(); return; }
  if (typing || document.querySelector('.modal-back, .od-back')) return;
  const mod = e.ctrlKey || e.metaKey;
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); return; }
  if (mod && e.key.toLowerCase() === 'f') { e.preventDefault(); S.panelTab = 'find'; setPanel(true); return; }
  if (mod && e.key.toLowerCase() === 's') { e.preventDefault(); if (ed.note.od) syncNow(); else saveNote(true).then(() => toast('Tablete kaydedildi', 1200)); return; }
  if ((e.key === 'Delete' || e.key === 'Backspace') && ed.sel) { $('#sDel').click(); return; }
  const map = { p: 'pen', h: 'hl', e: 'eraser', l: 'lasso', t: 'text' }; const k = e.key.toLowerCase();
  if (!mod && map[k]) { setTool(map[k]); return; }
  if (!mod && k === 's') { captureStart(); return; }
  if (e.key === 'PageDown' || e.key === 'ArrowDown') setView(ed.view.z, ed.view.tx, ed.view.ty - (e.key === 'PageDown' ? ed.H * .85 : 60));
  if (e.key === 'PageUp' || e.key === 'ArrowUp') setView(ed.view.z, ed.view.tx, ed.view.ty + (e.key === 'PageUp' ? ed.H * .85 : 60));
  if (!mod && (e.key === 'ArrowRight' || e.key === 'ArrowLeft')) setView(ed.view.z, ed.view.tx + (e.key === 'ArrowRight' ? -60 : 60), ed.view.ty);
  if (mod && (e.key === '+' || e.key === '=')) { e.preventDefault(); zoomAt(ed.view.z * 1.25, ed.W / 2, ed.H / 2); }
  if (mod && e.key === '-') { e.preventDefault(); zoomAt(ed.view.z / 1.25, ed.W / 2, ed.H / 2); }
});
$('#undoBtn').addEventListener('click', undo);
$('#redoBtn').addEventListener('click', redo);
$('#zIn').addEventListener('click', () => zoomAt(ed.view.z * 1.25, ed.W / 2, ed.H / 2));
$('#zOut').addEventListener('click', () => zoomAt(ed.view.z / 1.25, ed.W / 2, ed.H / 2));
$('#zLbl').addEventListener('click', fitWidth);

/* ---------- kaydırma düğmeleri (üst çubukta) ----------
   Yazarken diğer elle dokunulur: sayfa ekranın bir kısmı kadar yumuşakça sağa / aşağı kayar (Ayarlar → Görünüm).
   Basılı tutunca kaymaya devam eder. Kalemin hemen ardından gelen parmak dokunuşları sayfada avuç sayıldığı için
   (isPalm) parmakla sürüklemek yazarken çoğu zaman çalışmaz; düğmeler sayfanın dışında olduğundan bundan etkilenmez.
   Yan yana belgede, en son dokunulan bölmeyi kaydırır. */
const PAN_DIRS = { l: [-1, 0, 'Sola kaydır', 'leftArrow'], r: [1, 0, 'Sağa kaydır', 'rightArrow'], u: [0, -1, 'Yukarı kaydır', 'upArrow'], d: [0, 1, 'Aşağı kaydır', 'downArrow'] };
function panClamp(tx, ty) { const v = ed.view, ox = v.tx, oy = v.ty; v.tx = tx; v.ty = ty; clampView(); const r = [v.tx, v.ty]; v.tx = ox; v.ty = oy; return r; }
function panCan(dir) {
  if (!ed.note || !ed.W) return false;
  const [dx, dy] = PAN_DIRS[dir], A = ed.panAnim, v = ed.view, bx = A ? A.x1 : v.tx, by = A ? A.y1 : v.ty;
  const [tx, ty] = panClamp(bx - dx * 4, by - dy * 4); return Math.abs(tx - bx) > .5 || Math.abs(ty - by) > .5;
}
function panStep(dir) {
  if (!ed.note) return false;
  const [dx, dy] = PAN_DIRS[dir], f = clamp((S.prefs.panStep || 50) / 100, .15, .9), v = ed.view, A0 = ed.panAnim;
  const bx = A0 ? A0.x1 : v.tx, by = A0 ? A0.y1 : v.ty;
  const [tx, ty] = panClamp(bx - dx * ed.W * f, by - dy * ed.H * f);
  if (Math.abs(tx - bx) < .5 && Math.abs(ty - by) < .5) return false;
  if (ed.inertia) { cancelAnimationFrame(ed.inertia); ed.inertia = 0; }
  if (A0) cancelAnimationFrame(A0.raf);
  const x0 = v.tx, y0 = v.ty, z = v.z, t0 = performance.now(), ms = 200, A = ed.panAnim = { x1: tx, y1: ty, raf: 0 };
  const tick = t => {
    if (ed.panAnim !== A) return;
    if (v.z !== z) { ed.panAnim = null; return; } // arada yakınlaştırıldı
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    setView(z, x0 + (tx - x0) * e, y0 + (ty - y0) * e);
    if (k < 1) A.raf = requestAnimationFrame(tick); else ed.panAnim = null;
  };
  A.raf = requestAnimationFrame(tick);
  return true;
}
/* kalem sayfaya değince (ya da başka bir kaydırma başlayınca) yarım kalan kayma hemen tamamlanır */
function panFinish() { const A = ed.panAnim; if (!A) return; ed.panAnim = null; cancelAnimationFrame(A.raf); setView(ed.view.z, A.x1, A.y1); }
/* basılı tutma: sabit hızla kaymaya devam */
function panHold(dir, on) {
  cancelAnimationFrame(ed.panHoldRaf); ed.panHoldRaf = 0;
  if (!on || !ed.note) return;
  panFinish();
  const [dx, dy] = PAN_DIRS[dir], spd = (dx ? ed.W : ed.H) * .9 * clamp((S.prefs.panStep || 50) / 50, .6, 1.5) / 1000; // px / ms
  let last = performance.now();
  const tick = t => {
    const dt = Math.min(48, t - last); last = t;
    const v = ed.view, bx = v.tx, by = v.ty;
    setView(v.z, bx - dx * spd * dt, by - dy * spd * dt);
    if (Math.abs(v.tx - bx) < .01 && Math.abs(v.ty - by) < .01) { ed.panHoldRaf = 0; return; }
    ed.panHoldRaf = requestAnimationFrame(tick);
  };
  ed.panHoldRaf = requestAnimationFrame(tick);
}
const panFitsW = () => !!ed.note && ed.maxW * ed.view.z + 2 * MARGIN <= ed.W + .5;
window.panStep = panStep; window.panCan = panCan; window.panHold = panHold; window.panFitsW = panFitsW;
const panPane = () => (typeof activeSide === 'function' && activeSide()) || window;
function buildPanBtns() {
  if (EMBED) return;
  let box = $('#panBtns');
  if (!box) { box = h('div', { class: 'panpill', id: 'panBtns', role: 'group', 'aria-label': 'Sayfayı kaydır' }); $('#undoBtn').before(box); }
  box.innerHTML = '';
  const mode = S.prefs.pan || 'rd';
  box.hidden = mode === 'off';
  if (box.hidden) { fitEbar(); return; }
  for (const dir of mode === 'all' ? ['l', 'r', 'u', 'd'] : ['r', 'd']) {
    const [dx, dy, name, ic] = PAN_DIRS[dir];
    const b = h('button', { class: 'ibtn', type: 'button', 'aria-label': name, title: name + ' (basılı tut: kaymaya devam eder)', 'data-dir': dir, style: '--ex:' + dx * 3 + 'px;--ey:' + dy * 3 + 'px' }, icon(IC[ic]));
    let holdT = 0, held = false, pt = 0;
    const fire = () => {
      const w = panPane();
      if (w.panStep(dir)) return true;
      b.classList.remove('edge'); void b.offsetWidth; b.classList.add('edge');
      if (dx && w.panFitsW && w.panFitsW() && !panHintShown) { panHintShown = true; toast('Sayfa genişliği ekrana sığıyor; sağa-sola kaydırmak için önce yakınlaştırın.', 2800); }
      return false;
    };
    const stop = () => { clearTimeout(holdT); if (held) { held = false; try { panPane().panHold(dir, false); } catch (e) { } } b.classList.remove('hold'); };
    b.addEventListener('pointerdown', e => {
      if (e.button > 0) return;
      e.preventDefault(); pt = Date.now();
      try { b.setPointerCapture(e.pointerId); } catch (er) { }
      if (!fire()) return;
      clearTimeout(holdT);
      holdT = setTimeout(() => { held = true; b.classList.add('hold'); panPane().panHold(dir, true); }, 380);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(t => b.addEventListener(t, stop));
    b.addEventListener('click', () => { if (Date.now() - pt < 1500) return; fire(); }); // klavye
    b.addEventListener('contextmenu', e => e.preventDefault());
    box.append(b);
  }
  panSync(); fitEbar();
}
let panHintShown = false;
/* düğmeler o yönde gidilecek yer yoksa sönük görünür (etkin bölmeye göre) */
function panSync() {
  if (EMBED) { try { if (parent.panSync) parent.panSync(); } catch (e) { } return; }
  const box = $('#panBtns'); if (!box || box.hidden) return;
  const w = panPane();
  for (const b of box.children) { let can = true; try { can = w.panCan(b.dataset.dir); } catch (e) { } b.classList.toggle('dis', !can); b.setAttribute('aria-disabled', can ? 'false' : 'true'); }
}
window.panSync = panSync; window.buildPanBtns = buildPanBtns;
buildPanBtns();

/* ---------- S Pen yan tuşu (Android'den bildirilir) ---------- */
let penBtnNative = false;
window.__penButton = on => {
  penBtnNative = !!on;
  if (!on || S.prefs.side !== 'eraser' || !ed.note) return;
  for (const [id, st] of ed.ptrs) {
    if (st.g !== 'draw' || !st.live || st.live !== ed.live) continue;
    const L = st.live, last = L.last || L.sm;
    endDraw(st, now() - L.t0 < 400);           // yeni başlamış çizgiyi at, uzun çizgiyi koru
    if (last) { ed.erase = { pages: new Map(), last: { pv: L.pv, x: last.x, y: last.y } }; ed.ptrs.set(id, { g: 'erase' }); }
    else ed.ptrs.delete(id);
  }
};
