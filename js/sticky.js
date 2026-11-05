'use strict';
/* =========================================================
   Yapışkan notlar: sayfanın bir alanına yapıştırılan renkli kartlar
   (A.n = [{ id, x, y, w, h, text, color, open, title }])
   ve Yapay zekâ alan seçimi: kalemle bir alanı çevrele → açıkla / çevir / not
   ========================================================= */
const stickw = $('#stickw');
const STICKY_COLORS = [['#FFE58A', 'Sarı'], ['#FFC6D3', 'Pembe'], ['#C3E4FF', 'Mavi'], ['#CDEFC4', 'Yeşil'], ['#DDD0FF', 'Mor'], ['#FFD6B0', 'Turuncu']];
const STICKY_SIZE = 9;

function renderStickies(pv) {
  for (const el of pv.nEls || []) el.remove();
  pv.nEls = [];
  const A = ed.note.ann[pv.meta.id]; if (!A || !A.n) return;
  for (const n of A.n) {
    const el = stickyEl(n, pv); stickw.append(el); pv.nEls.push(el);
    if (n.open !== false) { const hh = el.offsetHeight; if (hh && Math.abs((n.h || 0) - hh) > .5) n.h = hh; }
    // sayfanın dışına taşmasın: alt kenara değiyorsa yukarı it, sağa taşıyorsa sola al
    const eh = el.offsetHeight || 20, ew = el.offsetWidth || n.w || 20;
    const ny = clamp(n.y, 0, Math.max(0, pv.meta.h - eh)), nx = clamp(n.x, 0, Math.max(0, pv.meta.w - ew));
    if (ny !== n.y || nx !== n.x) { n.y = ny; n.x = nx; el.style.top = (pv.y + n.y) + 'px'; el.style.left = (pv.x + n.x) + 'px'; }
  }
}
function stickyEl(n, pv) {
  const open = n.open !== false;
  const el = h('div', { class: 'sticky' + (open ? '' : ' closed'), 'data-id': n.id, style: { left: (pv.x + n.x) + 'px', top: (pv.y + n.y) + 'px', width: open ? n.w + 'px' : '', background: n.color || STICKY_COLORS[0][0], fontSize: STICKY_SIZE + 'px' } });
  el._n = n; el._pv = pv;
  if (!open) { el.append(h('span', { class: 'sic', title: (n.title || 'Not') + ' · açmak için dokunun' }, icon(IC.sticky))); return el; }
  el.append(
    h('div', { class: 'sh' }, h('span', { class: 'stt' }, n.title || 'Not'),
      h('button', { type: 'button', class: 'sbtn smin', 'aria-label': 'Küçült', title: 'Küçült' }, icon(IC.minus)),
      h('button', { type: 'button', class: 'sbtn smenu', 'aria-label': 'Not seçenekleri', title: 'Seçenekler' }, icon(IC.dotsV))),
    h('div', { class: 'sb' + (n.text ? '' : ' empty') }, n.text || 'Yazmak için dokunun'),
    h('i', { class: 'srz', title: 'Genişliği değiştir' }));
  el.querySelector('.smin').addEventListener('click', () => stickySet(pv, n.id, { open: false }));
  el.querySelector('.smenu').addEventListener('click', e => stickyMenu(e.currentTarget, pv, n.id));
  return el;
}
function stickyFind(pv, id) { const A = ann(pv.meta.id); return A.n.find(x => x.id === id); }
function stickySet(pv, id, patch, noOp) {
  const pid = pv.meta.id, b = snap(pid), A = ann(pid);
  A.n = A.n.map(x => x.id === id ? { ...x, ...patch } : x);
  renderStickies(pv); if (!noOp) { pushOp({ k: 'page', pid, b, a: snap(pid) }); }
}
function addSticky(pv, opt = {}) {
  if (!pv) pv = currentPage(); if (!pv) return null;
  const v = ed.view;
  let w = clamp(opt.w || 190, 110, pv.meta.w - 8);
  let x = opt.x != null ? opt.x : clamp((ed.W / 2 - v.tx) / v.z - pv.x - w / 2, 4, pv.meta.w - w - 4);
  let y = opt.y != null ? opt.y : clamp((ed.H / 2 - v.ty) / v.z - pv.y - 40, 4, pv.meta.h - 40);
  x = clamp(x, 0, Math.max(0, pv.meta.w - w)); y = clamp(y, 0, pv.meta.h - 20);
  const n = { id: uid(), x, y, w, h: 0, text: opt.text || '', color: opt.color || S.stickyColor || STICKY_COLORS[0][0], open: opt.open !== false, title: opt.title || '' };
  const pid = pv.meta.id, b = snap(pid); ann(pid).n.push(n); renderStickies(pv); pushOp({ k: 'page', pid, b, a: snap(pid) });
  if (opt.edit) requestAnimationFrame(() => { const el = stickw.querySelector(`.sticky[data-id="${n.id}"]`); if (el) beginStickyEdit(el); });
  return n;
}
function stickyMenu(anchor, pv, id) {
  const n = stickyFind(pv, id); if (!n) return;
  openPop(anchor, () => {
    const sw = h('div', { class: 'fcolors' });
    for (const [c, name] of STICKY_COLORS) sw.append(h('button', { type: 'button', class: 'sw' + (c === n.color ? ' on' : ''), style: { background: c }, 'aria-label': name, onclick: () => { closePop(); S.stickyColor = c; saveSettings(); stickySet(pv, id, { color: c }); } }));
    return h('div', { class: 'col' }, h('h3', null, 'Yapışkan not'), sw, menu([
      { label: 'Metni düzenle', icon: IC.rename, onClick: () => { const el = stickw.querySelector(`.sticky[data-id="${id}"]`); if (el) beginStickyEdit(el); } },
      { label: 'Küçült', icon: IC.minus, sub: 'Sayfada küçük bir simge olarak kalır', onClick: () => stickySet(pv, id, { open: false }) },
      { label: 'Metni kopyala', icon: IC.copy, disabled: !n.text, onClick: () => copyText(n.text) },
      { label: 'Çoğalt', icon: IC.dup, onClick: () => addSticky(pv, { ...n, x: n.x + 12, y: n.y + 12 }) },
      '-',
      { label: 'Notu sil', icon: IC.trash, danger: true, onClick: () => { const pid = pv.meta.id, b = snap(pid), A = ann(pid); A.n = A.n.filter(x => x.id !== id); renderStickies(pv); pushOp({ k: 'page', pid, b, a: snap(pid) }); toast('Not silindi · Geri al ile geri getirin', 1800); } }
    ]));
  });
}
/* ---------- düzenleme ---------- */
function beginStickyEdit(el) {
  finishSticky();
  const body = el.querySelector('.sb'); if (!body) return;
  const n = el._n; ed.stickyEdit = { el, pv: el._pv, id: n.id, before: n.text || '' };
  el.classList.add('editing'); body.classList.remove('empty'); body.textContent = n.text || '';
  try { body.contentEditable = 'plaintext-only'; } catch (e) { } if (body.contentEditable !== 'plaintext-only') body.contentEditable = 'true';
  body.focus();
  try { const r = document.createRange(); r.selectNodeContents(body); r.collapse(false); const s = getSelection(); s.removeAllRanges(); s.addRange(r); } catch (e) { }
  body.addEventListener('keydown', e => { if (e.key === 'Escape') { e.preventDefault(); finishSticky(); } e.stopPropagation(); });
  body.addEventListener('blur', () => setTimeout(() => { if (ed.stickyEdit && ed.stickyEdit.el === el && document.activeElement !== body) finishSticky(); }, 120));
}
function finishSticky() {
  const E = ed.stickyEdit; if (!E) return; ed.stickyEdit = null;
  const body = E.el.querySelector('.sb'); const text = body ? (body.innerText || '').replace(/\n+$/, '') : '';
  if (body) { body.contentEditable = 'false'; try { body.blur(); } catch (e) { } }
  if (text !== E.before) stickySet(E.pv, E.id, { text, h: E.el.offsetHeight });
  else renderStickies(E.pv);
}
/* ---------- telefonda not penceresi ----------
   Telefonda sayfadaki not küçük kalır; dokununca alttan açılan pencerede okunaklı yazıyla okunur ve düzenlenir.
   Buradan sayfada açık ya da küçük (simge) gösterilmesi, rengi ve silinmesi seçilir. Geri tuşu da kaydederek kapatır. */
function phoneStickySheet(pv, id, isNew) {
  const n0 = stickyFind(pv, id); if (!n0) return;
  document.querySelectorAll('.nsheet-back').forEach(x => x._close ? x._close() : x.remove());
  let color = n0.color || STICKY_COLORS[0][0], open = n0.open !== false, done = false;
  const ta = h('textarea', { class: 'nsta', rows: 6, placeholder: 'Notunu yaz…', 'aria-label': 'Not metni' }); ta.value = n0.text || '';
  const sw = h('div', { class: 'fcolors nscolors', role: 'radiogroup', 'aria-label': 'Not rengi' });
  const back = h('div', { class: 'modal-back nsheet-back' });
  const sheet = h('div', { class: 'nsheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': n0.title || 'Not' });
  const paint = () => {
    sheet.style.setProperty('--nc', color); sw.innerHTML = '';
    for (const [c, name] of STICKY_COLORS) sw.append(h('button', { type: 'button', class: 'sw' + (c === color ? ' on' : ''), role: 'radio', 'aria-checked': c === color ? 'true' : 'false', style: { background: c }, 'aria-label': name, onclick: () => { color = c; S.stickyColor = c; saveSettings(); paint(); } }));
  };
  const close = () => {
    if (done) return; done = true; back.remove();
    const n = stickyFind(pv, id); if (!n) return;
    const text = ta.value.replace(/\s+$/, '');
    const pid = pv.meta.id;
    if (isNew && !text.trim()) { const b = snap(pid), A = ann(pid); A.n = A.n.filter(x => x.id !== id); renderStickies(pv); pushOp({ k: 'page', pid, b, a: snap(pid) }); return; }
    const patch = {};
    if (text !== (n.text || '')) { patch.text = text; patch.h = 0; }
    if (color !== n.color) patch.color = color;
    if (open !== (n.open !== false)) patch.open = open;
    if (Object.keys(patch).length) stickySet(pv, id, patch);
  };
  back._close = close;
  const openRow = toggleRow('nsOpen', 'Sayfada açık göster', open, v => { open = v; }, 'Kapalıyken sayfada küçük bir simge olarak durur');
  sheet.append(
    h('div', { class: 'nshead' }, h('i', { class: 'nsdot', 'aria-hidden': 'true' }), h('b', null, n0.title || (isNew ? 'Yeni not' : 'Not')), h('span', { class: 'grow' }),
      h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kaydet ve kapat', onclick: close }, icon(IC.close))),
    ta, sw, openRow,
    h('div', { class: 'nsacts' },
      isNew ? null : h('button', { class: 'btn danger', type: 'button', onclick: () => {
        done = true; back.remove(); const pid = pv.meta.id, b = snap(pid), A = ann(pid); A.n = A.n.filter(x => x.id !== id); renderStickies(pv); pushOp({ k: 'page', pid, b, a: snap(pid) }); toast('Not silindi · Geri al ile geri getirin', 2000);
      } }, icon(IC.trash), 'Sil'),
      n0.text ? h('button', { class: 'btn', type: 'button', onclick: () => copyText(ta.value) }, icon(IC.copy), 'Kopyala') : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn primary', type: 'button', onclick: close }, 'Bitti')));
  back.append(sheet);
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  ta.addEventListener('keydown', e => e.stopPropagation());
  document.body.append(back); paint();
  if (isNew || !n0.text) setTimeout(() => ta.focus(), 60);
}
window.phoneStickySheet = phoneStickySheet;

/* ---------- sürükleme, boyutlandırma, dokunma (editor onDown'dan çağrılır) ---------- */
function stickyDown(e, el) {
  const pv = el._pv, n = el._n; if (!pv || !n) return;
  if (ed.stickyEdit && ed.stickyEdit.el === el && e.target.closest('.sb')) return; // yazarken imleç
  e.preventDefault(); capture(e);
  const w0 = toWorld(e.clientX, e.clientY);
  const g = e.target.closest('.srz') ? 'stickyrz' : 'sticky';
  ed.ptrs.set(e.pointerId, { g, el, pv, id: n.id, w0, x0: n.x, y0: n.y, wd0: n.w, sx: e.clientX, sy: e.clientY, moved: false, onBody: !!e.target.closest('.sb') });
}
function moveSticky(e, st) {
  if (!st.moved && Math.hypot(e.clientX - st.sx, e.clientY - st.sy) < 8) return;
  st.moved = true; st.el.classList.add('dragging');
  const w = toWorld(e.clientX, e.clientY), pv = st.pv, n = st.el._n;
  if (st.g === 'stickyrz') { const nw = clamp(st.wd0 + w.x - st.w0.x, 100, pv.meta.w - n.x); st.el.style.width = nw + 'px'; st.nw = nw; return; }
  // sürüklerken başka sayfaya geçebilir; bırakınca o sayfaya taşınır
  st.nx = st.x0 + w.x - st.w0.x; st.ny = st.y0 + w.y - st.w0.y;
  st.el.style.left = (pv.x + st.nx) + 'px'; st.el.style.top = (pv.y + st.ny) + 'px';
}
function endSticky(st, cancel) {
  st.el.classList.remove('dragging');
  if (cancel) { renderStickies(st.pv); return; }
  const n = st.el._n;
  if (!st.moved) { if (PHONE) { phoneStickySheet(st.pv, st.id); return; } if (n.open === false) stickySet(st.pv, st.id, { open: true }); else if (st.onBody) beginStickyEdit(st.el); return; }
  if (st.g === 'stickyrz') { stickySet(st.pv, st.id, { w: st.nw || n.w, h: 0 }); return; }
  const pv = st.pv, ew = st.el.offsetWidth, eh = st.el.offsetHeight;
  const cw = { x: pv.x + st.nx + Math.min(ew, 60) / 2, y: pv.y + st.ny + Math.min(eh, 30) / 2 };
  const tgt = pageAtWorld(cw, false) || pv;
  const fit = (p, x, y) => ({ x: clamp(x, 0, Math.max(0, p.meta.w - ew)), y: clamp(y, 0, Math.max(0, p.meta.h - eh)) });
  if (tgt === pv) { const q = fit(pv, st.nx, st.ny); stickySet(pv, st.id, q); return; }
  const q = fit(tgt, pv.x + st.nx - tgt.x, pv.y + st.ny - tgt.y);
  const a = pv.meta.id, b = tgt.meta.id, ba = snap(a), bb = snap(b);
  ann(a).n = ann(a).n.filter(x => x.id !== st.id); ann(b).n.push({ ...n, x: q.x, y: q.y });
  renderStickies(pv); renderStickies(tgt);
  pushOp({ k: 'multi', ops: [{ k: 'page', pid: a, b: ba, a: snap(a) }, { k: 'page', pid: b, b: bb, a: snap(b) }] });
}

/* =========================================================
   Yapay zekâ alanı: kement gibi çiz, içindeki metni topla
   ========================================================= */
function aiAreaClear() { ed.aiArea = null; const b = $('#aiBar'); if (b) b.remove(); renderLive(); }
async function aiAreaEnd(L) {
  const pv = L.pv; let poly = L.pts;
  let ext = 0; const p0 = poly[0]; poly.forEach(q => { ext = Math.max(ext, Math.hypot(q.x - p0.x, q.y - p0.y)); });
  if (ext < 14 / ed.view.z || poly.length < 4) { renderLive(); return; }
  const xs = poly.map(q => q.x), ys = poly.map(q => q.y);
  const bb = { x0: Math.max(0, Math.min(...xs)), y0: Math.max(0, Math.min(...ys)), x1: Math.min(pv.meta.w, Math.max(...xs)), y1: Math.min(pv.meta.h, Math.max(...ys)) };
  ed.aiArea = { pv, poly, bb, text: null };
  renderLive(); aiBar('Metin okunuyor…');
  let text = '';
  try { text = await areaText(pv, poly); } catch (e) { }
  if (!ed.aiArea || ed.aiArea.poly !== poly) return;
  ed.aiArea.text = text;
  aiBar();
}
async function areaText(pv, poly) {
  const parts = [];
  const v = ed.view, sr = stage.getBoundingClientRect();
  const toP = (cx, cy) => ({ x: (cx - sr.left - v.tx) / v.z - pv.x, y: (cy - sr.top - v.ty) / v.z - pv.y });
  if (pv.meta.k === 'pdf') {
    const div = await ensureTextLayer(pv);
    if (div) {
      let lastY = null;
      for (const sp of div.querySelectorAll('span')) {
        const t = sp.textContent; if (!t || !t.trim()) continue;
        const r = sp.getBoundingClientRect(); if (!r.width || !r.height) continue;
        const cy = (r.top + r.bottom) / 2; const words = [];
        // kelimelerin yatay konumunu karakter sırasına göre yaklaşık hesapla
        const re = /\S+/g; let m;
        while ((m = re.exec(t))) { const mid = (m.index + m[0].length / 2) / t.length; const q = toP(r.left + r.width * mid, cy); if (pip(q.x, q.y, poly)) words.push(m[0]); }
        if (!words.length) continue;
        const y = toP(0, cy).y;
        if (lastY != null && Math.abs(y - lastY) > r.height / v.z * .6) parts.push('\n'); else if (parts.length) parts.push(' ');
        parts.push(words.join(' ')); lastY = y;
      }
    }
  }
  const A = ed.note.ann[pv.meta.id];
  if (A) {
    for (const t of A.t || []) if (pip(t.x + (t.w || 20) / 2, t.y + (t.h || 20) / 2, poly)) parts.push('\n', t.text);
    for (const n of A.n || []) if (n.text && pip(n.x + n.w / 2, n.y + 10, poly)) parts.push('\n', n.text);
  }
  return parts.join('').replace(/(\p{L})-\n(\p{Ll})/gu, '$1$2').replace(/[ \t]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{2,}/g, '\n').trim();
}
/* Metin yoksa (taranmış sayfa, el yazısı) alanın görüntüsü yapay zekâya gönderilir */
async function areaImage(pv, bb) {
  const pad = 6, x0 = Math.max(0, bb.x0 - pad), y0 = Math.max(0, bb.y0 - pad), x1 = Math.min(pv.meta.w, bb.x1 + pad), y1 = Math.min(pv.meta.h, bb.y1 + pad);
  const s = Math.min(3, 1600 / Math.max(1, x1 - x0), 1600 / Math.max(1, y1 - y0));
  const c = document.createElement('canvas'); c.width = Math.max(8, Math.round((x1 - x0) * s)); c.height = Math.max(8, Math.round((y1 - y0) * s));
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  if (pv.meta.k === 'pdf' && ed.pdf) { const pg = await getPdfPage(pv.meta.i); await pg.render({ canvasContext: ctx, viewport: pg.getViewport({ scale: s, offsetX: -x0 * s, offsetY: -y0 * s }) }).promise; }
  else { ctx.save(); ctx.translate(-x0 * s, -y0 * s); drawBg(ctx, pv.meta, s); ctx.restore(); }
  ctx.setTransform(s, 0, 0, s, -x0 * s, -y0 * s);
  await paintAnnotations(ctx, ed.note.ann[pv.meta.id]);
  return c.toDataURL('image/jpeg', .9).split(',')[1];
}
function aiBar(wait) {
  let bar = $('#aiBar'); if (bar) bar.remove();
  const A = ed.aiArea; if (!A) return;
  const has = !!(A.text && A.text.trim());
  const place = { pv: A.pv, x: A.bb.x0, y: A.bb.y1, top: A.bb.y0, w: A.bb.x1 - A.bb.x0, area: true };
  const go = async mode => {
    const txt = A.text; let img = null;
    if (!has) { aiBar('Görüntü hazırlanıyor…'); try { img = await areaImage(A.pv, A.bb); } catch (e) { } }
    aiAreaClear(); openDict(txt || '', '', place, mode, img);
  };
  bar = h('div', { class: 'floaty selbar tbar aibar', id: 'aiBar' },
    wait ? h('span', { class: 'aiwait' }, wait) : [
      h('button', { class: 'btn', type: 'button', onclick: () => go('auto') }, icon(IC.spark), 'Açıkla'),
      h('button', { class: 'btn', type: 'button', onclick: () => go('translate') }, icon(IC.translate), 'Çevir'),
      h('button', { class: 'btn', type: 'button', onclick: () => { aiAreaClear(); addSticky(place.pv, { x: place.x, y: place.top, w: Math.max(150, Math.min(260, place.w)), edit: true }); } }, icon(IC.sticky), 'Not yapıştır'),
      has ? h('button', { class: 'btn', type: 'button', onclick: () => { copyText(A.text); aiAreaClear(); } }, icon(IC.copy), 'Kopyala') : null,
      has ? null : h('span', { class: 'aiwait' }, 'Seçilebilir metin yok; görüntü gönderilecek')],
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: aiAreaClear }, icon(IC.close)));
  $('#ui').append(bar);
  placeAiBar();
}
function placeAiBar() {
  const bar = $('#aiBar'), A = ed.aiArea; if (!bar || !A) return;
  const v = ed.view, pv = A.pv;
  const left = v.tx + (pv.x + (A.bb.x0 + A.bb.x1) / 2) * v.z, top = v.ty + (pv.y + A.bb.y0) * v.z, bottom = v.ty + (pv.y + A.bb.y1) * v.z;
  const bw = bar.offsetWidth, bh = bar.offsetHeight;
  let y = top - bh - 14; if (y < 8) y = bottom + 14; y = clamp(y, 8, ed.H - bh - 64);
  bar.style.left = clamp(left - bw / 2, 8, ed.W - bw - 8) + 'px'; bar.style.top = y + 'px';
}

/* Yapay zekâ yanıtını yapışkan nota dönüştür */
function stickyFromAnswer(place, word, answer, kind) {
  const P = plain(answer).split('\n').map(l => l.trim()).filter(Boolean);
  let text, title;
  if (kind === 'word') {
    const line = (P.find(l => /^Anlamı:/i.test(l)) || P[1] || '').replace(/^Anlamı:\s*/i, '');
    const tr = (P.find(l => /^Türkçesi:/i.test(l)) || '').replace(/^Türkçesi:\s*/i, '');
    text = (tr ? tr + ' — ' : '') + line; title = word.length > 28 ? word.slice(0, 26) + '…' : word;
  } else if (kind === 'translate') { text = P.join('\n'); title = 'Çeviri'; }
  else {
    const i = P.findIndex(l => /^Türkçesi:/i.test(l));
    text = P.join('\n').replace(/^Özet:\s*/i, 'Özet: '); title = i >= 0 ? 'Açıklama ve çeviri' : 'Açıklama';
  }
  const pv = place.pv; if (!pv) return;
  const w = place.area ? clamp(place.w, 160, Math.min(420, pv.meta.w - 8)) : 180;
  const x = place.area ? place.x : clamp(pv.meta.w - w - 8, 4, pv.meta.w - w);
  const y = place.area ? place.top : (place.top != null ? place.top : place.y);
  addSticky(pv, { x, y, w, text, title });
  toast('Yapışkan not eklendi · başlığından sürükleyin, − ile küçültün', 2600);
}
