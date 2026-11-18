'use strict';
/* =========================================================
   Metne basılı tutunca açılan menü (3.4) — ayarlanabilir.
   PDF metni (textsel.js) ve Markdown/Obsidian (md.js) seçim çubukları aynı ayarla şekillenir:
   hangi düğmeler görünsün, hangi sırayla; görünmeyenler "⋯ Diğer" altında kalır (istenirse o da kapatılır).
   Varsayılan: Kopyala, Dinle, Anlamı, Çevir.
   ========================================================= */
const SEL_ACTIONS = [['copy', 'Kopyala', IC.copy], ['speak', 'Dinle', IC.speak], ['dict', 'Anlamı', IC.spark], ['translate', 'Çevir', IC.translate], ['note', 'Tuvale not', IC.canvas], ['hl', 'Fosforla', IC.hl], ['share', 'Paylaş', IC.up]];
const SEL_DEFAULT = ['copy', 'speak', 'dict', 'translate'];
const SEL_BY_LABEL = Object.fromEntries(SEL_ACTIONS.map(([k, l]) => [l, k]));
function selCfg() {
  const c = S.prefs.selMenu || {}, known = SEL_ACTIONS.map(a => a[0]);
  const order = (Array.isArray(c.order) ? c.order : []).filter(k => known.includes(k));
  for (const k of [...SEL_DEFAULT, ...known]) if (!order.includes(k)) order.push(k);
  return { order, on: new Set(Array.isArray(c.on) ? c.on : SEL_DEFAULT), more: c.more !== false };
}
function saveSelCfg(cfg) { S.prefs.selMenu = { order: cfg.order, on: [...cfg.on], more: cfg.more }; saveSettings(); }
window.selCfg = selCfg;

/* hazır çubuğu ayara göre düzenle */
function shapeSelBar(bar, reposition) {
  if (!bar || bar._shaped) return; bar._shaped = true;
  const cfg = selCfg(), byKey = {};
  for (const b of bar.querySelectorAll(':scope > .btn')) { const k = SEL_BY_LABEL[b.textContent.trim()]; if (k) byKey[k] = b; }
  const end = bar.querySelector(':scope > .ibtn') || null;
  const shown = cfg.order.filter(k => byKey[k] && cfg.on.has(k)), hidden = cfg.order.filter(k => byKey[k] && !cfg.on.has(k));
  for (const k of shown) bar.insertBefore(byKey[k], end);
  for (const k of hidden) byKey[k].remove();
  if (hidden.length && (cfg.more || !shown.length)) {
    const more = h('button', { class: 'ibtn selmore', type: 'button', 'aria-label': 'Diğer seçenekler', title: 'Diğer: ' + hidden.map(k => SEL_ACTIONS.find(a => a[0] === k)[1]).join(', ') }, icon(IC.more));
    more.addEventListener('pointerdown', e => e.preventDefault()); // Markdown seçimi kaybolmasın
    more.addEventListener('click', e => {
      e.stopPropagation();
      for (const k of hidden) bar.insertBefore(byKey[k], more);
      more.remove(); bar.classList.add('selopen');
      reposition && reposition();
    });
    bar.insertBefore(more, end);
  }
}
window.shapeSelBar = shapeSelBar;
/* PDF metni */
{ const b = textSelBar; textSelBar = function () { b(); if (TS.bar) { shapeSelBar(TS.bar, placeTextBar); placeTextBar(); } }; }
/* Markdown / Obsidian */
if (typeof showSelBar === 'function') {
  const b = showSelBar;
  showSelBar = function () {
    b(); if (!selBar) return;
    const keepIn = () => { const host = selBar.parentElement; if (!host) return; const L = parseFloat(selBar.style.left) || 0; selBar.style.left = clamp(L, 8, Math.max(8, host.clientWidth - selBar.offsetWidth - 8)) + 'px'; };
    shapeSelBar(selBar, keepIn); keepIn();
  };
}

/* ---------- Ayarlar → Kalem → "Metne basılı tutunca" ---------- */
function selMenuEditor() {
  const box = h('div', { class: 'selcfg' });
  const draw = () => {
    const cfg = selCfg(); box.innerHTML = '';
    const prev = h('div', { class: 'selprev', 'aria-hidden': 'true' }, ...cfg.order.filter(k => cfg.on.has(k)).map(k => { const a = SEL_ACTIONS.find(x => x[0] === k); return h('span', null, icon(a[2]), a[1]); }), cfg.order.some(k => !cfg.on.has(k)) && cfg.more ? h('span', { class: 'pm' }, icon(IC.more)) : null);
    box.append(h('div', { class: 'selprevw' }, h('small', null, 'Önizleme'), prev));
    const list = h('div', { class: 'tblist sellist' });
    cfg.order.forEach((k, i) => {
      const a = SEL_ACTIONS.find(x => x[0] === k), id = 'selOn_' + k;
      const inp = h('input', { type: 'checkbox', id, role: 'switch', class: 'switch' }); inp.checked = cfg.on.has(k);
      inp.addEventListener('change', () => { const c = selCfg(); inp.checked ? c.on.add(k) : c.on.delete(k); saveSelCfg(c); draw(); });
      const mv = d => { const c = selCfg(), j = i + d; if (j < 0 || j >= c.order.length) return; [c.order[i], c.order[j]] = [c.order[j], c.order[i]]; saveSelCfg(c); draw(); const f = box.querySelector(`[data-k="${k}"] .${d < 0 ? 'up' : 'dn'}`); if (f && !f.disabled) f.focus(); };
      list.append(h('div', { class: 'tbrow', 'data-k': k },
        icon(a[2]), h('label', { for: id }, a[1]),
        h('button', { class: 'ibtn up', type: 'button', 'aria-label': a[1] + ': yukarı', disabled: i === 0, onclick: () => mv(-1) }, icon('<path d="M6 15l6-6 6 6"/>')),
        h('button', { class: 'ibtn dn', type: 'button', 'aria-label': a[1] + ': aşağı', disabled: i === cfg.order.length - 1, onclick: () => mv(1) }, icon('<path d="M6 9l6 6 6-6"/>')),
        inp));
    });
    box.append(list,
      toggleRow('selMore', 'Kapalı olanlar "⋯" altında dursun', cfg.more, v => { const c = selCfg(); c.more = v; saveSelCfg(c); draw(); }, 'Kapatınca menüde yalnız açık olanlar görünür'),
      h('div', { class: 'sbtns' }, h('button', { class: 'btn small', type: 'button', onclick: () => { delete S.prefs.selMenu; saveSettings(); draw(); toast('Varsayılan: Kopyala, Dinle, Anlamı, Çevir', 1800); } }, icon(IC.sync), 'Varsayılana dön')));
  };
  draw();
  return box;
}
{
  const sb = setBuild;
  setBuild = function (id, close) {
    const g = sb(id, close);
    if (id === 'pen' && Array.isArray(g)) {
      const i = g.findIndex(x => x && x.querySelector && /S Pen testi/.test((x.querySelector('h4') || {}).textContent || ''));
      g.splice(i < 0 ? g.length : i, 0, sGroup('Metne basılı tutunca', [selMenuEditor()], 'PDF ya da Markdown metnine parmakla basılı tutunca açılan menü. Açık olanlar bu sırayla görünür.'));
    }
    return g;
  };
}
