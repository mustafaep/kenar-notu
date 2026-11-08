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
/* Kapak ve şablon sayfaları (covers.js) resim olarak gömülür: kapak JPEG, ince çizgili şablonlar PNG */
async function bgToPdfAny(out, page, meta) {
  const bg = meta.bg || 'plain';
  const paperNew = window.PAPERS && PAPERS[bg] && (meta.paper || !['plain', 'lined', 'grid', 'dots'].includes(bg));
  if (bg !== 'cover' && !(window.TPLS && TPLS[bg]) && !paperNew) return bgToPdf(page, meta, PDFLib.rgb);
  const cover = bg === 'cover', sc = cover ? 2.6 : 3;
  const c = document.createElement('canvas'); c.width = Math.ceil(meta.w * sc); c.height = Math.ceil(meta.h * sc);
  drawBg(c.getContext('2d'), meta, sc);
  const blob = await new Promise(r => c.toBlob(r, cover ? 'image/jpeg' : 'image/png', .9));
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const img = cover ? await out.embedJpg(bytes) : await out.embedPng(bytes);
  page.drawImage(img, { x: 0, y: 0, width: meta.w, height: meta.h });
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
  // yapışkan notlar sayfaya resim olarak basılmaz: gerçek PDF notu (açılır kapanır) olarak eklenir
  if (A.n && A.n.length) addStickyAnnots(out, page, A.n, T);
}

/* =========================================================
   Yapışkan notlar ↔ gerçek PDF notu
   Her not bir /Text (simge) + /Popup (açılan kutu) annotation'ıdır. Bu sayede telefonda, bilgisayarda ve başka PDF
   uygulamalarında da simgeye dokununca açılıp kapanır. Kenar Notu'nun yazdıkları /NM "kn:<id>" ile tanınır;
   /KN içinde konum, genişlik, renk ve başlık JSON olarak durur (geri okurken birebir aynı not çıksın diye).
   Belge bilgisine (Info) /KNNotes (not sayısı) ve /KNBody (notlar dışındaki içeriğin parmak izi) yazılır:
   senkronizasyonda "öbür cihazda yalnız notlar mı değişti?" sorusu bununla cevaplanır.
   ========================================================= */
const KN_PREFIX = 'kn:';
/* bu kurulumun kimliği: dosyadaki /KNRev "<cihaz>:<sıra>" ile kendi eski yazımlarımızı başka cihazınkinden ayırırız */
function knDevId() { let d = ''; try { d = localStorage.getItem('kn.dev') || ''; if (!d) { d = 'd' + Math.random().toString(36).slice(2, 10); localStorage.setItem('kn.dev', d); } } catch (e) { d = 'd0'; } return d; }
const r2 = v => Math.round(v * 100) / 100;
function addStickyAnnots(out, page, notes, T) {
  const { PDFName, PDFString, PDFHexString } = PDFLib, ctx = out.context;
  const box = (x0, y0, x1, y1) => { const q = [T(x0, y0), T(x1, y0), T(x0, y1), T(x1, y1)], xs = q.map(v => v[0]), ys = q.map(v => v[1]); return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)].map(r2); };
  for (const n of notes) {
    const open = n.open !== false, w = n.w || 190, hh = Math.max(40, n.h || 90);
    const [r, g, b] = hexRgb(/^#[0-9a-f]{6}$/i.test(n.color || '') ? n.color : '#FFE58A').map(v => r2(v / 255));
    const t = ctx.obj({ Type: 'Annot', Subtype: 'Text', Rect: box(n.x, n.y, n.x + 20, n.y + 20), Name: 'Comment', F: 28, Open: open, C: [r, g, b] });
    t.set(PDFName.of('Contents'), PDFHexString.fromText(n.text || ''));
    t.set(PDFName.of('T'), PDFHexString.fromText(n.title || 'Not'));
    t.set(PDFName.of('Subj'), PDFHexString.fromText('Kenar Notu'));
    t.set(PDFName.of('NM'), PDFString.of(KN_PREFIX + n.id));
    t.set(PDFName.of('KN'), PDFHexString.fromText(JSON.stringify({ v: 1, x: r2(n.x), y: r2(n.y), w: r2(w), h: r2(n.h || 0), color: n.color || '', title: n.title || '', open })));
    const tr = ctx.register(t);
    const pop = ctx.obj({ Type: 'Annot', Subtype: 'Popup', Rect: box(n.x, n.y, n.x + w, n.y + hh), Open: open, F: 28 });
    pop.set(PDFName.of('Parent'), tr); pop.set(PDFName.of('NM'), PDFString.of(KN_PREFIX + n.id + ':p'));
    const pr = ctx.register(pop); t.set(PDFName.of('Popup'), pr);
    page.node.addAnnot(tr); page.node.addAnnot(pr);
  }
}
/* kaynaktan kopyalanan sayfadaki eski Kenar Notu notlarını kaldır (yeniden kaydederken çift olmasın) */
function stripStickyAnnots(out, page) {
  const { PDFName, PDFDict, PDFRef } = PDFLib; let an; try { an = page.node.Annots(); } catch (e) { return 0; } if (!an) return 0;
  let k = 0;
  for (let i = an.size() - 1; i >= 0; i--) {
    let a = null; try { a = an.lookup(i, PDFDict); } catch (e) { continue; }
    let nm = ''; try { const v = a && a.get(PDFName.of('NM')); nm = v && v.decodeText ? v.decodeText() : ''; } catch (e) { }
    if (!nm.startsWith(KN_PREFIX)) continue;
    const ref = an.get(i); an.remove(i); k++;
    try { if (ref instanceof PDFRef) out.context.delete(ref); } catch (e) { }
  }
  return k;
}
/* PDF'teki Kenar Notu notlarını oku → { body, count, pages: [[not…] her sayfa için] }.
   pages: pdfPagesMeta çıktısı (sayfa dönüşümü için). Başka uygulamada taşınmış/düzenlenmişse dikdörtgen ve metin esas alınır. */
async function readKnNotes(bytes, pages) {
  const { PDFDocument, PDFName, PDFDict, PDFArray } = PDFLib;
  const d = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false, throwOnInvalidObject: false });
  const res = { body: null, count: 0, pages: [] };
  const txt = (a, k) => { try { const v = a.get(PDFName.of(k)); return v && v.decodeText ? v.decodeText() : ''; } catch (e) { return ''; } };
  try { const b = d.getInfoDict().get(PDFName.of('KNBody')); if (b && b.decodeText) res.body = b.decodeText(); } catch (e) { }
  d.getPages().forEach((pg, i) => {
    const list = []; res.pages.push(list);
    const meta = pages[i]; let an = null; try { an = pg.node.Annots(); } catch (e) { }
    if (!an || !meta) return;
    const M = meta.k === 'pdf' && meta.m ? meta.m : [1, 0, 0, -1, 0, meta.h];
    const V = (x, y) => [M[0] * x + M[2] * y + M[4], M[1] * x + M[3] * y + M[5]];
    for (let j = 0; j < an.size(); j++) {
      let a = null; try { a = an.lookup(j, PDFDict); } catch (e) { continue; }
      if (!a || String(a.get(PDFName.of('Subtype'))) !== '/Text') continue;
      const nm = txt(a, 'NM'); if (!nm.startsWith(KN_PREFIX) || nm.endsWith(':p')) continue;
      let R; try { R = a.lookup(PDFName.of('Rect'), PDFArray).asArray().map(x => x.asNumber()); } catch (e) { continue; }
      const cs = [V(R[0], R[1]), V(R[2], R[1]), V(R[0], R[3]), V(R[2], R[3])];
      const x = Math.min(...cs.map(c => c[0])), y = Math.min(...cs.map(c => c[1]));
      let kn = {}; try { kn = JSON.parse(txt(a, 'KN') || '{}') || {}; } catch (e) { }
      let open = kn.open !== false; try { const o = a.get(PDFName.of('Open')); if (o && o.asBoolean) open = o.asBoolean(); } catch (e) { }
      let color = /^#[0-9a-f]{6}$/i.test(kn.color || '') ? kn.color : '';
      if (!color) { try { const C = a.lookup(PDFName.of('C'), PDFArray).asArray().map(v => v.asNumber()); if (C.length === 3) color = '#' + C.map(v => Math.round(clamp(v, 0, 1) * 255).toString(16).padStart(2, '0')).join('').toUpperCase(); } catch (e) { } }
      const near = kn.x != null && Math.abs(kn.x - x) < 3 && Math.abs(kn.y - y) < 3;
      list.push({ id: nm.slice(KN_PREFIX.length), x: near ? kn.x : r2(x), y: near ? kn.y : r2(y), w: kn.w || 190, h: kn.h || 0, text: txt(a, 'Contents'), color: color || '#FFE58A', open, title: kn.title || '' });
      res.count++;
    }
  });
  return res;
}
async function knSha(buf) {
  try { const d = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { return ''; }
}
/* Not yalnızca kaynak PDF'ten mi ibaret? (sayfa eklenmemiş, çizim/metin/görsel yok; yapışkan notlar sayılmaz) */
function notePristine(note) {
  if (!note || !note.srcPages || note.pages.length !== note.srcPages) return false;
  return note.pages.every((p, i) => { if (p.k !== 'pdf' || p.i !== i + 1) return false; const A = note.ann[p.id]; return !A || (!A.s.length && !A.t.length && !(A.i && A.i.length)); });
}
/* Notlar dışındaki içeriğin parmak izi (kaynak PDF + sayfalar + çizim/metin/görsel) */
async function noteBodyFp(note, bytes) {
  if (notePristine(note) && note.srcBody) return note.srcBody;
  if (!note.srcHash && bytes) note.srcHash = await knSha(bytes);
  let acc = 0; const mix = v => { acc = (acc * 31 + Math.round(v * 10)) | 0; };
  const anns = note.pages.map(p => {
    const A = note.ann[p.id]; if (!A || (!A.s.length && !(A.t || []).length && !(A.i || []).length)) return 0; acc = 0; // boş kap (yalnız yapışkan not) sayılmaz
    for (const st of A.s) { mix(st.p.length); for (let i = 0; i < st.p.length; i += 7) mix(st.p[i]); }
    return [A.s.length, acc, (A.t || []).map(t => [t.text, r2(t.x), r2(t.y), t.size, t.font].join('|')), (A.i || []).map(im => [im.src ? im.src.length : 0, r2(im.x), r2(im.y), r2(im.w)].join('|'))];
  });
  const body = JSON.stringify({ src: note.srcHash || '', pages: note.pages.map(p => [p.k, p.i || 0, p.bg || '', Math.round(p.w), Math.round(p.h)]), anns });
  return 'b' + (await knSha(new TextEncoder().encode(body))).slice(0, 40);
}
/* Yalnız PDF'ten ibaret bir notun (telefon) /KNBody değeri — kaynağı eski biçimde yazılmış (KNBody'siz) dosyalarda bu değer
   kaynak dosyanın özetinden üretilir; tablet aynı hesabı kendi yazdığı dosyanın özetiyle yapıp telefonun yalnız not
   değiştirdiğini anlayabilir (noteBodyFp ile birebir aynı hesap) */
async function pristineFp(srcHash, pages) {
  const body = JSON.stringify({ src: srcHash || '', pages: pages.map(p => [p.k, p.i || 0, p.bg || '', Math.round(p.w), Math.round(p.h)]), anns: pages.map(() => 0) });
  return 'b' + (await knSha(new TextEncoder().encode(body))).slice(0, 40);
}
/* Dosyadaki Kenar Notu bilgileri güvenilir mi? Başka bir uygulama (Acrobat, Edge…) dosyayı kaydederken /ModDate'i değiştirir
   ama bizim /KNBody, /KNSrc değerlerimizi olduğu gibi bırakabilir. /KNMod, yazdığımız /ModDate'in kopyasıdır. */
function knTrusted(info) {
  const cu = (info && info.Custom) || {};
  if (typeof cu.KNMod !== 'string') return true;   // 2.7.0 ve öncesi: denetlenemez
  return !info.ModDate || info.ModDate === cu.KNMod;
}
/* senkronizasyon tabanı: son eşitlemede notların durumu (üç yönlü birleştirme için) */
const stickySig = n => [n.text || '', Math.round(n.x), Math.round(n.y), Math.round(n.w || 0), n.open !== false ? 1 : 0, n.color || '', n.title || ''].join('\u0001');
function stickyBase(note) { const b = {}; note.pages.forEach((p, pi) => { const A = note.ann[p.id]; for (const n of (A && A.n) || []) b[n.id] = { sig: stickySig(n), pi }; }); return b; }
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
      if (myCi >= 0) { const cp = copied ? copied[myCi] : (await out.copyPages(src, [meta.i - 1]))[0]; page = out.addPage(cp); stripStickyAnnots(out, page); }
      else { page = out.addPage([meta.w, meta.h]); await bgToPdfAny(out, page, meta); }
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
  // senkronizasyon için: not sayısı ve notlar dışındaki içeriğin parmak izi
  try {
    const { PDFName, PDFString, PDFNumber } = PDFLib, info = out.getInfoDict();
    const cnt = note.pages.reduce((a, p) => a + (((note.ann[p.id] || {}).n || []).length), 0);
    const body = await noteBodyFp(note, bytes);
    info.set(PDFName.of('KNNotes'), PDFNumber.of(cnt)); info.set(PDFName.of('KNBody'), PDFString.of(body));
    if (note._rev) info.set(PDFName.of('KNRev'), PDFString.of(note._rev));
    // yalnız PDF + notlar (telefon): hangi dosyadan türediği → tablet kendi yazdığı dosyayı tanır
    if (notePristine(note) && note.srcHash) info.set(PDFName.of('KNSrc'), PDFString.of(note.srcHash));
    const d = new Date(), z = v => String(v).padStart(2, '0');
    const ds = `D:${d.getUTCFullYear()}${z(d.getUTCMonth() + 1)}${z(d.getUTCDate())}${z(d.getUTCHours())}${z(d.getUTCMinutes())}${z(d.getUTCSeconds())}Z`;
    info.set(PDFName.of('ModDate'), PDFString.of(ds)); info.set(PDFName.of('KNMod'), PDFString.of(ds));
    lastBuildInfo.body = body;
  } catch (e) { }
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
/* Dosyayı yerinde yeniden yazarken yeni PDF eskisinden kısaysa, son çapraz başvuru bölümünün önüne zararsız
   bir PDF yorumu (% ve boşluk) eklenip boyu eskisine eşitlenir. Neden: OneDrive'ın Android sağlayıcısı "wt"
   (önce boşalt) kipini kabul edip dosyayı kısaltmıyor; kısa içerik uzun dosyanın üzerine yazılınca sonda eski
   sürümden artık kalıyor, Edge/Acrobat gibi okuyucular dosyayı sondan okuduğu için açamıyordu.
   Yalnız son "startxref" sayısı kayar; nesnelerin konumları değişmez. */
function padPdfTo(out, target) {
  const u = out instanceof Uint8Array ? out : new Uint8Array(out);
  let P = target - u.length;
  if (!(P > 0)) return u;
  const tailStart = Math.max(0, u.length - 256), tail = new TextDecoder('latin1').decode(u.subarray(tailStart));
  const m = /startxref\s+(\d+)\s+%%EOF\s*$/.exec(tail);
  if (!m) return u;
  const N = +m[1]; if (!(N > 0 && N < u.length)) return u;
  const numAt = tailStart + m.index + m[0].indexOf(m[1]), oldLen = m[1].length;
  let num = String(N + P);
  // sayının basamak sayısı değişirse boyu tutturmak için dolguyu ayarla
  for (let k = 0; k < 3; k++) { const d = String(N + P).length - oldLen; const P2 = target - u.length - d; if (P2 === P) break; P = Math.max(1, P2); }
  num = String(N + P);
  const pad = new Uint8Array(P); pad.fill(32);
  for (let i = 0; i < P; i += 80) pad[i] = 37;          // her satır % ile başlar (yorum)
  for (let i = 79; i < P; i += 80) pad[i] = 10;
  pad[P - 1] = 10;
  if (P === 1) pad[0] = 10;
  const head = u.subarray(0, N), mid = u.subarray(N, numAt), rest = u.subarray(numAt + oldLen);
  const enc = new TextEncoder().encode(num);
  const r = new Uint8Array(head.length + P + mid.length + enc.length + rest.length);
  let o = 0; r.set(head, o); o += head.length; r.set(pad, o); o += P; r.set(mid, o); o += mid.length; r.set(enc, o); o += enc.length; r.set(rest, o);
  return r;
}
window.padPdfTo = padPdfTo;
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
