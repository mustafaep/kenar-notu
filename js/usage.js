'use strict';
/* =========================================================
   Harcama: yapay zekâ isteklerinin token sayıları ve tahmini maliyeti
   Her yanıtın gerçek token sayısı (Gemini usageMetadata, Claude usage) gün gün bu cihazda tutulur (kn.usage).
   Maliyet, istek anındaki liste fiyatıyla hesaplanır (USD / 1 milyon token; Gemini'de düşünme tokenları yanıta dahil).
   Ayarlar → Harcama: bugün / bu ay / toplam, günlük ya da aylık sütun grafiği, işleve ve modele göre dağılım.
   ========================================================= */
const UZ_KEY = 'kn.usage', UZ_KEEP = 800;
// [model, geçerli olduğu ilk gün ('' = her zaman), gönderilen $/1M, yanıt $/1M]
const UZ_PRICES = [
  ['gemini-3.8-flash', '2027-01-01', 1.50, 7.50],
  ['gemini-3.8-flash', '', 0.75, 3.75],
  ['gemini-3.5-flash-lite', '', 0.30, 2.50],
  ['claude-sonnet-5-5', '', 2, 10],
  ['claude-haiku-5-5', '', 0.10, 0.50]
];
const UZ_PRICES_ASOF = '3 Kasım 2026';
const UZ_NAMES = { 'gemini-3.8-flash': 'Gemini 3.8 Flash', 'gemini-3.5-flash-lite': 'Gemini 3.5 Flash-Lite', 'claude-sonnet-5-5': 'Claude Sonnet 5.5', 'claude-haiku-5-5': 'Claude Haiku 5.5' };
const UZ_TAGS = [['pagefix', 'Sayfayı düzelt'], ['sheet', 'Çalışma kağıdı'], ['hand', 'El yazısı'], ['dict', 'Sözlük, çeviri ve sohbet'], ['other', 'Diğer (bağlantı testi)']];
const UZ_MON = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
const UZ_MONL = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
const UZ_WD = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
const UZ_WDL = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
const UZ_MONFROM = ['Ocak’tan', 'Şubat’tan', 'Mart’tan', 'Nisan’dan', 'Mayıs’tan', 'Haziran’dan', 'Temmuz’dan', 'Ağustos’tan', 'Eylül’den', 'Ekim’den', 'Kasım’dan', 'Aralık’tan'];

/* ---------- kayıt ---------- */
const uzDay = (t = new Date()) => t.getFullYear() + '-' + String(t.getMonth() + 1).padStart(2, '0') + '-' + String(t.getDate()).padStart(2, '0');
const uzDate = k => { const [y, m, d] = k.split('-').map(Number); return new Date(y, m - 1, d); };
function uzLoad() {
  try { const j = JSON.parse(localStorage.getItem(UZ_KEY) || 'null'); if (j && j.d && typeof j.d === 'object') return j; } catch (e) { }
  return { v: 1, since: uzDay(), d: {} };
}
function uzSave(u) { try { localStorage.setItem(UZ_KEY, JSON.stringify(u)); } catch (e) { } }
function uzPrice(prov, model, day, inp) {
  let rows = UZ_PRICES.filter(p => p[0] === model), est = false;
  if (!rows.length) { rows = UZ_PRICES.filter(p => p[0] === (prov === 'gemini' ? 'gemini-3.8-flash' : 'claude-sonnet-5-5')); est = true; }
  const p = rows.find(p => !p[1] || p[1] <= day) || rows[rows.length - 1];
  if (model === 'claude-haiku-5-5' && inp > 100000) return { i: 0.5, o: 2.5, est };
  return { i: p[2], o: p[3], est };
}
/* her yanıttan sonra: ai.js çağırır; { prov, model, tag, inp, out, think, usd } döndürür */
function usageAdd({ prov, model, tag, inp, out, think }) {
  inp = Math.max(0, Math.round(inp || 0)); out = Math.max(0, Math.round(out || 0)); think = Math.max(0, Math.round(think || 0));
  if (!inp && !out) return null;
  const day = uzDay(), pr = uzPrice(prov, model, day, inp), usd = (inp * pr.i + out * pr.o) / 1e6;
  const t = UZ_TAGS.some(x => x[0] === tag) ? tag : 'other';
  const u = uzLoad(), D = u.d[day] || (u.d[day] = {}), k = prov + '|' + model + '|' + t;
  const r = D[k] || (D[k] = [0, 0, 0, 0, 0]);
  r[0]++; r[1] += inp; r[2] += out; r[3] += think; r[4] += usd;
  const days = Object.keys(u.d).sort(); while (days.length > UZ_KEEP) delete u.d[days.shift()];
  uzSave(u);
  try { window.dispatchEvent(new CustomEvent('kn-usage')); } catch (e) { }
  return { prov, model, inp, out, think, usd };
}
window.usageAdd = usageAdd;
const uzFree = () => !!(S.usage && S.usage.gFree);
/* bir işin harcaması: { usd (liste fiyatı), paid (ücretsiz katman düşülmüş) } */
function usageSum(list) {
  let usd = 0, paid = 0;
  for (const x of list || []) if (x) { usd += x.usd; if (!(uzFree() && x.prov === 'gemini')) paid += x.usd; }
  return { usd, paid };
}
window.usageSum = usageSum;

/* ---------- biçim ---------- */
const uzComma = s => s.replace('.', ',');
function uzUsd(v) {
  if (!v) return '0 $';
  if (v < 0.001) return '<0,001 $';
  return uzComma(v < 1 ? v.toFixed(3) : v < 100 ? v.toFixed(2) : v.toFixed(0)) + ' $';
}
window.uzUsd = uzUsd;
function uzTok(n) {
  if (n < 1000) return String(n);
  if (n < 1e6) return uzComma((n / 1000).toFixed(n < 10000 ? 1 : 0)) + ' bin';
  return uzComma((n / 1e6).toFixed(n < 1e7 ? 2 : 1)) + ' milyon';
}
const uzN = n => n.toLocaleString('tr-TR');
function uzNice(max) {
  if (!(max > 0)) return { step: 0.005, top: 0.01 };
  const raw = max / 4, mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map(k => k * mag).find(s => s >= raw);
  return { step, top: Math.ceil(max / step - 1e-9) * step };
}
function uzTick(v, step) {
  if (!v) return '0';
  let d = 0; while (d < 5 && Math.abs(step * Math.pow(10, d) - Math.round(step * Math.pow(10, d))) > 1e-7) d++;
  return uzComma(v.toFixed(d));
}

/* ---------- toplama ---------- */
function uzAgg(u, keys) {
  const s = { n: 0, inp: 0, out: 0, think: 0, usd: 0, paid: 0 };
  for (const k of keys) { const D = u.d[k]; if (!D) continue; for (const id in D) { const r = D[id]; s.n += r[0]; s.inp += r[1]; s.out += r[2]; s.think += r[3]; s.usd += r[4]; if (!(uzFree() && id.startsWith('gemini|'))) s.paid += r[4]; } }
  return s;
}
function uzBuckets(range) {
  const now = new Date(), out = [];
  if (range === '12m') {
    for (let k = 11; k >= 0; k--) {
      const m = new Date(now.getFullYear(), now.getMonth() - k, 1), last = new Date(m.getFullYear(), m.getMonth() + 1, 0).getDate(), keys = [];
      for (let d = 1; d <= last; d++) keys.push(uzDay(new Date(m.getFullYear(), m.getMonth(), d)));
      out.push({ keys, x: UZ_MON[m.getMonth()], full: UZ_MONL[m.getMonth()] + ' ' + m.getFullYear(), cur: k === 0 });
    }
    return out;
  }
  const n = range === '7d' ? 7 : 30;
  for (let k = n - 1; k >= 0; k--) {
    const t = new Date(now.getFullYear(), now.getMonth(), now.getDate() - k), key = uzDay(t);
    out.push({ keys: [key], x: n === 7 ? UZ_WD[t.getDay()] + ' ' + t.getDate() : String(t.getDate()), full: t.getDate() + ' ' + UZ_MONL[t.getMonth()] + ' ' + UZ_WDL[t.getDay()], cur: k === 0, i: n - 1 - k });
  }
  return out;
}

/* ---------- Ayarlar → Harcama ---------- */
function usageSettingsGroups() {
  const wrap = h('div', { class: 'uzwrap' });
  let table = false, resetArm = 0;
  const P = S.usage;
  const render = () => {
    const u = uzLoad(), range = ['7d', '30d', '12m'].includes(P.range) ? P.range : '30d';
    const all = Object.keys(u.d), today = uzDay(), now = new Date();
    const monthKeys = all.filter(k => k.startsWith(today.slice(0, 7)));
    const T = uzAgg(u, [today]), Mo = uzAgg(u, monthKeys), All = uzAgg(u, all);
    wrap.innerHTML = '';
    // özet kutuları (sabit dönemler)
    const tile = (lab, s) => h('div', { class: 'uztile' }, h('span', { class: 'lab' }, lab), h('b', null, uzUsd(s.usd)),
      h('small', null, uzN(s.n) + ' istek' + (uzFree() && s.paid < s.usd ? ' · ödediğin ' + uzUsd(s.paid) : '')));
    const since = uzDate(u.since || today);
    wrap.append(h('div', { class: 'uztiles' }, tile('Bugün', T), tile(UZ_MONL[now.getMonth()] + ' ayı', Mo), tile('Toplam · ' + since.getDate() + ' ' + UZ_MONFROM[since.getMonth()] + ' beri', All)));
    if (!All.n) wrap.append(h('p', { class: 'notice uzempty' }, 'Henüz kayıt yok. Sayfayı düzelt, el yazısı, sözlük gibi yapay zekâ özellikleri kullanıldıkça harcama burada görünür. Kayıt bu sürümle başladı; önceki kullanım burada yok.'));
    // dönem seçimi: altındaki her şey bu döneme göre
    const B = uzBuckets(range), vals = B.map(b => uzAgg(u, b.keys)), per = uzAgg(u, B.flatMap(b => b.keys));
    const seg = segRow([['7d', 'Son 7 gün'], ['30d', 'Son 30 gün'], ['12m', 'Son 12 ay']], range, v => { P.range = v; saveSettings(); render(); }, 'Dönem');
    const tBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { table = !table; render(); } }, icon(table ? IC.chart : IC.notes), table ? 'Grafik' : 'Tablo');
    const head = h('div', { class: 'uzhead' }, h('div', { class: 'tt' }, h('b', null, (range === '12m' ? 'Aylık' : 'Günlük') + ' harcama'),
      h('small', null, 'Bu dönem ' + uzUsd(per.usd) + ' · ' + uzN(per.n) + ' istek' + (uzFree() && per.paid < per.usd ? ' · ödediğin ' + uzUsd(per.paid) : ''))), tBtn);
    const card = h('div', { class: 'uzcard' }, head, table ? uzTable(B, vals) : uzChart(B, vals, range));
    wrap.append(h('div', { class: 'uzfilter' }, seg), sGroup(null, [card]));
    // işleve göre
    const keys = B.flatMap(b => b.keys), byTag = new Map(UZ_TAGS.map(([t, l]) => [t, { t, l, n: 0, usd: 0, tok: 0 }]));
    const byModel = new Map();
    for (const k of keys) { const D = u.d[k]; if (!D) continue; for (const id in D) {
      const [prov, model, tag] = id.split('|'), r = D[id], a = byTag.get(tag) || byTag.get('other');
      a.n += r[0]; a.usd += r[4]; a.tok += r[1] + r[2];
      const m = byModel.get(model) || { prov, model, n: 0, inp: 0, out: 0, think: 0, usd: 0 }; m.n += r[0]; m.inp += r[1]; m.out += r[2]; m.think += r[3]; m.usd += r[4]; byModel.set(model, m);
    } }
    const tags = [...byTag.values()].filter(a => a.n).sort((a, b) => b.usd - a.usd || b.n - a.n);
    if (tags.length) {
      const mx = Math.max(...tags.map(a => a.usd)) || 1;
      wrap.append(sGroup('Nereye harcandı', tags.map(a => h('div', { class: 'uzrank' },
        h('div', { class: 'uzrl' }, h('span', null, a.l), h('b', null, uzUsd(a.usd))),
        h('div', { class: 'uztrack' }, h('i', { style: { width: Math.max(a.usd > 0 ? 1.5 : 0, a.usd / mx * 100) + '%' } })),
        h('small', null, uzN(a.n) + ' istek · ' + uzTok(a.tok) + ' token' + (a.n ? ' · istek başına ≈ ' + uzUsd(a.usd / a.n) : ''))))));
    }
    const models = [...byModel.values()].sort((a, b) => b.usd - a.usd);
    if (models.length) wrap.append(sGroup('Modeller', models.map(m => sRow(UZ_NAMES[m.model] || m.model,
      uzN(m.n) + ' istek · gönderilen ' + uzTok(m.inp) + ' · yanıt ' + uzTok(m.out) + ' token' + (m.think ? ' (düşünme payı %' + Math.round(m.think / Math.max(1, m.out) * 100) + ')' : '') + (uzFree() && m.prov === 'gemini' ? ' · ücretsiz katman' : ''),
      h('b', { class: 'uzval' }, uzUsd(m.usd))))));
    // hesaplama
    const resetBtn = h('button', { class: 'btn small' + (resetArm ? ' danger' : ''), type: 'button', onclick: () => {
      if (!resetArm) { resetArm = setTimeout(() => { resetArm = 0; if (resetBtn.isConnected) render(); }, 4000); render(); return; }
      clearTimeout(resetArm); resetArm = 0; try { localStorage.removeItem(UZ_KEY); } catch (e) { } toast('Harcama kaydı sıfırlandı', 1600); render();
    } }, icon(IC.trash), resetArm ? 'Emin misin? Sıfırla' : 'Kaydı sıfırla');
    wrap.append(sGroup('Hesaplama', [
      toggleRow('uzFree', 'Gemini anahtarım ücretsiz katmanda', uzFree(), v => { P.gFree = v; saveSettings(); render(); }, 'AI Studio’da faturalandırma açık değilse Gemini istekleri için ödeme yapmazsın; tutarlar yine liste fiyatıyla gösterilir, “ödediğin” ayrıca yazılır'),
      h('div', { class: 'srow stack uzprices' }, h('div', { class: 'stext' }, h('b', null, 'Fiyatlar (1 milyon token için)'),
        ...UZ_PRICES.map(p => h('small', null, (UZ_NAMES[p[0]] || p[0]) + (p[1] ? ' · ' + uzDate(p[1]).getDate() + ' ' + UZ_MONL[uzDate(p[1]).getMonth()] + ' ' + p[1].slice(0, 4) + '’den itibaren' : p[0] === 'gemini-3.8-flash' ? ' · 31 Aralık 2026’ya kadar' : '') + ': gönderilen ' + uzComma(p[2].toFixed(2)) + ' $ · yanıt ' + uzComma(p[3].toFixed(2)) + ' $')))),
      h('div', { class: 'sbtns' }, resetBtn)
    ], 'Tahmindir: token sayıları her yanıtla gelen gerçek sayılardır, tutar istek anındaki liste fiyatıyla hesaplanır (fiyatlar ' + UZ_PRICES_ASOF + ' itibarıyla). Gemini’de modelin düşünme payı yanıta dahildir. Kayıt yalnızca bu cihazda tutulur. Kesin fatura için Google AI Studio ve Claude Console’a bakın.'));
  };
  render();
  return [wrap];
}
window.usageSettingsGroups = usageSettingsGroups;

/* sütun grafiği: tek seri (tutar), dokununca / üzerine gelince değer */
function uzChart(B, vals, range) {
  const max = Math.max(0, ...vals.map(v => v.usd)), { step, top } = uzNice(max);
  const plot = h('div', { class: 'uzplot' }), bars = h('div', { class: 'uzbars' }), xs = h('div', { class: 'uzx' }), tip = h('div', { class: 'uztip', hidden: true });
  for (let v = 0; v <= top + 1e-9; v += step) plot.append(h('div', { class: 'uzgrid' + (v ? '' : ' base'), style: { bottom: (v / top * 100) + '%' } }, h('span', null, uzTick(v, step) + (v ? '' : ' $'))));
  const mi = max > 0 ? vals.findIndex(v => v.usd === max) : -1;
  let pinned = -1;
  const show = (i, col) => {
    const b = B[i], v = vals[i];
    tip.innerHTML = ''; tip.append(h('b', null, uzUsd(v.usd)), h('span', null, b.full + ' · ' + uzN(v.n) + ' istek'));
    tip.hidden = false;
    const pr = plot.getBoundingClientRect(), cr = col.getBoundingClientRect();
    const x = cr.left + cr.width / 2 - pr.left, w = tip.offsetWidth;
    tip.style.left = Math.max(0, Math.min(pr.width - w, x - w / 2)) + 'px';
    [...bars.children].forEach((c, k) => c.classList.toggle('hot', k === i));
  };
  const hide = () => { tip.hidden = true; [...bars.children].forEach(c => c.classList.remove('hot')); };
  B.forEach((b, i) => {
    const v = vals[i], pct = top ? v.usd / top * 100 : 0;
    const col = h('div', { class: 'uzcol' + (b.cur ? ' cur' : ''), tabindex: '0', role: 'img', 'aria-label': b.full + ': ' + uzUsd(v.usd) + ', ' + v.n + ' istek' },
      h('i', { class: 'uzbar', style: { height: (v.usd > 0 ? Math.max(1.5, pct) : 0) + '%' } }),
      i === mi ? h('span', { class: 'uzlab' + (i >= B.length - 2 ? ' end' : i <= 1 ? ' start' : ''), style: { bottom: 'calc(' + pct + '% + 4px)' } }, uzUsd(v.usd)) : null);
    col.addEventListener('pointerenter', e => { if (e.pointerType === 'mouse') show(i, col); });
    col.addEventListener('pointerleave', e => { if (e.pointerType === 'mouse' && pinned < 0) hide(); });
    col.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse') { if (pinned === i) { pinned = -1; hide(); } else { pinned = i; show(i, col); } } });
    col.addEventListener('focus', () => show(i, col));
    col.addEventListener('blur', () => { if (pinned < 0) hide(); });
    bars.append(col);
    const lab = range === '30d' ? (b.i % 5 === 0 || b.cur ? b.x : '') : b.x;
    xs.append(h('span', { class: b.cur ? 'cur' : '' }, lab));
  });
  plot.append(bars, tip);
  return h('div', { class: 'uzchart' + (B.length > 12 ? ' dense' : '') }, plot, xs);
}
function uzTable(B, vals) {
  const rows = B.map((b, i) => ({ b, v: vals[i] })).filter(r => r.v.n).reverse();
  if (!rows.length) return h('p', { class: 'notice' }, 'Bu dönemde yapay zekâ isteği yok.');
  return h('table', { class: 'uztable' },
    h('thead', null, h('tr', null, h('th', null, 'Tarih'), h('th', null, 'İstek'), h('th', null, 'Token'), h('th', null, 'Tutar'))),
    h('tbody', null, ...rows.map(({ b, v }) => h('tr', null, h('td', null, b.full), h('td', null, uzN(v.n)), h('td', null, uzTok(v.inp + v.out)), h('td', null, uzUsd(v.usd))))));
}
