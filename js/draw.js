'use strict';
/* =========================================================
   Çizim (3.3) — ücretsiz Gemini metin modeliyle şema / grafik / çizim.
   Gemini resim üretmez; ne çizileceğini JSON "tarif" olarak verir (kutular, oklar, eksenler, etiketler).
   Uygulama tarifi kendi yerleştirir ve sayfaya NORMAL KALEM ÇİZGİLERİ + METİN KUTULARI olarak ekler:
   sonradan silinir, taşınır, rengi/stili değişir, PDF'e keskin gider.
   Fonksiyon grafiği yerelde hesaplanır (yapay zekâ gerekmez).
   Alanı çevrele → "Temize çiz": kaba el çizimi okunur, düzgün hâli yerine çizilir.
   ========================================================= */
IC.draw = IC.draw || '<rect x="3" y="4" width="7" height="5" rx="1.2"/><rect x="14" y="15" width="7" height="5" rx="1.2"/><path d="M6.5 9v4.5a2 2 0 002 2H14"/><path d="M12 13.5l2 2-2 2"/>';
const DRAW_TYPES = [['auto', 'Otomatik'], ['akis', 'Akış şeması'], ['dongu', 'Döngü'], ['zaman', 'Zaman çizelgesi'], ['venn', 'Venn'], ['tablo', 'Tablo'], ['agac', 'Ağaç / hiyerarşi'], ['harita', 'Zihin haritası'], ['grafik', 'Fonksiyon grafiği'], ['cubuk', 'Çubuk grafik'], ['cizim', 'Serbest çizim']];
const DRAW_SYSTEM = `Sen bir not uygulaması için ÇİZİM TARİFİ üreten yardımcısın. Resim üretmezsin; uygulama senin verdiğin JSON tarifini kendisi çizer.
YALNIZCA tek bir JSON nesnesi döndür (açıklama, kod bloğu işareti yok). Yazılar kısa olsun (bir kutuda en fazla 6 kelime), kullanıcının dilinde (çoğunlukla Türkçe) ve doğru bilgiyle.
"tur" alanı şunlardan biri:
- akis: {"tur":"akis","yon":"asagi"|"saga","dugumler":[{"id":"a","yazi":"...","sekil":"kutu"|"yuvarlak"|"karar"}],"oklar":[{"from":"a","to":"b","yazi":"(isteğe bağlı, ör. evet/hayır)"}]} — en fazla 12 düğüm. Başlangıç/bitiş "yuvarlak", soru/karar "karar".
- dongu: {"tur":"dongu","baslik":"(isteğe bağlı)","ogeler":["...","..."]} — döngüsel süreç, 3-8 öğe, sırayla.
- zaman: {"tur":"zaman","ogeler":[{"zaman":"1923","yazi":"..."}]} — en fazla 8 olay, kronolojik.
- venn: {"tur":"venn","kumeler":[{"ad":"...","ogeler":["..."]},{"ad":"...","ogeler":["..."]}],"ortak":["..."]} — 2 ya da 3 küme; her bölgede en fazla 5 kısa öğe.
- tablo: {"tur":"tablo","sutunlar":["..."],"satirlar":[["...","..."]]} — en fazla 5 sütun, 8 satır; karşılaştırma tabloları için.
- agac: {"tur":"agac","kok":{"yazi":"...","alt":[{"yazi":"...","alt":[...]}]}} — sınıflandırma, hiyerarşi; en fazla 3 kat, katta en fazla 6.
- harita: {"tur":"harita","kok":{"yazi":"...","alt":[{"yazi":"...","alt":[{"yazi":"..."}]}]}} — zihin haritası; 3-7 dal, dalda en fazla 4 alt.
- grafik: {"tur":"grafik","fonksiyonlar":[{"ifade":"x^2-4","ad":"f(x)"}],"x":[-5,5],"y":[-6,10],"noktalar":[{"x":2,"y":0,"yazi":"kök"}]} — ifadede x, sayılar, + - * / ^, parantez, sin cos tan sqrt abs ln log exp, pi, e kullan. "y" ve "noktalar" isteğe bağlı.
- cubuk: {"tur":"cubuk","baslik":"...","birim":"(isteğe bağlı)","ogeler":[{"ad":"...","deger":12}]} — en fazla 8 çubuk; yalnız gerçek ya da kullanıcının verdiği değerler.
- cizim: {"tur":"cizim","w":100,"h":70,"sekiller":[...]} — serbest, basit, şematik çizim (ders kitabındaki gibi sade çizgi çizimi). Koordinatlar 0..w ve 0..h aralığında. Şekiller:
  {"k":"cizgi","p":[x1,y1,x2,y2,...]}, {"k":"ok","p":[x1,y1,x2,y2]}, {"k":"egri","p":[x1,y1,x2,y2,...]} (yumuşak eğri), {"k":"dikdortgen","x":..,"y":..,"w":..,"h":..},
  {"k":"daire","x":..,"y":..,"r":..}, {"k":"elips","x":..,"y":..,"rx":..,"ry":..}, {"k":"cokgen","p":[x1,y1,...]}, {"k":"yazi","x":..,"y":..,"t":"etiket"}.
  Her şekle isteğe bağlı "renk": 1 (ana), 2, 3 (vurgu). En fazla 40 şekil. Etiketleri parçaların yanına koy, gerekirse kısa "cizgi" ile bağla.
Kullanıcı tür belirtmişse o türü kullan; belirtmemişse isteğe en uygun türü seç. Sayfa görüntüsü verilmişse içeriği oradan al.`;
const DRAW_CLEAN = `Görüntüde kullanıcının kalemle kabaca çizdiği bir şema, tablo, grafik ya da çizim var. Onu tanı ve AYNI YAPIYI (aynı kutular, oklar, yazılar, sıra ve yerleşim yönü) temiz çizilmek üzere yukarıdaki tarif biçiminde ver. Yazıları okuyup yazım hatalarını düzelt ama anlamını değiştirme; yeni bilgi ekleme. Akış/şema ise akis, kutular hiyerarşikse agac, döngüyse dongu, tabloysa tablo, eksenli eğriyse grafik (ifadeyi tahmin et), değilse cizim kullan; cizim için koordinatları görüntüdeki konumlara göre ver (w ve h görüntünün en-boy oranında olsun).`;

/* ---------- güvenli ifade ayrıştırıcı (eval yok) ---------- */
function parseExpr(src) {
  let s = String(src).toLowerCase().replace(/\s+/g, '').replace(/^(y|f\(x\))=/, '').replace(/²/g, '^2').replace(/³/g, '^3').replace(/−/g, '-').replace(/[×·]/g, '*').replace(/÷/g, '/').replace(/,/g, '.').replace(/π/g, 'pi').replace(/√/g, 'sqrt');
  let i = 0;
  const FN = { sin: Math.sin, cos: Math.cos, tan: Math.tan, sqrt: Math.sqrt, abs: Math.abs, ln: Math.log, log: Math.log10, exp: Math.exp, asin: Math.asin, acos: Math.acos, atan: Math.atan };
  const peek = () => s[i], eat = c => s[i] === c ? (i++, true) : false;
  const startsAtom = () => i < s.length && /[0-9.a-z(]/.test(s[i]);
  function expr() { let a = term(); for (;;) { if (eat('+')) { const b = term(), A = a; a = x => A(x) + b(x); } else if (eat('-')) { const b = term(), A = a; a = x => A(x) - b(x); } else return a; } }
  function term() { let a = unary(); for (;;) { if (eat('*')) { const b = unary(), A = a; a = x => A(x) * b(x); } else if (eat('/')) { const b = unary(), A = a; a = x => A(x) / b(x); } else if (startsAtom()) { const b = unary(), A = a; a = x => A(x) * b(x); } else return a; } }
  function unary() { if (eat('-')) { const a = unary(); return x => -a(x); } if (eat('+')) return unary(); return power(); }
  function power() { const b = atom(); if (eat('^')) { const e = unary(); return x => Math.pow(b(x), e(x)); } return b; }
  function atom() {
    if (eat('(')) { const a = expr(); if (!eat(')')) throw new Error('parantez'); return a; }
    const m = /^(\d+\.?\d*|\.\d+)/.exec(s.slice(i)); if (m) { i += m[0].length; const v = +m[0]; return () => v; }
    const w = /^[a-z]+/.exec(s.slice(i));
    if (w) {
      const name = w[0];
      for (const f of Object.keys(FN).sort((a, b) => b.length - a.length)) if (name.startsWith(f)) { i += f.length; const arg = peek() === '(' ? atom() : power(); return x => FN[f](arg(x)); }
      if (name.startsWith('pi')) { i += 2; return () => Math.PI; }
      if (name[0] === 'x') { i += 1; return x => x; }
      if (name[0] === 'e') { i += 1; return () => Math.E; }
    }
    throw new Error('ifade okunamadı');
  }
  const f = expr(); if (i < s.length) throw new Error('ifade okunamadı');
  f(1.3); return f;
}
window.parseExpr = parseExpr;

/* ---------- çizim modeli: { w, h, items:[ {k:'path', pts:[[x,y]..], close, arrow:'end'|'both', c, wd}, {k:'text', x, y, t, size, align, bold, c, maxW} ] } ---------- */
function drawCtx(style) {
  const font = style.hand ? 'print' : 'sans';
  const g = document.createElement('canvas').getContext('2d');
  const fnt = (size, bold) => `${bold ? (font === 'print' ? 400 : 700) : 400} ${size}px ${FONTS[font]}`;
  const wrap = (t, size, maxW, bold) => { g.font = fnt(size, bold); return String(t || '').split('\n').flatMap(par => wrapLines(g, par, maxW)); };
  const tw = (t, size, bold) => { g.font = fnt(size, bold); return g.measureText(String(t || '')).width; };
  return { font, wrap, tw, items: [] };
}
const P = {
  rect(x, y, w, hh, r = 0) {
    if (!r) return [[x, y], [x + w, y], [x + w, y + hh], [x, y + hh], [x, y]];
    const pts = [], arc = (cx, cy, a0) => { for (let k = 0; k <= 6; k++) { const a = a0 + k / 6 * Math.PI / 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]); } };
    arc(x + w - r, y + r, -Math.PI / 2); arc(x + w - r, y + hh - r, 0); arc(x + r, y + hh - r, Math.PI / 2); arc(x + r, y + r, Math.PI); pts.push(pts[0]); return pts;
  },
  ellipse(cx, cy, rx, ry, n = 48) { const pts = []; for (let k = 0; k <= n; k++) { const a = k / n * Math.PI * 2; pts.push([cx + Math.cos(a) * rx, cy + Math.sin(a) * ry]); } return pts; },
  diamond(cx, cy, w, hh) { return [[cx, cy - hh / 2], [cx + w / 2, cy], [cx, cy + hh / 2], [cx - w / 2, cy], [cx, cy - hh / 2]]; },
  bez(p0, p1, p2, p3, n = 24) { const pts = []; for (let k = 0; k <= n; k++) { const t = k / n, u = 1 - t; pts.push([u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0], u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1]]); } return pts; },
  smooth(pts, n = 8) { // Catmull-Rom
    if (pts.length < 3) return pts; const out = [];
    for (let i = 0; i < pts.length - 1; i++) { const p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2; for (let k = 0; k < n; k++) { const t = k / n, t2 = t * t, t3 = t2 * t; out.push([.5 * (2 * p1[0] + (-p0[0] + p2[0]) * t + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * t2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * t3), .5 * (2 * p1[1] + (-p0[1] + p2[1]) * t + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * t2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * t3)]); } }
    out.push(pts[pts.length - 1]); return out;
  }
};
/* kutu içinde ortalanmış, satırlara bölünmüş yazı */
function boxText(D, t, cx, cy, maxW, size, o = {}) {
  const lines = D.wrap(t, size, maxW, o.bold), lh = size * 1.25, y0 = cy - lines.length * lh / 2;
  lines.forEach((l, k) => D.items.push({ k: 'text', x: cx, y: y0 + k * lh, t: l, size, align: 'center', bold: o.bold, c: o.c || 0 }));
  return { w: Math.max(...lines.map(l => D.tw(l, size, o.bold)), 0), h: lines.length * lh };
}
function textSize(D, t, size, maxW, bold) { const lines = D.wrap(t, size, maxW, bold); return { w: Math.max(...lines.map(l => D.tw(l, size, bold)), 0), h: lines.length * size * 1.25, n: lines.length }; }
const path = (D, pts, o = {}) => D.items.push({ k: 'path', pts, close: !!o.close, arrow: o.arrow || '', c: o.c || 0, wd: o.wd || 1.25 });
/* iki kutu arasında kenardan kenara ok */
function edgePt(n, tx, ty) { // n: {x,y,w,h} merkez; (tx,ty) yönünde kenar noktası
  const dx = tx - n.x, dy = ty - n.y; if (!dx && !dy) return [n.x, n.y];
  const sx = n.w / 2 / Math.abs(dx || 1e-9), sy = n.h / 2 / Math.abs(dy || 1e-9), s = Math.min(sx, sy);
  return [n.x + dx * s, n.y + dy * s];
}

const LAYOUT = {
  akis(D, j) {
    const nodes = (j.dugumler || j.nodes || []).slice(0, 14).map((n, i) => ({ id: String(n.id ?? i), t: n.yazi || n.label || '', sh: n.sekil || 'kutu' }));
    const byId = new Map(nodes.map(n => [n.id, n])), edges = (j.oklar || j.edges || []).filter(e => byId.has(String(e.from)) && byId.has(String(e.to))).map(e => ({ a: byId.get(String(e.from)), b: byId.get(String(e.to)), t: e.yazi || e.label || '' }));
    const right = j.yon === 'saga';
    // katman: en uzun yol (geri dönen oklar yok sayılır)
    const lvl = new Map(nodes.map(n => [n, 0])), order = new Map(nodes.map((n, i) => [n, i]));
    for (let it = 0; it < nodes.length; it++) for (const e of edges) if (order.get(e.b) > order.get(e.a) || lvl.get(e.b) <= lvl.get(e.a)) { if (order.get(e.b) < order.get(e.a)) continue; lvl.set(e.b, Math.max(lvl.get(e.b), lvl.get(e.a) + 1)); }
    const rows = []; for (const n of nodes) (rows[lvl.get(n)] = rows[lvl.get(n)] || []).push(n);
    const size = 12.5, maxW = right ? 110 : 130;
    for (const n of nodes) { const ts = textSize(D, n.t, size, maxW); n.w = Math.max(n.sh === 'karar' ? 120 : 80, ts.w + (n.sh === 'karar' ? 50 : 26)); n.h = Math.max(n.sh === 'karar' ? 62 : 36, ts.h + (n.sh === 'karar' ? 30 : 16)); }
    const gapA = right ? 46 : 40, gapB = 26;
    let pos = 0; const rowSize = rows.map(r => r ? Math.max(...r.map(n => right ? n.w : n.h)) : 0);
    const cross = rows.map(r => r ? r.reduce((a, n) => a + (right ? n.h : n.w), 0) + (r.length - 1) * gapB : 0), maxCross = Math.max(...cross, 0);
    rows.forEach((r, k) => {
      if (!r) return; let c = (maxCross - cross[k]) / 2;
      for (const n of r) { const along = pos + rowSize[k] / 2, half = (right ? n.h : n.w) / 2; if (right) { n.x = along; n.y = c + half; } else { n.x = c + half; n.y = along; } c += half * 2 + gapB; }
      pos += rowSize[k] + gapA;
    });
    for (const n of nodes) {
      if (n.sh === 'karar') path(D, P.diamond(n.x, n.y, n.w, n.h), { c: 1 });
      else if (n.sh === 'yuvarlak') path(D, P.rect(n.x - n.w / 2, n.y - n.h / 2, n.w, n.h, n.h / 2), { c: 2 });
      else path(D, P.rect(n.x - n.w / 2, n.y - n.h / 2, n.w, n.h, 6));
      boxText(D, n.t, n.x, n.y, n.sh === 'karar' ? n.w - 44 : maxW, size);
    }
    for (const e of edges) {
      const back = lvl.get(e.b) <= lvl.get(e.a);
      if (back) { // geri dönüş: yandan kıvrılan ok
        const s = right ? [e.a.x, e.a.y + e.a.h / 2] : [e.a.x + e.a.w / 2, e.a.y], t = right ? [e.b.x, e.b.y + e.b.h / 2] : [e.b.x + e.b.w / 2, e.b.y];
        const off = 40 + Math.abs((right ? s[0] - t[0] : s[1] - t[1])) * .15;
        const pts = right ? P.bez(s, [s[0], s[1] + off], [t[0], t[1] + off], t) : P.bez(s, [s[0] + off, s[1]], [t[0] + off, t[1]], t);
        path(D, pts, { arrow: 'end' }); if (e.t) D.items.push({ k: 'text', x: (s[0] + t[0]) / 2 + (right ? 0 : off * .8), y: (s[1] + t[1]) / 2 + (right ? off * .8 : 0) - 7, t: e.t, size: 10.5, align: 'center', c: 3 });
        continue;
      }
      const a = edgePt(e.a, e.b.x, e.b.y), b = edgePt(e.b, e.a.x, e.a.y);
      path(D, [a, b], { arrow: 'end' });
      if (e.t) D.items.push({ k: 'text', x: (a[0] + b[0]) / 2 + (right ? 0 : 8), y: (a[1] + b[1]) / 2 - (right ? 16 : 7), t: e.t, size: 10.5, align: right ? 'center' : 'left', c: 3 });
    }
  },
  dongu(D, j) {
    const items = (j.ogeler || j.items || []).slice(0, 8).map(String), n = Math.max(1, items.length), size = 12.5;
    const sz = items.map(t => textSize(D, t, size, 104)), bw = Math.max(90, ...sz.map(s => s.w + 24)), bh = Math.max(34, ...sz.map(s => s.h + 14));
    const R = Math.max(105, (bw + 30) * n / (2 * Math.PI) * 1.05), cx = R + bw / 2, cy = R + bh / 2;
    const P0 = items.map((t, k) => { const a = -Math.PI / 2 + k / n * Math.PI * 2; return { x: cx + Math.cos(a) * R, y: cy + Math.sin(a) * R, a, w: bw, h: bh }; });
    if (j.baslik) boxText(D, j.baslik, cx, cy, R * 1.1, 14, { bold: true, c: 1 });
    P0.forEach((p, k) => { path(D, P.rect(p.x - bw / 2, p.y - bh / 2, bw, bh, 10), { c: 1 + (k % 3) }); boxText(D, items[k], p.x, p.y, 104, size); });
    for (let k = 0; k < n && n > 1; k++) {
      const a0 = P0[k].a, a1 = P0[(k + 1) % n].a + (k + 1 === n ? Math.PI * 2 : 0), pad = Math.asin(Math.min(.95, (bw * .62) / R));
      const pts = []; for (let t = 0; t <= 16; t++) { const a = a0 + pad + (a1 - a0 - 2 * pad) * t / 16; pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]); }
      if (a1 - a0 - 2 * pad > .05) path(D, pts, { arrow: 'end' });
    }
  },
  zaman(D, j) {
    const items = (j.ogeler || []).slice(0, 8), n = Math.max(1, items.length), step = Math.max(80, Math.min(120, 560 / n)), W = step * n, y = 120;
    path(D, [[0, y], [W + 10, y]], { arrow: 'end', wd: 1.6 });
    items.forEach((it, k) => {
      const x = step / 2 + k * step, up = k % 2 === 0;
      path(D, P.ellipse(x, y, 4.5, 4.5, 16), { c: 1 });
      path(D, [[x, y + (up ? -6 : 6)], [x, y + (up ? -26 : 26)]], { wd: .9 });
      D.items.push({ k: 'text', x, y: up ? y - 44 : y + 30, t: String(it.zaman || it.when || ''), size: 12.5, align: 'center', bold: true, c: 1 });
      const lines = D.wrap(String(it.yazi || it.label || ''), 11.5, step * 1.7 - 8);
      lines.slice(0, 4).forEach((l, i) => D.items.push({ k: 'text', x, y: up ? y - 44 - (lines.slice(0, 4).length - i) * 14.5 : y + 48 + i * 14.5, t: l, size: 11.5, align: 'center' }));
    });
  },
  venn(D, j) {
    const sets = (j.kumeler || []).slice(0, 3), n = Math.max(2, sets.length), r = 118, size = 11.5;
    const C = n === 2 ? [[r, r + 30], [r * 2.05, r + 30]] : [[r, r + 30], [r * 2.05, r + 30], [r * 1.525, r * 1.95 + 30]];
    sets.forEach((s, k) => { path(D, P.ellipse(C[k][0], C[k][1], r, r, 64), { c: k + 1, wd: 1.5 }); });
    const name = (k, x, y) => D.items.push({ k: 'text', x, y, t: String(sets[k].ad || sets[k].name || ''), size: 14, align: 'center', bold: true, c: k + 1 });
    if (n === 2) { name(0, C[0][0] - 20, 8); name(1, C[1][0] + 20, 8); } else { name(0, C[0][0] - 30, 8); name(1, C[1][0] + 30, 8); name(2, C[2][0], C[2][1] + r + 6); }
    const list = (arr, x, y, w) => { const L = (arr || []).slice(0, 5).map(String); let yy = y - L.length * 8; for (const t of L) { const ln = D.wrap(t, size, w); for (const l of ln) { D.items.push({ k: 'text', x, y: yy, t: l, size, align: 'center' }); yy += 14; } yy += 2; } };
    if (n === 2) { list(sets[0].ogeler, C[0][0] - r * .4, C[0][1], r * .9); list(sets[1].ogeler, C[1][0] + r * .4, C[1][1], r * .9); list(j.ortak, (C[0][0] + C[1][0]) / 2, C[0][1], r * .62); }
    else { list(sets[0].ogeler, C[0][0] - r * .4, C[0][1] - r * .25, r * .8); list(sets[1].ogeler, C[1][0] + r * .4, C[1][1] - r * .25, r * .8); list(sets[2].ogeler, C[2][0], C[2][1] + r * .45, r * .9); list(j.ortak, (C[0][0] + C[1][0] + C[2][0]) / 3, (C[0][1] + C[1][1] + C[2][1]) / 3, r * .5); }
  },
  tablo(D, j) {
    const cols = (j.sutunlar || []).slice(0, 5).map(String), rows = (j.satirlar || []).slice(0, 10).map(r => cols.map((c, i) => String(r[i] ?? ''))), size = 11.5, hs = 12.5, pad = 7;
    const nC = Math.max(1, cols.length), maxCol = Math.max(80, Math.min(200, 560 / nC));
    const cw = cols.map((c, i) => Math.min(maxCol, Math.max(textSize(D, c, hs, maxCol, true).w, ...rows.map(r => textSize(D, r[i], size, maxCol).w)) + pad * 2));
    const xs = [0]; cw.forEach(w => xs.push(xs[xs.length - 1] + w)); const W = xs[xs.length - 1];
    const rh = [Math.max(...cols.map((c, i) => textSize(D, c, hs, cw[i] - pad * 2, true).h), 14) + pad * 2, ...rows.map(r => Math.max(...r.map((t, i) => textSize(D, t, size, cw[i] - pad * 2).h), 14) + pad * 2)];
    const ys = [0]; rh.forEach(x => ys.push(ys[ys.length - 1] + x)); const H = ys[ys.length - 1];
    path(D, P.rect(0, 0, W, H, 4), { wd: 1.4 });
    path(D, [[0, ys[1]], [W, ys[1]]], { wd: 1.4, c: 1 });
    for (let k = 2; k < ys.length - 1; k++) path(D, [[0, ys[k]], [W, ys[k]]], { wd: .8 });
    for (let k = 1; k < xs.length - 1; k++) path(D, [[xs[k], 0], [xs[k], H]], { wd: .8 });
    cols.forEach((c, i) => { D.wrap(c, hs, cw[i] - pad * 2, true).forEach((l, q) => D.items.push({ k: 'text', x: xs[i] + pad, y: pad + q * hs * 1.25, t: l, size: hs, align: 'left', bold: true, c: 1 })); });
    rows.forEach((r, ri) => r.forEach((t, i) => { D.wrap(t, size, cw[i] - pad * 2).forEach((l, q) => D.items.push({ k: 'text', x: xs[i] + pad, y: ys[ri + 1] + pad + q * size * 1.25, t: l, size, align: 'left' })); }));
  },
  agac(D, j) {
    const size = 12, gapX = 18, gapY = 46;
    const mk = (n, d) => ({ t: String(n.yazi || n.label || ''), d, kids: d < 3 ? (n.alt || n.children || []).slice(0, 6).map(c => mk(c, d + 1)) : [] });
    const root = mk(j.kok || j.root || {}, 0);
    const sizeOf = n => { const ts = textSize(D, n.t, size, 110, n.d === 0); n.w = Math.max(64, ts.w + 20); n.h = ts.h + 14; n.kids.forEach(sizeOf); n.span = Math.max(n.w, n.kids.reduce((a, k) => a + k.span, 0) + gapX * Math.max(0, n.kids.length - 1)); };
    sizeOf(root);
    const rowH = []; const walk = n => { rowH[n.d] = Math.max(rowH[n.d] || 0, n.h); n.kids.forEach(walk); }; walk(root);
    const yAt = d => rowH.slice(0, d).reduce((a, x) => a + x + gapY, 0);
    const place = (n, x0) => { n.x = x0 + n.span / 2; n.y = yAt(n.d) + n.h / 2; let x = x0 + (n.span - (n.kids.reduce((a, k) => a + k.span, 0) + gapX * Math.max(0, n.kids.length - 1))) / 2; for (const k of n.kids) { place(k, x); x += k.span + gapX; } };
    place(root, 0);
    const draw = n => {
      path(D, P.rect(n.x - n.w / 2, n.y - n.h / 2, n.w, n.h, 6), { c: n.d === 0 ? 1 : n.d === 1 ? 2 : 0, wd: n.d === 0 ? 1.6 : 1.2 });
      boxText(D, n.t, n.x, n.y, 110, size, { bold: n.d === 0 });
      if (n.kids.length) { const yb = n.y + n.h / 2, ym = yb + gapY / 2; path(D, [[n.x, yb], [n.x, ym]], { wd: 1 }); if (n.kids.length > 1) path(D, [[n.kids[0].x, ym], [n.kids[n.kids.length - 1].x, ym]], { wd: 1 }); for (const k of n.kids) path(D, [[k.x, ym], [k.x, k.y - k.h / 2]], { wd: 1, arrow: 'end' }); }
      n.kids.forEach(draw);
    };
    draw(root);
  },
  harita(D, j) {
    const rootT = String((j.kok || {}).yazi || ''), kids = ((j.kok || {}).alt || []).slice(0, 8), n = Math.max(1, kids.length);
    const R1 = 150, R2 = 120, cx = 330, cy = 250;
    const rs = textSize(D, rootT, 15, 130, true);
    path(D, P.ellipse(cx, cy, Math.max(64, rs.w / 2 + 22), Math.max(30, rs.h / 2 + 14)), { c: 1, wd: 1.7 });
    boxText(D, rootT, cx, cy, 130, 15, { bold: true, c: 1 });
    kids.forEach((k, i) => {
      const a = -Math.PI / 2 + (i + .5) / n * Math.PI * 2 - Math.PI / n / 2 + .25, ca = Math.cos(a), sa = Math.sin(a), c = 1 + (i % 3);
      const x = cx + ca * R1 * 1.15, y = cy + sa * R1 * .9, t = String(k.yazi || '');
      const ts = textSize(D, t, 13, 110, true), bw = ts.w + 22, bh = ts.h + 12;
      path(D, P.bez([cx + ca * 60, cy + sa * 30], [cx + ca * 100, cy + sa * 50], [x - ca * 40, y - sa * 20], [x - ca * bw / 2, y - sa * bh / 2]), { c, wd: 1.8 });
      path(D, P.rect(x - bw / 2, y - bh / 2, bw, bh, bh / 2), { c, wd: 1.3 });
      boxText(D, t, x, y, 110, 13, { bold: true, c });
      const subs = (k.alt || []).slice(0, 4), m = subs.length;
      subs.forEach((sv, q) => {
        const b = a + (m > 1 ? (q - (m - 1) / 2) * .34 : 0), sx = x + Math.cos(b) * R2, sy = y + Math.sin(b) * R2 * .8, st = String(sv.yazi || sv);
        path(D, [[x + Math.cos(b) * bw / 2 * .9, y + Math.sin(b) * bh / 2 * .9], [sx - Math.cos(b) * 8, sy - Math.sin(b) * 6]], { c, wd: .9 });
        const lines = D.wrap(st, 11.5, 100), al = Math.cos(b) > .3 ? 'left' : Math.cos(b) < -.3 ? 'right' : 'center';
        lines.forEach((l, li) => D.items.push({ k: 'text', x: sx, y: sy - lines.length * 7 + li * 14, t: l, size: 11.5, align: al }));
      });
    });
  },
  grafik(D, j) {
    const fns = (j.fonksiyonlar || j.functions || []).slice(0, 3).map(f => { try { return { f: parseExpr(f.ifade || f.expr || f), ad: f.ad || f.name || '', src: String(f.ifade || f.expr || f) }; } catch (e) { return null; } }).filter(Boolean);
    if (!fns.length) throw new Error('Grafikteki ifade okunamadı');
    let [x0, x1] = Array.isArray(j.x) && j.x.length === 2 && j.x[1] > j.x[0] ? j.x.map(Number) : [-5, 5];
    let y0, y1;
    if (Array.isArray(j.y) && j.y.length === 2 && j.y[1] > j.y[0]) [y0, y1] = j.y.map(Number);
    else { const vals = []; for (const F of fns) for (let k = 0; k <= 200; k++) { const v = F.f(x0 + (x1 - x0) * k / 200); if (isFinite(v)) vals.push(v); } vals.sort((a, b) => a - b); const lo = vals[Math.floor(vals.length * .03)] ?? -5, hi = vals[Math.floor(vals.length * .97)] ?? 5; const pad = (hi - lo) * .12 || 1; y0 = Math.min(lo - pad, 0); y1 = Math.max(hi + pad, 0); if (y1 - y0 < 2) { y0 -= 1; y1 += 1; } }
    const W = 380, H = 280, X = x => (x - x0) / (x1 - x0) * W, Y = y => H - (y - y0) / (y1 - y0) * H;
    const nice = span => { const r = span / 8, p = Math.pow(10, Math.floor(Math.log10(r))), m = r / p; return (m < 1.5 ? 1 : m < 3.5 ? 2 : m < 7.5 ? 5 : 10) * p; };
    const sx = nice(x1 - x0), sy = nice(y1 - y0), fmt = v => String(+v.toFixed(6)).replace('.', ',');
    for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9; v += sx) if (Math.abs(v) > 1e-9) path(D, [[X(v), 0], [X(v), H]], { wd: .35, c: 4 });
    for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9; v += sy) if (Math.abs(v) > 1e-9) path(D, [[0, Y(v)], [W, Y(v)]], { wd: .35, c: 4 });
    const ax = y0 <= 0 && y1 >= 0 ? Y(0) : H, ay = x0 <= 0 && x1 >= 0 ? X(0) : 0;
    path(D, [[-6, ax], [W + 10, ax]], { arrow: 'end', wd: 1.2 }); path(D, [[ay, H + 6], [ay, -10]], { arrow: 'end', wd: 1.2 });
    D.items.push({ k: 'text', x: W + 14, y: ax - 8, t: 'x', size: 12, align: 'left', bold: true }); D.items.push({ k: 'text', x: ay + 6, y: -22, t: 'y', size: 12, align: 'left', bold: true });
    for (let v = Math.ceil(x0 / sx) * sx; v <= x1 + 1e-9; v += sx) if (Math.abs(v) > 1e-9) { path(D, [[X(v), ax - 3], [X(v), ax + 3]], { wd: .8 }); D.items.push({ k: 'text', x: X(v), y: ax + 5, t: fmt(v), size: 9, align: 'center', c: 4 }); }
    for (let v = Math.ceil(y0 / sy) * sy; v <= y1 + 1e-9; v += sy) if (Math.abs(v) > 1e-9) { path(D, [[ay - 3, Y(v)], [ay + 3, Y(v)]], { wd: .8 }); D.items.push({ k: 'text', x: ay - 6, y: Y(v) - 6, t: fmt(v), size: 9, align: 'right', c: 4 }); }
    fns.forEach((F, i) => {
      let seg = [], lastY = null; const segs = [];
      for (let k = 0; k <= 400; k++) {
        const x = x0 + (x1 - x0) * k / 400, y = F.f(x);
        if (!isFinite(y) || y < y0 - (y1 - y0) * 2 || y > y1 + (y1 - y0) * 2 || (lastY != null && Math.abs(y - lastY) > (y1 - y0) * .9)) { if (seg.length > 1) segs.push(seg); seg = []; lastY = isFinite(y) ? y : null; continue; }
        seg.push([X(x), Math.max(-8, Math.min(H + 8, Y(y)))]); lastY = y;
      }
      if (seg.length > 1) segs.push(seg);
      segs.forEach(sg => path(D, sg, { c: 1 + i, wd: 1.7 }));
      const pretty = e => e.replace(/^\s*(y|f\(x\))\s*=\s*/i, '').replace(/\^2(?![0-9])/g, '²').replace(/\^3(?![0-9])/g, '³').replace(/\*/g, '·').replace(/-/g, ' − ').replace(/\+/g, ' + ').replace(/\(\s−\s/g, '(−').replace(/^\s−\s/, '−').replace(/\s+/g, ' ').trim();
      const last = segs[segs.length - 1]; if (last) { const p = last[Math.max(0, last.length - 30)]; D.items.push({ k: 'text', x: p[0] + 4, y: Math.max(-16, p[1] - 20), t: (F.ad || 'y') + ' = ' + pretty(F.src), size: 11, align: 'left', c: 1 + i }); }
    });
    for (const pt of (j.noktalar || []).slice(0, 8)) { const x = X(+pt.x), y = Y(+pt.y); if (!isFinite(x) || !isFinite(y)) continue; path(D, P.ellipse(x, y, 3, 3, 12), { c: 3, wd: 2 }); if (pt.yazi) D.items.push({ k: 'text', x: x + 6, y: y - 18, t: String(pt.yazi), size: 10.5, align: 'left', c: 3 }); }
  },
  cubuk(D, j) {
    const items = (j.ogeler || []).slice(0, 8).filter(o => isFinite(+o.deger)), n = Math.max(1, items.length), max = Math.max(...items.map(o => +o.deger), 0) || 1;
    const H = 220, bw = Math.min(54, 360 / n), gap = bw * .6, W = n * (bw + gap) + gap;
    if (j.baslik) D.items.push({ k: 'text', x: W / 2, y: -34, t: String(j.baslik), size: 13.5, align: 'center', bold: true, c: 1 });
    path(D, [[0, -10], [0, H], [W + 8, H]], { wd: 1.2 });
    items.forEach((o, k) => {
      const x = gap + k * (bw + gap), hh = (+o.deger / max) * (H - 20), y = H - hh;
      path(D, P.rect(x, y, bw, hh), { c: 1 + (k % 3), wd: 1.4 });
      for (let yy = y + 8; yy < H - 4; yy += 11) path(D, [[x + 3, yy], [x + bw - 3, Math.min(H - 2, yy + 4)]], { c: 1 + (k % 3), wd: .5 });
      D.items.push({ k: 'text', x: x + bw / 2, y: y - 17, t: String(+o.deger).replace('.', ',') + (j.birim ? ' ' + j.birim : ''), size: 10.5, align: 'center' });
      D.wrap(String(o.ad || ''), 10.5, bw + gap - 4).slice(0, 2).forEach((l, q) => D.items.push({ k: 'text', x: x + bw / 2, y: H + 6 + q * 13, t: l, size: 10.5, align: 'center' }));
    });
  },
  cizim(D, j) {
    const w = +j.w || 100, hh = +j.h || 70, s = Math.min(420 / w, 320 / hh), q = v => +v * s;
    for (const sh of (j.sekiller || j.shapes || []).slice(0, 60)) {
      const c = Math.max(0, Math.min(3, (+sh.renk || 1) - 1)) ? +sh.renk : 0, pts = arr => { const out = []; for (let i = 0; i + 1 < (arr || []).length; i += 2) out.push([q(arr[i]), q(arr[i + 1])]); return out; };
      switch (sh.k) {
        case 'cizgi': if ((sh.p || []).length >= 4) path(D, pts(sh.p), { c }); break;
        case 'ok': if ((sh.p || []).length >= 4) path(D, pts(sh.p), { c, arrow: 'end' }); break;
        case 'egri': if ((sh.p || []).length >= 4) path(D, P.smooth(pts(sh.p)), { c }); break;
        case 'cokgen': if ((sh.p || []).length >= 6) { const p = pts(sh.p); p.push(p[0]); path(D, p, { c }); } break;
        case 'dikdortgen': path(D, P.rect(q(sh.x), q(sh.y), q(sh.w), q(sh.h), 2), { c }); break;
        case 'daire': path(D, P.ellipse(q(sh.x), q(sh.y), q(sh.r), q(sh.r)), { c }); break;
        case 'elips': path(D, P.ellipse(q(sh.x), q(sh.y), q(sh.rx), q(sh.ry)), { c }); break;
        case 'yazi': if (sh.t) D.items.push({ k: 'text', x: q(sh.x), y: q(sh.y) - 7, t: String(sh.t), size: 11.5, align: 'left', c }); break;
      }
    }
  }
};
/* tarif → çizim; sınırlar hesaplanıp (0,0)'a taşınır */
function buildDrawing(spec, style) {
  const D = drawCtx(style), tur = String(spec.tur || spec.type || '').toLowerCase();
  const fn = LAYOUT[tur] || (spec.dugumler ? LAYOUT.akis : spec.fonksiyonlar ? LAYOUT.grafik : spec.sekiller ? LAYOUT.cizim : null);
  if (!fn) throw new Error('Çizim türü anlaşılamadı');
  fn(D, spec);
  if (!D.items.length) throw new Error('Çizilecek bir şey çıkmadı');
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  const g = document.createElement('canvas').getContext('2d');
  for (const it of D.items) {
    if (it.k === 'path') for (const [x, y] of it.pts) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); }
    else { g.font = `${it.bold ? 700 : 400} ${it.size}px ${FONTS[D.font]}`; const w = g.measureText(it.t).width, l = it.align === 'center' ? it.x - w / 2 : it.align === 'right' ? it.x - w : it.x; x0 = Math.min(x0, l); x1 = Math.max(x1, l + w); y0 = Math.min(y0, it.y); y1 = Math.max(y1, it.y + it.size * 1.3); }
  }
  const pad = 6; x0 -= pad; y0 -= pad; x1 += pad; y1 += pad;
  for (const it of D.items) { if (it.k === 'path') it.pts = it.pts.map(([x, y]) => [x - x0, y - y0]); else { it.x -= x0; it.y -= y0; } }
  return { w: x1 - x0, h: y1 - y0, items: D.items, font: D.font, tur };
}
window.buildDrawing = buildDrawing;

/* ---------- renk ve el çizimi görünümü ---------- */
function drawColors(style) {
  const ink = style.ink || '#25324d';
  return style.color ? [ink, '#2c5aa0', '#1b7a4b', '#c2410c', '#8a94a6'] : [ink, ink, ink, ink, '#8a94a6'];
}
function seeded(seed) { let a = seed >>> 0 || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function densify(pts, step = 3) { const out = [pts[0]]; for (let i = 1; i < pts.length; i++) { const [ax, ay] = pts[i - 1], [bx, by] = pts[i], L = Math.hypot(bx - ax, by - ay), n = Math.max(1, Math.round(L / step)); for (let k = 1; k <= n; k++) out.push([ax + (bx - ax) * k / n, ay + (by - ay) * k / n]); } return out; }
function roughen(pts, amp, R) {
  if (!amp) return pts;
  const d = densify(pts, 3), p1 = R() * 6, p2 = R() * 6, f1 = .035 + R() * .03, f2 = .11 + R() * .05; let L = 0;
  return d.map((q, i) => {
    if (i) L += Math.hypot(q[0] - d[i - 1][0], q[1] - d[i - 1][1]);
    const a = d[Math.max(0, i - 1)], b = d[Math.min(d.length - 1, i + 1)], dx = b[0] - a[0], dy = b[1] - a[1], n = Math.hypot(dx, dy) || 1;
    const o = amp * (Math.sin(L * f1 + p1) * .7 + Math.sin(L * f2 + p2) * .3);
    return [q[0] - dy / n * o, q[1] + dx / n * o];
  });
}
function arrowHead(pts, size = 7) {
  const n = pts.length, b = pts[n - 1]; let a = pts[n - 2]; for (let k = n - 2; k >= 0; k--) { a = pts[k]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) > 6) break; }
  const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
  return [[b[0] - ux * size - uy * size * .55, b[1] - uy * size + ux * size * .55], b, [b[0] - ux * size + uy * size * .55, b[1] - uy * size - ux * size * .55]];
}
/* çizimi sayfa nesnelerine çevir: kalem çizgileri + metin kutuları (x,y,ölçek) */
function drawingToAnn(Dw, x, y, k, style) {
  const cols = drawColors(style), R = seeded(style.seed || 7), amp = style.hand ? .9 : 0, strokes = [], texts = [];
  const T = ([px, py]) => [x + px * k, y + py * k];
  for (const it of Dw.items) {
    if (it.k !== 'path' || it.pts.length < 2) continue;
    const pts = it.pts.map(T), wd = Math.max(.6, (it.wd || 1.25) * Math.min(1.25, Math.max(.8, k)) * (style.hand ? 1.08 : 1));
    const grid = it.c === 4, add = ps => { const r = roughen(ps, grid ? 0 : amp * Math.min(1.3, Math.max(.7, k)), R); const a = new Float32Array(r.length * 3); r.forEach((q, i) => { a[3 * i] = q[0]; a[3 * i + 1] = q[1]; a[3 * i + 2] = wd; }); strokes.push({ id: uid(), t: 'ballpoint', c: cols[it.c] || cols[0], o: grid ? .55 : 1, p: a }); };
    add(pts);
    if (it.arrow) add(arrowHead(pts, 7 * Math.max(.8, Math.min(1.3, k))));
    if (it.arrow === 'both') add(arrowHead(pts.slice().reverse(), 7 * Math.max(.8, Math.min(1.3, k))));
  }
  const g = document.createElement('canvas').getContext('2d');
  for (const it of Dw.items) {
    if (it.k !== 'text' || !String(it.t).trim()) continue;
    const size = Math.max(6, it.size * k), font = Dw.font, wt = it.bold ? (font === 'print' ? 400 : 700) : 400;
    g.font = `${wt} ${size}px ${FONTS[font]}`; const w = g.measureText(it.t).width;
    const px = x + it.x * k, left = it.align === 'center' ? px - w / 2 : it.align === 'right' ? px - w : px;
    texts.push({ id: uid(), x: left - 3, y: y + it.y * k - 2, text: String(it.t), size, color: cols[it.c] || cols[0], font, wt, bold: wt >= 700, w: w + 6, h: size * 1.3 + 4 });
  }
  return { strokes, texts };
}
/* önizleme: tuvale çiz */
function paintDrawing(cv, Dw, style) {
  const ctx = cv.getContext('2d'), r = cv.width, rh = cv.height;
  ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, r, rh);
  if (!Dw) return;
  const k = Math.min((r - 24) / Dw.w, (rh - 24) / Dw.h, 2.2 * (cv._r || 1)), ox = (r - Dw.w * k) / 2, oy = (rh - Dw.h * k) / 2;
  const { strokes, texts } = drawingToAnn(Dw, ox, oy, k, style);
  for (const s of strokes) { ctx.globalAlpha = s.o; ctx.fillStyle = s.c; ctx.fill(buildPath(s.p, s.p.length / 3)); ctx.globalAlpha = 1; }
  for (const t of texts) drawTextBox(ctx, t);
}

/* ---------- yapay zekâya sor ---------- */
async function askDrawing(parts, typeHint) {
  const sys = DRAW_SYSTEM + (typeHint && typeHint !== 'auto' ? `\nKullanıcı şu türü istedi: ${typeHint}.` : '');
  const { j } = await pfAsk(parts, null, { system: sys, maxTokens: 5000, tag: 'draw', check: j => !!(j && (j.tur || j.dugumler || j.sekiller || j.fonksiyonlar)) });
  return j;
}
/* yerel: "y = x^2 - 4" gibi yazılınca yapay zekâ gerekmez */
function localSpec(text, type) {
  const t = String(text || '').trim();
  const m = /^(?:y|f\(x\))\s*=\s*(.+)$/i.exec(t);
  const expr = m ? m[1] : (type === 'grafik' && /^[0-9x+\-*/^().\s,a-zπ√²³]+$/i.test(t) ? t : null);
  if (!expr) return null;
  const parts = expr.split(/\s*[;]\s*/).filter(Boolean);
  try { parts.forEach(parseExpr); } catch (e) { return null; }
  return { tur: 'grafik', fonksiyonlar: parts.map((e, i) => ({ ifade: e, ad: parts.length > 1 ? ['f(x)', 'g(x)', 'h(x)'][i] : '' })) };
}

/* ---------- sayfaya ekle ---------- */
function insertDrawing(pv, Dw, style, box, poly) {
  if (!pv || !Dw) return;
  const W = pv.meta.w, H = pv.meta.h;
  let k, x, y;
  if (box) { k = Math.min(box.w / Dw.w, box.h / Dw.h, 1.6); k = Math.max(k, Math.min(1, 260 / Dw.w)); x = box.x + (box.w - Dw.w * k) / 2; y = box.y + Math.max(0, (box.h - Dw.h * k) / 2); }
  else {
    k = Math.min(1, (W - 80) / Dw.w, (H - 80) / Dw.h);
    // görünen alanın ortasına
    const v = ed.view, vx0 = (-v.tx) / v.z - pv.x, vy0 = (-v.ty) / v.z - pv.y, vx1 = vx0 + ed.W / v.z, vy1 = vy0 + ed.H / v.z;
    const cx = clamp((Math.max(0, vx0) + Math.min(W, vx1)) / 2, Dw.w * k / 2 + 20, W - Dw.w * k / 2 - 20), cy = clamp((Math.max(0, vy0) + Math.min(H, vy1)) / 2, Dw.h * k / 2 + 20, H - Dw.h * k / 2 - 20);
    x = cx - Dw.w * k / 2; y = cy - Dw.h * k / 2;
  }
  x = clamp(x, 4, Math.max(4, W - Dw.w * k - 4)); y = clamp(y, 4, Math.max(4, H - Dw.h * k - 4));
  const { strokes, texts } = drawingToAnn(Dw, x, y, k, style);
  const pid = pv.meta.id, b = snap(pid), A = ann(pid);
  if (poly) { // Temize çiz: alandaki kaba çizgiler/yazılar yeni çizimle değişir (tek Geri al)
    const inS = s => { const q = strokeBB(s); return pip((q.x0 + q.x1) / 2, (q.y0 + q.y1) / 2, poly); };
    const inT = t => pip(t.x + (t.w || 20) / 2, t.y + (t.h || 14) / 2, poly);
    A.s = A.s.filter(s => s.t === 'hl' || !inS(s)); A.t = A.t.filter(t => !inT(t));
  }
  A.s.push(...strokes); A.t.push(...texts);
  pushOp({ k: "page", pid, b, a: snap(pid) }); renderLayer(pv); requestFrame(true);
  setTool('lasso'); setSel(pv, new Set(strokes), new Set(texts), new Set());
  toast('Çizim eklendi · seçili: taşı, büyüt-küçült ya da rengini değiştir', 2400);
}

/* ---------- Çizim penceresi ---------- */
function drawSheet(opts = {}) {
  if (!ed.note) return;
  const pv = opts.pv || currentPage();
  const st = { text: opts.text || '', type: S.prefs.drawType || 'auto', hand: S.prefs.drawHand !== false, color: S.prefs.drawColor !== false, usePage: false, spec: null, Dw: null, busy: false, err: '' };
  const style = () => ({ hand: st.hand, color: st.color, ink: (S.pen[S.pen.type] || {}).color || '#25324d', seed: 11 });
  const back = h('div', { class: 'modal-back nbback' });
  const close = () => { back.remove(); removeEventListener('keydown', onKey, true); if (ab) ab.abort(); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  addEventListener('keydown', onKey, true);
  let ab = null;
  const cv = nbCanvas(330, 300); cv._r = cv.width / 330;
  const status = h('p', { class: 'drstat', role: 'status' });
  const ta = h('textarea', { id: 'drText', rows: '3', placeholder: 'ör. "Fotosentez döngüsü", "Hücre bölünmesi evreleri akış şeması", "y = x² − 4", "Osmanlı kuruluşundan Cumhuriyete zaman çizelgesi", "Mitoz ve mayoz karşılaştırma tablosu"' });
  ta.value = st.text; ta.addEventListener('input', () => { st.text = ta.value; });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); go(); } e.stopPropagation(); });
  const typeSel = h('div', { class: 'drtypes', role: 'radiogroup', 'aria-label': 'Tür' });
  const drawTypes = () => { typeSel.innerHTML = ''; for (const [k, l] of DRAW_TYPES) typeSel.append(h('button', { type: 'button', class: 'prechip' + (st.type === k ? ' on' : ''), role: 'radio', 'aria-checked': String(st.type === k), onclick: () => { st.type = k; S.prefs.drawType = k; saveSettings(); drawTypes(); } }, l)); };
  const repaint = () => { paintDrawing(cv, st.Dw, style()); addB.disabled = !st.Dw; };
  const goB = h('button', { class: 'btn primary', type: 'button', onclick: () => go() }, icon(IC.spark), 'Çiz');
  const addB = h('button', { class: 'btn primary', type: 'button', disabled: true, onclick: () => { if (!st.Dw) return; close(); clearSel(); insertDrawing(pv, st.Dw, style(), opts.box, opts.poly); } }, icon(IC.plus), opts.box ? 'Yerine koy' : 'Sayfaya ekle');
  async function go() {
    if (st.busy) return;
    st.err = ''; const t = st.text.trim();
    if (!t && !st.usePage && !opts.image) { ta.focus(); status.textContent = 'Ne çizileceğini yaz.'; return; }
    const loc = !opts.image && !st.usePage ? localSpec(t, st.type) : null;
    try {
      st.busy = true; goB.disabled = true;
      if (loc) { st.spec = loc; status.textContent = 'Grafik çizildi (yapay zekâ kullanılmadı).'; }
      else {
        status.textContent = 'Yapay zekâ çizimi tarif ediyor…';
        const parts = [];
        if (opts.image) parts.push({ type: 'image', mime: 'image/jpeg', data: opts.image }, { type: 'text', text: DRAW_CLEAN + (t ? '\nKullanıcının notu: ' + t : '') });
        else {
          if (st.usePage && pv) { const img = await areaImage(pv, { x0: 0, y0: 0, x1: pv.meta.w, y1: pv.meta.h }); parts.push({ type: 'image', mime: 'image/jpeg', data: img }); }
          parts.push({ type: 'text', text: (st.usePage ? 'Bu not sayfasının içeriğinden yararlan.\n' : '') + 'İstek: ' + (t || 'bu sayfayı en iyi anlatan çizim') });
        }
        st.spec = await askDrawing(parts, st.type === 'auto' ? '' : (DRAW_TYPES.find(x => x[0] === st.type) || [])[0]);
        status.textContent = 'Hazır. Beğenmezsen isteği değiştirip yeniden çiz.';
      }
      st.Dw = buildDrawing(st.spec, style());
      repaint();
    } catch (e) { st.Dw = null; repaint(); status.textContent = e.code === 'nokey' ? 'Çizim için Ayarlar → Yapay zekâ bölümüne Gemini anahtarını gir (ücretsiz). Fonksiyon grafiği (ör. y = x² − 4) anahtarsız da çizilir.' : 'Çizilemedi: ' + (e.message || e); }
    finally { st.busy = false; goB.disabled = false; }
  }
  const look = h('div', { class: 'drlook' },
    segRow([['1', 'El çizimi'], ['0', 'Düzgün']], st.hand ? '1' : '0', v => { st.hand = v === '1'; S.prefs.drawHand = st.hand; saveSettings(); if (st.spec) { try { st.Dw = buildDrawing(st.spec, style()); } catch (e) { } } repaint(); }, 'Görünüm'),
    segRow([['1', 'Renkli'], ['0', 'Tek renk']], st.color ? '1' : '0', v => { st.color = v === '1'; S.prefs.drawColor = st.color; saveSettings(); repaint(); }, 'Renk'));
  const box = h('div', { class: 'modal wide nbbox drbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Çizim' },
    h('div', { class: 'nbhead' }, h('h3', null, opts.image ? 'Temize çiz' : 'Çizim'), h('span', { class: 'grow' }), h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: close }, icon(IC.close))),
    h('div', { class: 'nbmain' },
      h('div', { class: 'nbpv drpv' }, cv, look),
      h('div', { class: 'nbbody' },
        opts.image ? h('p', { class: 'notice' }, 'Seçtiğin alandaki kaba çizim yapay zekâya gönderilir; aynı şemanın düzgün hâli çizilir ve istersen yerine konur (Geri al ile dönülür). İstersen aşağıya bir not yaz (ör. "akış şeması, soldan sağa").') : null,
        h('label', { class: 'field', for: 'drText' }, opts.image ? 'Not (isteğe bağlı)' : 'Ne çizilsin?', ta),
        opts.image ? null : h('div', { class: 'lbl' }, 'Tür'), opts.image ? null : typeSel,
        opts.image ? null : toggleRow('drPage', 'Bu sayfanın içeriğinden yararlan', false, v => { st.usePage = v; }, 'Sayfanın görüntüsü de gönderilir (ör. "bu konuyu zihin haritası yap")'),
        h('p', { class: 'notice drnote' }, 'Ücretsiz Gemini resim üretmez; çizimi tarif eder, uygulama kalem çizgisi ve yazı olarak çizer. Eklenince seçili gelir: taşı, büyüt-küçült, rengini ya da yazı stilini değiştir, istediğini sil.'),
        status)),
    h('div', { class: 'nbfoot' }, h('span', { class: 'grow' }), h('button', { class: 'btn', type: 'button', onclick: close }, 'Vazgeç'), goB, addB));
  back.append(box); back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  document.body.append(back);
  drawTypes(); repaint();
  if (opts.image) go(); else setTimeout(() => ta.focus(), 60);
}
window.drawSheet = drawSheet;

/* ---------- araç çubuğu ve Alanı çevrele ---------- */
TB_ITEMS.draw = { name: 'Çizim (YZ)', ic: IC.draw };
if (!TB_DEFAULT.order.includes('draw')) TB_DEFAULT.order.splice(TB_DEFAULT.order.indexOf('pagefix') + 1, 0, 'draw');
{ const ta = toolbarAction; toolbarAction = function (id, anchor) { if (id === 'draw') { drawSheet(); return; } return ta(id, anchor); }; }
{
  const ab = aiBar;
  aiBar = function (wait) {
    ab(wait);
    const bar = $('#aiBar'), A = ed.aiArea; if (!bar || wait || !A) return;
    const btn = h('button', { class: 'btn', type: 'button', title: 'Kaba çizimi düzgün şemaya çevir' }, icon(IC.draw), 'Temize çiz');
    btn.addEventListener('click', async () => {
      const area = ed.aiArea; if (!area) return;
      aiBar('Görüntü hazırlanıyor…');
      let img = null; try { img = await areaImage(area.pv, area.bb); } catch (e) { }
      const pv = area.pv, poly = area.poly, bb = area.bb; aiAreaClear();
      if (!img) { toast('Alanın görüntüsü alınamadı', 2000); return; }
      drawSheet({ pv, image: img, box: { x: bb.x0, y: bb.y0, w: Math.max(120, bb.x1 - bb.x0), h: Math.max(90, bb.y1 - bb.y0) }, poly });
    });
    const first = bar.querySelector('.btn'); if (first) first.before(btn); else bar.prepend(btn);
    placeAiBar();
  };
}
