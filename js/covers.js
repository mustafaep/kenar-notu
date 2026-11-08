'use strict';
/* =========================================================
   Kapaklar ve sayfa şablonları (3.0)
   Hepsi tuval (canvas) üzerine sayfa birimleriyle (A4: 595×842) çizilir; ekranda, küçük resimde ve
   PDF'e aktarırken aynı çizim kullanılır. Kapak sayfası: { k:'blank', bg:'cover', cover:{ d, pal, title, sub, year, seed } }
   ========================================================= */
const CV_PALS = {
  lacivert: { name: 'Lacivert', base: '#1f2a44', deep: '#131a2c', ink: '#f3ead7', accent: '#c9a45c', soft: '#d8dceb' },
  bordo: { name: 'Bordo', base: '#6e1f2a', deep: '#45121a', ink: '#f6e9dc', accent: '#d9b26f', soft: '#efd9d6' },
  zumrut: { name: 'Zümrüt', base: '#1d5c4d', deep: '#113a30', ink: '#eef3e6', accent: '#e2c47a', soft: '#d5e6dc' },
  hardal: { name: 'Hardal', base: '#c9962b', deep: '#8e6612', ink: '#2a2216', accent: '#3b2f1e', soft: '#f1e2bd' },
  gul: { name: 'Gül kurusu', base: '#b47a70', deep: '#8a5148', ink: '#fbf1ec', accent: '#5b2f2a', soft: '#f1dcd6' },
  antrasit: { name: 'Antrasit', base: '#363a41', deep: '#212328', ink: '#eceae4', accent: '#c3c7cf', soft: '#dfe1e5' },
  cini: { name: 'Çini mavisi', base: '#1f5aa6', deep: '#143e74', ink: '#ffffff', accent: '#6fd0c9', soft: '#d6e4f5' },
  adacayi: { name: 'Adaçayı', base: '#879d82', deep: '#5f765b', ink: '#1f2a1e', accent: '#f4efe2', soft: '#e3eadf' }
};
const CV_PAL_ORDER = ['lacivert', 'bordo', 'zumrut', 'hardal', 'gul', 'antrasit', 'cini', 'adacayi'];
const CV_FONT = { serif: 'Literata, Georgia, serif', sans: 'Onest, system-ui, sans-serif', hand: 'Caveat, "Segoe Print", cursive' };

function cvRand(seed) { let a = (seed >>> 0) || 1; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hexA(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`; }
function mixHex(a, b, t) { const x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16); const c = k => Math.round(((x >> k) & 255) * (1 - t) + ((y >> k) & 255) * t); return '#' + [16, 8, 0].map(k => c(k).toString(16).padStart(2, '0')).join(''); }
function rrect(ctx, x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
/* başlığı verilen genişliğe sığdırır: önce yazı küçülür, yetmezse iki satıra bölünür */
function fitTitle(ctx, text, maxW, size, minSize, font, weight = 600) {
  text = String(text || '').trim() || 'Adsız defter';
  for (let s = size; s >= minSize; s -= 2) { ctx.font = `${weight} ${s}px ${font}`; if (ctx.measureText(text).width <= maxW) return { lines: [text], size: s }; }
  const words = text.split(/\s+/); let s = Math.max(minSize, Math.round(size * .8));
  for (; s >= minSize; s -= 2) {
    ctx.font = `${weight} ${s}px ${font}`; const lines = []; let cur = '';
    for (const w of words) { const t = cur ? cur + ' ' + w : w; if (ctx.measureText(t).width > maxW && cur) { lines.push(cur); cur = w; } else cur = t; }
    if (cur) lines.push(cur);
    if (lines.length <= 2 && lines.every(l => ctx.measureText(l).width <= maxW)) return { lines, size: s };
  }
  ctx.font = `${weight} ${minSize}px ${font}`;
  let t = text; while (t.length > 3 && ctx.measureText(t + '…').width > maxW) t = t.slice(0, -1);
  return { lines: [t + '…'], size: minSize };
}
function drawTitle(ctx, o, x, y, maxW, { size = 44, min = 22, font = CV_FONT.serif, weight = 600, color, align = 'center', lh = 1.12 } = {}) {
  const f = fitTitle(ctx, o.title, maxW, size, min, font, weight);
  ctx.font = `${weight} ${f.size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic';
  f.lines.forEach((l, i) => ctx.fillText(l, x, y + i * f.size * lh));
  return y + (f.lines.length - 1) * f.size * lh;
}
function drawSub(ctx, text, x, y, color, { size = 15, font = CV_FONT.sans, weight = 500, align = 'center', spacing = 0 } = {}) {
  if (!text) return; ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align;
  if (spacing && 'letterSpacing' in ctx) { ctx.letterSpacing = spacing + 'px'; ctx.fillText(text, x, y); ctx.letterSpacing = '0px'; } else ctx.fillText(text, x, y);
}

/* ---------------- kapak tasarımları ---------------- */
const COVERS = {
  /* Ebru: taraklı ebru katmanları, ortada kâğıt etiket */
  ebru: { name: 'Ebru', pal: 'cini', draw(ctx, W, H, p, o, R) {
    // gelgit ebru: geniş, yumuşak katmanlar; her katman bir öncekinin üstüne dökülür, aralarında beyaz damar kalır
    const tones = [p.base, mixHex(p.base, '#ffffff', .55), p.deep, mixHex(p.accent, '#ffffff', .25), mixHex(p.base, '#ffffff', .78), p.accent];
    ctx.fillStyle = '#f8f3e8'; ctx.fillRect(0, 0, W, H);
    const ph = [R() * 6, R() * 6, R() * 6];
    const curve = (y0, x) => y0 + 34 * Math.sin(x / 70 + y0 / 55 + ph[0]) + 12 * Math.sin(x / 26 - y0 / 40 + ph[1]) + 20 * Math.sin(y0 / 90 + ph[2]) * Math.sin(x / 120 + ph[1]);
    let i = 0;
    for (let y0 = -60; y0 < H + 80; y0 += 16 + R() * 22, i++) {
      ctx.beginPath(); ctx.moveTo(0, H + 10);
      for (let x = 0; x <= W; x += 3) ctx.lineTo(x, curve(y0, x));
      ctx.lineTo(W, H + 10); ctx.closePath();
      ctx.fillStyle = tones[(i * 2 + (R() < .3 ? 1 : 0)) % tones.length]; ctx.fill();
      ctx.strokeStyle = 'rgba(255,253,247,.85)'; ctx.lineWidth = 1.6; ctx.stroke();
    }
    // tarak: katmanları aşağı çeken ince çizgiler gelgit dokusunu verir
    ctx.strokeStyle = 'rgba(255,253,247,.22)'; ctx.lineWidth = .8;
    for (let x = 10; x < W; x += 26) { ctx.beginPath(); for (let y = 0; y <= H; y += 5) ctx.lineTo(x + 6 * Math.sin(y / 34 + x / 40), y); ctx.stroke(); }
    // etiket
    const lw = 350, lh = o.sub ? 158 : 130, lx = (W - lw) / 2, ly = 200;
    ctx.save(); ctx.shadowColor = 'rgba(30,25,15,.28)'; ctx.shadowBlur = 16; ctx.shadowOffsetY = 5;
    ctx.fillStyle = '#fbf8f0'; rrect(ctx, lx, ly, lw, lh, 6); ctx.fill(); ctx.restore();
    ctx.strokeStyle = p.deep; ctx.lineWidth = 1.2; rrect(ctx, lx + 9, ly + 9, lw - 18, lh - 18, 3); ctx.stroke();
    const ty = drawTitle(ctx, o, W / 2, ly + 66, lw - 54, { size: 40, min: 20, color: p.deep });
    drawSub(ctx, o.sub, W / 2, ty + 32, mixHex(p.deep, '#ffffff', .25), { size: 15 });
    drawSub(ctx, o.year, W / 2, ly + lh - 20, mixHex(p.deep, '#ffffff', .35), { size: 11 });
  } },
  /* Bez cilt: keten dokusu, koyu sırt şeridi, varak (yaldız) baskı başlık */
  bez: { name: 'Bez cilt', pal: 'bordo', draw(ctx, W, H, p, o, R) {
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    ctx.lineWidth = .7;
    for (let y = 0; y < H; y += 2.2) { ctx.strokeStyle = R() < .5 ? 'rgba(255,255,255,.045)' : 'rgba(0,0,0,.06)'; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y + (R() - .5)); ctx.stroke(); }
    for (let x = 0; x < W; x += 2.2) { ctx.strokeStyle = R() < .5 ? 'rgba(255,255,255,.035)' : 'rgba(0,0,0,.05)'; ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x + (R() - .5), H); ctx.stroke(); }
    // sırt
    const sw = 64; ctx.fillStyle = hexA(p.deep, .92); ctx.fillRect(0, 0, sw, H);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(sw, 0, 2, H); ctx.fillStyle = 'rgba(0,0,0,.25)'; ctx.fillRect(sw + 2, 0, 3, H);
    for (const y of [70, H - 70]) { ctx.fillStyle = hexA(p.accent, .75); ctx.fillRect(10, y, sw - 20, 2); }
    // varak baskı: hafif gömük gölge + parlak üst kenar
    const cx = sw + (W - sw) / 2, by = 300;
    ctx.strokeStyle = p.accent; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(cx - 70, by - 64); ctx.lineTo(cx + 70, by - 64); ctx.stroke();
    ctx.beginPath(); ctx.arc(cx, by - 64, 4, 0, Math.PI * 2); ctx.fillStyle = p.accent; ctx.fill();
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.45)'; ctx.shadowOffsetY = 1.2; ctx.shadowBlur = 1;
    const ty = drawTitle(ctx, o, cx, by, W - sw - 110, { size: 46, min: 22, color: p.accent });
    ctx.restore();
    drawSub(ctx, o.sub, cx, ty + 40, hexA(p.accent, .85), { size: 15, font: CV_FONT.serif, weight: 600 });
    ctx.beginPath(); ctx.moveTo(cx - 70, ty + 70); ctx.lineTo(cx + 70, ty + 70); ctx.stroke();
    drawSub(ctx, o.year, cx, H - 64, hexA(p.accent, .8), { size: 13, font: CV_FONT.serif, weight: 600 });
  } },
  /* Kraft: kâğıt lifleri, sağda lastik bant, elle yazılmış etiket */
  kraft: { name: 'Kraft', pal: 'zumrut', draw(ctx, W, H, p, o, R) {
    ctx.fillStyle = '#c9a476'; ctx.fillRect(0, 0, W, H);
    for (let i = 0; i < 2600; i++) {
      const x = R() * W, y = R() * H, l = 2 + R() * 7, a = R() * Math.PI;
      ctx.strokeStyle = R() < .55 ? 'rgba(90,60,25,.16)' : 'rgba(255,240,210,.22)'; ctx.lineWidth = .5 + R() * .6;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke();
    }
    const g = ctx.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 620); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(70,40,10,.18)'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // etiket (hafif eğik)
    ctx.save(); ctx.translate(W / 2 - 28, 260); ctx.rotate(-.025);
    const lw = 380, lh = 196;
    ctx.shadowColor = 'rgba(60,35,10,.25)'; ctx.shadowBlur = 6; ctx.shadowOffsetY = 2;
    ctx.fillStyle = '#f6f1e6'; ctx.fillRect(-lw / 2, -lh / 2, lw, lh); ctx.shadowColor = 'transparent';
    ctx.fillStyle = p.base; ctx.fillRect(-lw / 2, -lh / 2, lw, 16);
    ctx.strokeStyle = 'rgba(31,42,68,.18)'; ctx.lineWidth = .8;
    for (let y = -lh / 2 + 84; y < lh / 2 - 10; y += 40) { ctx.beginPath(); ctx.moveTo(-lw / 2 + 18, y); ctx.lineTo(lw / 2 - 18, y); ctx.stroke(); }
    const ty = drawTitle(ctx, o, 0, -lh / 2 + 78, lw - 44, { size: 58, min: 26, font: CV_FONT.hand, weight: 700, color: p.deep, lh: 1.0 });
    drawSub(ctx, o.sub, 0, Math.max(ty + 40, -lh / 2 + 120), mixHex(p.deep, '#000000', .1), { size: 30, font: CV_FONT.hand, weight: 400 });
    drawSub(ctx, o.year, lw / 2 - 18, lh / 2 - 12, 'rgba(60,45,30,.55)', { size: 11, align: 'right' });
    ctx.restore();
    // lastik bant
    const bx = W - 92;
    const bg = ctx.createLinearGradient(bx, 0, bx + 22, 0); bg.addColorStop(0, p.deep); bg.addColorStop(.45, p.base); bg.addColorStop(1, p.deep);
    ctx.save(); ctx.shadowColor = 'rgba(40,20,0,.35)'; ctx.shadowBlur = 6; ctx.shadowOffsetX = 2; ctx.fillStyle = bg; ctx.fillRect(bx, 0, 22, H); ctx.restore();
    ctx.strokeStyle = 'rgba(255,255,255,.12)'; ctx.lineWidth = .6;
    for (let y = 0; y < H; y += 3) { ctx.beginPath(); ctx.moveTo(bx, y); ctx.lineTo(bx + 22, y + 1.5); ctx.stroke(); }
  } },
  /* Kompozisyon defteri: benekli desen, bant sırt, okul etiketi */
  kompozisyon: { name: 'Kompozisyon', pal: 'antrasit', draw(ctx, W, H, p, o, R) {
    ctx.fillStyle = mixHex(p.base, '#ffffff', .9); ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = p.base;
    for (let i = 0; i < 5200; i++) {
      const x = R() * W, y = R() * H, r = 1.2 + Math.pow(R(), 2) * 7; ctx.beginPath();
      for (let k = 0; k < 7; k++) { const a = k / 7 * Math.PI * 2, rr = r * (.55 + R() * .6); ctx.lineTo(x + Math.cos(a) * rr * 1.5, y + Math.sin(a) * rr * .7); }
      ctx.closePath(); ctx.fill();
    }
    ctx.fillStyle = p.deep; ctx.fillRect(0, 0, 52, H);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; for (let y = 0; y < H; y += 5) ctx.fillRect(0, y, 52, 1);
    const lx = 140, ly = 150, lw = 340, lh = 210;
    ctx.fillStyle = '#ffffff'; rrect(ctx, lx, ly, lw, lh, 26); ctx.fill();
    ctx.strokeStyle = p.deep; ctx.lineWidth = 2.5; rrect(ctx, lx + 8, ly + 8, lw - 16, lh - 16, 20); ctx.stroke();
    drawSub(ctx, 'Defter', lx + lw / 2, ly + 46, p.deep, { size: 15, font: CV_FONT.serif, weight: 600 });
    const ty = drawTitle(ctx, o, lx + lw / 2, ly + 100, lw - 60, { size: 34, min: 18, color: p.deep });
    ctx.strokeStyle = 'rgba(30,30,30,.35)'; ctx.lineWidth = .8;
    const fy = Math.max(ty + 34, ly + 140);
    ctx.font = `500 11px ${CV_FONT.sans}`; ctx.fillStyle = 'rgba(30,30,30,.6)'; ctx.textAlign = 'left';
    ctx.fillText('Konu', lx + 30, fy); ctx.beginPath(); ctx.moveTo(lx + 70, fy + 2); ctx.lineTo(lx + lw - 30, fy + 2); ctx.stroke();
    if (o.sub) { ctx.font = `700 22px ${CV_FONT.hand}`; ctx.fillStyle = p.deep; ctx.fillText(o.sub, lx + 76, fy - 2); }
    ctx.font = `500 11px ${CV_FONT.sans}`; ctx.fillStyle = 'rgba(30,30,30,.6)';
    ctx.fillText('Yıl', lx + 30, fy + 30); ctx.beginPath(); ctx.moveTo(lx + 70, fy + 32); ctx.lineTo(lx + 170, fy + 32); ctx.stroke();
    if (o.year) { ctx.font = `700 20px ${CV_FONT.hand}`; ctx.fillStyle = p.deep; ctx.fillText(o.year, lx + 76, fy + 28); }
  } },
  /* Çini: İznik esintili sekiz köşeli yıldız döşeme, ortada kartuş */
  cini: { name: 'Çini', pal: 'cini', draw(ctx, W, H, p, o) {
    ctx.fillStyle = '#f8f5ee'; ctx.fillRect(0, 0, W, H);
    const t = 74, star = (cx, cy, r) => { ctx.beginPath(); for (let k = 0; k < 16; k++) { const a = k * Math.PI / 8 - Math.PI / 2, rr = k % 2 ? r * .62 : r; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); } ctx.closePath(); };
    for (let y = 0; y < H + t; y += t) for (let x = 0; x < W + t; x += t) {
      const cx = x + ((y / t) % 2 ? t / 2 : 0), cy = y;
      star(cx, cy, t * .42); ctx.fillStyle = p.base; ctx.fill();
      star(cx, cy, t * .22); ctx.fillStyle = '#f8f5ee'; ctx.fill();
      ctx.beginPath(); ctx.arc(cx, cy, t * .08, 0, Math.PI * 2); ctx.fillStyle = p.accent; ctx.fill();
      ctx.save(); ctx.translate(cx + t / 4, cy + t / 2); ctx.rotate(Math.PI / 4); ctx.fillStyle = hexA(p.accent, .9); ctx.fillRect(-5, -5, 10, 10); ctx.restore();
    }
    // kartuş
    const cw = 380, ch = o.sub ? 190 : 160, cx = (W - cw) / 2, cy = 240;
    ctx.fillStyle = p.deep; rrect(ctx, cx - 10, cy - 10, cw + 20, ch + 20, 90); ctx.fill();
    ctx.fillStyle = '#fbf8f1'; rrect(ctx, cx, cy, cw, ch, 80); ctx.fill();
    ctx.strokeStyle = p.accent; ctx.lineWidth = 2; rrect(ctx, cx + 10, cy + 10, cw - 20, ch - 20, 70); ctx.stroke();
    const ty = drawTitle(ctx, o, W / 2, cy + ch / 2 + (o.sub ? -4 : 12), cw - 90, { size: 40, min: 20, color: p.deep });
    drawSub(ctx, o.sub, W / 2, ty + 34, mixHex(p.deep, '#ffffff', .2), { size: 15, font: CV_FONT.serif, weight: 600 });
    if (o.year) { const yw = 96; ctx.fillStyle = p.deep; rrect(ctx, (W - yw) / 2, H - 92, yw, 32, 16); ctx.fill(); drawSub(ctx, o.year, W / 2, H - 70, '#fbf8f1', { size: 13 }); }
  } },
  /* Sözlük: sözlük maddesi düzeni, sağ kenarda harf sekmeleri */
  sozluk: { name: 'Sözlük', pal: 'hardal', draw(ctx, W, H, p, o) {
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    const grp = ['A–C', 'D–F', 'G–I', 'J–L', 'M–O', 'P–R', 'S–U', 'V–Z'], th = (H - 120) / grp.length;
    grp.forEach((g, i) => {
      const y = 60 + i * th, x = W - 46 + (i % 2) * 4;
      ctx.fillStyle = i % 2 ? mixHex(p.base, '#ffffff', .78) : mixHex(p.base, '#ffffff', .88); rrect(ctx, x, y + 2, 60, th - 4, 8); ctx.fill();
      ctx.save(); ctx.translate(x + 22, y + th / 2); ctx.rotate(Math.PI / 2); ctx.font = `600 13px ${CV_FONT.serif}`; ctx.fillStyle = p.deep; ctx.textAlign = 'center'; ctx.fillText(g, 0, 4); ctx.restore();
    });
    ctx.font = `700 300px ${CV_FONT.serif}`; ctx.fillStyle = hexA(p.deep, .12); ctx.textAlign = 'left'; ctx.fillText('Aa', 30, H - 70);
    const x = 54;
    const ty = drawTitle(ctx, o, x, 210, W - 160, { size: 54, min: 26, color: p.ink, align: 'left' });
    ctx.font = `600 17px ${CV_FONT.serif}`; ctx.fillStyle = hexA(p.ink, .75); ctx.textAlign = 'left';
    ctx.fillText(o.sub ? o.sub : 'n. defter, sözlük', x, ty + 40);
    ctx.strokeStyle = hexA(p.ink, .5); ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(x, ty + 62); ctx.lineTo(W - 120, ty + 62); ctx.stroke();
    ctx.font = `400 15px ${CV_FONT.sans}`; ctx.fillStyle = hexA(p.ink, .8);
    ctx.fillText('1. Yeni sözcüklerin, anlamlarının ve', x, ty + 92); ctx.fillText('    örnek cümlelerin yazıldığı yer.', x, ty + 114);
    drawSub(ctx, o.year, x, H - 52, hexA(p.ink, .7), { size: 13, align: 'left' });
  } },
  /* Topoğrafya: eş yükselti çizgileri; proje, tez, araştırma */
  topo: { name: 'Topoğrafya', pal: 'zumrut', draw(ctx, W, H, p, o, R) {
    ctx.fillStyle = p.deep; ctx.fillRect(0, 0, W, H);
    const peaks = [[W * .72, H * .28, 1], [W * .22, H * .7, .8], [W * .85, H * .85, .6]].map(([x, y, s]) => ({ x: x + (R() - .5) * 60, y: y + (R() - .5) * 60, s, ph: R() * 6 }));
    ctx.lineWidth = .9;
    for (const pk of peaks) for (let r = 14, k = 0; r < 520 * pk.s; r += 13, k++) {
      ctx.strokeStyle = hexA(p.ink, k % 5 === 0 ? .32 : .14); ctx.lineWidth = k % 5 === 0 ? 1.2 : .8;
      ctx.beginPath();
      for (let a = 0; a <= Math.PI * 2 + .01; a += .05) {
        const rr = r * (1 + .16 * Math.sin(3 * a + pk.ph + r / 90) + .08 * Math.sin(5 * a - r / 50 + pk.ph * 2));
        ctx.lineTo(pk.x + Math.cos(a) * rr * 1.15, pk.y + Math.sin(a) * rr);
      }
      ctx.stroke();
    }
    ctx.fillStyle = hexA(p.deep, .82); ctx.fillRect(0, H - 250, W, 250);
    ctx.strokeStyle = hexA(p.accent, .9); ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(48, H - 250); ctx.lineTo(160, H - 250); ctx.stroke();
    const ty = drawTitle(ctx, o, 48, H - 182, W - 96, { size: 48, min: 24, color: p.ink, align: 'left' });
    drawSub(ctx, o.sub, 48, ty + 38, hexA(p.ink, .78), { size: 16, align: 'left' });
    drawSub(ctx, '41° 01′ K   28° 58′ D' + (o.year ? '      ' + o.year : ''), 48, H - 48, hexA(p.accent, .9), { size: 12, align: 'left' });
  } },
  /* Kütüphane: cep ve ödünç kartı; okuma notları için */
  kutuphane: { name: 'Kütüphane kartı', pal: 'lacivert', draw(ctx, W, H, p, o, R) {
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(255,255,255,.05)'; for (let y = 0; y < H; y += 3) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }
    const ty = drawTitle(ctx, o, 56, 150, W - 112, { size: 50, min: 24, color: p.ink, align: 'left' });
    drawSub(ctx, o.sub, 56, ty + 40, hexA(p.ink, .75), { size: 17, font: CV_FONT.serif, weight: 600, align: 'left' });
    // kart
    const cx = 120, cy = 400, cw = 300, chh = 330;
    ctx.save(); ctx.translate(cx + cw / 2, cy + chh / 2); ctx.rotate(.035); ctx.translate(-(cx + cw / 2), -(cy + chh / 2));
    ctx.fillStyle = '#f5efdd'; ctx.fillRect(cx, cy, cw, chh);
    ctx.font = `600 14px ${CV_FONT.serif}`; ctx.fillStyle = '#4a3b2a'; ctx.textAlign = 'center'; ctx.fillText('Okuma kaydı', cx + cw / 2, cy + 28);
    ctx.strokeStyle = 'rgba(168,52,52,.55)'; ctx.lineWidth = .8; ctx.beginPath(); ctx.moveTo(cx + 12, cy + 40); ctx.lineTo(cx + cw - 12, cy + 40); ctx.stroke();
    ctx.strokeStyle = 'rgba(60,80,120,.35)'; ctx.beginPath(); ctx.moveTo(cx + 110, cy + 40); ctx.lineTo(cx + 110, cy + chh - 12); ctx.stroke();
    ctx.font = `500 10px ${CV_FONT.sans}`; ctx.fillStyle = '#6b5a45'; ctx.textAlign = 'left'; ctx.fillText('Tarih', cx + 16, cy + 56); ctx.fillText('Bölüm', cx + 120, cy + 56);
    ctx.strokeStyle = 'rgba(60,80,120,.25)'; for (let y = cy + 64; y < cy + chh - 12; y += 24) { ctx.beginPath(); ctx.moveTo(cx + 12, y); ctx.lineTo(cx + cw - 12, y); ctx.stroke(); }
    const d = new Date(); const stamp = (i) => { const t = new Date(d.getTime() + i * 864e5 * 6); return t.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short' }).toUpperCase(); };
    ctx.font = `700 13px ${CV_FONT.sans}`; ctx.fillStyle = hexA('#7a2b8c', .55);
    for (let i = 0; i < 3; i++) { ctx.save(); ctx.translate(cx + 22, cy + 82 + i * 24); ctx.rotate((R() - .5) * .12); ctx.fillText(stamp(i), 0, 0); ctx.restore(); }
    ctx.restore();
    // cep
    const py = 600;
    ctx.save(); ctx.shadowColor = 'rgba(0,0,0,.35)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = -2;
    ctx.fillStyle = '#e4d3ac'; ctx.beginPath(); ctx.moveTo(90, py); ctx.lineTo(450, py); ctx.lineTo(450, H - 50); ctx.lineTo(90, H - 50); ctx.closePath(); ctx.fill(); ctx.restore();
    ctx.beginPath(); ctx.arc(270, py, 34, 0, Math.PI); ctx.fillStyle = mixHex('#e4d3ac', '#000000', .12); ctx.fill();
    ctx.font = `600 13px ${CV_FONT.serif}`; ctx.fillStyle = '#5a4630'; ctx.textAlign = 'center'; ctx.fillText(o.year ? 'Kenar Notu · ' + o.year : 'Kenar Notu', 270, H - 80);
  } },
  /* Sade: düz renk, ince çerçeve, ortada yaldız başlık */
  sade: { name: 'Sade', pal: 'adacayi', draw(ctx, W, H, p, o) {
    ctx.fillStyle = p.base; ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = hexA(p.ink, .55); ctx.lineWidth = 1; ctx.strokeRect(28, 28, W - 56, H - 56); ctx.strokeRect(34, 34, W - 68, H - 68);
    const ty = drawTitle(ctx, o, W / 2, H * .42, W - 140, { size: 46, min: 22, color: p.ink });
    drawSub(ctx, o.sub, W / 2, ty + 40, hexA(p.ink, .8), { size: 16, font: CV_FONT.serif, weight: 600 });
    drawSub(ctx, o.year, W / 2, H - 70, hexA(p.ink, .7), { size: 13 });
  } }
};
const COVER_ORDER = ['ebru', 'bez', 'kraft', 'kompozisyon', 'cini', 'sozluk', 'topo', 'kutuphane', 'sade'];
function drawCover(ctx, W, H, c) {
  c = c || {}; const d = COVERS[c.d] || COVERS.ebru, p = CV_PALS[c.pal] || CV_PALS[d.pal];
  ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, H); ctx.clip();
  d.draw(ctx, W, H, p, { title: c.title, sub: c.sub || '', year: c.year || '' }, cvRand(c.seed || 7));
  ctx.restore();
}

/* ---------------- sayfa şablonları ---------------- */
const TPL_C = { line: '#c9d4e4', faint: '#e2e8f1', head: '#5d6c84', mute: '#8e9aae', acc: '#6f86b3', tint: '#f3f6fb', red: '#efb0a4' };
function tLabel(ctx, t, x, y, { size = 10.5, color = TPL_C.mute, weight = 500, align = 'left', font = CV_FONT.sans } = {}) { ctx.font = `${weight} ${size}px ${font}`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'alphabetic'; ctx.fillText(t, x, y); }
function hl(ctx, x1, x2, y, c = TPL_C.line, w = .7) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y); ctx.lineTo(x2, y); ctx.stroke(); }
function vl(ctx, x, y1, y2, c = TPL_C.line, w = .7) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y2); ctx.stroke(); }
function lines(ctx, x1, x2, y1, y2, step, c) { for (let y = y1; y <= y2 + .1; y += step) hl(ctx, x1, x2, y, c); }
function box(ctx, x, y, w, h, { r = 8, stroke = TPL_C.line, fill = null, lw = .8 } = {}) { rrect(ctx, x, y, w, h, r); if (fill) { ctx.fillStyle = fill; ctx.fill(); } ctx.strokeStyle = stroke; ctx.lineWidth = lw; ctx.stroke(); }
function check(ctx, x, y, s = 9) { ctx.strokeStyle = TPL_C.mute; ctx.lineWidth = .8; rrect(ctx, x, y - s, s, s, 2); ctx.stroke(); }
function head(ctx, W, title, fields) {
  tLabel(ctx, title, 40, 52, { size: 17, color: TPL_C.head, weight: 600, font: CV_FONT.serif });
  let x = W - 40; ctx.font = `500 10.5px ${CV_FONT.sans}`;
  for (const [lab, w] of fields.slice().reverse()) { hl(ctx, x - w, x, 52, TPL_C.line); tLabel(ctx, lab, x - w - 6, 52, { align: 'right' }); x -= w + ctx.measureText(lab).width + 22; }
  hl(ctx, 40, W - 40, 68, TPL_C.acc, 1.2);
}
const TPLS = {
  cornell: { name: 'Cornell', cat: 'Ders', draw(ctx, W, H) {
    head(ctx, W, 'Ders notu', [['Konu', 170], ['Tarih', 70]]);
    const cue = 178, top = 92, bot = H - 150;
    vl(ctx, cue, top - 10, bot, TPL_C.red, 1);
    tLabel(ctx, 'Anahtar sözcükler, sorular', 44, top + 4, { size: 9.5 }); tLabel(ctx, 'Notlar', cue + 10, top + 4, { size: 9.5 });
    lines(ctx, 40, W - 40, top + 22, bot, 26);
    box(ctx, 40, bot + 16, W - 80, H - bot - 56, { fill: TPL_C.tint });
    tLabel(ctx, 'Özet: bu sayfayı üç cümleyle anlat', 52, bot + 36, { size: 9.5 });
    lines(ctx, 52, W - 52, bot + 64, H - 52, 24, TPL_C.faint);
  } },
  kelime: { name: 'Kelime defteri', cat: 'Dil', draw(ctx, W, H) {
    head(ctx, W, 'Kelime defteri', [['Ünite', 120], ['Tarih', 70]]);
    const cols = [[40, 'Kelime'], [180, 'Anlamı'], [318, 'Örnek cümle'], [512, 'Tekrar']], top = 86, rh = 48, n = Math.floor((H - top - 60) / rh);
    box(ctx, 40, top, W - 80, 26, { r: 6, fill: TPL_C.tint, stroke: TPL_C.tint });
    cols.forEach(([x, l]) => tLabel(ctx, l, x + 8, top + 17, { size: 10, color: TPL_C.head }));
    for (let i = 0; i <= n; i++) { const y = top + 26 + i * rh; hl(ctx, 40, W - 40, y, i === n ? TPL_C.line : TPL_C.line); if (i < n) { hl(ctx, 318, 505, y + rh / 2, TPL_C.faint); for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.arc(522 + k * 12, y + rh / 2, 3.6, 0, Math.PI * 2); ctx.strokeStyle = TPL_C.mute; ctx.lineWidth = .7; ctx.stroke(); } } }
    for (const x of [180, 318, 512]) vl(ctx, x, top + 26, top + 26 + n * rh, TPL_C.faint);
    tLabel(ctx, 'Tekrar halkaları: 1. gün · 3. gün · 1 hafta sonra', W - 40, H - 30, { size: 9, align: 'right' });
  } },
  gramer: { name: 'Gramer', cat: 'Dil', draw(ctx, W, H) {
    head(ctx, W, 'Gramer', [['Konu', 180], ['Ünite', 50]]);
    let y = 88;
    box(ctx, 40, y, W - 80, 118, { fill: TPL_C.tint, stroke: TPL_C.tint }); tLabel(ctx, 'Kural', 54, y + 20, { color: TPL_C.head, weight: 600 }); lines(ctx, 54, W - 54, y + 46, y + 106, 28, '#dfe6f0'); y += 134;
    tLabel(ctx, 'Yapı', 40, y + 4, { color: TPL_C.head, weight: 600 });
    const slots = ['Özne', 'Yardımcı fiil', 'Fiil', 'Tümleç'], sw = (W - 80 - 3 * 22) / 4;
    slots.forEach((s, i) => { const x = 40 + i * (sw + 22); box(ctx, x, y + 14, sw, 44, { r: 10 }); tLabel(ctx, s, x + sw / 2, y + 70, { size: 9, align: 'center' }); if (i < 3) tLabel(ctx, '+', x + sw + 11, y + 42, { size: 14, align: 'center', color: TPL_C.acc }); });
    y += 96;
    tLabel(ctx, 'Örnekler', 40, y, { color: TPL_C.head, weight: 600 }); lines(ctx, 40, W - 40, y + 26, y + 26 * 6, 26); y += 26 * 6 + 26;
    tLabel(ctx, 'Sık yapılan hatalar', 40, y, { color: TPL_C.head, weight: 600 });
    const hw = (W - 80 - 16) / 2; box(ctx, 40, y + 12, hw, 112, { stroke: TPL_C.red }); box(ctx, 56 + hw, y + 12, hw, 112, { stroke: '#a9d3b5' });
    tLabel(ctx, '✗  Yanlış', 52, y + 32, { size: 10, color: '#c46a5a' }); tLabel(ctx, '✓  Doğru', 68 + hw, y + 32, { size: 10, color: '#4f9a66' });
    lines(ctx, 52, 40 + hw - 12, y + 60, y + 108, 24, TPL_C.faint); lines(ctx, 68 + hw, W - 52, y + 60, y + 108, 24, TPL_C.faint); y += 146;
    tLabel(ctx, 'Alıştırma', 40, y, { color: TPL_C.head, weight: 600 });
    for (let i = 1, yy = y + 26; yy < H - 30; i++, yy += 26) { tLabel(ctx, i + '.', 40, yy - 4, { size: 10 }); hl(ctx, 58, W - 40, yy); }
  } },
  hata: { name: 'Hata defteri', cat: 'Sınav', draw(ctx, W, H) {
    head(ctx, W, 'Hata defteri', [['Sınav / kaynak', 150], ['Tarih', 70]]);
    const cols = [[40, '', 24], [64, 'Soru · sayfa', 76], [140, 'Konu', 92], [232, 'Cevabım', 52], [284, 'Doğrusu', 52], [336, 'Neden yanlış yaptım, bir dahakine ne yapacağım?', 219]];
    const top = 86, rh = 64, n = Math.floor((H - top - 40) / rh);
    box(ctx, 40, top, W - 80, 26, { r: 6, fill: TPL_C.tint, stroke: TPL_C.tint });
    cols.forEach(([x, l, w]) => { if (l) tLabel(ctx, l.length > 30 ? 'Neden yanlış yaptım?' : l, x + 6, top + 17, { size: 9.5, color: TPL_C.head }); });
    for (let i = 0; i <= n; i++) { const y = top + 26 + i * rh; hl(ctx, 40, W - 40, y); if (i < n) { tLabel(ctx, String(i + 1), 52, y + 20, { size: 10, align: 'center', color: TPL_C.acc, weight: 600 }); hl(ctx, 336 + 8, W - 48, y + rh / 2, TPL_C.faint); } }
    for (const [x] of cols.slice(1)) vl(ctx, x, top + 26, top + 26 + n * rh, TPL_C.faint);
  } },
  yazma: { name: 'Yazma (essay)', cat: 'Dil', draw(ctx, W, H) {
    head(ctx, W, 'Writing', [['Tarih', 70]]);
    box(ctx, 40, 84, W - 80, 66, { fill: TPL_C.tint, stroke: TPL_C.tint }); tLabel(ctx, 'Soru / konu', 52, 102, { size: 9.5 }); hl(ctx, 52, W - 52, 128, '#dfe6f0');
    const top = 176, bot = H - 86; vl(ctx, 80, top - 12, bot, TPL_C.red, .9);
    lines(ctx, 40, W - 40, top, bot, 30);
    ['Giriş', 'Gelişme', 'Sonuç'].forEach((t, i) => { const y = top + [0, .2, .8][i] * (bot - top) + 22; ctx.save(); ctx.translate(58, y); ctx.rotate(-Math.PI / 2); tLabel(ctx, t, 0, 0, { size: 8.5, align: 'right', color: TPL_C.mute }); ctx.restore(); });
    box(ctx, 40, H - 66, 150, 34, { r: 8 }); tLabel(ctx, 'Kelime sayısı', 52, H - 44, { size: 9.5 });
    box(ctx, 200, H - 66, 120, 34, { r: 8 }); tLabel(ctx, 'Süre', 212, H - 44, { size: 9.5 });
    ['Paragraflar net', 'Bağlaçlar', 'Yazım kontrolü'].forEach((t, i) => { const x = 340 + i * 75; check(ctx, x, H - 44); tLabel(ctx, t, x + 13, H - 45, { size: 8.5 }); });
  } },
  okuma: { name: 'Okuma notları', cat: 'Ders', draw(ctx, W, H) {
    head(ctx, W, 'Okuma notları', [['Sayfa', 60]]);
    tLabel(ctx, 'Kitap / makale', 40, 96); hl(ctx, 124, W - 40, 96); tLabel(ctx, 'Yazar', 40, 122); hl(ctx, 76, 330, 122); tLabel(ctx, 'Bölüm', 344, 122); hl(ctx, 384, W - 40, 122);
    let y = 154; tLabel(ctx, 'Özet', 40, y, { color: TPL_C.head, weight: 600 }); lines(ctx, 40, W - 40, y + 24, y + 24 * 7, 24); y += 24 * 7 + 30;
    tLabel(ctx, 'Alıntılar', 40, y, { color: TPL_C.head, weight: 600 });
    for (let i = 0; i < 3; i++) { const yy = y + 14 + i * 74; ctx.fillStyle = TPL_C.acc; ctx.fillRect(40, yy, 3, 60); lines(ctx, 54, W - 100, yy + 20, yy + 56, 20, TPL_C.faint); tLabel(ctx, 's.', W - 92, yy + 16, { size: 9.5 }); hl(ctx, W - 78, W - 40, yy + 16, TPL_C.faint); }
    y += 14 + 3 * 74 + 18;
    const hw = (W - 80 - 20) / 2;
    tLabel(ctx, 'Yeni kelimeler', 40, y, { color: TPL_C.head, weight: 600 }); tLabel(ctx, 'Düşüncelerim', 60 + hw, y, { color: TPL_C.head, weight: 600 });
    for (let yy = y + 24; yy < H - 30; yy += 24) { hl(ctx, 40, 40 + hw, yy); hl(ctx, 60 + hw, W - 40, yy); }
    vl(ctx, 40 + hw * .45, y + 10, H - 40, TPL_C.faint);
  } },
  haftalik: { name: 'Haftalık plan', cat: 'Plan', draw(ctx, W, H) {
    head(ctx, W, 'Hafta', [['Tarih aralığı', 160]]);
    const days = ['Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi', 'Pazar'], cw = (W - 80 - 16) / 2, top = 86, bh = (H - top - 40 - 3 * 12) / 4;
    days.forEach((d, i) => { const c = i < 4 ? 0 : 1, r = i < 4 ? i : i - 4, x = 40 + c * (cw + 16), y = top + r * (bh + 12); box(ctx, x, y, cw, bh); tLabel(ctx, d, x + 12, y + 20, { color: TPL_C.head, weight: 600, size: 11 }); hl(ctx, x + 64 + (d.length > 8 ? 26 : 0), x + cw - 12, y + 20, TPL_C.faint); lines(ctx, x + 12, x + cw - 12, y + 44, y + bh - 10, 22, TPL_C.faint); });
    const x = 40 + cw + 16, y = top + 3 * (bh + 12); box(ctx, x, y, cw, bh, { fill: TPL_C.tint, stroke: TPL_C.tint }); tLabel(ctx, 'Bu haftanın üç hedefi', x + 12, y + 20, { color: TPL_C.head, weight: 600, size: 11 });
    for (let i = 0; i < 3; i++) { check(ctx, x + 12, y + 50 + i * 30); hl(ctx, x + 30, x + cw - 12, y + 50 + i * 30, '#dfe6f0'); }
  } },
  gunluk: { name: 'Günlük plan', cat: 'Plan', draw(ctx, W, H) {
    head(ctx, W, 'Gün', [['Tarih', 110]]);
    ['Pt', 'Sa', 'Ça', 'Pe', 'Cu', 'Ct', 'Pz'].forEach((d, i) => { const x = 160 + i * 30; ctx.beginPath(); ctx.arc(x, 47, 11, 0, Math.PI * 2); ctx.strokeStyle = TPL_C.line; ctx.lineWidth = .8; ctx.stroke(); tLabel(ctx, d, x, 51, { size: 9, align: 'center' }); });
    const top = 88, lw = 250, hrs = 16, rh = (H - top - 40) / hrs;
    for (let i = 0; i <= hrs; i++) { const y = top + i * rh; hl(ctx, 40, 40 + lw, y); if (i < hrs) { tLabel(ctx, String(7 + i).padStart(2, '0') + ':00', 44, y + 14, { size: 9 }); hl(ctx, 82, 40 + lw, y + rh / 2, TPL_C.faint); } }
    vl(ctx, 78, top, top + hrs * rh, TPL_C.faint);
    const x = 40 + lw + 24, w = W - 40 - x; let y = top;
    box(ctx, x, y, w, 128, { fill: TPL_C.tint, stroke: TPL_C.tint }); tLabel(ctx, 'Önce bunlar', x + 12, y + 20, { color: TPL_C.head, weight: 600 });
    for (let i = 0; i < 3; i++) { tLabel(ctx, String(i + 1), x + 16, y + 52 + i * 28, { color: TPL_C.acc, weight: 700 }); hl(ctx, x + 30, x + w - 12, y + 54 + i * 28, '#dfe6f0'); }
    y += 150; tLabel(ctx, 'Yapılacaklar', x, y, { color: TPL_C.head, weight: 600 });
    for (let i = 0; i < 10; i++) { const yy = y + 28 + i * 26; check(ctx, x, yy); hl(ctx, x + 16, x + w, yy + 1); }
    y += 28 + 10 * 26 + 10; tLabel(ctx, 'Notlar', x, y, { color: TPL_C.head, weight: 600 }); lines(ctx, x, x + w, y + 24, H - 40, 24);
  } },
  toplanti: { name: 'Görüşme / toplantı', cat: 'Plan', draw(ctx, W, H) {
    head(ctx, W, 'Görüşme notu', [['Tarih', 80]]);
    tLabel(ctx, 'Konu', 40, 96); hl(ctx, 72, W - 40, 96); tLabel(ctx, 'Katılanlar', 40, 122); hl(ctx, 100, W - 40, 122);
    let y = 156; tLabel(ctx, 'Gündem', 40, y, { color: TPL_C.head, weight: 600 });
    for (let i = 1; i <= 4; i++) { tLabel(ctx, i + '.', 40, y + i * 24, { size: 10, color: TPL_C.acc }); hl(ctx, 58, W - 40, y + i * 24 + 2); }
    y += 4 * 24 + 34; tLabel(ctx, 'Notlar', 40, y, { color: TPL_C.head, weight: 600 }); lines(ctx, 40, W - 40, y + 24, y + 24 * 9, 24); y += 24 * 9 + 30;
    box(ctx, 40, y - 16, W - 80, 86, { fill: TPL_C.tint, stroke: TPL_C.tint }); tLabel(ctx, 'Kararlar', 52, y + 4, { color: TPL_C.head, weight: 600 }); lines(ctx, 52, W - 52, y + 28, y + 56, 24, '#dfe6f0'); y += 96;
    tLabel(ctx, 'Yapılacak', 40, y, { color: TPL_C.head, weight: 600 }); tLabel(ctx, 'Kim', 380, y, { size: 10 }); tLabel(ctx, 'Ne zamana', 470, y, { size: 10 });
    for (let yy = y + 26; yy < H - 30; yy += 26) { check(ctx, 40, yy); hl(ctx, 56, 370, yy + 1); hl(ctx, 380, 460, yy + 1); hl(ctx, 470, W - 40, yy + 1); }
  } },
  harita: { name: 'Zihin haritası', cat: 'Ders', draw(ctx, W, H) {
    ctx.fillStyle = '#c3ccda';
    for (let x = 30; x < W; x += 22) for (let y = 30; y < H; y += 22) { ctx.beginPath(); ctx.arc(x, y, .85, 0, Math.PI * 2); ctx.fill(); }
    const cx = W / 2, cy = H / 2; ctx.beginPath(); ctx.ellipse(cx, cy, 92, 54, 0, 0, Math.PI * 2); ctx.fillStyle = '#ffffff'; ctx.fill(); ctx.strokeStyle = TPL_C.acc; ctx.lineWidth = 1.4; ctx.stroke();
    ctx.setLineDash([3, 5]); ctx.strokeStyle = TPL_C.line; ctx.lineWidth = 1;
    for (let k = 0; k < 6; k++) { const a = k / 6 * Math.PI * 2 + Math.PI / 6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * 100, cy + Math.sin(a) * 62); ctx.lineTo(cx + Math.cos(a) * 190, cy + Math.sin(a) * 160); ctx.stroke(); }
    ctx.setLineDash([]); tLabel(ctx, 'Ana fikir', cx, cy + 4, { size: 10, align: 'center' });
  } }
};
const TPL_ORDER = ['cornell', 'kelime', 'gramer', 'yazma', 'hata', 'okuma', 'harita', 'haftalik', 'gunluk', 'toplanti'];

/* drawBg'yi genişlet: kapak ve şablon sayfaları */
if (typeof drawBg === 'function') {
  const base = drawBg;
  drawBg = function (ctx, meta, s) {
    const bg = meta && meta.bg;
    if (bg === 'cover' || (bg && TPLS[bg])) {
      ctx.save(); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, meta.w * s, meta.h * s);
      // şablonlar A4 için çizildi; başka boydaki sayfaya oranla sığdırılır
      const k = Math.min(meta.w / 595, meta.h / 842); ctx.scale(s * k, s * k);
      const W = meta.w / k, H = meta.h / k;
      if (bg === 'cover') drawCover(ctx, W, H, meta.cover); else TPLS[bg].draw(ctx, W, H);
      ctx.restore(); return;
    }
    return base(ctx, meta, s);
  };
}
if (typeof BG_NAMES === 'object') { for (const k of TPL_ORDER) BG_NAMES[k] = TPLS[k].name; BG_NAMES.cover = 'Kapak'; }
Object.assign(window, { CV_PALS, CV_PAL_ORDER, COVERS, COVER_ORDER, TPLS, TPL_ORDER, drawCover });

/* =========================================================
   Ayarlanabilir kâğıtlar (3.1): aralık, kâğıt ve çizgi rengi, kenar, başlık satırı, kalın çizgi.
   Sayfa: { bg: 'lined' | 'milimetrik' | …, paper: { spi, pc, lc, mg, hd, mj } }
   Gerçek ölçüyle (mm) çizilir; 1 mm = 2.8346 pt. Eski sayfalar (paper yok) eskisi gibi çizilir.
   ========================================================= */
const MM = 72 / 25.4;
const PAPER_COLS = { beyaz: ['Beyaz', '#ffffff'], krem: ['Krem', '#fbf5e6'], sari: ['Sarı', '#fff5bf'], nane: ['Nane', '#eaf6ef'], gri: ['Gri', '#eef0f3'], gece: ['Gece', '#1e2229'] };
const LINE_COLS = { mavi: ['Mavi gri', '#c3cfe2'], gri: ['Gri', '#cdd0d6'], yesil: ['Yeşil', '#9fd0ae'], sepya: ['Sepya', '#d9c2a2'], turuncu: ['Turuncu', '#f1b68c'] };
const PAPERS = {
  plain: { name: 'Boş', sps: null },
  lined: { name: 'Çizgili', sps: [[6, 'Dar'], [7.1, 'Orta'], [8.7, 'Geniş'], [10, 'Çok geniş']], margin: true },
  grid: { name: 'Kareli', sps: [[4, 'Dar'], [5, 'Orta'], [6.35, 'Geniş'], [10, 'Çok geniş']], major: true },
  dots: { name: 'Noktalı', sps: [[4, 'Dar'], [5, 'Orta'], [6.35, 'Geniş'], [8, 'Çok geniş']], major: true },
  milimetrik: { name: 'Milimetrik', sps: null, lc: 'turuncu' },
  muhendislik: { name: 'Mühendislik', sps: [[5, '5 mm'], [6.35, '¼ inç']], lc: 'yesil', pc: 'nane' },
  izometrik: { name: 'İzometrik', sps: [[5, 'Dar'], [7, 'Orta'], [10, 'Geniş']] },
  altigen: { name: 'Altıgen', sps: [[4, 'Dar'], [6, 'Orta'], [9, 'Geniş']] },
  yazi: { name: 'El yazısı alıştırma', sps: [[3.5, 'Küçük'], [5, 'Orta'], [7, 'Büyük'], [10, 'Çok büyük']], margin: true },
  kaligrafi: { name: 'Kaligrafi', sps: [[5, 'İnce kalem'], [7, 'Orta'], [10, 'Geniş uç']] },
  nota: { name: 'Nota', sps: [[1.8, 'Küçük'], [2.2, 'Orta'], [2.8, 'Büyük']] },
  seyes: { name: 'Seyès (Fransız)', sps: null },
  legal: { name: 'Legal (sarı)', sps: [[6, 'Dar'], [7.1, 'Orta'], [8.7, 'Geniş']], pc: 'sari' },
  ikisutun: { name: 'İki sütun', sps: [[6, 'Dar'], [7.1, 'Orta'], [8.7, 'Geniş']] },
  yarikareli: { name: 'Yarı kareli', sps: [[5, 'Dar'], [6.35, 'Orta'], [8, 'Geniş']] }
};
const PAPER_ORDER = ['plain', 'lined', 'grid', 'dots', 'milimetrik', 'muhendislik', 'izometrik', 'altigen', 'yazi', 'kaligrafi', 'nota', 'seyes', 'legal', 'ikisutun', 'yarikareli'];
const PAPER_DEF = { spi: 1, mg: 'left', hd: false, mj: true };
/* çözülmüş seçenekler: renkler, aralık (pt), koyu kâğıt */
function paperOpts(bg, p) {
  const T = PAPERS[bg] || PAPERS.lined, o = { ...PAPER_DEF, ...(p || {}) };
  const pcKey = o.pc || T.pc || 'beyaz', lcKey = o.lc || T.lc || 'mavi';
  const paper = (PAPER_COLS[pcKey] || PAPER_COLS.beyaz)[1], dark = pcKey === 'gece';
  const base = (LINE_COLS[lcKey] || LINE_COLS.mavi)[1];
  const sps = T.sps; const sp = sps ? sps[Math.min(sps.length - 1, Math.max(0, o.spi | 0))][0] * MM : 5 * MM;
  return { ...o, pcKey, lcKey, paper, dark, sp, line: dark ? 'rgba(255,255,255,.17)' : base, faint: dark ? 'rgba(255,255,255,.08)' : hexA(base, .5), strong: dark ? 'rgba(255,255,255,.3)' : mixHex(base, '#3c4a63', .28), red: dark ? 'rgba(255,140,120,.45)' : '#f1a99c', mute: dark ? 'rgba(255,255,255,.45)' : '#8e9aae' };
}
function pLine(ctx, x1, y1, x2, y2, c, w) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function pHeader(ctx, W, o) {
  if (!o.hd) return 40;
  ctx.font = `500 9.5px ${CV_FONT.sans}`; ctx.fillStyle = o.mute; ctx.textAlign = 'left';
  ctx.fillText('Konu', 40, 46); pLine(ctx, 70, 48, W - 170, 48, o.line, .8);
  ctx.fillText('Tarih', W - 154, 46); pLine(ctx, W - 124, 48, W - 40, 48, o.line, .8);
  pLine(ctx, 40, 62, W - 40, 62, o.strong, 1);
  return 76;
}
function pMargins(ctx, W, H, o, top) {
  if (o.mg === 'left' || o.mg === 'both') pLine(ctx, 64, o.hd ? top - 10 : 0, 64, H, o.red, .8);
  if (o.mg === 'right' || o.mg === 'both') pLine(ctx, W - 40, o.hd ? top - 10 : 0, W - 40, H, o.red, .8);
}
const PAPER_DRAW = {
  plain(ctx, W, H, o) { pHeader(ctx, W, o); },
  lined(ctx, W, H, o) { const top = pHeader(ctx, W, o); for (let y = top + (o.hd ? 18 : 56); y < H - 20; y += o.sp) pLine(ctx, 0, y, W, y, o.line, .7); pMargins(ctx, W, H, o, top); },
  grid(ctx, W, H, o) {
    const top = pHeader(ctx, W, o), s = o.sp, x0 = (W % s) / 2, y0 = top + ((H - top) % s) / 2;
    for (let x = x0, i = 0; x <= W; x += s, i++) pLine(ctx, x, top - (o.hd ? 6 : 40), x, H, o.mj && i % 5 === 0 ? o.strong : o.line, o.mj && i % 5 === 0 ? .8 : .55);
    for (let y = y0, i = 0; y <= H; y += s, i++) pLine(ctx, 0, y, W, y, o.mj && i % 5 === 0 ? o.strong : o.line, o.mj && i % 5 === 0 ? .8 : .55);
  },
  dots(ctx, W, H, o) {
    const top = pHeader(ctx, W, o), s = o.sp, x0 = (W % s) / 2 || s / 2, y0 = top + 8;
    for (let x = x0, i = 0; x < W; x += s, i++) for (let y = y0, j = 0; y < H - 6; y += s, j++) { const big = o.mj && i % 5 === 0 && j % 5 === 0; ctx.fillStyle = big ? o.strong : o.dark ? 'rgba(255,255,255,.28)' : mixHex(o.line.startsWith('#') ? o.line : '#c3cfe2', '#5b6b82', .25); ctx.beginPath(); ctx.arc(x, y, big ? 1.3 : .85, 0, Math.PI * 2); ctx.fill(); }
  },
  milimetrik(ctx, W, H, o) {
    const top = pHeader(ctx, W, o), m = MM, x0 = (W % (10 * m)) / 2, y0 = top + ((H - top) % (10 * m)) / 2;
    for (let i = 0, x = x0; x <= W + .1; x += m, i++) pLine(ctx, x, top - (o.hd ? 6 : 40), x, H, i % 10 === 0 ? o.strong : i % 5 === 0 ? o.line : o.faint, i % 10 === 0 ? .8 : i % 5 === 0 ? .55 : .3);
    for (let i = 0, y = y0; y <= H + .1; y += m, i++) pLine(ctx, 0, y, W, y, i % 10 === 0 ? o.strong : i % 5 === 0 ? o.line : o.faint, i % 10 === 0 ? .8 : i % 5 === 0 ? .55 : .3);
  },
  muhendislik(ctx, W, H, o) {
    const s = o.sp, top = 86;
    ctx.font = `500 9.5px ${CV_FONT.sans}`; ctx.fillStyle = o.mute; ctx.textAlign = 'left';
    const cells = [['Konu', 40, 330], ['Tarih', 340, 460], ['Sayfa', 470, W - 40]];
    for (const [l, a, b] of cells) { ctx.fillText(l, a + 6, 48); pLine(ctx, a, 66, b, 66, o.strong, .9); }
    pLine(ctx, 40, top - 8, W - 40, top - 8, o.strong, 1.4);
    const x0 = 40, x1 = W - 40, cols = Math.floor((x1 - x0) / s), rows = Math.floor((H - 40 - top) / s);
    for (let i = 0; i <= cols; i++) pLine(ctx, x0 + i * s, top, x0 + i * s, top + rows * s, i % 5 === 0 ? o.strong : o.line, i % 5 === 0 ? .8 : .5);
    for (let j = 0; j <= rows; j++) pLine(ctx, x0, top + j * s, x0 + cols * s, top + j * s, j % 5 === 0 ? o.strong : o.line, j % 5 === 0 ? .8 : .5);
  },
  izometrik(ctx, W, H, o) {
    const top = pHeader(ctx, W, o), s = o.sp, hgt = s * Math.sqrt(3) / 2;
    ctx.save(); ctx.beginPath(); ctx.rect(0, top - (o.hd ? 6 : 40), W, H); ctx.clip();
    for (let y = top; y < H; y += hgt) pLine(ctx, 0, y, W, y, o.line, .5);
    const t = Math.tan(Math.PI / 3), span = H / t;
    for (let x = -span; x < W + span; x += s) { pLine(ctx, x, top, x + (H - top) / t, H, o.line, .5); pLine(ctx, x, top, x - (H - top) / t, H, o.line, .5); }
    ctx.restore();
  },
  altigen(ctx, W, H, o) {
    const top = pHeader(ctx, W, o), r = o.sp, w = r * 1.5, hh = r * Math.sqrt(3);
    ctx.strokeStyle = o.line; ctx.lineWidth = .55;
    ctx.save(); ctx.beginPath(); ctx.rect(0, top - (o.hd ? 6 : 40), W, H); ctx.clip();
    for (let c = 0, x = 0; x < W + r; x += w, c++) for (let y = top + (c % 2 ? hh / 2 : 0); y < H + hh; y += hh) {
      ctx.beginPath(); for (let k = 0; k < 6; k++) { const a = k * Math.PI / 3; ctx.lineTo(x + r * Math.cos(a), y + r * Math.sin(a)); } ctx.closePath(); ctx.stroke();
    }
    ctx.restore();
  },
  yazi(ctx, W, H, o) {
    // dört çizgi: üst (büyük harf), orta kesikli (x yüksekliği), taban (koyu), alt (kuyruk)
    const top = pHeader(ctx, W, o), x = o.sp, G = x * 3, gap = x * 1.3;
    for (let y = top + (o.hd ? 14 : 40); y + G < H - 20; y += G + gap) {
      pLine(ctx, 0, y, W, y, o.faint, .6);
      ctx.setLineDash([4, 4]); pLine(ctx, 0, y + x, W, y + x, o.line, .6); ctx.setLineDash([]);
      pLine(ctx, 0, y + 2 * x, W, y + 2 * x, o.strong, .9);
      pLine(ctx, 0, y + 3 * x, W, y + 3 * x, o.faint, .6);
    }
    pMargins(ctx, W, H, o, top);
  },
  kaligrafi(ctx, W, H, o) {
    const top = pHeader(ctx, W, o), x = o.sp, G = x * 4, gap = x * 1.2;
    for (let y = top + (o.hd ? 14 : 40); y + G < H - 20; y += G + gap) {
      pLine(ctx, 0, y, W, y, o.faint, .5); pLine(ctx, 0, y + 1.5 * x, W, y + 1.5 * x, o.line, .5);
      pLine(ctx, 0, y + 2.5 * x, W, y + 2.5 * x, o.strong, .8); pLine(ctx, 0, y + 4 * x, W, y + 4 * x, o.faint, .5);
    }
    // 55° eğim kılavuzları
    ctx.save(); ctx.beginPath(); ctx.rect(0, top, W, H - top); ctx.clip();
    const k = 1 / Math.tan(55 * Math.PI / 180);
    for (let x0 = -H; x0 < W; x0 += 9 * MM) pLine(ctx, x0, H, x0 + (H - top) * k, top, o.faint, .45);
    ctx.restore();
  },
  nota(ctx, W, H, o) {
    const top = pHeader(ctx, W, o), g = o.sp, staff = g * 4, gap = Math.max(staff * 1.6, 13 * MM);
    for (let y = top + (o.hd ? 20 : 50); y + staff < H - 30; y += staff + gap) {
      for (let k = 0; k < 5; k++) pLine(ctx, 40, y + k * g, W - 40, y + k * g, o.strong, .6);
      pLine(ctx, 40, y, 40, y + staff, o.strong, .8); pLine(ctx, W - 40, y, W - 40, y + staff, o.strong, .8);
    }
  },
  seyes(ctx, W, H, o) {
    const top = pHeader(ctx, W, o), big = 8 * MM, small = 2 * MM, ml = 30 * MM;
    const purple = o.dark ? 'rgba(170,170,255,.35)' : '#8e8fd6', thin = o.dark ? 'rgba(170,170,255,.16)' : '#cfd0f1';
    for (let x = ml + big; x < W; x += big) pLine(ctx, x, top, x, H, thin, .45);
    for (let y = top + 40, i = 0; y < H - 10; y += small, i++) pLine(ctx, 0, y, W, y, i % 4 === 0 ? purple : thin, i % 4 === 0 ? .8 : .45);
    pLine(ctx, ml, 0, ml, H, o.red, 1);
  },
  legal(ctx, W, H, o) {
    const top = pHeader(ctx, W, o), s = o.sp;
    pLine(ctx, 0, top + (o.hd ? 6 : 44), W, top + (o.hd ? 6 : 44), o.dark ? o.strong : '#9fb8d8', 1.2);
    for (let y = top + (o.hd ? 6 : 44) + s; y < H - 20; y += s) pLine(ctx, 0, y, W, y, o.dark ? o.line : '#a9c0de', .6);
    pLine(ctx, 66, 0, 66, H, o.red, .8); pLine(ctx, 70, 0, 70, H, o.red, .8);
  },
  ikisutun(ctx, W, H, o) {
    const top = pHeader(ctx, W, o), mid = W / 2;
    for (let y = top + (o.hd ? 18 : 56); y < H - 20; y += o.sp) { pLine(ctx, 30, y, mid - 12, y, o.line, .7); pLine(ctx, mid + 12, y, W - 30, y, o.line, .7); }
    pLine(ctx, mid, top + (o.hd ? 4 : 30), mid, H - 20, o.strong, .6);
  },
  yarikareli(ctx, W, H, o) {
    const top = pHeader(ctx, W, o), s = o.sp, split = top + (H - top) * .42, x0 = (W % s) / 2;
    for (let x = x0; x <= W; x += s) pLine(ctx, x, top, x, split, o.line, .5);
    for (let y = top; y <= split; y += s) pLine(ctx, 0, y, W, y, o.line, .5);
    pLine(ctx, 0, split + 6, W, split + 6, o.strong, .9);
    for (let y = split + 6 + 7.1 * MM; y < H - 20; y += 7.1 * MM) pLine(ctx, 0, y, W, y, o.line, .7);
    pLine(ctx, 64, split + 6, 64, H, o.red, .8);
  }
};
function drawPaper(ctx, W, H, bg, p) {
  const o = paperOpts(bg, p);
  ctx.fillStyle = o.paper; ctx.fillRect(0, 0, W, H);
  (PAPER_DRAW[bg] || PAPER_DRAW.plain)(ctx, W, H, o);
}
/* drawBg: kâğıt seçenekleri olan ya da yeni kâğıt türündeki sayfalar gerçek ölçüyle çizilir */
{
  const prev = drawBg, LEGACY = new Set(['plain', 'lined', 'grid', 'dots']);
  drawBg = function (ctx, meta, s) {
    const bg = meta && meta.bg;
    if (bg && PAPERS[bg] && (meta.paper || !LEGACY.has(bg))) { ctx.save(); ctx.scale(s, s); drawPaper(ctx, meta.w, meta.h, bg, meta.paper); ctx.restore(); return; }
    return prev(ctx, meta, s);
  };
}
for (const k of PAPER_ORDER) BG_NAMES[k] = PAPERS[k].name;
const isDarkPaper = meta => !!(meta && PAPERS[meta.bg] && paperOpts(meta.bg, meta.paper).dark);
Object.assign(window, { PAPERS, PAPER_ORDER, PAPER_COLS, LINE_COLS, PAPER_DEF, paperOpts, drawPaper, isDarkPaper });
