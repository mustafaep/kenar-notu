'use strict';
/* =========================================================
   Kalem stilleri (3.2): takımlar (İngilizce / dil, Ders notu, Toplantı ve plan, Kendi stillerim),
   stil düzenleyici, sayfadaki metin kutularına stil uygulama ve metni düzenleme.
   ========================================================= */
const STYLE_PREFIXES = ['', '•', '–', '→', '▸', '★', '!', '?', '✓', '✗', '☐', '↳', '@', 'Örn.'];
const PREFIX_RE = new RegExp('^\\s*(?:' + STYLE_PREFIXES.filter(Boolean).map(p => p.replace(/[.?*+^$()[\]{}|\\]/g, '\\$&')).join('|') + ')\\s+');
const WT_OPTS = [['300', 'İnce'], ['400', 'Normal'], ['700', 'Kalın']];
const namedIn = set => S.fav.map((f, i) => [f, i]).filter(([f]) => f.name && f.text && styleSetOf(f) === set);

function styleSample(fv, max = 24) {
  const tx = fv.text || {};
  return h('span', { class: 'sample', style: { color: fv.color, fontFamily: FONTS[tx.font] || FONTS.sans, fontWeight: String(tx.wt || 400), fontSize: Math.min(max, Math.max(16, (tx.size || 13) * 1.15)) + 'px' } }, (tx.prefix ? tx.prefix + ' ' : '') + fv.name);
}
const styleMeta = fv => { const tx = fv.text || {}; return (FONT_LABEL[tx.font] || '') + (tx.wt >= 700 ? ' kalın' : tx.wt && tx.wt < 400 ? ' ince' : '') + ' · ' + String(tx.size || '').replace('.', ',') + ' pt'; };

/* ---------- stil seçici (araç çubuğundaki stil düğmesi) ---------- */
stylePicker = function () {
  const wrap = h('div', { class: 'col stylepick' });
  const render = () => {
    const set = activeStyleSet();
    wrap.innerHTML = '';
    wrap.append(h('h3', null, 'Kalem stilleri'),
      segRow(STYLE_SET_ORDER.map(k => [k, STYLE_SET_NAMES[k]]), set, v => { S.prefs.styleSet = v; saveSettings(); refreshToolbar(); render(); }, 'Stil takımı'));
    const list = namedIn(set), grid = h('div', { class: 'stylegrid' });
    if (!list.length) grid.append(h('p', { class: 'notice' }, set === 'mine' ? 'Henüz kendi stilin yok. "Yeni stil" ile ekle.' : 'Bu takımda stil kalmadı. "Hazır stilleri geri yükle" ile geri getir.'));
    for (const [fv, i] of list) {
      const on = S.hand.style && S.hand.style.name === fv.name;
      const b = h('button', { class: 'styleitem' + (on ? ' on' : ''), type: 'button', onclick: () => { closePop(); applyFav(fv); } },
        h('i', { class: 'dot', style: { background: fv.color } }), h('span', { class: 'st' }, styleSample(fv), h('small', null, styleMeta(fv))));
      const ed2 = h('button', { class: 'ibtn styleedit', type: 'button', 'aria-label': fv.name + ' stilini düzenle', title: 'Düzenle', onclick: e => { e.stopPropagation(); openPop($('.stylechip') || b, () => styleEditor(i)); } }, icon(IC.rename || IC.pen));
      grid.append(h('div', { class: 'stylecell' }, b, ed2));
    }
    wrap.append(grid, h('div', { class: 'row', style: { display: 'flex', gap: '8px', flexWrap: 'wrap' } },
      h('button', { class: 'btn small primary', type: 'button', onclick: () => openPop($('.stylechip') || wrap, () => styleEditor(-1, set === 'mine' ? 'mine' : set)) }, icon(IC.plus), 'Yeni stil'),
      h('button', { class: 'btn small', type: 'button', onclick: () => { S.hand.style = null; saveSettings(); refreshToolbar(); closePop(); toast('Stil kapatıldı · düz kalem', 1400); } }, icon(IC.close), 'Stili kapat'),
      set !== 'mine' ? h('button', { class: 'btn small', type: 'button', onclick: () => {
        const base = STYLE_ALL.filter(f => f.set === set), names = new Set(base.map(f => f.name));
        S.fav = [...S.fav.filter(f => !(f.name && styleSetOf(f) === set && names.has(f.name))), ...base.map(f => JSON.parse(JSON.stringify(f)))];
        saveSettings(); refreshToolbar(); render(); toast(STYLE_SET_NAMES[set] + ' stilleri varsayılana döndü', 1600);
      } }, icon(IC.sync), 'Hazır stilleri geri yükle') : null));
  };
  render();
  return wrap;
};

/* ---------- stil düzenleyici ---------- */
function styleEditor(i, set) {
  const isNew = i < 0, src = isNew ? { type: 'fountain', size: 1.8, o: 1, color: '#25324d', set: set || 'mine', name: '', text: { font: 'print', wt: 400, size: 13 } } : S.fav[i];
  const st = JSON.parse(JSON.stringify(src)); st.text = st.text || { font: 'print', wt: 400, size: 13 };
  const wrap = h('div', { class: 'col styleed' });
  const prev = h('div', { class: 'styleprev' });
  const paint = () => { prev.innerHTML = ''; prev.append(styleSample({ ...st, name: st.name || 'Örnek yazı' }, 30)); };
  const nameIn = h('input', { type: 'text', id: 'stName', value: st.name, maxlength: '30', placeholder: 'ör. Önemli', autocomplete: 'off' });
  nameIn.addEventListener('input', () => { st.name = nameIn.value; paint(); });
  const preIn = h('input', { type: 'text', id: 'stPre', value: STYLE_PREFIXES.includes(st.text.prefix || '') ? '' : st.text.prefix || '', maxlength: '6', placeholder: 'kendi işaretin', autocomplete: 'off' });
  const preRow = h('div', { class: 'prechips' });
  const drawPre = () => { preRow.innerHTML = ''; for (const p of STYLE_PREFIXES) preRow.append(h('button', { type: 'button', class: 'prechip' + ((st.text.prefix || '') === p ? ' on' : ''), 'aria-pressed': String((st.text.prefix || '') === p), onclick: () => { st.text.prefix = p; preIn.value = ''; drawPre(); paint(); } }, p || 'Yok')); preRow.append(preIn); };
  preIn.addEventListener('input', () => { st.text.prefix = preIn.value.trim(); drawPre(); preIn.focus(); paint(); });
  wrap.append(h('h3', null, isNew ? 'Yeni stil' : 'Stili düzenle'), prev,
    h('label', { class: 'field', for: 'stName' }, 'Adı', nameIn),
    h('div', { class: 'lbl' }, 'Renk'), swatchGrid(st.color, [...new Set([...PALETTE.slice(0, 9), '#25324d', '#1b6e3c', '#6b3fa0', '#c0392b', '#8a5a00', '#6b7280', ...S.recent.slice(0, 3)])].slice(0, 15), c => { st.color = c; paint(); }),
    h('div', { class: 'lbl' }, 'Yazı tipi'), segRow(FONT_OPTS, st.text.font, v => { st.text.font = v; paint(); }, 'Yazı tipi'),
    h('div', { class: 'lbl' }, 'Kalınlık'), segRow(WT_OPTS, String(st.text.wt >= 700 ? 700 : st.text.wt && st.text.wt < 400 ? 300 : 400), v => { st.text.wt = +v; paint(); }, 'Kalınlık'),
    rangeRow('stSize', 'Yazı boyutu', 8, 40, .5, st.text.size, v => String(v).replace('.', ',') + ' pt', v => { st.text.size = v; paint(); }),
    h('div', { class: 'lbl' }, 'Satır başı işareti'), preRow,
    !isNew || set ? h('div', { class: 'lbl' }, 'Takım') : null,
    segRow(STYLE_SET_ORDER.map(k => [k, STYLE_SET_NAMES[k]]), st.set || 'mine', v => { st.set = v; }, 'Takım'),
    h('div', { class: 'row', style: { display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' } },
      !isNew ? h('button', { class: 'btn small danger', type: 'button', onclick: () => { S.fav.splice(i, 1); if (S.hand.style && S.hand.style.name === src.name) S.hand.style = null; saveSettings(); refreshToolbar(); closePop(); toast('Stil silindi', 1200); } }, icon(IC.trash), 'Sil') : null,
      h('button', { class: 'btn small', type: 'button', onclick: () => openPop($('.stylechip') || wrap, stylePicker) }, 'Vazgeç'),
      h('button', { class: 'btn small primary', type: 'button', onclick: () => {
        st.name = st.name.trim(); if (!st.name) { nameIn.focus(); toast('Stile bir ad ver', 1400); return; }
        if (isNew) S.fav.push(st); else S.fav[i] = st;
        if (S.hand.style && S.hand.style.name === src.name) S.hand.style = { ...st.text, name: st.name, color: st.color };
        saveSettings(); refreshToolbar(); openPop($('.stylechip') || wrap, stylePicker); toast('Stil kaydedildi', 1200);
      } }, 'Kaydet')));
  drawPre(); paint();
  return wrap;
}
window.styleEditor = styleEditor;
{
  const fm = favMenu;
  favMenu = function (anchor, i) {
    const fv = S.fav[i]; if (!fv || !fv.name) return fm(anchor, i);
    openPop(anchor, () => menu([
      { label: 'Bu stili kullan', icon: IC.pen, onClick: () => applyFav(fv) },
      { label: 'Düzenle…', icon: IC.rename || IC.gear, onClick: () => openPop(anchor, () => styleEditor(i)) },
      { label: 'Sil', icon: IC.trash, danger: true, onClick: () => { S.fav.splice(i, 1); saveSettings(); refreshToolbar(); toast('Stil silindi', 1200); } }
    ]));
  };
}

/* ---------- seçili metin kutularına stil ----------
   Kement ile seçilen metin kutuları (düzeltilmiş yazılar) başka bir stile, yazı tipine ya da boyuta geçirilir;
   satır başı işareti değişir, kutu yeniden ölçülür. Seçimdeki el yazısı çizgileri stilin rengini alır. */
function measureBox(t, maxW) {
  const g = document.createElement('canvas').getContext('2d');
  g.font = `${tWeight(t)} ${t.size}px ${FONTS[t.font] || FONTS.sans}`;
  const lines = String(t.text).split('\n').flatMap(par => wrapLines(g, par, Math.max(20, maxW - 6)));
  return { w: Math.ceil(Math.max(10, ...lines.map(l => g.measureText(l).width))) + 6, h: lines.length * t.size * 1.3 + 4 };
}
function restyleText(t, pv, ch) {
  const n = { ...t };
  if (ch.font) n.font = ch.font;
  if (ch.size) n.size = ch.size;
  if (ch.wt) { n.wt = ch.wt; n.bold = ch.wt >= 700; }
  if (ch.bold != null) { n.bold = ch.bold; n.wt = ch.bold ? 700 : 400; }
  if (ch.color) n.color = ch.color;
  if (ch.prefix != null) { const body = String(n.text).replace(PREFIX_RE, ''); n.text = ch.prefix ? ch.prefix + ' ' + body : body; }
  const maxW = n.mw || Math.max(40, pv.meta.w - n.x - 6);
  Object.assign(n, measureBox(n, maxW));
  return n;
}
function restyleSel(ch, inkColor) {
  const sel = ed.sel; if (!sel || (!sel.tids.size && !(inkColor && sel.ids.size))) return;
  commitSel(); const pv = sel.pv, pid = pv.meta.id, A = ann(pid), b = snap(pid);
  const ntids = new Set(), nids = new Set();
  A.t = A.t.map(t => { if (!sel.tids.has(t)) return t; const n = restyleText(t, pv, ch); ntids.add(n); return n; });
  A.s = A.s.map(s => { if (!sel.ids.has(s)) return s; if (!inkColor || s.t === 'hl') { nids.add(s); return s; } const n = { ...s, id: uid(), c: inkColor }; nids.add(n); return n; });
  const iids = sel.iids;
  renderLayer(pv); pushOp({ k: 'page', pid, b, a: snap(pid) }); requestFrame(true);
  ed.sel = null; setSel(pv, nids, ntids, iids);
}
window.restyleSel = restyleSel;
function selStylePop() {
  const sel = ed.sel; if (!sel) return h('div');
  const t0 = [...sel.tids][0] || {};
  const wrap = h('div', { class: 'col selstyle' });
  const render = () => {
    const set = activeStyleSet();
    wrap.innerHTML = '';
    wrap.append(h('h3', null, sel.tids.size > 1 ? sel.tids.size + ' yazının stili' : 'Yazının stili'),
      segRow(STYLE_SET_ORDER.map(k => [k, STYLE_SET_NAMES[k]]), set, v => { S.prefs.styleSet = v; saveSettings(); refreshToolbar(); render(); }, 'Stil takımı'));
    const grid = h('div', { class: 'stylegrid' });
    for (const [fv] of namedIn(set)) grid.append(h('button', { class: 'styleitem', type: 'button', onclick: () => { const tx = fv.text; restyleSel({ font: tx.font, size: tx.size, wt: tx.wt || 400, color: fv.color, prefix: tx.prefix || '' }, fv.color); closePop(); toast(fv.name + ' uygulandı', 1200); } },
      h('i', { class: 'dot', style: { background: fv.color } }), h('span', { class: 'st' }, styleSample(fv, 20), h('small', null, styleMeta(fv)))));
    const cur = [...(ed.sel ? ed.sel.tids : [])][0] || t0;
    wrap.append(grid,
      h('div', { class: 'lbl' }, 'Yalnız yazı tipi'), segRow(FONT_OPTS, cur.font || 'sans', v => { restyleSel({ font: v }); render(); }, 'Yazı tipi'),
      h('div', { class: 'selqk' },
        h('button', { class: 'btn small', type: 'button', 'aria-label': 'Küçült', onclick: () => { restyleSel({ size: Math.max(7, ((ed.sel && [...ed.sel.tids][0] || cur).size || 13) - 1) }); render(); } }, 'A−'),
        h('span', { class: 'selsz' }, String((cur.size || 13)).replace('.', ',') + ' pt'),
        h('button', { class: 'btn small', type: 'button', 'aria-label': 'Büyüt', onclick: () => { restyleSel({ size: Math.min(72, ((ed.sel && [...ed.sel.tids][0] || cur).size || 13) + 1) }); render(); } }, 'A+'),
        h('button', { class: 'btn small' + (tWeight(cur) >= 700 ? ' primary' : ''), type: 'button', 'aria-pressed': String(tWeight(cur) >= 700), onclick: () => { restyleSel({ bold: !(tWeight(cur) >= 700) }); render(); } }, h('b', null, 'K'), ' Kalın'),
        h('button', { class: 'btn small', type: 'button', onclick: () => { restyleSel({ prefix: '' }); render(); } }, 'İşareti kaldır')));
  };
  render();
  return wrap;
}
/* seçim çubuğuna "Stil" ve "Metni düzenle" */
(() => {
  const bar = $('#selbar'); if (!bar) return;
  const sb = h('button', { class: 'btn', id: 'sStyle', type: 'button', title: 'Seçili yazıların stilini, yazı tipini ve boyutunu değiştir', hidden: true }, 'Stil');
  const eb = h('button', { class: 'btn', id: 'sEditT', type: 'button', title: 'Yazıyı düzenle', hidden: true }, 'Metni düzenle');
  $('#sCol').after(sb, eb);
  sb.addEventListener('click', () => openPop(sb, selStylePop));
  eb.addEventListener('click', () => {
    const sel = ed.sel; if (!sel || sel.tids.size !== 1) return;
    const t = [...sel.tids][0], pv = sel.pv; clearSel(); setTool('text');
    const el = pv.tmap.get(t.id); if (el) editExisting(el);
  });
  const ss = setSel;
  setSel = function (pv, ids, tids, iids) {
    ss(pv, ids, tids, iids);
    const n = tids ? tids.size : 0;
    sb.hidden = !n; eb.hidden = n !== 1;
    if (typeof placeSelbar === 'function') placeSelbar();
  };
})();
