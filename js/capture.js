'use strict';
/* =========================================================
   Bölge ekran görüntüsü: dikdörtgen ya da serbest seçim
   ========================================================= */
function captureStart() {
  if (!ed.note || ed.capture) return;
  finishAll(); closePop(); hideCursor(); stopInertia();
  const root = h('div', { class: 'capture', role: 'dialog', 'aria-label': 'Bölge ekran görüntüsü' });
  const cv = h('canvas'); root.append(cv);
  const size = h('div', { class: 'capsize', hidden: true });
  const bar = h('div', { class: 'capbar' }, h('b', null, 'Yakalamak istediğiniz alanı çizin'),
    segRow([['rect', 'Dikdörtgen', IC.rect], ['free', 'Serbest', IC.free]], S.capture.mode, v => { S.capture.mode = v; saveSettings(); C.sel = null; draw(); acts.hidden = true; }, 'Seçim biçimi'),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Vazgeç', onclick: captureEnd }, icon(IC.close)));
  const acts = h('div', { class: 'capacts', hidden: true });
  root.append(size, bar, acts);
  stage.append(root);
  const C = ed.capture = { root, cv, size, bar, acts, sel: null, drawing: null };
  captureResize();

  function draw() {
    const d = DPR(), ctx = cv.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, ed.W, ed.H);
    ctx.fillStyle = 'rgba(14,20,48,.55)'; ctx.fillRect(0, 0, ed.W, ed.H); ctx.fillStyle = '#000';
    const s = C.drawing || C.sel; if (!s) { size.hidden = true; return; }
    const path = selPath(s); if (!path) return;
    ctx.save(); ctx.globalCompositeOperation = 'destination-out'; ctx.fill(path); ctx.restore();
    ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.setLineDash(s.kind === 'free' ? [7, 5] : []); ctx.stroke(path); ctx.setLineDash([]);
    const b = selBox(s);
    if (s.kind === 'rect') for (const [x, y] of [[b.x, b.y], [b.x + b.w, b.y], [b.x, b.y + b.h], [b.x + b.w, b.y + b.h]]) { ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#EE5A43'; ctx.stroke(); }
    const px = Math.round(b.w * Math.max(2, DPR())), py = Math.round(b.h * Math.max(2, DPR()));
    size.hidden = false; size.textContent = `${px} × ${py} px`;
    size.style.left = clamp(b.x, 8, ed.W - 140) + 'px'; size.style.top = (b.y > 40 ? b.y - 34 : b.y + b.h + 8) + 'px';
  }
  C.draw = draw;
  function selPath(s) {
    const p = new Path2D();
    if (s.kind === 'rect') { const b = selBox(s); if (b.w < 2 || b.h < 2) return null; p.rect(b.x, b.y, b.w, b.h); }
    else { if (s.pts.length < 3) return null; p.moveTo(s.pts[0].x, s.pts[0].y); for (const q of s.pts) p.lineTo(q.x, q.y); p.closePath(); }
    return p;
  }
  C.selPath = selPath;
  function selBox(s) {
    if (s.kind === 'rect') { const a = s.a, b = s.b; return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(b.x - a.x), h: Math.abs(b.y - a.y) }; }
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const q of s.pts) { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); }
    return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  }
  C.selBox = selBox;
  const pos = e => { const r = stage.getBoundingClientRect(); return { x: clamp(e.clientX - r.left, 0, ed.W), y: clamp(e.clientY - r.top, 0, ed.H) }; };
  root.addEventListener('pointerdown', e => {
    if (e.target.closest('.capbar, .capacts')) return;
    e.preventDefault(); e.stopPropagation(); try { root.setPointerCapture(e.pointerId); } catch (er) { }
    if (C.drawing) return;
    const p = pos(e); acts.hidden = true;
    C.drawing = S.capture.mode === 'free' ? { kind: 'free', pts: [p], id: e.pointerId } : { kind: 'rect', a: p, b: p, id: e.pointerId };
    draw();
  });
  root.addEventListener('pointermove', e => {
    const s = C.drawing; if (!s || s.id !== e.pointerId) return; e.preventDefault();
    const p = pos(e); if (s.kind === 'rect') s.b = p; else { const l = s.pts[s.pts.length - 1]; if (Math.hypot(p.x - l.x, p.y - l.y) > 2) s.pts.push(p); }
    draw();
  });
  const up = e => {
    const s = C.drawing; if (!s || s.id !== e.pointerId) return; C.drawing = null;
    const b = selBox(s);
    if (b.w < 12 || b.h < 12) { draw(); return; }
    C.sel = s; draw(); showActs(b);
  };
  root.addEventListener('pointerup', up); root.addEventListener('pointercancel', up);
  root.addEventListener('contextmenu', e => e.preventDefault());

  function showActs(b) {
    acts.innerHTML = '';
    acts.append(...[
      h('button', { class: 'btn', type: 'button', onclick: async () => { const r = await captureRender(); if (r) copyImage(r.blob); } }, icon(IC.copy), 'Kopyala'),
      h('button', { class: 'btn', type: 'button', onclick: async () => { const r = await captureRender(); if (!r) return; const src = await blobToDataUrl(r.blob); const pv = pageUnder(b) || currentPage(); captureEnd(); insertImage(src, b.w / ed.view.z, b.h / ed.view.z, pv); toast('Görüntü sayfaya eklendi'); } }, icon(IC.paste), 'Nota yapıştır'),
      navigator.canShare ? h('button', { class: 'btn', type: 'button', onclick: async () => { const r = await captureRender(); if (r) await shareBlob(r.name, r.blob); } }, icon(IC.up), 'Paylaş') : null,
      Native ? null : h('button', { class: 'btn', type: 'button', onclick: async () => { const r = await captureRender(); if (r) saveBlob(r.name, r.blob); } }, icon(IC.dl), 'İndir'),
      h('button', { class: 'btn primary', type: 'button', onclick: async () => {
        const r = await captureRender(); if (!r) return;
        await Store.put('shots', { id: uid(), created: Date.now(), buf: await r.blob.arrayBuffer(), type: 'image/png', w: r.w, h: r.h, noteName: ed.note.name });
        captureEnd();
        if (Native) await saveToGallery(r.blob, r.name); else toast('Ekran görüntülerine kaydedildi', 2200);
      } }, icon(IC.check), Native ? 'Galeriye kaydet' : 'Kaydet')].filter(Boolean));
    acts.hidden = false;
    const aw = acts.offsetWidth, ah = acts.offsetHeight;
    let y = b.y + b.h + 14; if (y + ah > ed.H - 8) y = Math.max(76, b.y - ah - 14); if (y + ah > ed.H - 8) y = ed.H - ah - 12;
    acts.style.left = clamp(b.x + b.w / 2 - aw / 2, 8, ed.W - aw - 8) + 'px'; acts.style.top = y + 'px';
  }
}
function pageUnder(b) { const w = toWorld(ed.rect.left + b.x + b.w / 2, ed.rect.top + b.y + b.h / 2); return pageAtWorld(w, false); }
function captureResize() {
  const C = ed.capture; if (!C) return; const d = DPR();
  C.cv.width = Math.round(ed.W * d); C.cv.height = Math.round(ed.H * d); C.cv.style.width = ed.W + 'px'; C.cv.style.height = ed.H + 'px';
  if (C.draw) C.draw();
}
function captureEnd() { const C = ed.capture; if (!C) return; C.root.remove(); ed.capture = null; requestFrame(true); }
function blobToDataUrl(blob) { return new Promise(res => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); }

/* Seçili alanı sayfa içeriğinden yeniden çizer: PDF katmanı, görseller, metin ve mürekkep */
async function captureRender() {
  const C = ed.capture; if (!C || !C.sel) return null;
  const b = C.selBox(C.sel), k = Math.max(2, DPR());
  const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(b.w * k)); c.height = Math.max(1, Math.round(b.h * k));
  const ctx = c.getContext('2d'); ctx.scale(k, k); ctx.translate(-b.x, -b.y);
  if (C.sel.kind === 'free') ctx.clip(C.selPath(C.sel));
  else { ctx.fillStyle = getComputedStyle(stage).backgroundColor || '#dde2ec'; ctx.fillRect(b.x, b.y, b.w, b.h); }
  const v = ed.view;
  for (const pv of ed.pvs) {
    const sx = v.tx + pv.x * v.z, sy = v.ty + pv.y * v.z, sw = pv.meta.w * v.z, sh = pv.meta.h * v.z;
    if (sx > b.x + b.w || sx + sw < b.x || sy > b.y + b.h || sy + sh < b.y) continue;
    ctx.save(); ctx.translate(sx, sy); ctx.scale(v.z, v.z);
    ctx.beginPath(); ctx.rect(0, 0, pv.meta.w, pv.meta.h); ctx.clip();
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, pv.meta.w, pv.meta.h);
    if (pv.cv) ctx.drawImage(pv.cv, 0, 0, pv.meta.w, pv.meta.h); else if (pv.meta.k !== 'pdf') drawBg(ctx, pv.meta, 1);
    await paintAnnotations(ctx, ed.note.ann[pv.meta.id]);
    ctx.restore();
  }
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const d = new Date(); const name = `Kenar Notu ${d.toISOString().slice(0, 10)} ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}.${String(d.getSeconds()).padStart(2, '0')}.png`;
  return { blob, w: c.width, h: c.height, name };
}
