'use strict';
/* =========================================================
   Mürekkep: kalem dinamiği, darbe geometrisi, şekil tanıma,
   sayfa arka planları, metin ve görsel çizimi
   ========================================================= */

/* Basınç, eğim, yön ve hızdan genişlik */
function penWidth(type, size, p, tilt, dir, speed) {
  const sens = S.feel.pressure;
  let k = 1;
  switch (type) {
    case 'ballpoint': k = .8 + .35 * p; break;
    case 'fountain': k = .28 + 1.25 * Math.pow(p, .9); break;
    case 'pencil': k = .7 + .5 * p; break;
    case 'calli': k = .65 + .55 * p; break;
    case 'brush': k = .1 + 1.55 * Math.pow(p, 1.3); break;
    case 'hl': k = 1; break;
  }
  let w = size * (1 - sens + sens * k);
  if (type === 'fountain') w *= 1 - Math.min(.25, speed * .09);
  if (type === 'pencil' && S.feel.tilt) w *= 1 + 2.4 * tilt * tilt;
  if (type === 'calli') { const f = dir == null ? .55 : Math.abs(Math.sin(dir - Math.PI / 4)); w = w * (.14 + .86 * f) * 1.3; }
  return Math.max(.25, w);
}

/* Darbe: {id, t:tür, c:renk, o:opaklık, p:Float32Array [x,y,genişlik,...]} sayfa noktası (pt) cinsinden.
   Çizim: her nokta bir daire + ardışık noktalar arasında yamuk; sıfır-dışı doldurma ile tek parça, eşit opaklık. */
const pathCache = new WeakMap(), bbCache = new WeakMap();
function buildPath(p, n, P) {
  P = P || new Path2D();
  for (let i = 0; i < n; i++) { const x = p[3 * i], y = p[3 * i + 1], r = Math.max(.12, p[3 * i + 2] / 2); P.moveTo(x + r, y); P.arc(x, y, r, 0, Math.PI * 2); }
  for (let i = 0; i < n - 1; i++) {
    const x0 = p[3 * i], y0 = p[3 * i + 1], r0 = Math.max(.12, p[3 * i + 2] / 2), x1 = p[3 * i + 3], y1 = p[3 * i + 4], r1 = Math.max(.12, p[3 * i + 5] / 2);
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy); if (L < 1e-4) continue;
    const nx = -dy / L, ny = dx / L;
    P.moveTo(x0 + nx * r0, y0 + ny * r0); P.lineTo(x0 - nx * r0, y0 - ny * r0); P.lineTo(x1 - nx * r1, y1 - ny * r1); P.lineTo(x1 + nx * r1, y1 + ny * r1); P.closePath();
  }
  return P;
}
function strokePath(s) { let P = pathCache.get(s); if (!P) { P = buildPath(s.p, s.p.length / 3); pathCache.set(s, P); } return P; }
function strokeBB(s) {
  let b = bbCache.get(s); if (b) return b;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; const p = s.p;
  for (let i = 0; i < p.length; i += 3) { const r = p[i + 2] / 2; if (p[i] - r < x0) x0 = p[i] - r; if (p[i] + r > x1) x1 = p[i] + r; if (p[i + 1] - r < y0) y0 = p[i + 1] - r; if (p[i + 1] + r > y1) y1 = p[i + 1] + r; }
  b = { x0, y0, x1, y1 }; bbCache.set(s, b); return b;
}
const patCache = new Map();
function pencilPattern(ctx, color) {
  let pat = patCache.get(color); if (pat) return pat;
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const id = g.createImageData(64, 64); const [r, gg, b] = hexRgb(color);
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 64 * 64; i++) { const a = rnd() < .72 ? .5 + .5 * rnd() : .08 * rnd(); id.data[4 * i] = r; id.data[4 * i + 1] = gg; id.data[4 * i + 2] = b; id.data[4 * i + 3] = a * 255; }
  g.putImageData(id, 0, 0);
  pat = ctx.createPattern(c, 'repeat'); try { pat.setTransform(new DOMMatrix().scale(.3)); } catch (e) { }
  patCache.set(color, pat); return pat;
}
function paintStroke(ctx, s, path) {
  ctx.globalAlpha = s.o;
  ctx.fillStyle = s.t === 'pencil' ? pencilPattern(ctx, s.c) : s.c;
  ctx.fill(path || strokePath(s));
  ctx.globalAlpha = 1;
}
function transformStroke(s, m) {
  const k = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])); const p = s.p, q = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) { const x = p[i], y = p[i + 1]; q[i] = m[0] * x + m[2] * y + m[4]; q[i + 1] = m[1] * x + m[3] * y + m[5]; q[i + 2] = p[i + 2] * k; }
  return { id: uid(), t: s.t, c: s.c, o: s.o, p: q };
}
function simStroke(type, size, color, o, pts) {
  const out = []; let last = null;
  pts.forEach((q, i) => {
    let w = penWidth(type, size, q.p, q.tilt || .25, last ? Math.atan2(q.y - last.y, q.x - last.x) : null, 0.4);
    if (last) w = last.w + (w - last.w) * .5;
    if (type === 'brush' && i < 6) w *= .35 + .65 * i / 6;
    out.push(q.x, q.y, w); last = { x: q.x, y: q.y, w };
  });
  return { id: uid(), t: type, c: color, o, p: new Float32Array(out) };
}
function sCurve(x0, y0, w, hgt, n = 60) {
  const a = []; for (let i = 0; i <= n; i++) { const t = i / n; a.push({ x: x0 + w * t, y: y0 + Math.sin(t * Math.PI * 2) * hgt * .5, p: .25 + .75 * Math.pow(Math.sin(t * Math.PI), .7), tilt: .25 + .5 * t }); } return a;
}
function miniStroke(canvas, type, cfg, wide) {
  const d = DPR(), W = canvas.clientWidth || canvas.width, H = canvas.clientHeight || canvas.height;
  canvas.width = Math.round(W * d); canvas.height = Math.round(H * d);
  const ctx = canvas.getContext('2d'); ctx.setTransform(d, 0, 0, d, 0, 0); ctx.clearRect(0, 0, W, H);
  const size = wide ? cfg.size : Math.min(cfg.size, type === 'hl' ? 10 : 6) * (type === 'brush' || type === 'calli' ? .8 : 1);
  const s = simStroke(type, size, cfg.color, cfg.o, sCurve(10, H / 2, W - 20, wide ? H * .45 : H * .5, 50));
  if (type === 'hl') ctx.globalCompositeOperation = 'multiply';
  paintStroke(ctx, s);
}

/* Şekil tanıma: kalemi çizgi sonunda bekletince */
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy; let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = clamp(t, 0, 1);
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  let dmax = 0, idx = 0; const a = pts[0], b = pts[pts.length - 1];
  for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i].x, pts[i].y, a.x, a.y, b.x, b.y); if (d > dmax) { dmax = d; idx = i; } }
  if (dmax > eps) { const l = rdp(pts.slice(0, idx + 1), eps), r = rdp(pts.slice(idx), eps); return l.slice(0, -1).concat(r); }
  return [a, b];
}
function recognize(pts) {
  if (pts.length < 5) return null;
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9, len = 0;
  pts.forEach((q, i) => { x0 = Math.min(x0, q.x); y0 = Math.min(y0, q.y); x1 = Math.max(x1, q.x); y1 = Math.max(y1, q.y); if (i) len += Math.hypot(q.x - pts[i - 1].x, q.y - pts[i - 1].y); });
  const diag = Math.hypot(x1 - x0, y1 - y0); if (diag < 10) return null;
  const a = pts[0], b = pts[pts.length - 1], gap = Math.hypot(b.x - a.x, b.y - a.y);
  if (gap / len > .92) return { kind: 'line', pts: [a, b] };
  if (gap > .25 * diag) return null;
  let v = rdp(pts, diag * .075); v = v.slice(0, -1);
  for (let pass = 0; pass < 2 && v.length > 3; pass++) {
    v = v.filter((q, i) => { const p0 = v[(i - 1 + v.length) % v.length], p1 = v[(i + 1) % v.length]; let ang = Math.abs(Math.atan2(p0.y - q.y, p0.x - q.x) - Math.atan2(p1.y - q.y, p1.x - q.x)); if (ang > Math.PI) ang = 2 * Math.PI - ang; return ang < Math.PI * .84; });
  }
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, rx = Math.max(1, (x1 - x0) / 2), ry = Math.max(1, (y1 - y0) / 2);
  let err = 0; pts.forEach(q => { err += Math.abs(Math.hypot((q.x - cx) / rx, (q.y - cy) / ry) - 1); }); err /= pts.length;
  if (err < .085) return { kind: 'ellipse', cx, cy, rx, ry };
  if (v.length === 3) return { kind: 'poly', pts: v };
  if (v.length === 4) {
    const ang = v.map((q, i) => { const p0 = v[(i + 3) % 4], p1 = v[(i + 1) % 4]; const d = Math.abs(Math.atan2(p0.y - q.y, p0.x - q.x) - Math.atan2(p1.y - q.y, p1.x - q.x)); return Math.min(d, 2 * Math.PI - d); });
    const axis = v.every((q, i) => { const n = v[(i + 1) % 4]; const t = Math.atan2(n.y - q.y, n.x - q.x) % (Math.PI / 2); return Math.min(Math.abs(t), Math.PI / 2 - Math.abs(t)) < .17; });
    if (axis && ang.every(x => Math.abs(x - Math.PI / 2) < .25)) {
      const xs = v.map(q => q.x).sort((a, b) => a - b), ys = v.map(q => q.y).sort((a, b) => a - b);
      const L = (xs[0] + xs[1]) / 2, R = (xs[2] + xs[3]) / 2, T = (ys[0] + ys[1]) / 2, B = (ys[2] + ys[3]) / 2;
      return { kind: 'poly', pts: [{ x: L, y: T }, { x: R, y: T }, { x: R, y: B }, { x: L, y: B }] };
    }
    return { kind: 'poly', pts: v };
  }
  if (err < .14) return { kind: 'ellipse', cx, cy, rx, ry };
  return null;
}
function shapePoints(sh) {
  const out = []; const step = 2.5;
  const seg = (a, b) => { const L = Math.hypot(b.x - a.x, b.y - a.y), n = Math.max(1, Math.ceil(L / step)); for (let i = 0; i < n; i++) out.push({ x: a.x + (b.x - a.x) * i / n, y: a.y + (b.y - a.y) * i / n }); };
  if (sh.kind === 'line') { seg(sh.pts[0], sh.pts[1]); out.push(sh.pts[1]); }
  else if (sh.kind === 'poly') { sh.pts.forEach((q, i) => seg(q, sh.pts[(i + 1) % sh.pts.length])); out.push(sh.pts[0]); }
  else { const per = Math.PI * (3 * (sh.rx + sh.ry) - Math.sqrt((3 * sh.rx + sh.ry) * (sh.rx + 3 * sh.ry))); const n = Math.max(24, Math.ceil(per / step)); for (let i = 0; i <= n; i++) { const t = i / n * Math.PI * 2; out.push({ x: sh.cx + sh.rx * Math.cos(t), y: sh.cy + sh.ry * Math.sin(t) }); } }
  return out;
}

/* Boş sayfa arka planları */
const BG_NAMES = { plain: 'Boş', lined: 'Çizgili', grid: 'Kareli', dots: 'Noktalı' };
function drawBg(ctx, meta, s) {
  ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, meta.w * s, meta.h * s);
  const bg = meta.bg || 'plain'; if (bg === 'plain') return;
  ctx.save(); ctx.scale(s, s);
  if (bg === 'lined') {
    ctx.strokeStyle = '#c6d2e3'; ctx.lineWidth = .7;
    for (let y = 96; y < meta.h - 24; y += 28) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(meta.w, y); ctx.stroke(); }
    ctx.strokeStyle = '#f1a99c'; ctx.beginPath(); ctx.moveTo(64, 0); ctx.lineTo(64, meta.h); ctx.stroke();
  } else if (bg === 'grid') {
    ctx.strokeStyle = '#dbe2ec'; ctx.lineWidth = .6;
    for (let x = 20; x < meta.w; x += 20) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, meta.h); ctx.stroke(); }
    for (let y = 20; y < meta.h; y += 20) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(meta.w, y); ctx.stroke(); }
  } else if (bg === 'dots') {
    ctx.fillStyle = '#b9c3d1';
    for (let x = 20; x < meta.w; x += 20) for (let y = 20; y < meta.h; y += 20) { ctx.beginPath(); ctx.arc(x, y, .9, 0, Math.PI * 2); ctx.fill(); }
  }
  ctx.restore();
}

/* Metin kutuları */
const FONTS = { sans: 'Onest, system-ui, sans-serif', serif: 'Literata, Georgia, serif', hand: 'Caveat, "Segoe Print", cursive', kalam: 'Kalam, "Segoe Print", cursive', print: '"Patrick Hand", Kalam, "Segoe Print", cursive' };
const FONT_LABEL = { sans: 'Yalın', serif: 'Tırnaklı', hand: 'El yazısı', kalam: 'Kalam', print: 'Okunaklı' };
/* yazı tipi seçenekleri (seçim listelerinde bu sırayla) */
const FONT_OPTS = [['print', 'Okunaklı'], ['kalam', 'Kalam'], ['hand', 'El yazısı'], ['sans', 'Yalın'], ['serif', 'Tırnaklı']];
const tWeight = t => t.wt || (t.bold ? 700 : 400);
async function loadFonts() {
  try { if (!document.fonts) return; await Promise.race([Promise.all(['400 16px Onest', '700 16px Onest', '600 16px Literata', '700 16px Literata', '400 16px Caveat', '700 16px Caveat', '300 16px Kalam', '400 16px Kalam', '700 16px Kalam', '400 16px "Patrick Hand"', '400 16px Literata', 'italic 400 16px Literata', '700 16px Onest'].map(f => document.fonts.load(f, 'ğüşıöçİ'))), new Promise(r => setTimeout(r, 2500))]); } catch (e) { }
}
function wrapLines(ctx, text, maxW) {
  const out = [];
  for (const para of text.split('\n')) {
    if (!para) { out.push(''); continue; }
    let line = '';
    for (const word of para.split(/(\s+)/)) {
      const test = line + word;
      if (ctx.measureText(test).width > maxW && line.trim()) { out.push(line.trimEnd()); line = word.trimStart(); }
      else line = test;
      while (ctx.measureText(line).width > maxW && line.length > 1) { let i = line.length - 1; while (i > 1 && ctx.measureText(line.slice(0, i)).width > maxW) i--; out.push(line.slice(0, i)); line = line.slice(i); }
    }
    out.push(line);
  }
  return out;
}
function drawTextBox(ctx, t) {
  ctx.save();
  ctx.font = `${tWeight(t)} ${t.size}px ${FONTS[t.font] || FONTS.sans}`;
  ctx.fillStyle = t.color; ctx.textBaseline = 'top';
  const lh = t.size * 1.3, padX = 3, padY = 2;
  const maxW = t.w ? Math.max(10, t.w - padX * 2 + 1) : 1e5;
  wrapLines(ctx, t.text, maxW).forEach((ln, i) => ctx.fillText(ln, t.x + padX, t.y + padY + i * lh + (lh - t.size) / 2));
  ctx.restore();
}

/* Görseller: {id, x, y, w, h, src (data URL)} */
const imgCache = new Map();
function loadImg(src) {
  let p = imgCache.get(src);
  if (!p) { p = new Promise(res => { const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; }); imgCache.set(src, p); }
  return p;
}
async function fileToDataUrl(file, maxDim = 2200) {
  const url = URL.createObjectURL(file);
  try {
    const im = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
    const k = Math.min(1, maxDim / Math.max(im.naturalWidth, im.naturalHeight));
    const c = document.createElement('canvas'); c.width = Math.round(im.naturalWidth * k); c.height = Math.round(im.naturalHeight * k);
    c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
    const png = /png|gif|webp/.test(file.type);
    return { src: c.toDataURL(png ? 'image/png' : 'image/jpeg', .9), w: c.width, h: c.height };
  } finally { URL.revokeObjectURL(url); }
}

/* Sayfa içeriğini bir tuvale çiz (küçük resimler, ekran görüntüleri) */
async function paintAnnotations(ctx, ann) {
  if (!ann) return;
  for (const im of ann.i || []) { const img = await loadImg(im.src); if (img) ctx.drawImage(img, im.x, im.y, im.w, im.h); }
  for (const t of ann.t) drawTextBox(ctx, t);
  ctx.globalCompositeOperation = 'multiply';
  for (const st of ann.s) if (st.t === 'hl') paintStroke(ctx, st);
  ctx.globalCompositeOperation = 'source-over';
  for (const st of ann.s) if (st.t !== 'hl') paintStroke(ctx, st);
  for (const n of ann.n || []) drawSticky(ctx, n);
}
/* Yapışkan not (dışa aktarma ve küçük resim için) */
function stickyBox(ctx, n) {
  const fs = 9, pad = 6, hdr = 14, lh = fs * 1.4;
  ctx.font = `400 ${fs}px ${FONTS.sans}`;
  const lines = wrapLines(ctx, n.text || '', Math.max(20, n.w - pad * 2));
  return { fs, pad, hdr, lh, lines, w: n.w, h: Math.max(n.h || 0, hdr + pad + lines.length * lh + pad) };
}
function drawSticky(ctx, n) {
  ctx.save();
  const col = n.color || '#FFE58A';
  const rr = (x, y, w, h, r) => { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); };
  if (n.open === false) {
    rr(n.x, n.y, 18, 18, 3); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = .6; ctx.stroke();
    ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(n.x + 4.5, n.y + 7); ctx.lineTo(n.x + 13.5, n.y + 7); ctx.moveTo(n.x + 4.5, n.y + 11); ctx.lineTo(n.x + 10.5, n.y + 11); ctx.stroke();
    ctx.restore(); return;
  }
  const b = stickyBox(ctx, n);
  ctx.shadowColor = 'rgba(0,0,0,.18)'; ctx.shadowBlur = 4; ctx.shadowOffsetY = 1.5;
  rr(n.x, n.y, b.w, b.h, 3); ctx.fillStyle = col; ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.fillStyle = 'rgba(0,0,0,.06)'; ctx.fillRect(n.x, n.y + 3, b.w, b.hdr - 3);
  ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.font = `600 ${7}px ${FONTS.sans}`; ctx.textBaseline = 'middle';
  if (n.title) ctx.fillText(n.title, n.x + b.pad, n.y + b.hdr / 2 + 1);
  ctx.fillStyle = '#26241f'; ctx.font = `400 ${b.fs}px ${FONTS.sans}`; ctx.textBaseline = 'top';
  b.lines.forEach((ln, i) => ctx.fillText(ln, n.x + b.pad, n.y + b.hdr + b.pad * .6 + i * b.lh + (b.lh - b.fs) / 2));
  ctx.restore();
}
