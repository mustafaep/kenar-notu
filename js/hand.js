'use strict';
/* =========================================================
   El yazısını düzelt
   Kalemle yazılan satırları metne çevirir ve yazım hatalarını düzeltir.
   - Android: cihazda ML Kit el yazısı tanıma (Türkçe + İngilizce, aynı anda) ve sistemin yazım denetleyicisi
     (HandwritingCorrector.java); modeller bir kez indirildikten sonra internetsiz çalışır.
   - Web / yedek: bağlı yapay zekâ (Gemini ya da Claude) görüntüden okur ve düzeltir.
   - Gelişmiş okuma (varsayılan, internet gerekir): cihazdaki sonuç hemen yazılır; aynı anda gelişmiş model (Gemini 3.8 Flash
     ya da hızlısı Flash-Lite; Claude'da Sonnet / Haiku) el yazısının görüntüsünü baştan okur ve 1–3 sn içinde o parçayı günceller.
     Cihazdaki ML Kit modeli kısa yazıda iyi, uzun cümlede zayıf; Gemini Nano Galaxy Tab S11'de yok, bu yüzden gelişmiş okuma buluttadır.
   Mod: Kapalı · Düğmeyle (yazınca “Düzelt” düğmesi çıkar; köşesindeki çarpı düğmeyi kapatır) · Otomatik (durunca kendisi düzeltir)
   Hangi belgede: ana belge, yan yana açılan yan belge ya da ikisi (kalem panelinden ve Ayarlar'dan).
   Alt satıra geçen yazı aynı paragrafta kalır; bir metnin yanına/altına yazılan devam, o metne eklenir.
   ========================================================= */
const HW = { group: null, pend: [], timer: 0, chip: null, bar: null, last: null, reqs: new Map(), status: null, seq: 0, times: new WeakMap(), busy: 0 };
const HW_NATIVE = () => !!(window.KenarNative && window.KenarNative.inkRecognize);
const HW_TR = /[çğıöşüÇĞİÖŞÜ]/;
if (S.hand.grammar && S.hand.ai === 'off') { S.hand.ai = 'always'; S.hand.grammar = false; saveSettings(); }
// 2.6.0: gelişmiş okuma varsayılan olarak açılır (bir kez; sonra kullanıcının seçimi korunur)
if (!S.hand.mig) { S.hand.mig = 1; if (S.hand.ai === 'off') S.hand.ai = 'always'; saveSettings(); }
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

function handModelsReady() { const s = HW.status; return !!(s && (s.tr === 'ready' || s.en === 'ready')); }
function handCheckModels() { if (HW_NATIVE()) try { KenarNative.inkCheck(); } catch (e) { } }
const cleanAi = t => (t || '').replace(/^\s*(düzeltilmiş metin\s*:)?\s*/i, '').replace(/^["“”'«»]+|["“”'«»]+$/g, '').trim();
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
    const id = 'ink' + (++HW.seq);
    const to = setTimeout(() => { HW.reqs.delete(id); rej(Object.assign(new Error('Tanıma zaman aşımına uğradı'), { code: 'timeout' })); }, 15000);
    HW.reqs.set(id, r => { clearTimeout(to); if (r.ok) res({ ...r, via: 'device' }); else rej(Object.assign(new Error(r.error === 'nomodel' ? 'El yazısı modelleri henüz indirilmedi' : r.error || 'Tanınamadı'), { code: r.error })); });
    try { KenarNative.inkRecognize(JSON.stringify({ id, strokes: payload, mode, pre: (pre || '').slice(-60), w: W, h: H })); }
    catch (e) { clearTimeout(to); HW.reqs.delete(id); rej(e); }
  });
}
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
/* Gelişmiş okuma: model görüntüyü baştan okur (cihazın okuması verilmez; uzun cümlede çoğu zaman yanlış olduğu için yanıltır).
   before: önceki metin (devam yazısı için bağlam) · maxLen: el yazısının genişliğine göre en uzun makul metin */
async function handAiRead(strokes, { mode = S.hand.lang, before = '', lines = 1, maxLen = 0 } = {}) {
  const hint = mode === 'tr' ? '\n- Metin Türkçe.' : mode === 'en' ? '\n- Metin İngilizce.' : '';
  const ask = [];
  if (before && before.trim()) ask.push('Önceki metin (yalnızca bağlam; bunu tekrar yazma): «' + before.trim().slice(-240) + '»');
  if (lines > 1) ask.push('Yazı ' + lines + ' satır; hepsini sırayla oku.');
  ask.push('El yazısının metni:');
  const { text } = await aiStream({ tag: 'hand', ...handAiOpts(), system: HAND_READ_SYSTEM + hint, messages: [{ role: 'user', content: [{ type: 'image', mime: 'image/png', data: handImage(strokes) }, { type: 'text', text: ask.join('\n') }] }], maxTokens: 2048 });
  const t = cleanAi(text).replace(/\s*\n+\s*/g, ' ');
  if (!t) throw new Error('Yazı okunamadı');
  if (maxLen && t.length > maxLen) throw new Error('sonuç yazının uzunluğuyla uyuşmadı');
  return t;
}
/* el yazısının kapladığı genişliğe göre: uzun mu, en fazla kaç harf olabilir */
function handInkSize(lines, lh) {
  const w = lines.reduce((a, l) => a + (l.bb.x1 - l.bb.x0), 0), k = w / Math.max(8, lh);
  return { long: lines.length > 1 || k >= 14, maxLen: Math.round(k * 3.5 + 40) };
}
async function handAi(strokes, mode, pre = '', lines = 1) {
  if (!aiReady()) throw Object.assign(new Error('Bu cihazda el yazısı tanıma yok; yapay zekâyı bağlayın'), { code: 'nokey' });
  const t = await handAiRead(strokes, { mode, before: pre, lines });
  return { ok: true, lang: mode === 'tr' || mode === 'en' ? mode : HW_TR.test(t) ? 'tr' : 'en', text: t, corrected: t, kept: [], via: 'ai' };
}
/* Yalnızca metin (birleştirilmiş parçalar, el yazısı yok): bölünmüş kelimeleri birleştir, en az değişiklikle düzelt */
async function handAiText(r) {
  const { text } = await aiStream({ tag: 'hand', ...handAiOpts(), system: MERGE_FIX_SYSTEM, messages: [{ role: 'user', content: (r.text || r.corrected) + (r.corrected && r.corrected !== r.text ? '\n\n(Yazım denetleyicisinin önerisi: ' + r.corrected + ')' : '') }], maxTokens: 2048 });
  const t = cleanAi(text); return t && t.length < (r.corrected || '').length * 1.8 + 40 ? t : null;
}
/* Satırlar sırayla tanınır; her satıra öncesindeki metin bağlam olarak verilir. Olmazsa yapay zekâ. */
async function handRecognizeLines(lineStrokes, mode = S.hand.lang, pre = '', area = null, aiP = null) {
  const all = lineStrokes.flat();
  const viaAi = async () => { const t = await aiP; return { ok: true, lang: mode === 'tr' || mode === 'en' ? mode : HW_TR.test(t) ? 'tr' : 'en', text: t, corrected: t, kept: [], via: 'ai' }; };
  if (HW_NATIVE()) {
    try {
      const outs = []; let ctx = pre || '';
      for (const ls of lineStrokes) { const r = await handNative(ls, mode, ctx, area); outs.push(r); ctx = (ctx ? ctx + ' ' : '') + r.corrected; }
      const langs = outs.map(o => o.lang);
      return { ok: true, via: 'device', lang: langs.filter(l => l === 'tr').length > langs.length / 2 ? 'tr' : langs[0],
        text: outs.map(o => o.text).join(' '), corrected: outs.map(o => o.corrected).join(' '),
        kept: outs.flatMap(o => o.kept || []), alts: outs.length === 1 ? outs[0].alts || [] : [] };
    } catch (e) {
      if (e.code === 'nomodel') { handCheckModels(); if (!aiReady()) throw Object.assign(new Error('El yazısı modelleri indiriliyor (yaklaşık 40 MB). Birkaç dakika sonra tekrar deneyin.'), { code: 'nomodel' }); }
      else if (!aiReady()) throw e;
      if (aiP) return viaAi(); // gelişmiş okuma zaten yolda
      return handAi(all, mode, pre, lineStrokes.length);
    }
  }
  if (aiP) return viaAi();
  return handAi(all, mode, pre, lineStrokes.length);
}
async function handRecognize(strokes, mode = S.hand.lang, pre = '', area = null) { return handRecognizeLines([strokes], mode, pre, area); }
/* Yalnızca metnin yazım düzeltmesi (cihazda) */
function handNativeText(text, mode) {
  return new Promise((res, rej) => {
    if (!(window.KenarNative && KenarNative.inkCorrectText)) { rej(new Error('yok')); return; }
    const id = 'txt' + (++HW.seq);
    const to = setTimeout(() => { HW.reqs.delete(id); rej(new Error('Zaman aşımı')); }, 10000);
    HW.reqs.set(id, r => { clearTimeout(to); r.ok ? res({ ...r, via: 'device' }) : rej(new Error(r.error || 'Düzeltilemedi')); });
    try { KenarNative.inkCorrectText(JSON.stringify({ id, text, mode })); } catch (e) { clearTimeout(to); HW.reqs.delete(id); rej(e); }
  });
}
const MERGE_FIX_SYSTEM = 'Aşağıdaki metin bir kişinin el yazısından tanınıp parça parça birleştirildi. Bölünmüş kelimeleri birleştir; tanıma, yazım ve bariz dil bilgisi hatalarını en az değişiklikle düzelt. Metin Türkçe, İngilizce ya da karışık olabilir: her kelimeyi kendi dilinde bırak; çevirme, yeniden yazma, anlamı değiştirme. Satır sonlarını (paragrafları) koru. Yalnızca düzeltilmiş metni yaz; açıklama ya da tırnak ekleme.';
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
function splitLines(strokes) {
  const items = strokes.map(s => ({ s, bb: strokeBB(s) })).sort((a, b) => (a.bb.y0 + a.bb.y1) - (b.bb.y0 + b.bb.y1));
  const lines = [];
  for (const it of items) {
    const L = lines.find(l => sameLine(l, it.bb));
    if (L) { L.strokes.push(it.s); L.bb = bbUnion(L.bb, it.bb); if (it.bb.y1 - it.bb.y0 > L.lineH * .6) L.lineH = Math.max(L.lineH, it.bb.y1 - it.bb.y0); }
    else lines.push({ strokes: [it.s], bb: { ...it.bb }, lineH: Math.max(12, it.bb.y1 - it.bb.y0) });
  }
  lines.sort((a, b) => a.bb.y0 - b.bb.y0);
  for (const l of lines) l.strokes.sort((a, b) => strokeBB(a).x0 - strokeBB(b).x0);
  return lines;
}
function medianLineH(lines) { const a = lines.map(l => l.bb.y1 - l.bb.y0).sort((x, y) => x - y); return Math.max(10, a[a.length >> 1] || 14); }

/* Hangi belgede çalışır: ana belge, yan yana açılan yan belge ya da ikisi */
const handHere = () => { const w = S.hand.where || 'both'; return w === 'both' || (w === 'side' ? EMBED : !EMBED); };
/* iki belgedeki bekleyen düğmeleri ve çubukları birlikte temizle */
function handResetAll() {
  handReset();
  try { if (EMBED) { if (parent.handReset) parent.handReset(); } else { const w = typeof sideWin === 'function' && sideWin(); if (w && w.handReset) w.handReset(); } } catch (e) { }
}
window.handPenDown = () => { clearTimeout(HW.timer); };
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
    HW.timer = setTimeout(() => { const gg = HW.group; HW.group = null; if (gg) runGroup(gg, true); }, nearEdge ? 3000 : 1500);
  } else HW.timer = setTimeout(showHandChip, 650);
};

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
    const mode = S.hand.ai || 'off', useAi = HW_NATIVE() && aiReady() && navigator.onLine && (mode === 'always' || (mode === 'long' && ink.long));
    const aiAt = Date.now(), aiP = useAi ? handAiRead(pts.flat(), { before, lines: lines.length, maxLen: ink.maxLen }) : null;
    if (aiP) aiP.catch(() => { });
    const r = await handRecognizeLines(pts, S.hand.lang, before, { lineH: lh, pageW: g.pv.meta.w }, aiP);
    if (auto && r.corrected.replace(/\s/g, '').length < 2) return;
    applyHandResult(g.pv, live, r, { cont, lines, lh, aiP: r.via === 'ai' ? null : aiP, aiAt, maxLen: ink.maxLen, long: ink.long });
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
  maybeAiImprove(HW.last, info.aiP, info.aiAt);
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
async function maybeAiImprove(L, aiP, at) {
  if (!L) return;
  const mode = S.hand.ai || 'off';
  if (!aiP) {
    if (mode === 'off' || (L.r.via !== 'device' && L.r.via !== 'merge') || !aiReady() || !navigator.onLine) return;
    if (L.lines && L.lines.length) {
      if (mode === 'long' && !L.long && wordCount(L.seg) < 6) return;
      aiP = handAiRead(L.lines.flat().map(strokePts), { mode: L.mode, before: L.prefix, lines: L.lines.length, maxLen: Math.max(L.maxLen, L.seg.length * 1.8 + 30) });
    } else {
      if (mode === 'long' && wordCount(L.r.corrected) < 6) return;
      aiP = handAiText(L.r);
    }
    at = Date.now();
  }
  L.ai = 'busy'; L.aiModel = handModelInfo().short; if (HW.last === L && HW.bar) showHandBar();
  let imp = null;
  try { imp = await aiP; } catch (e) { L.ai = 'fail'; L.aiErr = e && e.message; }
  L.aiMs = Date.now() - (at || Date.now());
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
  const sec = L.aiMs ? ' · ' + (L.aiMs / 1000).toFixed(1).replace('.', ',') + ' sn' : '';
  const info = L.ai === 'busy' ? (L.aiModel || 'Gelişmiş model') + ' okuyor…' : L.ai === 'done' ? (L.aiModel || 'Gelişmiş model') + ' düzeltti' + sec + (L.prefix ? ' · metnin devamına eklendi' : '')
    : L.ai === 'same' ? (L.aiModel || 'Gelişmiş model') + ' de aynı okudu' + sec : L.ai === 'fail' ? 'Gelişmiş okuma olmadı' + (L.aiErr ? ': ' + L.aiErr : '') + '; cihazdaki sonuç kaldı' : L.ai === 'edited' ? 'Metni değiştirdiğin için gelişmiş okuma uygulanmadı'
    : r.kept && r.kept.length ? 'Korundu: ' + r.kept.join(', ') : r.text && r.text !== r.corrected ? 'Düzeltildi: ' + r.text
    : L.prefix ? 'Metnin devamına eklendi' : r.via === 'merge' ? 'Parçalar birleştirildi ve hizalandı' : r.via === 'ai' ? handModelInfo().short + ' ile okundu' : 'Yazım hatası yok';
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
    const letter = /[\p{L}\p{N}]/u;
    let text = '', prevRow = null;
    for (const row of rows) {
      row.items.sort((a, b) => a.bb.x0 - b.bb.x0);
      let line = '', prev = null;
      for (const it of row.items) {
        if (!it.text) continue;
        if (!prev) line = it.text;
        else { const gap = it.bb.x0 - prev.bb.x1, fs = Math.min(prev.size || 14, it.size || 14); line += (gap < fs * .3 && letter.test(line.slice(-1)) && letter.test(it.text[0]) ? '' : ' ') + it.text; } // çok yakınsa bölünmüş kelime: bitişik
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
function handAiNote() {
  const aiNote = h('p', { class: 'notice' });
  const showAi = () => {
    const mode = S.hand.ai || 'off';
    if (mode === 'off') { aiNote.textContent = 'Yalnızca cihazdaki tanıma ve yazım denetimi kullanılır (internetsiz, anında). Kısa yazılarda iyidir; uzun cümlelerde hata yapabilir.'; return; }
    const k = handCost(), cost = k && window.uzUsd ? ' Düzeltme başına ' + (k.real ? 'ortalama ' : '≈ ') + uzUsd(k.usd) + ' (100 düzeltme ≈ ' + uzUsd(k.usd * 100) + ')' + (S.usage && S.usage.gFree && aiCfg().provider === 'gemini' ? '; ücretsiz katmanda ödenmez' : '') + '.' : '';
    const head = HW_NATIVE() ? 'Önce cihazdaki sonuç anında yazılır; aynı anda ' + handModelName() + ' el yazısının görüntüsünü baştan okur ve genellikle 1–3 saniyede metni günceller' + (mode === 'long' ? ' (birden çok satır ya da yaklaşık 6 kelimeden uzun yazılarda)' : '') + '. İnternet gerekir; bağlantı yoksa cihazdaki sonuç kalır.'
      : 'Bu tarayıcıda cihazda tanıma yok; el yazısını ' + handModelName() + ' okur (internet gerekir).';
    aiNote.textContent = head + cost + (aiReady() ? '' : ' Önce yapay zekâyı bağlayın (Ayarlar → Yapay zekâ).');
  };
  showAi(); aiNote._show = showAi;
  return aiNote;
}
const handModelSub = () => { const c = aiCfg(), M = HAND_MODELS[c.provider === 'gemini' ? 'gemini' : 'claude']; return 'En doğru: ' + M.best.name + ' · En hızlı: ' + M.fast.name; };
function handSettingsRows() {
  const st = handStatusNote(), showSt = st._show, aiNote = handAiNote(), showAi = aiNote._show;
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
    h('small', { class: 'segcap' }, 'Gelişmiş okuma (yapay zekâ)'),
    segRow([['off', 'Yalnız cihaz'], ['long', 'Uzun yazılarda'], ['always', 'Her zaman']], S.hand.ai || 'off', v => { S.hand.ai = v; saveSettings(); showAi(); }),
    h('small', { class: 'segcap' }, 'Gelişmiş model'),
    segRow([['best', 'En doğru'], ['fast', 'En hızlı']], S.hand.model === 'fast' ? 'fast' : 'best', v => { S.hand.model = v; saveSettings(); showAi(); }),
    aiNote,
    st);
  return rows;
}
/* Ayarlar ekranı için */
function handSettingsGroups() {
  const st = handStatusNote(), showSt = st._show, aiNote = handAiNote(), showAi = aiNote._show;
  st.className = 'sfoot handst'; aiNote.className = 'sfoot';
  return [
    sGroup('Mod', [
      sRow('El yazısını düzelt', 'Kalemle yazdığın satırlar metne çevrilir, yazım hataları düzeltilir', segRow([['off', 'Kapalı'], ['button', 'Düğmeyle'], ['auto', 'Otomatik']], S.hand.mode, v => { S.hand.mode = v; saveSettings(); handResetAll(); if (v !== 'off' && HW_NATIVE()) { const s = HW.status || {}; if (s.tr !== 'ready' || s.en !== 'ready') try { KenarNative.inkPrepare(); } catch (e) { } } showSt(); }), true),
      sRow('Hangi belgede çalışsın', 'Ana belge: soldaki (ya da tek açık) belge · Yan belge: “Yan yana belge” ile açılan ikinci belge', handWhereSeg(), true),
      sRow('Dil', null, segRow([['auto', 'Otomatik'], ['tr', 'Türkçe'], ['en', 'İngilizce']], S.hand.lang, v => { S.hand.lang = v; saveSettings(); }), true)
    ], st),
    sGroup('Düzeltilen metin', [
      sRow('Yazı tipi', S.hand.style ? 'Seçili kalem stili kullanılıyor: ' + S.hand.style.name : null, segRow([['hand', 'El yazısı'], ['kalam', 'Kalam'], ['sans', 'Yalın'], ['serif', 'Tırnaklı']], S.hand.font, v => { S.hand.font = v; saveSettings(); }), true),
      rangeRow('sHScale', 'Metin boyutu', 50, 200, 5, S.hand.scale, v => '%' + Math.round(v), v => { S.hand.scale = v; saveSettings(); }),
      toggleRow('sHCont', 'Metnin devamına ekle', S.hand.cont !== false, v => { S.hand.cont = v; saveSettings(); showSt(); }, 'Düzeltilmiş bir metnin yanına ya da altına yazdığın devam, ayrı kutu olmadan o metnin arkasına eklenir'),
      toggleRow('sScratch', 'Karalayarak sil', S.feel.scratch !== false, v => { S.feel.scratch = v; saveSettings(); }, 'Yazının üzerini zikzakla karalayınca silinir')
    ]),
    sGroup('Gelişmiş okuma', [
      sRow('Ne zaman', 'Cihazdaki model kısa yazılarda iyi, uzun cümlelerde zayıf. Gelişmiş model el yazısının görüntüsünü baştan okur.', segRow([['off', 'Yalnız cihaz'], ['long', 'Uzun yazılarda'], ['always', 'Her zaman']], S.hand.ai || 'off', v => { S.hand.ai = v; saveSettings(); showAi(); }), true),
      sRow('Model', handModelSub(), segRow([['best', 'En doğru'], ['fast', 'En hızlı']], S.hand.model === 'fast' ? 'fast' : 'best', v => { S.hand.model = v; saveSettings(); showAi(); }), true)
    ], aiNote)
  ];
}

/* seçim çubuğu düğmeleri */
(() => {
  const sh = $('#sHand'), ss = $('#sSmall'), sb = $('#sBig'), sa = $('#sAlign');
  if (sa) { sa.prepend(icon(IC.fixText)); sa.addEventListener('click', selAlignFix); }
  if (sh) { sh.prepend(icon(IC.fixText)); sh.addEventListener('click', selToText); }
  if (ss) { ss.append(icon(IC.aSmall)); ss.addEventListener('click', () => scaleSelBy(1 / 1.15)); }
  if (sb) { sb.append(icon(IC.aBig)); sb.addEventListener('click', () => scaleSelBy(1.15)); }
})();
