'use strict';
/* =========================================================
   El yazısını düzelt
   Kalemle yazılan satırları metne çevirir ve yazım hatalarını düzeltir.
   - Android: cihazda ML Kit el yazısı tanıma (Türkçe + İngilizce, aynı anda) ve sistemin yazım denetleyicisi
     (HandwritingCorrector.java); modeller bir kez indirildikten sonra internetsiz çalışır. Varsayılan olarak
     KELİME KELİME okur: satır aradaki boşluklardan kelimelere bölünür, her kelime öncesindeki metinle (bağlam) sırayla
     okunur, sonra birleştirilir (ML Kit tek kelimede çok daha iyi). İstenirse 3–4 kelimelik parçalar ya da tüm satır.
   - Gelişmiş okuma (isteğe bağlı): cihazdaki sonuç hemen yazılır; aynı anda gelişmiş model el yazısının görüntüsünü
     baştan okur ve o parçayı günceller. Varsayılan model TABLETTE çalışır: Gemma 4 E2B (LiteRT-LM, LocalReader.java;
     ≈2,6 GB, bir kez indirilir, sonra internetsiz). İstenirse bulut (Gemini / Claude) seçilebilir; kendiliğinden kullanılmaz.
   - Web (tarayıcı): cihazda tanıma olmadığı için bağlı yapay zekâ okur.
   Mod: Kapalı · Düğmeyle (yazınca “Düzelt” düğmesi çıkar; köşesindeki çarpı düğmeyi kapatır) · Otomatik (durunca kendisi düzeltir)
   Hangi belgede: ana belge, yan yana açılan yan belge ya da ikisi (kalem panelinden ve Ayarlar'dan).
   Alt satıra geçen yazı aynı paragrafta kalır; bir metnin yanına/altına yazılan devam, o metne eklenir.
   ========================================================= */
const HW = { group: null, pend: [], timer: 0, chip: null, bar: null, last: null, reqs: new Map(), status: null, local: null, seq: 0, times: new WeakMap(), busy: 0,
  tag: (EMBED ? 's' : 'm') + Math.random().toString(36).slice(2, 6) }; // istek kimlikleri iki bölmede çakışmasın
const HW_NATIVE = () => !!(window.KenarNative && window.KenarNative.inkRecognize);
const HW_LOCAL = () => !!(window.KenarNative && window.KenarNative.localRead);
const HW_TR = /[çğıöşüÇĞİÖŞÜ]/;
if (S.hand.grammar && S.hand.ai === 'off') { S.hand.ai = 'always'; S.hand.grammar = false; saveSettings(); }
// 2.6.1: el yazısı buluta gönderilmez; gelişmiş okuma tabletteki modelle yapılır (model inince açılır)
if ((S.hand.mig || 0) < 2) { S.hand.mig = 2; S.hand.ai = 'off'; S.hand.engine = 'local'; saveSettings(); }
// 2.6.2: cihazdaki tanıma varsayılan olarak kelime kelime (önceki "parça parça" kapalıysa tüm satır kalır)
if (S.hand.mig < 3) { S.hand.mig = 3; S.hand.seg = S.hand.split === false ? 'line' : 'word'; saveSettings(); }
const HAND_MODELS = {
  gemini: { best: { id: 'gemini-3.8-flash', name: 'Gemini 3.8 Flash', short: 'Flash', think: 'low' }, fast: { id: 'gemini-3.5-flash-lite', name: 'Gemini 3.5 Flash-Lite', short: 'Flash-Lite', think: 'minimal' } },
  claude: { best: { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', short: 'Sonnet' }, fast: { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', short: 'Haiku' } }
};
function handModelInfo(c = aiCfg()) { return HAND_MODELS[c.provider === 'gemini' ? 'gemini' : 'claude'][S.hand.model === 'fast' ? 'fast' : 'best']; }
function handAiOpts() { const m = handModelInfo(); return { model: m.id, think: m.think }; }
const handModelName = () => handModelInfo().name;
const HAND_READ_SYSTEM = `Sen el yazısını metne çeviren uzman bir okuyucusun. Görüntüde bir kişinin tablete kalemle yazdığı bir ya da birkaç satır var.
- Yazıyı baştan sona, eksiksiz ve yazıldığı sırayla oku; hiçbir kelimeyi ya da satırı atlama.
- Metin Türkçe, İngilizce ya da karışık olabilir: her kelimeyi kendi dilinde yaz, başka dile çevirme.
- Belirsiz harflerde cümlenin anlamına ve verilen önceki metne en uygun kelimeyi seç.
- Yalnızca yazım hatalarını düzelt (eksik ya da yanlış harf, Türkçe karakterler ç ğ ı İ ö ş ü). Kelime ekleme ya da çıkarma, cümleyi yeniden kurma, anlamı değiştirme.
- Satır sonunda bölünmüş kelimeyi birleştir; satırları aralarına boşluk koyarak tek paragraf yaz.
- Büyük/küçük harf ve noktalamayı yazıldığı gibi bırak; yalnızca bariz hatayı düzelt.
- Ok, çizgi, karalama gibi yazı olmayan işaretleri yok say.
- Yalnızca metni yaz: açıklama, tırnak, başlık ya da yorum ekleme. Görüntüde okunacak yazı yoksa hiçbir şey yazma.`;

window.__inkStatus = j => { try { HW.status = JSON.parse(j); } catch (e) { } if (HW.onStatus) HW.onStatus(); };
window.__inkResult = j => { let r; try { r = JSON.parse(j); } catch (e) { return; } const f = HW.reqs.get(r.id); if (f) { HW.reqs.delete(r.id); f(r); } };
/* tabletteki model (Gemma) durumu: missing · downloading · waiting · ready · loading · loaded · error */
window.__localStatus = j => {
  let st; try { st = JSON.parse(j); } catch (e) { return; }
  const was = HW.local && HW.local.state; HW.local = st;
  // indirme bitti: gelişmiş okumayı bir kez kendiliğinden aç (indirmek istendiği için)
  if (!EMBED && (was === 'downloading' || was === 'waiting') && st.state === 'ready' && S.hand.engine !== 'cloud') {
    if ((S.hand.ai || 'off') === 'off') { S.hand.ai = 'always'; saveSettings(); }
    toast('Tabletteki el yazısı modeli hazır; gelişmiş okuma açık.', 3200);
  }
  if (HW.onLocal) HW.onLocal(); if (HW.onStatus) HW.onStatus();
  if (HW.bar && HW.last && HW.last.ai === 'busy') showHandBar();
};
window.__localResult = j => { let r; try { r = JSON.parse(j); } catch (e) { return; } const f = HW.reqs.get(r.id); if (f) { HW.reqs.delete(r.id); f(r); } };
function handLocalStatus() {
  if (!HW_LOCAL()) return null;
  try { HW.local = JSON.parse(KenarNative.localStatus()); } catch (e) { }
  return HW.local;
}
const handLocalReady = () => { const s = HW.local || handLocalStatus(); return !!(s && /^(ready|loading|loaded)$/.test(s.state)); };
function handLocalPrepare() { if (HW_LOCAL() && handLocalReady()) try { KenarNative.localPrepare(); } catch (e) { } }

/* Gelişmiş okuyucu: tablet (Gemma) ya da — yalnızca açıkça seçildiyse — bulut */
function handAdv() {
  if (S.hand.engine === 'cloud') { const m = handModelInfo(); return { kind: 'cloud', name: m.name, short: m.short, ready: aiReady() && navigator.onLine }; }
  return { kind: 'local', name: 'Gemma 4 (tablette)', short: 'Gemma', ready: HW_LOCAL() && handLocalReady() };
}
function handAdvRead(strokes, opts) { return handAdv().kind === 'cloud' ? handAiRead(strokes, opts) : handLocalRead(strokes, opts); }

function handModelsReady() { const s = HW.status; return !!(s && (s.tr === 'ready' || s.en === 'ready')); }
function handCheckModels() { if (HW_NATIVE()) try { KenarNative.inkCheck(); } catch (e) { } }
const cleanAi = t => (t || '').replace(/^\s*```[a-z]*\s*|\s*```\s*$/gi, '').replace(/^\s*(düzeltilmiş metin|metin|el yazısının metni)\s*:\s*/i, '').replace(/^["“”'«»]+|["“”'«»]+$/g, '').trim();
const wordCount = t => (t || '').trim().split(/\s+/).filter(Boolean).length;

/* ---------- tanıma ---------- */
/* strokes: [[x, y, t?], …] dizileri (sayfa koordinatı). area: { lineH, pageW } yazı alanı için */
function handNative(strokes, mode, pre, area) {
  return new Promise((res, rej) => {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
    const k = 3, now0 = Date.now();
    const payload = strokes.map((s, si) => { const a = []; s.forEach((p, i) => a.push(+((p[0] - x0) * k).toFixed(1), +((p[1] - y0) * k).toFixed(1), Math.round(p[2] || (now0 + si * 400 + i * 8)))); return a; });
    // Yazı alanı: dar çerçeve değil, satır yüksekliği ve sayfa genişliği (küçük/büyük harf ve noktalama için önemli)
    const lineH = area && area.lineH ? area.lineH : (y1 - y0), pageW = area && area.pageW ? area.pageW : (x1 - x0);
    const W = Math.max(x1 - x0, pageW * .85) * k + 20, H = Math.max(y1 - y0, lineH * 1.4) * k + 20;
    const id = 'ink' + HW.tag + (++HW.seq);
    const to = setTimeout(() => { HW.reqs.delete(id); rej(Object.assign(new Error('Tanıma zaman aşımına uğradı'), { code: 'timeout' })); }, 15000);
    HW.reqs.set(id, r => { clearTimeout(to); if (r.ok) res({ ...r, via: 'device' }); else rej(Object.assign(new Error(r.error === 'nomodel' ? 'El yazısı modelleri henüz indirilmedi' : r.error || 'Tanınamadı'), { code: r.error })); });
    try { KenarNative.inkRecognize(JSON.stringify({ id, strokes: payload, mode, pre: (pre || '').slice(-60), w: W, h: H })); }
    catch (e) { clearTimeout(to); HW.reqs.delete(id); rej(e); }
  });
}
const ptsBB = s => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const p of s) { if (p[0] < x0) x0 = p[0]; if (p[1] < y0) y0 = p[1]; if (p[0] > x1) x1 = p[0]; if (p[1] > y1) y1 = p[1]; } return { x0, y0, x1, y1 }; };
/* Uzun bir satırı (çizgi noktaları) yalnızca belirgin kelime boşluklarından, her parça en az `per` kelime olacak şekilde böler.
   Kelime: yatayda üst üste binen ya da çok yakın çizgiler (i noktası, ç/ş çengeli, ğ şapkası kelimesinde kalır). */
function handChunks(ls, lh, per = 3) {
  const items = ls.map(s => ({ s, bb: ptsBB(s) })).sort((a, b) => a.bb.x0 - b.bb.x0);
  const words = [];
  for (const it of items) {
    const w = words[words.length - 1];
    if (w && it.bb.x0 <= w.x1 + lh * .5) { w.items.push(it); w.x1 = Math.max(w.x1, it.bb.x1); }
    else words.push({ items: [it], x0: it.bb.x0, x1: it.bb.x1 });
  }
  if (words.length <= per + 1) return [ls];
  const chunks = []; let cur = [], n = 0;
  words.forEach((w, i) => {
    const next = words[i + 1], gap = next ? next.x0 - w.x1 : 0;
    cur.push(...w.items); n++;
    // en az `per` kelime biriktiyse ve boşluk belirginse (yaklaşık bir harf genişliğinden büyük) burada kes
    if (next && n >= per && gap >= lh * .7 && words.length - i - 1 >= 2) { chunks.push(cur); cur = []; n = 0; }
  });
  if (cur.length) chunks.push(cur);
  // parçalar özgün yazılış sırasını korusun
  const order = new Map(ls.map((s, i) => [s, i]));
  return chunks.map(c => c.map(it => it.s).sort((a, b) => order.get(a) - order.get(b)));
}
/* Satırı (çizgi noktaları) kelimelere böl: yatayda binen ya da çok yakın çizgiler aynı kelime (i noktası, ü/ö noktaları,
   ç/ş çengeli, sonradan atılan t çizgisi kelimesinde kalır). Eşik o satırın kendi boşluklarından çıkar: harf araları ile
   kelime araları iki ayrı küme oluşturur, aradaki en büyük sıçramadan kesilir. Kelimenin çizgileri yazılış sırasında kalır. */
function handWords(ls) {
  const items = ls.map((s, i) => ({ s, i, bb: ptsBB(s), t: (s[0] && s[0][2]) || 0 })).sort((a, b) => a.bb.x0 - b.bb.x0);
  if (items.length < 2) return [ls];
  const hs = items.map(it => it.bb.y1 - it.bb.y0).sort((a, b) => a - b), hMax = hs[hs.length - 1];
  const big = hs.filter(h => h >= hMax * .25), hMed = Math.max(6, big[big.length >> 1] || hMax);
  const blobs = [];
  for (const it of items) { const B = blobs[blobs.length - 1]; if (B && it.bb.x0 <= B.x1 + hMed * .12) { B.items.push(it); B.x1 = Math.max(B.x1, it.bb.x1); } else blobs.push({ items: [it], x0: it.bb.x0, x1: it.bb.x1 }); }
  if (blobs.length < 2) return [ls];
  const gaps = blobs.slice(1).map((B, i) => B.x0 - blobs[i].x1), sg = gaps.slice().sort((a, b) => a - b), floor = hMed * .04;
  let T;
  if (sg[0] >= hMed * .4) T = sg[0] * .99; // hepsi kelime arası (her kelime tek çizgi)
  else {
    let bestR = 0;
    for (let k = 0; k < sg.length - 1; k++) { if (sg[k] >= hMed * .4 || sg[k + 1] < hMed * .3) continue; const lo = Math.max(sg[k], floor), r = sg[k + 1] / lo; if (r > bestR) { bestR = r; T = Math.sqrt(lo * sg[k + 1]); } }
    if (!(bestR >= 1.7)) T = hMed * .45;
  }
  T = clamp(T, hMed * .2, hMed * 1.2);
  const words = [[...blobs[0].items]];
  gaps.forEach((g, i) => { if (g > T) words.push([]); words[words.length - 1].push(...blobs[i + 1].items); });
  const timed = items.every(it => it.t > 0);
  return words.map(w => w.sort((a, b) => timed ? a.t - b.t : a.i - b.i).map(it => it.s));
}
/* okunan kelimeleri birleştir: noktalama önceki kelimeye boşluksuz eklenir */
function handJoin(parts) {
  let out = '';
  for (const t0 of parts) {
    const t = (t0 || '').trim(); if (!t) continue;
    if (!out) out = t;
    else if (/^[.,;:!?…%)\]}»”’]+$/.test(t) || /[(«“‘]$/.test(out)) out += t;
    else out += ' ' + t;
  }
  return out;
}
/* satırları birleştir: satır sonunda tireyle bölünmüş kelime (kele- / me) alt satırdaki devamıyla birleşir */
const handJoinLines = arr => arr.reduce((a, t) => !t ? a : !a ? t : /\p{L}-$/u.test(a) && /^\p{Ll}/u.test(t) ? a.slice(0, -1) + t : a + ' ' + t, '');
function handImage(strokes) {
  let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
  for (const s of strokes) for (const p of s) { x0 = Math.min(x0, p[0]); y0 = Math.min(y0, p[1]); x1 = Math.max(x1, p[0]); y1 = Math.max(y1, p[1]); }
  const pad = 10, w = x1 - x0 + pad * 2, hh = y1 - y0 + pad * 2, k = Math.min(5, 2000 / Math.max(1, w), 1400 / Math.max(1, hh));
  const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(w * k)); c.height = Math.max(8, Math.round(hh * k));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.setTransform(k, 0, 0, k, (pad - x0) * k, (pad - y0) * k);
  g.strokeStyle = '#111'; g.lineCap = g.lineJoin = 'round'; g.lineWidth = Math.max(1.4, 2.2 / k * 2);
  for (const s of strokes) { g.beginPath(); s.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); if (s.length === 1) g.lineTo(s[0][0] + .5, s[0][1]); g.stroke(); }
  return c.toDataURL('image/png').split(',')[1];
}
/* Tabletteki model için: satırlar (uzunsa parçaları) alt alta, sola hizalı dizilir. Çok uzun ince bir görüntü yerine
   daha kare bir görüntü olur; modelin sabit görsel token bütçesinde harfler daha büyük kalır. rows: [[çizgi noktaları]…] */
function handImageRows(rows) {
  const bbs = rows.map(r => r.reduce((b, s) => bbUnion(b, ptsBB(s)), null));
  const hs = bbs.map(b => b.y1 - b.y0), lh = Math.max(8, hs.slice().sort((a, b) => a - b)[hs.length >> 1]);
  const gapY = lh * .45, pad = lh * .4;
  const W = Math.max(...bbs.map(b => b.x1 - b.x0)) + pad * 2, H = hs.reduce((a, x) => a + x, 0) + gapY * (rows.length - 1) + pad * 2;
  const k = Math.min(5, 1600 / Math.max(1, W), 1600 / Math.max(1, H), 64 / lh);
  const c = document.createElement('canvas'); c.width = Math.max(8, Math.round(W * k)); c.height = Math.max(8, Math.round(H * k));
  const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = '#111'; g.lineCap = g.lineJoin = 'round';
  let y = pad;
  rows.forEach((r, i) => {
    const b = bbs[i]; g.setTransform(k, 0, 0, k, (pad - b.x0) * k, (y - b.y0) * k); g.lineWidth = Math.max(1.4, 4.4 / k);
    for (const s of r) { g.beginPath(); s.forEach((p, j) => j ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); if (s.length === 1) g.lineTo(s[0][0] + .5, s[0][1]); g.stroke(); }
    y += hs[i] + gapY;
  });
  return c.toDataURL('image/png').split(',')[1];
}
const handAsk = (before, lines, extra) => {
  const ask = [];
  if (before && before.trim()) ask.push('Önceki metin (yalnızca bağlam; bunu tekrar yazma): «' + before.trim().slice(-240) + '»');
  if (extra) ask.push(extra);
  else if (lines > 1) ask.push('Yazı ' + lines + ' satır; hepsini sırayla oku.');
  ask.push('El yazısının metni:');
  return ask.join('\n');
};
/* Bulutta gelişmiş okuma (yalnızca Ayarlar'da “Bulut” seçildiyse): model görüntüyü baştan okur.
   before: önceki metin (devam yazısı için bağlam) · maxLen: el yazısının genişliğine göre en uzun makul metin */
async function handAiRead(strokes, { mode = S.hand.lang, before = '', lines = 1, maxLen = 0 } = {}) {
  const hint = mode === 'tr' ? '\n- Metin Türkçe.' : mode === 'en' ? '\n- Metin İngilizce.' : '';
  const { text } = await aiStream({ tag: 'hand', ...handAiOpts(), system: HAND_READ_SYSTEM + hint, messages: [{ role: 'user', content: [{ type: 'image', mime: 'image/png', data: handImage(strokes) }, { type: 'text', text: handAsk(before, lines) }] }], maxTokens: 2048 });
  const t = cleanAi(text).replace(/\s*\n+\s*/g, ' ');
  if (!t) throw new Error('Yazı okunamadı');
  if (maxLen && t.length > maxLen) throw new Error('sonuç yazının uzunluğuyla uyuşmadı');
  return t;
}
/* Tabletteki model (Gemma 4 E2B): internetsiz. rowsPts verilirse satırlar/parçalar alt alta dizilmiş görüntü gider.
   İlk okumada model belleğe yüklenir (birkaç saniye). Sonuç metni döner; opts.info'ya süreler yazılır. */
function handLocalRead(strokes, { mode = S.hand.lang, before = '', lines = 1, maxLen = 0, rows = null, info = null } = {}) {
  return new Promise((res, rej) => {
    if (!HW_LOCAL()) { rej(new Error('Tabletteki model yalnızca Android uygulamasında çalışır')); return; }
    if (!handLocalReady()) { rej(Object.assign(new Error('Tabletteki model indirilmedi (Ayarlar → El yazısı)'), { code: 'nolocal' })); return; }
    const hint = mode === 'tr' ? '\n- Metin Türkçe.' : mode === 'en' ? '\n- Metin İngilizce.' : '';
    const rr = rows && rows.length ? rows : null;
    const extra = rr && rr.length > 1 ? 'Görüntüdeki satırları yukarıdan aşağı sırayla oku; hepsi tek bir metnin devamıdır.' : '';
    const id = 'loc' + HW.tag + (++HW.seq);
    const to = setTimeout(() => { HW.reqs.delete(id); rej(new Error('Tabletteki model yanıt vermedi')); }, 120000);
    HW.reqs.set(id, r => {
      clearTimeout(to);
      if (info) Object.assign(info, { ms: r.ms || 0, loadMs: r.loadMs || 0, backend: r.backend || '' });
      if (!r.ok) { rej(Object.assign(new Error(r.error === 'nomodel' ? 'Tabletteki model indirilmedi' : r.error || 'Okunamadı'), { code: r.error })); return; }
      const t = cleanAi(r.text).replace(/\s*\n+\s*/g, ' ');
      if (!t) { rej(new Error('Yazı okunamadı')); return; }
      if (r.cut || (maxLen && t.length > maxLen)) { rej(new Error('sonuç yazının uzunluğuyla uyuşmadı')); return; }
      res(t);
    });
    try {
      const png = rr ? handImageRows(rr) : handImage(strokes);
      KenarNative.localRead(JSON.stringify({ id, png, system: HAND_READ_SYSTEM + hint, prompt: handAsk(before, lines, extra), budget: 280, maxChars: maxLen ? Math.round(maxLen * 1.3) : 1500 }));
    } catch (e) { clearTimeout(to); HW.reqs.delete(id); rej(e); }
  });
}
/* el yazısının kapladığı genişliğe göre: uzun mu, en fazla kaç harf olabilir */
function handInkSize(lines, lh) {
  const w = lines.reduce((a, l) => a + (l.bb.x1 - l.bb.x0), 0), k = w / Math.max(8, lh);
  return { long: lines.length > 1 || k >= 14, maxLen: Math.round(k * 3.5 + 40) };
}
/* tabletteki model için satırları (uzunsa parçalarına bölerek) alt alta diz */
function handRows(linePts, lh) { return linePts.flatMap(ls => { const b = ls.reduce((a, s) => bbUnion(a, ptsBB(s)), null); return b.x1 - b.x0 > lh * 16 ? handChunks(ls, lh, 4) : [ls]; }); }
async function handAi(strokes, mode, pre = '', lines = 1) {
  if (!aiReady()) throw Object.assign(new Error('Bu cihazda el yazısı tanıma yok; yapay zekâyı bağlayın'), { code: 'nokey' });
  const t = await handAiRead(strokes, { mode, before: pre, lines });
  return { ok: true, lang: mode === 'tr' || mode === 'en' ? mode : HW_TR.test(t) ? 'tr' : 'en', text: t, corrected: t, kept: [], via: 'ai' };
}
/* Yalnızca metin (birleştirilmiş parçalar, el yazısı yok): bölünmüş kelimeleri birleştir, en az değişiklikle düzelt (yalnızca bulutta) */
async function handAiText(r) {
  const { text } = await aiStream({ tag: 'hand', ...handAiOpts(), system: MERGE_FIX_SYSTEM, messages: [{ role: 'user', content: (r.text || r.corrected) + (r.corrected && r.corrected !== r.text ? '\n\n(Yazım denetleyicisinin önerisi: ' + r.corrected + ')' : '') }], maxTokens: 2048 });
  const t = cleanAi(text); return t && t.length < (r.corrected || '').length * 1.8 + 40 ? t : null;
}
/* Satırlar sırayla tanınır; her satıra (ve uzun satırın her parçasına) öncesindeki metin bağlam olarak verilir.
   Cihazda tanıma olmazsa: gelişmiş okuma yoldaysa (aiP) onun sonucu; web'de bulut. Tablette, açıkça seçilmedikçe buluta gidilmez.
   o.split: uzun satırları böl (varsayılan ayardan) · o.deviceOnly: yalnızca cihaz (karşılaştırma için) */
async function handRecognizeLines(lineStrokes, mode = S.hand.lang, pre = '', area = null, aiP = null, o = {}) {
  const all = lineStrokes.flat();
  const viaAi = async () => { const t = await aiP; return { ok: true, lang: mode === 'tr' || mode === 'en' ? mode : HW_TR.test(t) ? 'tr' : 'en', text: t, corrected: t, kept: [], via: 'ai' }; };
  if (HW_NATIVE()) {
    try {
      // seg: 'word' kelime kelime (varsayılan) · 'chunk' 3–4 kelimelik parçalar · 'line' tüm satır bir kerede
      const seg = o.seg || S.hand.seg || 'word', lh = area && area.lineH ? area.lineH : 20;
      const outs = [], lineFix = [], lineRaw = []; let ctx = pre || '', parts = 0;
      // tek bir parça okunamazsa (ör. kopuk bir işaret) tüm yazı düşmesin; model yoksa ya da zaman aşımıysa düşsün
      const one = (pc, c) => handNative(pc, mode, c, area).catch(e => { if (e.code === 'nomodel' || e.code === 'timeout' || seg === 'line') throw e; return { text: '', corrected: '', kept: [], lang: null }; });
      for (const ls of lineStrokes) {
        const pieces = seg === 'word' ? handWords(ls) : seg === 'chunk' ? handChunks(ls, lh) : [ls];
        let rs;
        if (o.parallel) { rs = await Promise.all(pieces.map(pc => one(pc, ''))); ctx = handJoin([ctx, ...rs.map(r => r.corrected)]); }
        else { rs = []; for (const pc of pieces) { const r = await one(pc, ctx); rs.push(r); ctx = handJoin([ctx, r.corrected]); } } // her kelimeye öncesi bağlam olarak
        parts += pieces.length; outs.push(...rs);
        lineFix.push(handJoin(rs.map(r => r.corrected))); lineRaw.push(handJoin(rs.map(r => r.text)));
      }
      const corrected = handJoinLines(lineFix);
      if (!corrected.replace(/\s/g, '')) throw Object.assign(new Error('Yazı tanınamadı'), { code: 'empty' });
      const langs = outs.map(o => o.lang).filter(Boolean);
      return { ok: true, via: 'device', parts, lang: langs.filter(l => l === 'tr').length >= langs.length / 2 ? 'tr' : langs[0] || 'en',
        text: handJoinLines(lineRaw), corrected,
        kept: outs.flatMap(o => o.kept || []), alts: outs.length === 1 ? outs[0].alts || [] : [] };
    } catch (e) {
      if (o.deviceOnly) throw e;
      if (aiP) return viaAi(); // gelişmiş okuma zaten yolda
      if (e.code === 'nomodel') { handCheckModels(); throw Object.assign(new Error('El yazısı modelleri indiriliyor (yaklaşık 40 MB). Birkaç dakika sonra tekrar deneyin.'), { code: 'nomodel' }); }
      if (S.hand.engine === 'cloud' && aiReady()) return handAi(all, mode, pre, lineStrokes.length);
      throw e;
    }
  }
  if (o.deviceOnly) throw new Error('Cihazda tanıma yalnızca Android uygulamasında var');
  if (aiP) return viaAi();
  return handAi(all, mode, pre, lineStrokes.length);
}
async function handRecognize(strokes, mode = S.hand.lang, pre = '', area = null) { return handRecognizeLines([strokes], mode, pre, area); }
/* Yalnızca metnin yazım düzeltmesi (cihazda) */
function handNativeText(text, mode) {
  return new Promise((res, rej) => {
    if (!(window.KenarNative && KenarNative.inkCorrectText)) { rej(new Error('yok')); return; }
    const id = 'txt' + HW.tag + (++HW.seq);
    const to = setTimeout(() => { HW.reqs.delete(id); rej(new Error('Zaman aşımı')); }, 10000);
    HW.reqs.set(id, r => { clearTimeout(to); r.ok ? res({ ...r, via: 'device' }) : rej(new Error(r.error || 'Düzeltilemedi')); });
    try { KenarNative.inkCorrectText(JSON.stringify({ id, text, mode })); } catch (e) { clearTimeout(to); HW.reqs.delete(id); rej(e); }
  });
}
const MERGE_FIX_SYSTEM = 'Aşağıdaki metin bir kişinin el yazısından tanınıp parça parça birleştirildi. Yalnız tireyle bölünmüş kelimeleri birleştir; ayrı kelimeleri bitiştirme, kelimeler arasında boşluk olsun; tanıma, yazım ve bariz dil bilgisi hatalarını en az değişiklikle düzelt. Metin Türkçe, İngilizce ya da karışık olabilir: her kelimeyi kendi dilinde bırak; çevirme, yeniden yazma, anlamı değiştirme. Satır sonlarını (paragrafları) koru. Yalnızca düzeltilmiş metni yaz; açıklama ya da tırnak ekleme.';
window.handRecognize = handRecognize;

/* ---------- yazarken grup toplama ---------- */
function strokePts(s) {
  const p = s.p, n = p.length / 3, tm = HW.times.get(s); const out = [];
  const step = Math.max(1, Math.floor(n / 160));
  for (let i = 0; i < n; i += step) out.push([p[3 * i], p[3 * i + 1], tm ? Math.round(tm.t0 + (tm.t1 - tm.t0) * i / Math.max(1, n - 1)) : 0]);
  if ((n - 1) % step) out.push([p[3 * (n - 1)], p[3 * (n - 1) + 1], tm ? tm.t1 : 0]);
  return out;
}
function bbUnion(a, b) { return a ? { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1) } : { ...b }; }
function sameLine(g, bb) {
  const lh = Math.max(14, g.lineH);
  const ov = Math.min(g.bb.y1, bb.y1) - Math.max(g.bb.y0, bb.y0);
  const dx = Math.max(0, bb.x0 - g.bb.x1, g.bb.x0 - bb.x1);
  return (ov > -lh * .25 || (bb.y1 - bb.y0) < lh * .5 && bb.y0 > g.bb.y0 - lh && bb.y1 < g.bb.y1 + lh * .6) && dx < lh * 4;
}
/* Yeni çizgi gruba (paragrafa) giriyor mu? Aynı satırın devamı ya da hemen alt satırın başı */
function joinGroup(g, bb) {
  const lh = Math.max(14, g.lineH);
  if (sameLine({ bb: g.line, lineH: g.lineH }, bb)) { g.line = bbUnion(g.line, bb); return true; }
  if (bb.y0 > g.line.y0 + lh * .5 && bb.y0 < g.line.y1 + lh * 1.3 && bb.x0 < g.bb.x0 + lh * 3 && bb.x1 > g.bb.x0 - lh) { g.line = { ...bb }; return true; }
  return false;
}
/* Çizgileri satırlara ayır. Önce normal boydaki çizgiler, dikey konumlarına göre en uygun satıra atanır (yatay uzaklık
   bakılmaz: önceki sürüm, satırın solundaki kelimeyi işlem sırası yüzünden ayrı bir satır sayıp sona atabiliyordu).
   Sonra küçük işaretler (i noktası, ü/ö noktaları, ç/ş çengeli, nokta, virgül) en yakın satıra eklenir. */
function splitLines(strokes) {
  const items = strokes.map((s, i) => { const bb = strokeBB(s); return { s, i, bb, h: bb.y1 - bb.y0, cy: (bb.y0 + bb.y1) / 2 }; });
  if (!items.length) return [];
  const hs = items.map(it => it.h).sort((a, b) => a - b), hMax = hs[hs.length - 1];
  // tipik harf boyu: küçük işaretleri saymadan ortanca
  const big = hs.filter(h => h >= hMax * .25), hMed = Math.max(8, big[big.length >> 1] || hMax);
  const isMark = it => it.h < hMed * .45 && (it.bb.x1 - it.bb.x0) < hMed * 1.2;
  const lines = [];
  const add = (L, it) => { L.items.push(it); L.bb = bbUnion(L.bb, it.bb); if (!isMark(it)) { L.n++; L.cy += (it.cy - L.cy) / L.n; L.core = bbUnion(L.core, it.bb); } };
  for (const it of items.filter(x => !isMark(x)).sort((a, b) => a.cy - b.cy)) {
    let best = null, bd = 1e9;
    for (const L of lines) {
      const d = Math.abs(it.cy - L.cy), ov = Math.min(L.core.y1, it.bb.y1) - Math.max(L.core.y0, it.bb.y0);
      if ((d < hMed * .6 || ov > Math.min(it.h, L.core.y1 - L.core.y0) * .5) && d < bd) { bd = d; best = L; }
    }
    if (best) add(best, it); else { const L = { items: [], bb: null, core: null, cy: it.cy, n: 0 }; add(L, it); lines.push(L); }
  }
  // birbirine çok binen satırları birleştir (eğik yazılmış bir satır ikiye bölünmesin)
  lines.sort((a, b) => a.cy - b.cy);
  for (let i = 1; i < lines.length; i++) {
    const A = lines[i - 1], B = lines[i], ov = Math.min(A.core.y1, B.core.y1) - Math.max(A.core.y0, B.core.y0);
    if (ov > Math.min(A.core.y1 - A.core.y0, B.core.y1 - B.core.y0) * .55) { for (const it of B.items) add(A, it); lines.splice(i--, 1); }
  }
  // küçük işaretler: yatayda üstünde/altında durduğu, dikeyde en yakın satıra (noktalar harfin üstünde, virgül altta)
  for (const it of items.filter(isMark)) {
    if (!lines.length) { const L = { items: [], bb: null, core: null, cy: it.cy, n: 0 }; add(L, it); L.core = { ...it.bb }; lines.push(L); continue; }
    let best = null, bd = 1e9;
    for (const L of lines) {
      const c = L.core, dy = it.cy < c.y0 ? (c.y0 - it.cy) * .8 : it.cy > c.y1 ? (it.cy - c.y1) * 1.3 : 0;
      const dx = Math.max(0, c.x0 - it.bb.x1, it.bb.x0 - c.x1);
      const d = dy + dx * .5; if (d < bd) { bd = d; best = L; }
    }
    add(best, it);
  }
  const out = lines.map(L => {
    const norm = L.items.filter(it => !isMark(it)).map(it => it.h).sort((a, b) => a - b);
    return { strokes: L.items.sort((a, b) => a.bb.x0 - b.bb.x0).map(it => it.s), bb: L.bb, lineH: Math.max(12, norm.length ? norm[norm.length - 1] : L.bb.y1 - L.bb.y0) };
  });
  out.sort((a, b) => a.bb.y0 - b.bb.y0);
  return out;
}
function medianLineH(lines) { const a = lines.map(l => l.bb.y1 - l.bb.y0).sort((x, y) => x - y); return Math.max(10, a[a.length >> 1] || 14); }

/* Hangi belgede çalışır: ana belge, yan yana açılan yan belge ya da ikisi */
const handHere = () => { if (PHONE) return false; const w = S.hand.where || 'both'; return w === 'both' || (w === 'side' ? EMBED : !EMBED); };
/* iki belgedeki bekleyen düğmeleri ve çubukları birlikte temizle */
function handResetAll() {
  handReset();
  try { if (EMBED) { if (parent.handReset) parent.handReset(); } else { const w = typeof sideWin === 'function' && sideWin(); if (w && w.handReset) w.handReset(); } } catch (e) { }
}
window.handPenDown = () => {
  clearTimeout(HW.timer);
  // tabletteki model: yazmaya başlayınca arka planda belleğe yüklensin (ilk Düzelt beklemesin)
  if (!HW.prepped && S.hand.mode !== 'off' && (S.hand.ai || 'off') !== 'off' && S.hand.engine !== 'cloud') { HW.prepped = true; handLocalPrepare(); }
};
window.handAfterStroke = (pv, s, t0p, t1p) => {
  if (S.hand.mode === 'off' || !handHere() || S.prefs.readOnly || s.t === 'hl') return;
  const t1 = Date.now(); HW.times.set(s, { t0: t1 - Math.max(1, t1p - t0p), t1 });
  const bb = strokeBB(s); const hgt = bb.y1 - bb.y0;
  let g = HW.group;
  if (g && (g.pv !== pv || !joinGroup(g, bb) || t1 - g.at > 60000)) {
    const old = g; HW.group = g = null;
    if (S.hand.mode === 'auto') runGroup(old, true); else HW.pend.push(old); // düğmeyle: önceki satırlar kaybolmasın
  }
  if (!g) g = HW.group = { pv, strokes: [], bb: null, line: { ...bb }, lineH: Math.max(12, hgt), at: t1 };
  g.strokes.push(s); g.bb = bbUnion(g.bb, bb); g.at = t1;
  if (hgt > g.lineH * .6 && hgt < g.lineH * 2.5) g.lineH = Math.max(g.lineH * .7 + hgt * .3, 12);
  clearTimeout(HW.timer);
  if (S.hand.mode === 'auto') {
    // satır sonuna (sağ kenara) yakın bırakıldıysa alt satırda devam edilecek: biraz daha bekle
    const nearEdge = g.line.x1 > pv.meta.w - Math.max(50, g.lineH * 2.2);
    const w = Math.max(1500, handWaitMs());
    HW.timer = setTimeout(() => { const gg = HW.group; HW.group = null; if (gg) runGroup(gg, true); }, nearEdge ? w + 1500 : w);
  } else HW.timer = setTimeout(showHandChip, handWaitMs());
};

/* kalem kaldırıldıktan sonra Düzelt düğmesinin çıkması (Otomatik'te düzeltmenin başlaması) için bekleme — Ayarlar → El yazısı */
function handWaitMs() { const v = +S.hand.wait; return Math.round((isFinite(v) && v > 0 ? Math.min(10, Math.max(.3, v)) : 1.5) * 1000); }
function groupScreenBox(pv, bb) {
  const v = ed.view; return { x0: v.tx + (pv.x + bb.x0) * v.z, y0: v.ty + (pv.y + bb.y0) * v.z, x1: v.tx + (pv.x + bb.x1) * v.z, y1: v.ty + (pv.y + bb.y1) * v.z };
}
function pendingGroups() {
  if (!ed.note) return [];
  const live = g => { const A = ed.note.ann[g.pv.meta.id]; return A && g.strokes.some(s => A.s.includes(s)); };
  HW.pend = HW.pend.filter(g => ed.pvs.includes(g.pv) && live(g));
  return [...HW.pend, ...(HW.group && live(HW.group) ? [HW.group] : [])];
}
function showHandChip() {
  const gs = pendingGroups(); if (!gs.length) { hideHandChip(); return; }
  hideHandChip();
  const go = async () => {
    const all = pendingGroups(); HW.pend = []; HW.group = null; hideHandChip();
    for (const g of all) await runGroup(g, false);
  };
  // çarpı: düğmeyi kapatır, yazı el yazısı olarak kalır (sonraki yazıda düğme yeniden çıkar)
  const dismiss = () => { clearTimeout(HW.timer); HW.pend = []; HW.group = null; hideHandChip(); };
  HW.chip = h('div', { class: 'floaty handchip' },
    h('button', { class: 'hgo', type: 'button', title: 'El yazısını metne çevir ve düzelt', onclick: go }, icon(IC.fixText), gs.length > 1 ? 'Düzelt (' + gs.length + ')' : 'Düzelt'),
    h('button', { class: 'hx', type: 'button', 'aria-label': 'Düzelt düğmesini kapat', title: 'Kapat (yazı el yazısı olarak kalır)', onclick: dismiss }, icon(IC.close)));
  HW.chip.addEventListener('pointerdown', e => e.stopPropagation());
  $('#ui').append(HW.chip); placeHandUi();
}
function hideHandChip() { if (HW.chip) { HW.chip.remove(); HW.chip = null; } }

/* Bu yazı bir metnin devamı mı? Aynı satırda sağında ya da hemen alt satırında başlayan yazı o metne eklenir.
   Düzeltilmiş kutular, el yazısının nerede bittiğini (ink) hatırlar: metin el yazısından kısa olsa da devamı bulunur. */
function findContinuation(pv, bb, lh) {
  const A = ann(pv.meta.id); let best = null, bestD = 1e9;
  for (const t of A.t) {
    if (!t.text || !t.w) continue;
    const th = t.h || t.size * 1.3, ink = t.ink && t.ink.x1 > t.ink.x0 ? t.ink : null;
    const tl = Math.max(lh, t.size * 1.25, ink ? ink.y1 - ink.y0 : 0);
    const lineEnd = ink ? Math.max(ink.x1, t.x + Math.min(t.w, t.size * 2)) : t.x + t.w;
    const band0 = ink ? Math.min(ink.y0, t.y + th - t.size * 1.3) : t.y + th - t.size * 1.35, band1 = ink ? Math.max(ink.y1, t.y + th) : t.y + th;
    // 1) aynı satırda, kutunun (ya da önceki el yazısının) sağında
    const ov = Math.min(band1, bb.y1) - Math.max(band0, bb.y0), gap = bb.x0 - lineEnd;
    if (ov > -tl * .35 && bb.x0 > t.x + Math.min(t.w * .5, tl * 2) && gap > -tl && gap < Math.max(tl * 5, 80)) { const d = Math.max(0, gap); if (d < bestD) { bestD = d; best = t; } continue; }
    // 2) hemen alt satırda, paragrafın sol kenarına yakın
    const dy = bb.y0 - band1, x0s = ink ? Math.min(ink.x0, t.x) : t.x;
    if (dy > -tl * .6 && dy < tl * 1.4 && Math.abs(bb.x0 - x0s) < Math.max(tl * 3, 50)) { const d = 1000 + dy; if (d < bestD) { bestD = d; best = t; } }
  }
  return best;
}

async function runGroup(g, auto) {
  const A = ann(g.pv.meta.id); const live = g.strokes.filter(s => A.s.includes(s));
  if (!live.length) return;
  const lines = splitLines(live);
  const bb = live.reduce((b, s) => bbUnion(b, strokeBB(s)), null);
  if (auto && (lines.some(l => l.bb.y1 - l.bb.y0 > 150) || (live.length < 2 && bb.x1 - bb.x0 < 40))) return; // çizim ya da tek işaret olabilir
  const lh = medianLineH(lines);
  const cont = S.hand.cont !== false ? findContinuation(g.pv, lines[0].bb, lh) : null;
  HW.busy++; showHandBusy(g.pv, bb);
  try {
    const pts = lines.map(l => l.strokes.map(strokePts)), ink = handInkSize(lines, lh), before = cont ? cont.text : '';
    // gelişmiş okuma cihazdakiyle AYNI ANDA başlar: cihaz sonucu hemen yazılır, model gelince o parça güncellenir
    const mode = S.hand.ai || 'off', adv = handAdv(), useAi = HW_NATIVE() && adv.ready && (mode === 'always' || (mode === 'long' && ink.long));
    const aiAt = Date.now(), aiInfo = {}, aiP = useAi ? handAdvRead(pts.flat(), { before, lines: lines.length, maxLen: ink.maxLen, rows: handRows(pts, lh), info: aiInfo }) : null;
    if (aiP) aiP.catch(() => { });
    const r = await handRecognizeLines(pts, S.hand.lang, before, { lineH: lh, pageW: g.pv.meta.w }, aiP);
    if (auto && r.corrected.replace(/\s/g, '').length < 2) return;
    applyHandResult(g.pv, live, r, { cont, lines, lh, aiP: r.via === 'ai' ? null : aiP, aiAt, aiInfo, maxLen: ink.maxLen, long: ink.long });
  } catch (e) {
    if (e.code === 'nokey') toastAction(e.message, 'Bağla', () => aiSettingsModal());
    else toast(e.message || 'El yazısı tanınamadı', 3200);
  } finally { HW.busy--; hideHandBusy(); }
}
function toastAction(msg, label, fn) {
  toast(msg, 5200);
  const t = $('.toast'); if (!t) return;
  t.append(' ', h('button', { class: 'btn small', type: 'button', style: { marginLeft: '8px', height: '30px' }, onclick: () => { t.hidden = true; fn(); } }, label));
}
function showHandBusy(pv, bb) {
  hideHandBusy();
  const sb = groupScreenBox(pv, bb);
  HW.busyEl = h('div', { class: 'handbusy', style: { left: sb.x0 - 6 + 'px', top: sb.y0 - 6 + 'px', width: sb.x1 - sb.x0 + 12 + 'px', height: sb.y1 - sb.y0 + 12 + 'px' } });
  $('#ui').prepend(HW.busyEl);
}
function hideHandBusy() { if (HW.busyEl) { HW.busyEl.remove(); HW.busyEl = null; } }

/* ---------- sonucu uygula ---------- */
function handFontSize(lineH, font) {
  const base = lineH * (font === 'hand' ? 0.95 : 0.72);
  return Math.round(clamp(base * (S.hand.scale || 100) / 100, 8, 96) * 2) / 2;
}
function applyHandResult(pv, strokes, r, info = {}) {
  const pid = pv.meta.id, A = ann(pid);
  const live = strokes.filter(s => A.s.includes(s)); if (!live.length) return;
  const lines = info.lines || splitLines(live), first = lines[0].bb, last = lines[lines.length - 1].bb;
  const lineH = info.lh || medianLineH(lines);
  const b = snap(pid);
  const font = S.hand.font || 'hand';
  const cont = info.cont && A.t.includes(info.cont) ? info.cont : null;
  let nt, prefix = '', mark = '', prevInk = null;
  if (cont) {
    // devam: aynı kutuya, mevcut metnin hemen arkasına eklenir (hizalı kalır)
    prefix = cont.text.replace(/\s+$/, '') + ' '; prevInk = cont.ink || null;
    nt = { ...cont, text: prefix + r.corrected, w: 0, h: 0, ink: { x0: prevInk ? Math.min(prevInk.x0, first.x0) : cont.x, x1: last.x1, y0: last.y0, y1: last.y1 } };
    A.t = A.t.map(t => t === cont ? nt : t);
  } else {
    // Kalem stili seçiliyse (Terim, Anlamı…) onun yazı tipi, kalınlığı, boyutu ve işareti kullanılır
    const st = S.hand.style, fnt = st && st.font ? st.font : font;
    const size = st && st.size ? st.size : handFontSize(lineH, font);
    let text = r.corrected; mark = st && st.prefix && !text.startsWith(st.prefix) ? st.prefix : '';
    if (mark) text = mark + ' ' + text;
    const hand = fnt === 'hand' || fnt === 'kalam';
    nt = { id: uid(), x: Math.max(0, first.x0), y: Math.max(0, first.y0 - size * (hand ? .12 : .08)), text, size, color: live[0].c || S.text.color, font: fnt, bold: !!(st && st.wt >= 700), wt: st && st.wt ? st.wt : 0,
      ink: { x0: first.x0, x1: last.x1, y0: last.y0, y1: last.y1 } };
    A.t.push(nt);
  }
  A.s = A.s.filter(s => !live.includes(s));
  const op = { k: 'page', pid, b, a: snap(pid) }; pushOp(op);
  renderLayer(pv); requestFrame(true); refreshPanel && refreshPanel();
  // seg/idx: bu işlemin kutuya eklediği parça ve yeri (sonradan gelen gelişmiş okuma yalnızca bu parçayı değiştirir)
  HW.last = { pv, t: nt, strokes: live, lines: lines.map(l => l.strokes), lh: lineH, r, op, prefix, mark, prevInk, at: Date.now(),
    seg: r.corrected, idx: cont ? prefix.length : mark ? mark.length + 1 : 0, mode: S.hand.lang, maxLen: info.maxLen || 0, long: !!info.long };
  showHandBar();
  maybeAiImprove(HW.last, info.aiP, info.aiAt, info.aiInfo);
}
/* L'nin eklediği parça metnin neresinde? (kullanıcı o parçayı değiştirdiyse -1) */
function segAt(L, text) {
  if (!L.seg || !text) return -1;
  if (text.substr(L.idx, L.seg.length) === L.seg) return L.idx;
  const a = text.indexOf(L.seg); return a >= 0 && text.indexOf(L.seg, a + 1) < 0 ? a : -1;
}
function segReplace(L, seg) {
  const t = curT(L); if (!t) return false;
  const i = segAt(L, t.text); if (i < 0) return false;
  const text = t.text.slice(0, i) + seg + t.text.slice(i + L.seg.length);
  replaceT(L, () => ({ text }));
  L.seg = seg; L.idx = i;
  return true;
}
/* Gelişmiş okuma: cihazdaki sonuç beklemeden yazılmıştır; model gelince yalnızca bu işlemin parçası güncellenir.
   Sonuç, kullanıcı bu arada başka satırlar düzeltse de kendi kutusuna uygulanır (parça değiştirilmediyse). */
async function maybeAiImprove(L, aiP, at, info) {
  if (!L) return;
  const mode = S.hand.ai || 'off', adv = handAdv();
  if (!aiP) {
    if (mode === 'off' || (L.r.via !== 'device' && L.r.via !== 'merge') || !adv.ready) return;
    info = {};
    if (L.lines && L.lines.length) {
      if (mode === 'long' && !L.long && wordCount(L.seg) < 6) return;
      const pts = L.lines.map(l => l.map(strokePts));
      aiP = handAdvRead(pts.flat(), { mode: L.mode, before: L.prefix, lines: L.lines.length, maxLen: Math.max(L.maxLen, L.seg.length * 1.8 + 30), rows: handRows(pts, L.lh || 20), info });
    } else {
      if (adv.kind !== 'cloud') return; // birleştirilmiş metnin düzeltmesi yalnızca bulutta (tabletteki model görüntüden okur)
      if (mode === 'long' && wordCount(L.r.corrected) < 6) return;
      aiP = handAiText(L.r);
    }
    at = Date.now();
  }
  L.ai = 'busy'; L.aiModel = adv.short; L.aiKind = adv.kind; L.aiInfo = info || null; if (HW.last === L && HW.bar) showHandBar();
  let imp = null;
  try { imp = await aiP; } catch (e) { L.ai = 'fail'; L.aiErr = e && e.message; }
  // tabletteki modelde süre: okuma süresi (ilk okumada model yükleme ayrıca)
  L.aiMs = info && info.ms ? info.ms : Date.now() - (at || Date.now());
  L.aiLoad = info && info.loadMs ? info.loadMs : 0;
  if (L.ai === 'fail') { }
  else if (imp && imp !== L.seg) {
    const before = L.seg;
    if (segReplace(L, imp)) { L.r = { ...L.r, corrected: imp, aiFixed: true, devText: before }; L.ai = 'done'; }
    else L.ai = 'edited';
  } else L.ai = 'same';
  if (HW.last === L && HW.bar) showHandBar();
}
function curT(L) { if (!L || !ed.note || !ed.pvs.includes(L.pv)) return null; const A = ann(L.pv.meta.id); return A.t.find(t => t.id === L.t.id) || null; }
function replaceT(L, fn) {
  const t = curT(L); if (!t) return;
  const pid = L.pv.meta.id, A = ann(pid), b = snap(pid);
  const nt = { ...t, ...fn(t), w: 0, h: 0 };
  A.t = A.t.map(x => x === t ? nt : x); L.t = nt;
  pushOp({ k: 'page', pid, b, a: snap(pid) }); renderLayer(L.pv); requestFrame(true);
  if (HW.last === L) placeHandUi();
}
function curLastT() { return curT(HW.last); }
function replaceLastT(fn) { if (!curLastT()) { hideHandBar(); return; } replaceT(HW.last, fn); }
function handResize(k) { replaceLastT(t => ({ size: Math.round(clamp(t.size * k, 6, 120) * 2) / 2 })); }
async function handSwitchLang() {
  const L = HW.last; if (!L) return;
  const to = L.r.lang === 'tr' ? 'en' : 'tr';
  const bar = HW.bar; if (bar) bar.classList.add('busy');
  try {
    const r = L.lines.length ? await handRecognizeLines(L.lines.map(l => l.map(strokePts)), to, L.prefix, { lineH: L.lh, pageW: L.pv.meta.w })
      : await handNativeText(L.raw || L.r.text, to);
    if (!segReplace(L, r.corrected)) { toast('Metin değiştirilmiş; yeniden okunmadı', 2200); if (bar) bar.classList.remove('busy'); return; }
    L.r = r; L.ai = null; L.mode = to;
    showHandBar(); maybeAiImprove(L);
  } catch (e) { toast(e.message || 'Tanınamadı', 2600); if (bar) bar.classList.remove('busy'); }
}
function handUndo() {
  const L = HW.last; if (!L) return;
  if (ed.undo[ed.undo.length - 1] === L.op) undo();
  else {
    const pid = L.pv.meta.id, A = ann(pid), b = snap(pid); const t = curLastT();
    const i = t && L.prefix ? segAt(L, t.text) : -1;
    if (t && L.prefix) A.t = A.t.map(x => x === t ? { ...t, text: i >= 0 ? (t.text.slice(0, i).replace(/\s+$/, '') + t.text.slice(i + L.seg.length)).trim() : L.prefix.replace(/\s+$/, ''), w: 0, h: 0, ink: L.prevInk } : x); // devamsa yalnızca eklenen kısım geri alınır
    else A.t = A.t.filter(x => x !== t);
    A.s.push(...L.strokes); pushOp({ k: 'page', pid, b, a: snap(pid) }); renderLayer(L.pv); requestFrame(true);
  }
  HW.last = null; hideHandBar();
}
function handSelect() {
  const L = HW.last, t = curLastT(); hideHandBar(); if (!L || !t) return;
  if (ed.tool !== 'pen' && ed.tool !== 'lasso') setTool('lasso');
  setSel(L.pv, new Set(), new Set([t]), new Set());
}
function handDelete() {
  const L = HW.last, t = curLastT(); hideHandBar(); if (!L || !t) return;
  const pid = L.pv.meta.id, A = ann(pid), b = snap(pid);
  A.t = A.t.filter(x => x !== t); pushOp({ k: 'page', pid, b, a: snap(pid) }); renderLayer(L.pv); requestFrame(true);
  HW.last = null; toast('Metin silindi', 1200);
}
function showHandBar() {
  hideHandBar(); const L = HW.last; if (!L) return;
  const r = L.r;
  const langBtn = h('button', { class: 'langb', type: 'button', title: (r.lang === 'tr' ? 'İngilizce' : 'Türkçe') + ' olarak yeniden oku', onclick: handSwitchLang }, (r.lang || '?').toUpperCase());
  const sec = L.aiMs ? ' · ' + (L.aiMs / 1000).toFixed(1).replace('.', ',') + ' sn' + (L.aiLoad ? ' (+' + (L.aiLoad / 1000).toFixed(0) + ' sn yükleme)' : '') : '';
  const loadingLocal = L.aiKind === 'local' && HW.local && HW.local.state === 'loading';
  const info = L.ai === 'busy' ? (loadingLocal ? 'Gemma belleğe yükleniyor (ilk okuma)…' : (L.aiModel || 'Gelişmiş model') + ' okuyor…') : L.ai === 'done' ? (L.aiModel || 'Gelişmiş model') + ' düzeltti' + sec + (L.prefix ? ' · metnin devamına eklendi' : '')
    : L.ai === 'same' ? (L.aiModel || 'Gelişmiş model') + ' de aynı okudu' + sec : L.ai === 'fail' ? 'Gelişmiş okuma olmadı' + (L.aiErr ? ': ' + L.aiErr : '') + '; cihazdaki sonuç kaldı' : L.ai === 'edited' ? 'Metni değiştirdiğin için gelişmiş okuma uygulanmadı'
    : r.kept && r.kept.length ? 'Korundu: ' + r.kept.join(', ') : r.text && r.text !== r.corrected ? 'Düzeltildi: ' + r.text
    : L.prefix ? 'Metnin devamına eklendi' : r.via === 'merge' ? 'Parçalar birleştirildi ve hizalandı' : r.via === 'ai' ? (L.aiModel || (HW_NATIVE() ? handAdv().short : handModelInfo().short)) + ' ile okundu' : 'Yazım hatası yok';
  const shown = L.t.text.length > 60 ? '…' + L.t.text.slice(-58) : L.t.text;
  HW.bar = h('div', { class: 'floaty handbar' + (L.ai === 'busy' ? ' aibusy' : ''), role: 'toolbar', 'aria-label': 'El yazısı sonucu' },
    langBtn,
    h('div', { class: 'hinfo' }, h('b', null, shown), h('small', null, info)),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Küçült', title: 'Küçült', onclick: () => handResize(1 / 1.12) }, icon(IC.aSmall)),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Büyüt', title: 'Büyüt', onclick: () => handResize(1.12) }, icon(IC.aBig)),
    window.speakText ? h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Sesli oku', title: 'Sesli oku', onclick: () => { const t = curLastT(); if (t) speakText(t.text); } }, icon(IC.speak)) : null,
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Seç ve taşı', title: 'Seç: taşı, büyüt/küçült', onclick: handSelect }, icon(IC.move)),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Metni sil', title: 'Metni sil', onclick: handDelete }, icon(IC.trash)),
    h('button', { class: 'btn small', type: 'button', onclick: handUndo }, icon(IC.undo), 'Geri al'),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: hideHandBar }, icon(IC.close)));
  HW.bar.addEventListener('pointerdown', e => e.stopPropagation());
  $('#ui').append(HW.bar); placeHandUi();
  clearTimeout(HW.barT); HW.barT = setTimeout(() => { if (HW.bar && !HW.bar.matches(':hover') && !(HW.last && HW.last.ai === 'busy')) hideHandBar(); }, 9000);
}
function hideHandBar() { clearTimeout(HW.barT); if (HW.bar) { HW.bar.remove(); HW.bar = null; } }

function placeHandUi() {
  if (!ed.note) return;
  if (HW.chip) {
    const g = HW.group || HW.pend[HW.pend.length - 1];
    if (!g || ed.tool !== 'pen' || !ed.pvs.includes(g.pv)) { hideHandChip(); }
    else { const sb = groupScreenBox(g.pv, g.line || g.bb); const c = HW.chip; c.style.left = clamp(sb.x1 + 10, 8, ed.W - c.offsetWidth - 8) + 'px'; c.style.top = clamp((sb.y0 + sb.y1) / 2 - c.offsetHeight / 2, 8, ed.H - c.offsetHeight - 8) + 'px'; }
  }
  if (HW.bar) {
    const t = curLastT(); if (!t) { hideHandBar(); return; }
    const L = HW.last, sb = groupScreenBox(L.pv, { x0: t.x, y0: t.y, x1: t.x + (t.w || 40), y1: t.y + (t.h || 20) });
    const bar = HW.bar, bw = bar.offsetWidth, bh = bar.offsetHeight;
    let y = sb.y1 + 12; if (y + bh > ed.H - 60) y = sb.y0 - bh - 12;
    bar.style.left = clamp(sb.x0, 8, ed.W - bw - 8) + 'px'; bar.style.top = clamp(y, 8, ed.H - bh - 8) + 'px';
  }
}
window.placeHandUi = placeHandUi;
window.handReset = () => { clearTimeout(HW.timer); HW.group = null; HW.pend = []; HW.last = null; hideHandChip(); hideHandBar(); hideHandBusy(); };

/* ---------- seçimden: “Yazıya dök” ve büyüt/küçült ---------- */
async function selToText() {
  const sel = ed.sel; if (!sel) return;
  commitSel();
  const strokes = [...sel.ids].filter(s => s.t !== 'hl');
  if (!strokes.length) { toast('Seçimde el yazısı yok', 1600); return; }
  const pv = sel.pv; clearSel();
  // satırlar → paragraflar (alt alta, sola hizalı ve yakın satırlar aynı paragraf)
  const lines = splitLines(strokes), paras = [];
  for (const l of lines) {
    const P = paras[paras.length - 1], lh = Math.max(14, l.lineH);
    if (P && l.bb.y0 - P.last.y1 < lh * 1.3 && Math.abs(l.bb.x0 - P.bb.x0) < lh * 3) { P.strokes.push(...l.strokes); P.bb = bbUnion(P.bb, l.bb); P.last = l.bb; }
    else paras.push({ pv, strokes: [...l.strokes], bb: { ...l.bb }, last: l.bb, lineH: l.lineH });
  }
  for (const p of paras) { HW.last = null; await runGroup(p, false); }
}
/* Seçilen parçaları (metin kutuları + düzeltilmemiş el yazısı) okuma sırasına göre tek, sola hizalı metinde birleştir ve düzelt */
async function selAlignFix() {
  const sel = ed.sel; if (!sel) return;
  commitSel();
  const pv = sel.pv, pid = pv.meta.id, A = ann(pid);
  const boxes = [...sel.tids].filter(t => A.t.includes(t) && t.text && t.text.trim());
  const strokes = [...sel.ids].filter(s => s.t !== 'hl' && A.s.includes(s));
  if (!boxes.length && !strokes.length) return;
  clearSel();
  const items = boxes.map(t => ({ t, bb: { x0: t.x, y0: t.y, x1: t.x + (t.w || 20), y1: t.y + (t.h || 20) }, text: t.text.trim(), size: t.size }));
  const all = items.reduce((b, it) => bbUnion(b, it.bb), strokes.reduce((b, s) => bbUnion(b, strokeBB(s)), null));
  HW.busy++; showHandBusy(pv, all);
  try {
    if (strokes.length) {
      const lines = splitLines(strokes), lh = medianLineH(lines);
      for (const l of lines) {
        const r = await handRecognizeLines([l.strokes.map(strokePts)], S.hand.lang, '', { lineH: lh, pageW: pv.meta.w });
        items.push({ bb: l.bb, text: r.corrected.trim(), size: handFontSize(l.bb.y1 - l.bb.y0, S.hand.font) });
      }
    }
    // okuma sırası: dikey örtüşen parçalar aynı satır; satır içinde soldan sağa
    items.sort((a, b) => (a.bb.y0 + a.bb.y1) - (b.bb.y0 + b.bb.y1));
    const rows = [];
    for (const it of items) {
      const hh = it.bb.y1 - it.bb.y0;
      const row = rows.find(r => Math.min(r.bb.y1, it.bb.y1) - Math.max(r.bb.y0, it.bb.y0) > Math.min(hh, r.bb.y1 - r.bb.y0) * .35);
      if (row) { row.items.push(it); row.bb = bbUnion(row.bb, it.bb); } else rows.push({ items: [it], bb: { ...it.bb } });
    }
    rows.sort((a, b) => a.bb.y0 - b.bb.y0);
    let text = '', prevRow = null;
    for (const row of rows) {
      row.items.sort((a, b) => a.bb.x0 - b.bb.x0);
      let line = '', prev = null;
      for (const it of row.items) {
        if (!it.text) continue;
        if (!prev) line = it.text;
        // ayrı parçalar her zaman boşlukla birleşir (kutuların genişliği tahmini olduğundan "yakınlık" kelimeleri bitiştiriyordu);
        // yalnız tireyle bölünmüş kelime ("kele-" + "me") bitişik yazılır
        else if (/\p{L}-$/u.test(line) && /^\p{Ll}/u.test(it.text)) line = line.slice(0, -1) + it.text;
        else line += (/^[.,;:!?…%)\]}»”’]/.test(it.text) ? '' : ' ') + it.text;
        prev = it;
      }
      if (!line) continue;
      if (prevRow) { const lh = Math.max(prevRow.bb.y1 - prevRow.bb.y0, row.bb.y1 - row.bb.y0); text += (row.bb.y0 - prevRow.bb.y1 > lh * 1.1 ? '\n' : ' ') + line; } else text = line;
      prevRow = row;
    }
    text = text.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim();
    if (!text) return;
    let r = { ok: true, lang: HW_TR.test(text) ? 'tr' : 'en', text, corrected: text, kept: [], via: 'merge' };
    try { const d = await handNativeText(text, S.hand.lang); r = { ...d, via: 'merge' }; } catch (e) { }
    // yazım denetimi kelimeleri bitiştirdiyse (aynı harfler, daha az boşluk) birleştirilmiş metnin boşlukları korunur
    if (r.corrected && r.corrected.replace(/\s+/g, '') === text.replace(/\s+/g, '') && r.corrected.split(/\s+/).length < text.split(/\s+/).length) r = { ...r, corrected: text };
    // stil: okuma sırasındaki ilk metin kutusundan (yoksa kalem stili / ayarlar)
    const firstBox = rows.flatMap(rw => rw.items).find(it => it.t);
    const st = S.hand.style, base = firstBox ? firstBox.t : null;
    const size = base ? base.size : st && st.size ? st.size : handFontSize(medianLineH(rows.map(rw => ({ bb: rw.bb }))), S.hand.font);
    const lastRow = rows[rows.length - 1].bb;
    const nt = base ? { ...base, id: uid(), w: 0, h: 0 } : { id: uid(), size, color: strokes[0] ? strokes[0].c : S.text.color, font: st && st.font ? st.font : S.hand.font, bold: !!(st && st.wt >= 700), wt: st && st.wt ? st.wt : 0 };
    Object.assign(nt, { x: Math.max(0, all.x0), y: Math.max(0, rows[0].bb.y0), text: r.corrected, ink: { x0: all.x0, x1: lastRow.x1, y0: lastRow.y0, y1: lastRow.y1 } });
    const b = snap(pid);
    A.t = A.t.filter(t => !boxes.includes(t)); A.s = A.s.filter(s => !strokes.includes(s)); A.t.push(nt);
    const op = { k: 'page', pid, b, a: snap(pid) }; pushOp(op);
    renderLayer(pv); requestFrame(true);
    HW.last = { pv, t: nt, strokes, lines: [], raw: text, lh: size, r, op, prefix: '', mark: '', at: Date.now(), seg: r.corrected, idx: 0, mode: S.hand.lang };
    showHandBar(); maybeAiImprove(HW.last);
  } catch (e) { toast(e.message || 'Birleştirilemedi', 3000); }
  finally { HW.busy--; hideHandBusy(); }
}
function scaleSelBy(k) {
  const sel = ed.sel; if (!sel) return;
  const bb = sel.bb, cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
  sel.m = mul([k, 0, 0, k, cx - k * cx, cy - k * cy], sel.m);
  updateSelStyle(); moveSelItems(); commitSel(); placeSelbar();
}

/* ---------- kalem panelindeki ayarlar ---------- */
function handWhereSeg() {
  return segRow([['main', 'Ana belge'], ['side', 'Yan belge'], ['both', 'İkisinde de']], S.hand.where || 'both', v => { S.hand.where = v; saveSettings(); handResetAll(); }, 'El yazısını düzelt hangi belgede çalışsın');
}
function handStatusNote() {
  const st = h('p', { class: 'notice handst' });
  const showSt = () => {
    if (!st.isConnected && HW.onStatus === showSt) { HW.onStatus = null; return; }
    st.innerHTML = '';
    if (S.hand.mode === 'off') { st.textContent = 'Kalemle yazdığınız satırlar metne çevrilir; yazım hataları düzeltilir. Türkçe ve İngilizce karışık yazılabilir.' + (S.hand.cont !== false ? ' Bir metnin yanına ya da altına yazdığınız devam, o metne eklenir.' : ''); return; }
    if (HW_NATIVE()) {
      const s = HW.status || {};
      const ok = s.tr === 'ready' && s.en === 'ready', dl = s.tr === 'downloading' || s.en === 'downloading';
      if (ok) st.textContent = 'Cihazda tanıma hazır (internetsiz). Yazım denetimi Samsung Klavye’nin Türkçe ve İngilizce sözlüklerini kullanır.';
      else if (dl) st.textContent = 'Türkçe ve İngilizce el yazısı modelleri indiriliyor (yaklaşık 40 MB)…';
      else if (s.tr === 'missing' || s.en === 'missing') st.append('Cihazda tanıma için iki dil modeli bir kez indirilmeli (yaklaşık 40 MB). ', h('button', { class: 'btn small', type: 'button', onclick: () => { try { KenarNative.inkPrepare(); } catch (e) { } } }, icon(IC.dl), 'Modelleri indir'));
      else st.textContent = 'Cihazdaki el yazısı modelleri kontrol ediliyor…';
    } else st.textContent = aiReady() ? 'Bu tarayıcıda el yazısı ' + aiName() + ' ile okunur (internet gerekir).' : 'Bu tarayıcıda el yazısını okumak için yapay zekâyı bağlayın.';
  };
  HW.onStatus = showSt;
  handCheckModels(); showSt();
  st._show = showSt;
  return st;
}
/* düzeltme başına maliyet: bu modelle yapılmış en az 3 el yazısı isteği varsa gerçek ortalama, yoksa tahmin */
function handCost() {
  const c = aiCfg(), m = handModelInfo(c), prov = c.provider === 'gemini' ? 'gemini' : 'claude';
  try {
    let n = 0, usd = 0; const d = uzLoad().d;
    for (const day in d) { const r = d[day][prov + '|' + m.id + '|hand']; if (r) { n += r[0]; usd += r[4]; } }
    if (n >= 3) return { usd: usd / n, real: true, n };
  } catch (e) { }
  const inp = prov === 'gemini' ? 1500 : 900, out = prov === 'gemini' && m.think === 'low' ? 300 : 70;
  try { const pr = uzPrice(prov, m.id, uzDay(), inp); return { usd: (inp * pr.i + out * pr.o) / 1e6, real: false }; } catch (e) { return null; }
}
/* ---------- tabletteki model kutusu (indir / durdur / sil / durum) ---------- */
const gb = b => (b / 1e9).toFixed(1).replace('.', ',') + ' GB';
HW.localSubs = new Set();
{ const base = window.__localStatus; window.__localStatus = j => { base(j); for (const f of [...HW.localSubs]) f(); }; }
function handLocalBox() {
  const box = h('div', { class: 'lmbox' });
  let armDel = false, armT = 0;
  const btn = (label, ic, fn, cls) => h('button', { class: 'btn small' + (cls ? ' ' + cls : ''), type: 'button', onclick: fn }, ic ? icon(ic) : null, label);
  const call = f => { try { KenarNative[f](); } catch (e) { toast('Yapılamadı: ' + e.message, 2400); } };
  const render = () => {
    if (!box.isConnected && box._mounted) { HW.localSubs.delete(render); return; }
    box.innerHTML = '';
    if (!HW_LOCAL()) { box.append(h('p', { class: 'notice' }, 'Tabletteki model yalnızca Android uygulamasında çalışır.')); return; }
    const st = HW.local || handLocalStatus() || { state: 'missing' }, total = st.total || 2.58e9;
    const line = (txt, sub) => box.append(h('div', { class: 'lmline' }, h('b', null, txt), sub ? h('small', null, sub) : null));
    const bar = frac => box.append(h('div', { class: 'lmbar', role: 'progressbar', 'aria-valuemin': 0, 'aria-valuemax': 100, 'aria-valuenow': Math.round(frac * 100) }, h('i', { style: { width: Math.max(2, Math.round(frac * 100)) + '%' } })));
    const acts = (...b) => box.append(h('div', { class: 'sbtns' }, ...b));
    const st0 = st.state;
    if (st0 === 'missing' || (st0 === 'error' && !(st.done > 0))) {
      if (st.error) box.append(h('p', { class: 'lmerr' }, st.error));
      line('Gemma 4 E2B · yaklaşık 2,6 GB', 'Bir kez indirilir, sonra internetsiz çalışır; yazın tabletten çıkmaz. Yalnızca Wi-Fi’da iner; indirme bildirimlerde görünür, uygulamayı kapatsan da sürer.' + (st.free ? ' Boş yer: ' + gb(st.free) + '.' : ''));
      acts(btn(st0 === 'error' ? 'Yeniden dene' : 'İndir (2,6 GB)', IC.dl, () => { if (st.free && st.free < 3e9) { toast('Tablette yeterli boş yer yok (en az 3 GB gerekir).', 3200); return; } call('localDownload'); }, 'primary'));
    } else if (st0 === 'downloading' || st0 === 'waiting') {
      const done = st.done || 0, frac = Math.min(1, done / total);
      line(st0 === 'waiting' ? (st.reason || 'Bekliyor') : 'İndiriliyor · %' + Math.floor(frac * 100), gb(done) + ' / ' + gb(total));
      bar(frac);
      acts(btn('İndirmeyi durdur', IC.close, () => call('localCancel')));
    } else if (st0 === 'loading') {
      line('Belleğe yükleniyor…', 'İlk yüklemede 5–10 saniye sürebilir');
      bar(.5); box.lastChild.classList.add('busy');
    } else if (st0 === 'ready' || st0 === 'loaded') {
      line(st0 === 'loaded' ? 'Hazır · ' + (st.backend === 'CPU' ? 'işlemcide' : st.backend ? 'grafik işlemcisinde' : '') + (st.loadMs ? ' · yükleme ' + (st.loadMs / 1000).toFixed(1).replace('.', ',') + ' sn' : '') : 'İndirildi · ilk okumada belleğe yüklenir',
        'Gemma 4 E2B · 2,6 GB · internetsiz' + (st.backend === 'CPU' ? ' · grafik işlemcisi kullanılamadı, işlemcide daha yavaş çalışır' : ''));
      acts(st0 === 'ready' ? btn('Şimdi yükle', IC.spark, () => call('localPrepare')) : null,
        btn(armDel ? 'Emin misin? Sil' : 'Modeli sil', IC.trash, () => {
          if (!armDel) { armDel = true; render(); clearTimeout(armT); armT = setTimeout(() => { armDel = false; render(); }, 4000); return; }
          armDel = false; call('localDelete');
        }, armDel ? 'danger' : ''));
    } else {
      if (st.error) box.append(h('p', { class: 'lmerr' }, st.error));
      acts(btn('Yeniden dene', IC.dl, () => call('localDownload'), 'primary'));
    }
  };
  HW.localSubs.add(render);
  render(); box._mounted = true;
  return box;
}
function handAiNote() {
  const aiNote = h('p', { class: 'notice' });
  const showAi = () => {
    const mode = S.hand.ai || 'off';
    if (!HW_NATIVE()) { aiNote.textContent = 'Bu tarayıcıda cihazda tanıma yok; el yazısını ' + handModelName() + ' okur (internet gerekir).' + (aiReady() ? '' : ' Önce yapay zekâyı bağlayın (Ayarlar → Yapay zekâ).'); return; }
    if (mode === 'off') { aiNote.textContent = 'Yalnızca cihazdaki tanıma ve yazım denetimi kullanılır (internetsiz, anında). Kısa yazılarda iyidir; uzun cümlelerde hata yapabilir.'; return; }
    const when = mode === 'long' ? ' (birden çok satır ya da yaklaşık 6 kelimeden uzun yazılarda)' : '';
    if (S.hand.engine !== 'cloud') {
      aiNote.textContent = 'Önce cihazdaki sonuç anında yazılır; aynı anda tabletteki Gemma 4 el yazısının görüntüsünü baştan okur ve metni günceller' + when + '. İnternet gerekmez, yazın tabletten çıkmaz.' + (handLocalReady() ? '' : ' Önce aşağıdan modeli indir.');
      return;
    }
    const k = handCost(), cost = k && window.uzUsd ? ' Düzeltme başına ' + (k.real ? 'ortalama ' : '≈ ') + uzUsd(k.usd) + ' (100 düzeltme ≈ ' + uzUsd(k.usd * 100) + ')' + (S.usage && S.usage.gFree && aiCfg().provider === 'gemini' ? '; ücretsiz katmanda ödenmez' : '') + '.' : '';
    aiNote.textContent = 'Önce cihazdaki sonuç anında yazılır; aynı anda ' + handModelName() + ' el yazısının görüntüsünü baştan okur ve genellikle 1–3 saniyede metni günceller' + when + '. El yazısının görüntüsü buluta gider; internet gerekir.' + cost + (aiReady() ? '' : ' Önce yapay zekâyı bağlayın (Ayarlar → Yapay zekâ).');
  };
  showAi(); aiNote._show = showAi;
  return aiNote;
}
const handModelSub = () => { const c = aiCfg(), M = HAND_MODELS[c.provider === 'gemini' ? 'gemini' : 'claude']; return 'En doğru: ' + M.best.name + ' · En hızlı: ' + M.fast.name; };
const HAND_WHEN = [['off', 'Yalnız cihaz'], ['long', 'Uzun yazılarda'], ['always', 'Her zaman']];
function handSettingsRows() {
  const st = handStatusNote(), showSt = st._show, aiNote = handAiNote(), showAi = aiNote._show;
  const loc = HW_NATIVE() && S.hand.engine !== 'cloud' ? h('p', { class: 'notice' }) : null;
  const showLoc = () => {
    if (!loc) return; if (!loc.isConnected && loc._m) { HW.localSubs.delete(showLoc); return; }
    const s0 = (HW.local || handLocalStatus() || {}).state;
    loc.innerHTML = '';
    loc.append(s0 === 'loaded' || s0 === 'ready' || s0 === 'loading' ? 'Tabletteki model hazır. ' : s0 === 'downloading' || s0 === 'waiting' ? 'Tabletteki model indiriliyor. ' : 'Tabletteki model indirilmedi. ',
      h('button', { class: 'btn small', type: 'button', onclick: () => { closePop(); openSettings('hand'); } }, 'Ayarlar → El yazısı'));
  };
  if (loc) { HW.localSubs.add(showLoc); showLoc(); loc._m = true; }
  const rows = h('div', { class: 'col handset' },
    h('hr', { class: 'sep' }), h('div', { class: 'lbl' }, 'El yazısını düzelt'),
    segRow([['off', 'Kapalı'], ['button', 'Düğmeyle'], ['auto', 'Otomatik']], S.hand.mode, v => { S.hand.mode = v; saveSettings(); handResetAll(); if (v !== 'off' && HW_NATIVE()) { const s = HW.status || {}; if (s.tr !== 'ready' || s.en !== 'ready') try { KenarNative.inkPrepare(); } catch (e) { } } showSt(); }),
    h('small', { class: 'segcap' }, 'Hangi belgede çalışsın'),
    handWhereSeg(),
    h('small', { class: 'segcap' }, 'Dil'),
    segRow([['auto', 'Otomatik'], ['tr', 'Türkçe'], ['en', 'İngilizce']], S.hand.lang, v => { S.hand.lang = v; saveSettings(); }),
    h('small', { class: 'segcap' }, 'Düzeltilen metnin yazı tipi'),
    segRow([['hand', 'El yazısı'], ['kalam', 'Kalam'], ['sans', 'Yalın'], ['serif', 'Tırnaklı']], S.hand.font, v => { S.hand.font = v; saveSettings(); }),
    rangeRow('hScale', 'Metin boyutu', 50, 200, 5, S.hand.scale, v => '%' + Math.round(v), v => { S.hand.scale = v; saveSettings(); }),
    toggleRow('hCont', 'Metnin devamına ekle', S.hand.cont !== false, v => { S.hand.cont = v; saveSettings(); showSt(); }, 'Düzeltilmiş bir metnin yanına ya da altına yazdığın devam o metne eklenir'),
    S.hand.style ? h('p', { class: 'notice' }, 'Seçili kalem stili: ' + S.hand.style.name + ' (' + (FONT_LABEL[S.hand.style.font] || '') + ' ' + String(S.hand.style.size).replace('.', ',') + ' pt). Yazı tipi ve boyut bu stilden gelir; araç çubuğundaki stil düğmesinden değiştirin.') : null,
    h('small', { class: 'segcap' }, S.hand.engine === 'cloud' ? 'Gelişmiş okuma (bulut)' : 'Gelişmiş okuma (tablette, Gemma 4)'),
    segRow(HAND_WHEN, S.hand.ai || 'off', v => { S.hand.ai = v; saveSettings(); showAi(); if (v !== 'off') { HW.prepped = false; } }),
    aiNote, loc,
    st);
  return rows;
}
/* Ayarlar ekranı için */
function handSettingsGroups() {
  const st = handStatusNote(), showSt = st._show, aiNote = handAiNote(), showAi = aiNote._show;
  st.className = 'sfoot handst'; aiNote.className = 'sfoot';
  const localRow = sRow('Tabletteki model', null, handLocalBox(), true);
  const cloudRow = sRow('Bulut modeli', handModelSub(), segRow([['best', 'En doğru'], ['fast', 'En hızlı']], S.hand.model === 'fast' ? 'fast' : 'best', v => { S.hand.model = v; saveSettings(); showAi(); }), true);
  const showEng = () => { localRow.hidden = S.hand.engine === 'cloud' || !HW_NATIVE(); cloudRow.hidden = S.hand.engine !== 'cloud' && HW_NATIVE(); };
  showEng();
  const whenSeg = segRow(HAND_WHEN, S.hand.ai || 'off', v => { S.hand.ai = v; saveSettings(); showAi(); HW.prepped = false; });
  // model inince gelişmiş okuma kendiliğinden açılır: seçim ve açıklama güncel kalsın
  const syncWhen = () => {
    if (!whenSeg.isConnected && whenSeg._m) { HW.localSubs.delete(syncWhen); return; }
    [...whenSeg.children].forEach((b, i) => { const on = HAND_WHEN[i][0] === (S.hand.ai || 'off'); b.classList.toggle('on', on); b.setAttribute('aria-checked', on ? 'true' : 'false'); });
    showAi();
  };
  HW.localSubs.add(syncWhen); setTimeout(() => { whenSeg._m = true; }, 0);
  return [
    sGroup('Mod', [
      sRow('El yazısını düzelt', 'Kalemle yazdığın satırlar metne çevrilir, yazım hataları düzeltilir', segRow([['off', 'Kapalı'], ['button', 'Düğmeyle'], ['auto', 'Otomatik']], S.hand.mode, v => { S.hand.mode = v; saveSettings(); handResetAll(); if (v !== 'off' && HW_NATIVE()) { const s = HW.status || {}; if (s.tr !== 'ready' || s.en !== 'ready') try { KenarNative.inkPrepare(); } catch (e) { } } showSt(); }), true),
      rangeRow('sHWait', 'Düzelt düğmesi çıkmadan önce bekle', .5, 8, .5, S.hand.wait || 1.5, v => String(v).replace('.', ',') + ' sn', v => { S.hand.wait = v; saveSettings(); }),
      sRow('Hangi belgede çalışsın', 'Ana belge: soldaki (ya da tek açık) belge · Yan belge: “Yan yana belge” ile açılan ikinci belge', handWhereSeg(), true),
      sRow('Dil', null, segRow([['auto', 'Otomatik'], ['tr', 'Türkçe'], ['en', 'İngilizce']], S.hand.lang, v => { S.hand.lang = v; saveSettings(); }), true),
      HW_NATIVE() ? sRow('Cihazda okuma', 'Kelime kelime: her kelime ayrı okunur, önceki kelimeler bağlam olarak verilir; sonra birleştirilir (tek tek düzeltmenin aynısı). Kelimeler aralarındaki boşluktan ayrılır.', segRow([['word', 'Kelime kelime'], ['chunk', '3–4 kelime'], ['line', 'Tüm satır']], S.hand.seg || 'word', v => { S.hand.seg = v; saveSettings(); }, 'Cihazda okuma'), true) : null
    ], st),
    sGroup('Düzeltilen metin', [
      sRow('Yazı tipi', S.hand.style ? 'Seçili kalem stili kullanılıyor: ' + S.hand.style.name : null, segRow([['hand', 'El yazısı'], ['kalam', 'Kalam'], ['sans', 'Yalın'], ['serif', 'Tırnaklı']], S.hand.font, v => { S.hand.font = v; saveSettings(); }), true),
      rangeRow('sHScale', 'Metin boyutu', 50, 200, 5, S.hand.scale, v => '%' + Math.round(v), v => { S.hand.scale = v; saveSettings(); }),
      toggleRow('sHCont', 'Metnin devamına ekle', S.hand.cont !== false, v => { S.hand.cont = v; saveSettings(); showSt(); }, 'Düzeltilmiş bir metnin yanına ya da altına yazdığın devam, ayrı kutu olmadan o metnin arkasına eklenir'),
      toggleRow('sScratch', 'Karalayarak sil', S.feel.scratch !== false, v => { S.feel.scratch = v; saveSettings(); }, 'Yazının üzerini zikzakla karalayınca silinir')
    ]),
    sGroup('Gelişmiş okuma', [
      sRow('Ne zaman', 'Cihazdaki model kısa yazılarda iyi, uzun cümlelerde zayıf. Gelişmiş model el yazısının görüntüsünü baştan okur.', whenSeg, true),
      HW_NATIVE() ? sRow('Okuyan model', 'Tablette: internetsiz, yazın tabletten çıkmaz · Bulut: görüntü Gemini’ye ya da Claude’a gider, internet ve ücret gerekir', segRow([['local', 'Tablette · Gemma 4'], ['cloud', 'Bulut']], S.hand.engine === 'cloud' ? 'cloud' : 'local', v => { S.hand.engine = v; saveSettings(); showEng(); showAi(); }), true) : null,
      localRow, cloudRow,
      HW_NATIVE() ? h('div', { class: 'srow' }, h('div', { class: 'stext' }, h('b', null, 'Karşılaştır'), h('small', null, 'Bir cümle yaz: cihazdaki tanıma (tüm satır, kelime kelime) ile tabletteki Gemma aynı yazıyı okusun, sonuçlar süreleriyle alt alta görünsün')),
        h('button', { class: 'btn small', type: 'button', onclick: () => handCompare() }, icon(IC.pen), 'Dene')) : null
    ], aiNote)
  ];
}

/* ---------- karşılaştırma: aynı yazıyı farklı okuyucular okusun ---------- */
function handCompare() {
  const cv = h('canvas', { class: 'hcpad', 'aria-label': 'Yazma alanı' });
  const list = h('div', { class: 'hclist' });
  const strokes = []; let cur = null, W = 0, H = 0, busy = false, boxes = [];
  const g = cv.getContext('2d');
  const paint = () => {
    const d = DPR(); g.setTransform(d, 0, 0, d, 0, 0); g.clearRect(0, 0, W, H);
    g.strokeStyle = 'rgba(120,135,170,.35)'; g.lineWidth = 1;
    for (let y = 56; y < H; y += 56) { g.beginPath(); g.moveTo(12, y + .5); g.lineTo(W - 12, y + .5); g.stroke(); }
    // bulunan kelimeler: kesik çizgili çerçeve ve sıra numarası
    g.setLineDash([5, 4]); g.strokeStyle = 'rgba(47,91,234,.7)'; g.fillStyle = 'rgba(47,91,234,.07)'; g.lineWidth = 1.2; g.font = '600 11px system-ui, sans-serif';
    boxes.forEach((b, i) => { const x = b.x0 - 5, y = b.y0 - 5, w = b.x1 - b.x0 + 10, hh = b.y1 - b.y0 + 10; g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, hh, 6); else g.rect(x, y, w, hh); g.fill(); g.stroke(); g.fillStyle = 'rgba(47,91,234,.9)'; g.fillText(String(i + 1), x + 3, y - 3); g.fillStyle = 'rgba(47,91,234,.07)'; });
    g.setLineDash([]);
    g.strokeStyle = '#1f2f5c'; g.lineCap = g.lineJoin = 'round'; g.lineWidth = 2.2;
    for (const s of [...strokes, cur].filter(Boolean)) { const p = s.p; g.beginPath(); for (let i = 0; i < p.length; i += 3) i ? g.lineTo(p[i], p[i + 1]) : g.moveTo(p[i], p[i + 1]); if (p.length === 3) g.lineTo(p[0] + .5, p[1]); g.stroke(); }
  };
  const size = () => { const r = cv.getBoundingClientRect(); W = r.width; H = r.height; cv.width = Math.round(W * DPR()); cv.height = Math.round(H * DPR()); paint(); };
  const pos = e => { const r = cv.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  let pts = [], t0 = 0;
  cv.addEventListener('pointerdown', e => {
    if (e.pointerType === 'touch' && S.prefs.penSeen) return; // kalem varken parmak/avuç yazmasın
    e.preventDefault(); try { cv.setPointerCapture(e.pointerId); } catch (er) { }
    const [x, y] = pos(e); pts = [x, y, 2.2]; t0 = Date.now(); boxes = []; cur = { id: uid(), t: 'ballpoint', c: '#1f2f5c', o: 1, p: new Float32Array(pts) }; paint();
  });
  cv.addEventListener('pointermove', e => {
    if (!cur) return; e.preventDefault();
    let evs = []; try { evs = e.getCoalescedEvents ? e.getCoalescedEvents() : []; } catch (er) { }
    for (const ev of evs.length ? evs : [e]) { const [x, y] = pos(ev); pts.push(x, y, 2.2); }
    cur.p = new Float32Array(pts); paint();
  });
  const up = () => { if (!cur) return; const s = cur; cur = null; s.p = new Float32Array(pts); HW.times.set(s, { t0, t1: Date.now() }); strokes.push(s); paint(); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  const clear = () => { strokes.length = 0; boxes = []; list.innerHTML = ''; paint(); };
  const row = (name, note) => { const t = h('div', { class: 'hctext' }, '…'), m = h('small', null, note || ''); const el = h('div', { class: 'hcrow' }, h('div', { class: 'hchead' }, h('b', null, name), m), t); list.append(el); return { t, m, el }; };
  const fmt = ms => (ms / 1000).toFixed(1).replace('.', ',') + ' sn';
  const run = async () => {
    if (busy) return; if (!strokes.length) { toast('Önce kalemle bir cümle yaz.', 1800); return; }
    busy = true; readBtn.disabled = true; list.innerHTML = '';
    const lines = splitLines(strokes.slice()), lh = medianLineH(lines), P = lines.map(l => l.strokes.map(strokePts)), area = { lineH: lh, pageW: W };
    const ink = handInkSize(lines, lh);
    // kelimelere nasıl bölündüğünü yazma alanında göster
    boxes = P.flatMap(ls => handWords(ls).map(w => w.reduce((b, st) => bbUnion(b, ptsBB(st)), null))); paint();
    const dev = (o, note) => () => handRecognizeLines(P, S.hand.lang, '', area, null, { deviceOnly: true, ...o }).then(r => { note.parts = r.parts; return r.corrected; });
    const nW = {}, nP = {};
    const jobs = [
      ['Cihaz · tüm satır', 'ML Kit, her satır bir kerede', dev({ seg: 'line' }, {})],
      ['Cihaz · kelime kelime', 'sırayla; her kelimeye önceki kelimeler bağlam olarak verilir', dev({ seg: 'word' }, nW), nW],
      ['Cihaz · kelime kelime, paralel', 'aynı anda; bağlam yok', dev({ seg: 'word', parallel: true }, nP), nP],
      ['Gemma 4 · tablette', 'internetsiz', null]
    ];
    const GI = 3;
    if (S.hand.engine === 'cloud' && aiReady()) jobs.push([handModelName() + ' · bulut', 'internet', () => handAiRead(P.flat(), { lines: lines.length, maxLen: ink.maxLen })]);
    const rs = jobs.map(j => row(j[0], j[1]));
    for (let i = 0; i < jobs.length; i++) {
      const R = rs[i], t1 = performance.now();
      R.t.textContent = 'okuyor…'; R.el.classList.add('busy');
      try {
        let text;
        if (i === GI) {
          if (!handLocalReady()) throw new Error('Model indirilmedi (yukarıdaki Ayarlar’dan indir)');
          const info = {};
          if (HW.local && HW.local.state !== 'loaded') R.t.textContent = 'model belleğe yükleniyor…';
          text = await handLocalRead(P.flat(), { lines: lines.length, maxLen: ink.maxLen, rows: handRows(P, lh), info });
          R.m.textContent = fmt(info.ms || performance.now() - t1) + (info.loadMs ? ' · ilk okuma, model yüklemesi ' + fmt(info.loadMs) : '') + (info.backend ? ' · ' + (info.backend === 'CPU' ? 'işlemci' : 'grafik işlemcisi') : '');
        } else {
          text = await jobs[i][2]();
          R.m.textContent = fmt(performance.now() - t1) + (jobs[i][3] && jobs[i][3].parts ? ' · ' + jobs[i][3].parts + ' kelime' : '');
        }
        R.t.textContent = text || '(boş)';
      } catch (e) { R.t.textContent = e.message || 'Okunamadı'; R.el.classList.add('fail'); R.m.textContent = ''; }
      R.el.classList.remove('busy');
    }
    busy = false; readBtn.disabled = false;
  };
  const readBtn = h('button', { class: 'btn primary', type: 'button', onclick: run }, icon(IC.fixText), 'Oku ve karşılaştır');
  const body = h('div', { class: 'col hcwrap' },
    cv,
    h('div', { class: 'sbtns' }, h('button', { class: 'btn', type: 'button', onclick: clear }, icon(IC.trash), 'Temizle'), readBtn),
    list,
    h('p', { class: 'notice' }, 'Yazılan hiçbir şey kaydedilmez. Kesik çizgili çerçeveler kelimelerin nereden ayrıldığını gösterir. Sıra: cihazdaki tanıma (tüm satır, kelime kelime, kelime kelime paralel), sonra Gemma. İlk Gemma okuması modelin belleğe yüklenmesini de içerir.'));
  modal({ title: 'El yazısı okumayı karşılaştır', body, wide: true, actions: [{ label: 'Kapat' }] });
  requestAnimationFrame(size);
}
window.handCompare = handCompare;

/* seçim çubuğu düğmeleri */
(() => {
  const sh = $('#sHand'), ss = $('#sSmall'), sb = $('#sBig'), sa = $('#sAlign');
  if (sa) { sa.prepend(icon(IC.fixText)); sa.addEventListener('click', selAlignFix); }
  if (sh) { sh.prepend(icon(IC.fixText)); sh.addEventListener('click', selToText); }
  if (ss) { ss.append(icon(IC.aSmall)); ss.addEventListener('click', () => scaleSelBy(1 / 1.15)); }
  if (sb) { sb.append(icon(IC.aBig)); sb.addEventListener('click', () => scaleSelBy(1.15)); }
})();
