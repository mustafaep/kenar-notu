'use strict';
/* =========================================================
   PDF okuma (PDF.js), küçük resim ve notlu PDF üretimi (pdf-lib)
   ========================================================= */
const hasPdfJs = typeof window.pdfjsLib !== 'undefined';
if (hasPdfJs) pdfjsLib.GlobalWorkerOptions.workerSrc = 'vendor/pdfjs/pdf.worker.min.js';
async function loadPdf(bytes) {
  if (!hasPdfJs) throw new Error('PDF motoru yüklenemedi. Uygulama dosyalarının eksiksiz olduğundan emin olun.');
  return pdfjsLib.getDocument({
    data: new Uint8Array(bytes.slice(0)), isEvalSupported: false, useSystemFonts: true,
    cMapUrl: 'vendor/pdfjs/cmaps/', cMapPacked: true, standardFontDataUrl: 'vendor/pdfjs/standard_fonts/'
  }).promise;
}
async function pdfPagesMeta(doc, onProg) {
  const pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i); const vp = pg.getViewport({ scale: 1 });
    pages.push({ id: uid(), k: 'pdf', i, w: vp.width, h: vp.height, m: Array.from(vp.transform), rot: vp.rotation });
    pg.cleanup(); if (onProg && (i % 8 === 0 || i === doc.numPages)) onProg(i, doc.numPages);
  }
  return pages;
}
async function renderThumb(meta, ann, pdf, width) {
  const s = width / meta.w; const c = document.createElement('canvas'); c.width = Math.round(meta.w * s); c.height = Math.round(meta.h * s);
  const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
  if (meta.k === 'pdf' && pdf) {
    try { const pg = await pdf.getPage(meta.i); await pg.render({ canvasContext: ctx, viewport: pg.getViewport({ scale: s }) }).promise; } catch (e) { }
  } else drawBg(ctx, meta, s);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  await paintAnnotations(ctx, ann);
  return c;
}

/* ---------- dışa aktarma ---------- */
function invert(m) { const det = m[0] * m[3] - m[1] * m[2]; return [m[3] / det, -m[1] / det, -m[2] / det, m[0] / det, (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det]; }
function svgPathFor(s, T) {
  const p = s.p, n = p.length / 3, K = .5523; const out = []; const f = v => (Math.round(v * 100) / 100).toString();
  const pt = (x, y) => { const q = T(x, y); return f(q[0]) + ' ' + f(-q[1]); };
  for (let i = 0; i < n; i++) {
    const x = p[3 * i], y = p[3 * i + 1], r = Math.max(.12, p[3 * i + 2] / 2), k = K * r;
    out.push('M' + pt(x + r, y), 'C' + pt(x + r, y + k) + ' ' + pt(x + k, y + r) + ' ' + pt(x, y + r), 'C' + pt(x - k, y + r) + ' ' + pt(x - r, y + k) + ' ' + pt(x - r, y), 'C' + pt(x - r, y - k) + ' ' + pt(x - k, y - r) + ' ' + pt(x, y - r), 'C' + pt(x + k, y - r) + ' ' + pt(x + r, y - k) + ' ' + pt(x + r, y) + 'Z');
  }
  for (let i = 0; i < n - 1; i++) {
    const x0 = p[3 * i], y0 = p[3 * i + 1], r0 = Math.max(.12, p[3 * i + 2] / 2), x1 = p[3 * i + 3], y1 = p[3 * i + 4], r1 = Math.max(.12, p[3 * i + 5] / 2);
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy); if (L < 1e-4) continue; const nx = -dy / L, ny = dx / L;
    out.push('M' + pt(x0 + nx * r0, y0 + ny * r0) + 'L' + pt(x0 - nx * r0, y0 - ny * r0) + 'L' + pt(x1 - nx * r1, y1 - ny * r1) + 'L' + pt(x1 + nx * r1, y1 + ny * r1) + 'Z');
  }
  return out.join('');
}
function bgToPdf(page, meta, rgb) {
  const H = meta.h, bg = meta.bg || 'plain';
  if (bg === 'lined') { for (let y = 96; y < H - 24; y += 28) page.drawLine({ start: { x: 0, y: H - y }, end: { x: meta.w, y: H - y }, thickness: .7, color: rgb(.776, .824, .89) }); page.drawLine({ start: { x: 64, y: 0 }, end: { x: 64, y: H }, thickness: .7, color: rgb(.945, .663, .612) }); }
  if (bg === 'grid') { for (let x = 20; x < meta.w; x += 20) page.drawLine({ start: { x, y: 0 }, end: { x, y: H }, thickness: .6, color: rgb(.86, .886, .925) }); for (let y = 20; y < H; y += 20) page.drawLine({ start: { x: 0, y: H - y }, end: { x: meta.w, y: H - y }, thickness: .6, color: rgb(.86, .886, .925) }); }
  if (bg === 'dots') { for (let x = 20; x < meta.w; x += 20) for (let y = 20; y < H; y += 20) page.drawCircle({ x, y: H - y, size: .9, color: rgb(.725, .765, .82) }); }
}
/* Bir dikdörtgeni (sayfa koordinatı) raster olarak çizer; döndürülmüş sayfalar için resmi önceden çevirir */
async function rasterToPdf(out, page, T, rot, x, y, w, hgt, paint, scale = 4) {
  let c = document.createElement('canvas'); c.width = Math.max(1, Math.ceil(w * scale)); c.height = Math.max(1, Math.ceil(hgt * scale));
  const ctx = c.getContext('2d'); ctx.scale(scale, scale); await paint(ctx);
  const r = ((rot % 360) + 360) % 360;
  if (r) {
    const c2 = document.createElement('canvas'); const swap = r === 90 || r === 270; c2.width = swap ? c.height : c.width; c2.height = swap ? c.width : c.height;
    const g = c2.getContext('2d'); g.translate(c2.width / 2, c2.height / 2); g.rotate(-r * Math.PI / 180); g.drawImage(c, -c.width / 2, -c.height / 2); c = c2;
  }
  const blob = await new Promise(res => c.toBlob(res, 'image/png'));
  const img = await out.embedPng(new Uint8Array(await blob.arrayBuffer()));
  const cs = [T(x, y), T(x + w, y), T(x, y + hgt), T(x + w, y + hgt)]; const xs = cs.map(q => q[0]), ys = cs.map(q => q[1]);
  page.drawImage(img, { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) });
}
/* ---------- qpdf (WASM): şifreli ya da bozuk PDF'leri kaydetmeden önce çöz/onar ---------- */
let qpdfLoad = null; const cleanCache = new WeakMap(); let lastBuildInfo = {};
function loadQpdf() {
  if (!qpdfLoad) qpdfLoad = new Promise((res, rej) => {
    if (window.createQpdfModule) return res();
    const s = document.createElement('script'); s.src = 'vendor/qpdf/qpdf.js'; s.onload = () => res(); s.onerror = () => { qpdfLoad = null; rej(new Error('PDF onarım aracı yüklenemedi')); }; document.head.append(s);
  });
  return qpdfLoad;
}
async function qpdfClean(bytes) {
  await loadQpdf();
  const log = [];
  const q = await createQpdfModule({ locateFile: () => 'vendor/qpdf/qpdf.wasm', noInitialRun: true, print: t => log.push(t), printErr: t => log.push(t) });
  q.FS.writeFile('/in.pdf', new Uint8Array(bytes));
  let code; try { code = q.callMain(['/in.pdf', '--decrypt', '--object-streams=generate', '/out.pdf']); } catch (e) { code = e && e.status != null ? e.status : -1; }
  let out; try { out = q.FS.readFile('/out.pdf'); } catch (e) { out = null; }
  if (!out || !out.length || (code !== 0 && code !== 3)) throw new Error('PDF onarılamadı' + (log.length ? ': ' + log[log.length - 1] : ''));
  return out.buffer.slice(out.byteOffset, out.byteOffset + out.byteLength);
}

/* Bir sayfanın notlarını (görsel, metin, çizgi, yapışkan not) pdf-lib sayfasına işler */
async function drawAnnotationsTo(out, page, meta, A, T, rot) {
  const { rgb, BlendMode } = PDFLib;
  if (!A) return;
  for (const im of A.i || []) { const img = await loadImg(im.src); if (img) await rasterToPdf(out, page, T, rot, im.x, im.y, im.w, im.h, ctx => ctx.drawImage(img, 0, 0, im.w, im.h), Math.min(4, img.naturalWidth / im.w || 2)); }
  for (const t of A.t) await rasterToPdf(out, page, T, rot, t.x, t.y, (t.w || 40) + 2, (t.h || t.size * 1.4) + 2, ctx => drawTextBox(ctx, { ...t, x: 0, y: 0 }));
  const order = [...A.s.filter(s => s.t === 'hl'), ...A.s.filter(s => s.t !== 'hl')];
  for (const s of order) {
    const [r, g, b] = hexRgb(s.c);
    const opt = { x: 0, y: 0, color: rgb(r / 255, g / 255, b / 255), opacity: s.o * (s.t === 'pencil' ? .85 : 1) };
    if (s.t === 'hl') opt.blendMode = BlendMode.Multiply;
    page.drawSvgPath(svgPathFor(s, T), opt);
  }
  for (const n of A.n || []) {
    const m = document.createElement('canvas').getContext('2d'); const bx = n.open === false ? { w: 18, h: 18 } : stickyBox(m, n);
    await rasterToPdf(out, page, T, rot, n.x - 4, n.y - 4, bx.w + 8, bx.h + 8, ctx => drawSticky(ctx, { ...n, x: 4, y: 4 }));
  }
}
async function buildPdf(note, bytes, onProg) {
  if (typeof PDFLib === 'undefined') throw new Error('PDF kaydetme motoru yüklenemedi.');
  await loadFonts();
  const needSrc = bytes && note.pages.some(p => p.k === 'pdf');
  lastBuildInfo = { cleaned: false, rasterPages: 0 };
  if (!needSrc) return buildPdfWith(note, null, onProg, true);
  const cached = cleanCache.get(bytes);
  if (cached) { lastBuildInfo.cleaned = true; return buildPdfWith(note, cached, onProg, true); }
  try { return await buildPdfWith(note, bytes, onProg, false); }
  catch (e) {
    // şifreli ya da yapısı bozuk: qpdf ile çöz/onar ve yeniden dene
    let clean; try { clean = await qpdfClean(bytes); } catch (e2) { throw e.code === 'encrypted' ? new Error('Bu PDF şifreli ve şifresi çözülemedi: ' + e2.message) : e; }
    cleanCache.set(bytes, clean); lastBuildInfo.cleaned = true;
    return buildPdfWith(note, clean, onProg, true);
  }
}
async function buildPdfWith(note, bytes, onProg, lastTry) {
  const { PDFDocument } = PDFLib;
  // updateMetadata: false + sabit tarihler → not değişmediyse çıktı bayt bayt aynı olur (gereksiz yeniden yükleme yapılmaz)
  const out = await PDFDocument.create({ updateMetadata: false }); out.setTitle(note.name); out.setCreator('Kenar Notu'); out.setProducer('Kenar Notu');
  try { const d = new Date(note.created || 0); out.setCreationDate(d); out.setModificationDate(d); } catch (e) { }
  let src = null, pdfjsDoc = null;
  if (bytes) {
    src = await PDFDocument.load(bytes, { ignoreEncryption: true, throwOnInvalidObject: false, updateMetadata: false });
    if (src.isEncrypted) throw Object.assign(new Error('Şifreli PDF'), { code: 'encrypted' });
  }
  const srcCount = src ? src.getPageCount() : 0;
  const okPdf = m => m.k === 'pdf' && src && m.i - 1 < srcCount;
  // ortak yazı tipleri bir kez kopyalansın diye sayfalar tek seferde kopyalanır; olmazsa sayfa sayfa
  let copied = null;
  if (src) { try { copied = await out.copyPages(src, note.pages.filter(okPdf).map(m => m.i - 1)); } catch (e) { if (!lastTry) throw e; copied = null; } }
  let ci = 0;
  for (let pi = 0; pi < note.pages.length; pi++) {
    const meta = note.pages[pi]; const A = note.ann[meta.id];
    const before = out.getPageCount(); const myCi = okPdf(meta) ? ci++ : -1;
    try {
      let page;
      if (myCi >= 0) { const cp = copied ? copied[myCi] : (await out.copyPages(src, [meta.i - 1]))[0]; page = out.addPage(cp); }
      else { page = out.addPage([meta.w, meta.h]); bgToPdf(page, meta, PDFLib.rgb); }
      const M = meta.k === 'pdf' && meta.m ? meta.m : [1, 0, 0, -1, 0, meta.h]; const inv = invert(M);
      const T = (x, y) => [inv[0] * x + inv[2] * y + inv[4], inv[1] * x + inv[3] * y + inv[5]];
      await drawAnnotationsTo(out, page, meta, A, T, meta.k === 'pdf' ? (meta.rot || 0) : 0);
    } catch (e) {
      if (!lastTry || meta.k !== 'pdf') throw e;
      // son çare: yalnızca bu sayfayı görüntü olarak ekle (notlar vektör kalır)
      while (out.getPageCount() > before) out.removePage(out.getPageCount() - 1);
      if (!pdfjsDoc) pdfjsDoc = await loadPdf(bytes);
      const pg = await pdfjsDoc.getPage(meta.i); const vp = pg.getViewport({ scale: 2 });
      const c = document.createElement('canvas'); c.width = Math.ceil(vp.width); c.height = Math.ceil(vp.height);
      const ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: ctx, viewport: vp }).promise;
      const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', .9));
      const img = await out.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const page = out.addPage([meta.w, meta.h]); page.drawImage(img, { x: 0, y: 0, width: meta.w, height: meta.h });
      const T = (x, y) => [x, meta.h - y];
      await drawAnnotationsTo(out, page, meta, A, T, 0);
      lastBuildInfo.rasterPages++;
    }
    if (onProg) onProg((pi + 1) / note.pages.length);
  }
  if (pdfjsDoc) { try { pdfjsDoc.destroy(); } catch (e) { } }
  return out.save();
}
async function saveBlob(name, blob) {
  if (window.claude && typeof window.claude.use === 'function') {
    try { const dl = await window.claude.use('downloads'); if (dl) { await dl.save({ filename: name, data: blob }); toast('Kaydedildi'); return; } } catch (e) { if (e && e.code === 'declined') { toast('Kaydetme iptal edildi.'); return; } }
  }
  const url = URL.createObjectURL(blob); const a = h('a', { href: url, download: name }); document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 8000);
  toast(name + ' indirildi');
}
async function shareBlob(name, blob) {
  const file = new File([blob], name, { type: blob.type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) { try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e && e.name === 'AbortError') return true; } }
  return false;
}
async function exportNote(note, bytes, share) {
  const pr = progress('PDF hazırlanıyor…');
  try {
    const out = await buildPdf(note, bytes, f => pr.set(f, `Sayfalar işleniyor %${Math.round(f * 100)}`));
    pr.done();
    const blob = new Blob([out], { type: 'application/pdf' }); const name = safeName(note.name) + '.pdf';
    if (lastBuildInfo.rasterPages) toast(lastBuildInfo.rasterPages + ' sayfa okunamadığı için görüntü olarak kaydedildi.', 4500);
    if (share && await shareBlob(name, blob)) return;
    await saveBlob(name, blob);
  } catch (e) { pr.done(); toast((e && e.message) || 'PDF oluşturulamadı.', 4200); }
}
