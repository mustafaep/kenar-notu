'use strict';
/* =========================================================
   Kenar arayüzü (2.9.0)
   1) Üst çubuk gizlenir: ortadaki küçük dille açılıp kapanır (tablette her zaman, telefonda yan çevrilince).
   2) Kenar düğmeleri: seçilen düğmeler çubuk gizliyken sayfanın köşesinde / kenarında durur
      (ör. sol üstte silgi). Düğmeye basılı tutunca yeri seçilir; tutamacından sürükleyince başka köşeye taşınır.
   3) Konum şeridi: alttaki küçük şerit sayfanın yatay konumunu gösterir; sürükleyince sayfa sağa-sola kayar,
      bir yere dokununca sayfa oraya gelir, iki kez dokununca ortalanır.
   ========================================================= */
const DOCK_SPOTS = ['tl', 'tr', 'l', 'r', 'bl', 'br'];
const SPOT_NAMES = { tl: 'Sol üst', tr: 'Sağ üst', l: 'Sol kenar', r: 'Sağ kenar', bl: 'Sol alt', br: 'Sağ alt' };
const DOCK_EXTRA = { undo: { name: 'Geri al', ic: IC.undo }, redo: { name: 'Yinele', ic: IC.redo } };
const GRIP_IC = '<circle cx="9" cy="7" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="7" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="1.3" fill="currentColor" stroke="none"/><circle cx="9" cy="17" r="1.3" fill="currentColor" stroke="none"/><circle cx="15" cy="17" r="1.3" fill="currentColor" stroke="none"/>';
const dockItem = id => TB_ITEMS[id] || DOCK_EXTRA[id] || null;
function dockPins() {
  if (!S.prefs.pins || typeof S.prefs.pins !== 'object') S.prefs.pins = PHONE ? {} : { pen: 'tl', eraser: 'tl', undo: 'tl' };
  return S.prefs.pins;
}
function setPin(id, spot) {
  const p = dockPins();
  if (spot && DOCK_SPOTS.includes(spot)) p[id] = spot; else delete p[id];
  saveSettings(); buildDocks();
}
window.setPin = setPin; window.dockPins = dockPins;
const barIsUp = () => edView.classList.contains('barup');

/* ---------- 1) üst çubuk ---------- */
const barTab = (() => {
  if (EMBED) return null;
  const bar = edView.querySelector('.ebar'); if (!bar) return null;
  const tab = h('button', { class: 'bartab', id: 'barTab', type: 'button' }, icon('<path d="M6 9l6 6 6-6"/>'));
  bar.append(tab);
  return tab;
})();
function setBarUp(up, byUser) {
  if (!barTab) return;
  up = !!up;
  if (up !== barIsUp()) {
    if (!PHONE && ed.note && !edView.hidden) { ed.keepScreen = true; setTimeout(() => { ed.keepScreen = false; }, 400); }
    edView.classList.toggle('barup', up);
    if (up) closePop();
  }
  barTab.setAttribute('aria-expanded', String(!up));
  barTab.setAttribute('aria-label', up ? 'Üst çubuğu göster' : 'Üst çubuğu gizle');
  barTab.title = up ? 'Üst çubuğu göster' : 'Üst çubuğu gizle (seçtiğin düğmeler kenarda kalır)';
  if (byUser && !PHONE) { S.prefs.barUp = up; saveSettings(); }
  if (!up) requestAnimationFrame(fitEbar);
  buildDocks();
  if (byUser && up && !PHONE && !S.prefs.dockHint) { S.prefs.dockHint = true; saveSettings(); toast('Bir düğmeye basılı tutarak onu kenarda tutabilirsin. Çubuğu geri açmak için üstteki dile dokun.', 4200); }
}
window.setBarUp = setBarUp; window.phoneBar = up => setBarUp(up);
function applyBarPrefs() {
  if (!barTab) return;
  if (PHONE) return;
  const allow = S.prefs.barTab !== false;
  edView.classList.toggle('notab', !allow);
  setBarUp(allow && !!S.prefs.barUp);
}
window.applyBarPrefs = applyBarPrefs;
if (barTab) {
  barTab.addEventListener('click', e => { e.stopPropagation(); setBarUp(!barIsUp(), true); });
  if (PHONE) {
    // ekran klavyesi açılınca görünüm yatay orana dönebilir; bu yüzden ekranın kendi yönüne bakılır
    const land = () => { const t = screen.orientation && screen.orientation.type; return t ? t.startsWith('landscape') : screen.width > screen.height; };
    let was = null;
    const apply = () => { const L = land(); if (L === was) return; was = L; document.documentElement.classList.toggle('land', L); setBarUp(L); };
    if (screen.orientation && screen.orientation.addEventListener) screen.orientation.addEventListener('change', apply);
    addEventListener('resize', apply); apply();
  }
}

/* ---------- 2) kenar düğmeleri ---------- */
function dockBtn(id) {
  const it = dockItem(id);
  const b = h('button', { class: 'tool', type: 'button', 'aria-label': it.name, title: it.name + ' (basılı tut: yerini değiştir)', 'data-item': id, 'data-dock': '1' }, icon(it.ic));
  if (it.tool) {
    b.dataset.tool = id; b.append(h('span', { class: 'caret' }));
    if (id === 'pen' || id === 'hl' || id === 'text') b.append(h('span', { class: 'tip' }));
    b.addEventListener('click', () => { if (ed.tool === id) openToolPop(id, b); else setTool(id); });
  } else if (id === 'undo') b.addEventListener('click', () => undo());
  else if (id === 'redo') b.addEventListener('click', () => redo());
  else b.addEventListener('click', () => toolbarAction(id, b));
  if (id === 'readonly') b.classList.toggle('on', !!S.prefs.readOnly);
  if (id === 'invert') b.classList.toggle('on', !!S.prefs.invert);
  if (id === 'split' && typeof splitOpen === 'function') b.classList.toggle('on', !!splitOpen());
  return b;
}
function dockAllowed(id) {
  if (!dockItem(id)) return false;
  if (id === 'split' && EMBED) return false;
  if (PHONE) return !!DOCK_EXTRA[id] || PHONE_TOOLS.includes(id);
  return true;
}
function buildDocks() {
  const ui = $('#ui'); if (!ui) return;
  $$('.edock', ui).forEach(x => x.remove());
  if (EMBED) return;
  if (!(barIsUp() || S.prefs.dockAlways)) return;
  const pins = dockPins(), groups = {};
  const order = [...new Set([...tbCfg().order, ...Object.keys(TB_ITEMS), 'undo', 'redo'])];
  for (const id of order) { const sp = pins[id]; if (sp && DOCK_SPOTS.includes(sp) && dockAllowed(id)) (groups[sp] = groups[sp] || []).push(id); }
  for (const sp of DOCK_SPOTS) {
    const ids = groups[sp]; if (!ids) continue;
    const grip = h('button', { class: 'dgrip', type: 'button', 'aria-label': SPOT_NAMES[sp] + ' kenar düğmeleri: taşı', title: 'Sürükleyip başka köşeye bırak · dokun: seçenekler' }, icon(GRIP_IC));
    const d = h('div', { class: 'floaty edock pill d-' + sp, role: 'toolbar', 'aria-label': 'Kenar düğmeleri · ' + SPOT_NAMES[sp], 'data-spot': sp }, grip, ...ids.map(dockBtn));
    ui.append(d);
    gripDrag(grip, d, sp);
  }
  refreshToolbar();
  placeDocks();
}
window.buildDocks = buildDocks;
/* alttaki köşeler, sağ alttaki yakınlaştırma düğmelerinin ve konum şeridinin üstünde durur */
function placeDocks() {
  const br = $('#ui .edock.d-br'), zc = $('#zoomCtl');
  if (br) br.style.bottom = (zc && !zc.hidden ? 16 + zc.offsetHeight + 10 : 16) + 'px';
}
function nearestSpot(x, y, W, H) {
  const left = x < W / 2, v = y < H * .3 ? 't' : y > H * .7 ? 'b' : 'm';
  return v === 'm' ? (left ? 'l' : 'r') : v + (left ? 'l' : 'r');
}
function gripDrag(grip, dock, sp) {
  let st = null;
  grip.addEventListener('pointerdown', e => {
    if (e.button > 0) return; e.preventDefault(); e.stopPropagation();
    const ur = $('#ui').getBoundingClientRect(), r = dock.getBoundingClientRect();
    st = { id: e.pointerId, sx: e.clientX, sy: e.clientY, ox: r.left - ur.left, oy: r.top - ur.top, ur, moved: false };
    try { grip.setPointerCapture(e.pointerId); } catch (er) { }
  });
  grip.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.sx, dy = e.clientY - st.sy;
    if (!st.moved && Math.hypot(dx, dy) < 8) return;
    if (!st.moved) { st.moved = true; dock.classList.add('dragging'); Object.assign(dock.style, { left: st.ox + 'px', top: st.oy + 'px', right: 'auto', bottom: 'auto', transform: 'none' }); }
    dock.style.left = clamp(st.ox + dx, 4, st.ur.width - dock.offsetWidth - 4) + 'px';
    dock.style.top = clamp(st.oy + dy, 4, st.ur.height - dock.offsetHeight - 4) + 'px';
    const to = nearestSpot(e.clientX - st.ur.left, e.clientY - st.ur.top, st.ur.width, st.ur.height);
    $$('#ui .dspot').forEach(x => x.classList.toggle('on', x.dataset.spot === to));
    if (!$('#ui .dspot')) for (const s of DOCK_SPOTS) $('#ui').append(h('i', { class: 'dspot d-' + s + (s === to ? ' on' : ''), 'data-spot': s, 'aria-hidden': 'true' }));
  });
  const up = e => {
    if (!st || e.pointerId !== st.id) return;
    const s0 = st; st = null; $$('#ui .dspot').forEach(x => x.remove());
    if (!s0.moved) { dockMenu(grip, sp); return; }
    const to = nearestSpot(e.clientX - s0.ur.left, e.clientY - s0.ur.top, s0.ur.width, s0.ur.height);
    const pins = dockPins(); for (const k of Object.keys(pins)) if (pins[k] === sp) pins[k] = to;
    saveSettings(); buildDocks();
  };
  grip.addEventListener('pointerup', up); grip.addEventListener('pointercancel', up);
}
function dockMenu(anchor, sp) {
  const pins = dockPins(), ids = Object.keys(pins).filter(k => pins[k] === sp && dockAllowed(k));
  openPop(anchor, () => menu([
    barIsUp() ? { label: 'Üst çubuğu göster', icon: IC.chevR, onClick: () => setBarUp(false, true) } : null,
    ...ids.map(id => ({ label: dockItem(id).name + ' · kenardan kaldır', icon: dockItem(id).ic, onClick: () => setPin(id, null) })),
    '-',
    { label: 'Kenar düğmelerini düzenle', icon: IC.gear, sub: 'Hangi düğme hangi köşede dursun', onClick: () => openPop(anchor, pinManager) }
  ]));
}
/* ekran şeması üzerinde altı yer: dokunulan yere taşınır */
function pinMap(cur, onPick) {
  return h('div', { class: 'pinmap', role: 'group', 'aria-label': 'Yer seç' },
    h('i', { class: 'pm-bar', 'aria-hidden': 'true' }), h('i', { class: 'pm-page', 'aria-hidden': 'true' }),
    ...DOCK_SPOTS.map(sp => h('button', { class: 'pinspot s-' + sp + (cur === sp ? ' on' : ''), type: 'button', 'aria-label': SPOT_NAMES[sp], 'aria-pressed': cur === sp ? 'true' : 'false', title: SPOT_NAMES[sp], onclick: () => onPick(sp) })));
}
function pinMenu(id, anchor) {
  const it = dockItem(id); if (!it) return;
  const cur = dockPins()[id] || '';
  openPop(anchor, () => h('div', { class: 'pinpop' },
    h('div', { class: 'pp-h' }, icon(it.ic), h('b', null, it.name)),
    h('p', { class: 'muted' }, 'Üst çubuk gizliyken bu düğme nerede dursun?'),
    pinMap(cur, sp => { setPin(id, sp); closePop(); toast(it.name + ': ' + SPOT_NAMES[sp] + (barIsUp() || S.prefs.dockAlways ? '' : ' · çubuğu gizleyince görünür'), 2200); }),
    h('div', { class: 'row' },
      cur ? h('button', { class: 'btn small', type: 'button', onclick: () => { setPin(id, null); closePop(); toast(it.name + ' kenardan kaldırıldı', 1500); } }, 'Kenarda tutma') : null,
      !barIsUp() && barTab && !edView.classList.contains('notab') ? h('button', { class: 'btn small primary', type: 'button', onclick: () => { closePop(); setBarUp(true, true); } }, 'Çubuğu şimdi gizle') : null)));
}
window.pinMenu = pinMenu;
/* tüm düğmeler için yer seçimi (Araç çubuğunu düzenle'den ya da kenar menüsünden) */
function pinManager() {
  const pins = dockPins(), wrap = h('div', { class: 'col pinman' });
  wrap.append(h('h3', null, 'Kenar düğmeleri'), h('p', { class: 'notice' }, 'Üst çubuğu ortadaki dille gizleyince seçtiğin düğmeler sayfanın kenarında kalır. Bir düğmeye basılı tutarak da yerini seçebilirsin.'));
  const ids = [...new Set([...tbCfg().order, 'undo', 'redo'])].filter(dockAllowed);
  const list = h('div', { class: 'tblist' });
  for (const id of ids) {
    const it = dockItem(id);
    const sel = h('select', { 'aria-label': it.name + ' nerede dursun' }, h('option', { value: '' }, '—'), ...DOCK_SPOTS.map(sp => h('option', { value: sp }, SPOT_NAMES[sp])));
    sel.value = pins[id] || '';
    sel.addEventListener('change', () => setPin(id, sel.value || null));
    list.append(h('div', { class: 'tbrow' }, icon(it.ic), h('span', null, it.name), sel));
  }
  wrap.append(list,
    toggleRow('dockAlw', 'Çubuk açıkken de görünsün', !!S.prefs.dockAlways, v => { S.prefs.dockAlways = v; saveSettings(); buildDocks(); }),
    !PHONE ? toggleRow('barTabT', 'Üst çubuğu gizleme dili', S.prefs.barTab !== false, v => { S.prefs.barTab = v; if (!v) S.prefs.barUp = false; saveSettings(); applyBarPrefs(); }) : null);
  return wrap;
}
window.pinManager = pinManager;
/* basılı tutma: çubuktaki ve kenardaki düğmelerin yerini seçmek için */
function longPress(root, sel, fn) {
  let T = 0, sx = 0, sy = 0, fired = 0;
  root.addEventListener('pointerdown', e => {
    const b = e.target.closest(sel); if (!b || !root.contains(b) || e.button > 0) return;
    sx = e.clientX; sy = e.clientY; clearTimeout(T);
    T = setTimeout(() => { T = 0; fired = Date.now(); fn(b); }, 560);
  }, true);
  root.addEventListener('pointermove', e => { if (T && Math.hypot(e.clientX - sx, e.clientY - sy) > 10) { clearTimeout(T); T = 0; } }, true);
  ['pointerup', 'pointercancel'].forEach(t => root.addEventListener(t, () => { clearTimeout(T); T = 0; }, true));
  root.addEventListener('click', e => { if (Date.now() - fired < 900 && e.target.closest(sel)) { e.stopPropagation(); e.preventDefault(); } }, true);
  root.addEventListener('contextmenu', e => { const b = e.target.closest(sel); if (!b) return; e.preventDefault(); if (Date.now() - fired < 1200) return; fired = Date.now(); fn(b); });
}
const pinIdOf = b => b.id === 'undoBtn' ? 'undo' : b.id === 'redoBtn' ? 'redo' : b.dataset.item;
if (!EMBED) {
  const bar = edView.querySelector('.ebar');
  if (bar) longPress(bar, '#tools .tool[data-item], #undoBtn, #redoBtn', b => { const id = pinIdOf(b); if (dockAllowed(id)) pinMenu(id, b); });
  const ui = $('#ui'); if (ui) longPress(ui, '.edock .tool[data-item]', b => pinMenu(b.dataset.item, b));
}
/* araç çubuğu yeniden kurulunca kenar düğmeleri de yenilenir; düzenleyiciye kenar düğmeleri bağlantısı */
{ const b = buildTools; buildTools = function () { b(); buildDocks(); }; }
{
  const te = toolbarEditor;
  toolbarEditor = function () {
    const w = te();
    if (!EMBED) w.append(h('button', { class: 'btn small', type: 'button', onclick: e => { e.stopPropagation(); const a = $('#moreBtn'); openPop(barIsUp() ? ($('#ui .edock .tool') || a) : a, pinManager); } }, icon(IC.pin || IC.gear), 'Kenar düğmeleri (çubuk gizliyken)'));
    return w;
  };
}
{ const r = setReadOnly; setReadOnly = function (on, quiet) { r(on, quiet); $$('.edock .tool[data-item="readonly"]').forEach(x => x.classList.toggle('on', !!S.prefs.readOnly)); }; }

/* ---------- 3) konum şeridi ---------- */
const shiftCtl = (() => {
  if (EMBED || PHONE) return null;
  const pg = h('i', { class: 'sc-pg', 'aria-hidden': 'true' }), scr = h('i', { class: 'sc-scr', 'aria-hidden': 'true' });
  const el = h('div', { class: 'floaty shiftctl', id: 'shiftCtl', role: 'slider', tabindex: '0', 'aria-label': 'Sayfanın yatay konumu', title: 'Sürükle: sayfayı sağa-sola kaydır · dokun: sayfa oraya gelir · iki kez dokun: ortala', hidden: true }, h('div', { class: 'sc-track' }, scr, pg));
  $('#ui').append(el);
  return { el, pg, scr, track: el.firstChild };
})();
function shiftGeom() {
  const v = ed.view, [lo, hi] = hRange(), cw = ed.maxW * v.z;
  const minX = Math.min(0, lo - cw / 2), maxX = Math.max(ed.W, hi + cw / 2), span = Math.max(1, maxX - minX);
  const tw = shiftCtl.track.clientWidth || 140, s = tw / span;
  return { lo, hi, cw, minX, s, tw };
}
function shiftSync() {
  if (!shiftCtl) return;
  const on = !!ed.note && shiftMode() !== 'off' && S.prefs.shiftCtl !== false && !ed.capture;
  let can = false;
  if (on) { const [lo, hi] = hRange(); can = hi - lo > 4; }
  shiftCtl.el.hidden = !(on && can);
  $('#pager').classList.toggle('lift', !shiftCtl.el.hidden);
  if (shiftCtl.el.hidden) return;
  const g = shiftGeom(), v = ed.view;
  Object.assign(shiftCtl.scr.style, { left: (-g.minX * g.s) + 'px', width: Math.max(6, ed.W * g.s) + 'px' });
  Object.assign(shiftCtl.pg.style, { left: ((v.tx - g.cw / 2 - g.minX) * g.s) + 'px', width: Math.max(6, g.cw * g.s) + 'px' });
  const frac = g.hi - g.lo > 1 ? (v.tx - g.lo) / (g.hi - g.lo) : .5;
  shiftCtl.el.setAttribute('aria-valuenow', String(Math.round(frac * 100)));
  shiftCtl.el.setAttribute('aria-valuetext', Math.abs(v.tx - ed.W / 2) < 3 ? 'Ortada' : (v.tx < ed.W / 2 ? 'Solda' : 'Sağda'));
  shiftCtl.el.classList.toggle('mid', Math.abs(v.tx - ed.W / 2) < 3);
  placeDocks();
}
window.shiftSync = shiftSync;
{ const p = panSync; panSync = function () { p(); shiftSync(); }; window.panSync = panSync; }
function shiftTo(tx, ms = 220) {
  stopInertia(); cancelAnimationFrame(ed.shiftRaf);
  const v = ed.view, x0 = v.tx, z = v.z, t0 = performance.now();
  const tick = t => {
    if (v.z !== z || !ed.note) return;
    const k = Math.min(1, (t - t0) / ms), e = 1 - Math.pow(1 - k, 3);
    setView(z, x0 + (tx - x0) * e, v.ty);
    if (k < 1) ed.shiftRaf = requestAnimationFrame(tick); else settle();
  };
  ed.shiftRaf = requestAnimationFrame(tick);
}
window.shiftTo = shiftTo;
if (shiftCtl) {
  let st = null, lastTap = 0;
  const el = shiftCtl.el;
  el.addEventListener('pointerdown', e => {
    if (e.button > 0 || !ed.note) return; e.preventDefault(); e.stopPropagation();
    stopInertia(); cancelAnimationFrame(ed.shiftRaf);
    st = { id: e.pointerId, sx: e.clientX, tx0: ed.view.tx, g: shiftGeom(), moved: false };
    el.classList.add('act');
    try { el.setPointerCapture(e.pointerId); } catch (er) { }
  });
  el.addEventListener('pointermove', e => {
    if (!st || e.pointerId !== st.id) return;
    const dx = e.clientX - st.sx; if (!st.moved && Math.abs(dx) < 4) return;
    st.moved = true;
    setView(ed.view.z, st.tx0 + dx / st.g.s, ed.view.ty);
  });
  const up = e => {
    if (!st || e.pointerId !== st.id) return;
    const s0 = st; st = null; el.classList.remove('act');
    if (s0.moved) { settle(); return; }
    const t = Date.now();
    if (t - lastTap < 380) { lastTap = 0; shiftTo(ed.W / 2); toast('Sayfa ortalandı', 1000); return; }
    lastTap = t;
    // dokunulan yere sayfanın ortası gelir
    const r = shiftCtl.track.getBoundingClientRect(), x = (e.clientX - r.left) / s0.g.s + s0.g.minX;
    shiftTo(clamp(x, s0.g.lo, s0.g.hi));
  };
  el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up);
  el.addEventListener('keydown', e => {
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') { e.preventDefault(); e.stopPropagation(); shiftTo(ed.view.tx + (e.key === 'ArrowLeft' ? -1 : 1) * ed.W * .08, 120); }
    else if (e.key === 'Home' || e.key === 'Enter') { e.preventDefault(); shiftTo(ed.W / 2); }
  });
}
/* Ayarlar'da sağa-sola kaydırma değişince sayfa yeni sınıra oturur */
function applyShiftPrefs() { if (!ed.note || !ed.W) return; setView(ed.view.z, fitsAt(ed.view.z) ? homeTx(ed.view.z) : ed.view.tx, ed.view.ty); shiftSync(); }
window.applyShiftPrefs = applyShiftPrefs;
{ const a = applyViewPrefs; applyViewPrefs = function () { a(); shiftSync(); placeDocks(); }; }

applyBarPrefs();
buildDocks();
