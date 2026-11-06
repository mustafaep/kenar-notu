'use strict';
/* =========================================================
   Kayan pencere: sayfanın üzerinde sürüklenir, kenar ve köşelerden boyutlanır,
   tam ekran yapılır. Tuval ve "pencere olarak" açılan ikinci belge bunu kullanır.
   Konum ve boyut S.win[key] içinde (kaplayan alana göre oranla) saklanır.
   ========================================================= */
function fwinDefault(W, H, key) {
  if (PHONE || W < 700) return { x: 0, y: 0, w: 1, h: 1, max: true };
  const w = Math.min(.5, Math.max(.36, 560 / W)), h = .78;
  return key === 'side' ? { x: 1 - w - .015, y: .03, w, h: .9 } : { x: 1 - w - .02, y: .06, w, h };
}
function makeFwin(host, { key, cls = '', title = '', icon: ic, buttons = [], body, onClose, minW = 300, minH = 220, label }) {
  const titleEl = h('b', null, title), subEl = h('small', null, '');
  const maxBtn = h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Tam ekran', title: 'Tam ekran / küçült' }, icon(IC.expand));
  const closeBtn = h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', title: 'Kapat' }, icon(IC.close));
  const head = h('div', { class: 'fwin-head', title: 'Taşımak için sürükleyin' },
    ic ? h('span', { class: 'ico' }, icon(ic)) : null, h('div', { class: 'tt' }, titleEl, subEl), ...buttons, maxBtn, closeBtn);
  const grips = ['l', 'r', 'b', 't', 'bl', 'br', 'tl', 'tr'].map(d => { const g = h('i', { class: 'rz rz-' + d, 'aria-hidden': 'true' }); g.addEventListener('pointerdown', e => drag(e, d)); return g; });
  const el = h('section', { class: 'fwin uiwin ' + cls, role: 'dialog', 'aria-label': label || title }, head, body, ...grips);
  el.addEventListener('pointerdown', e => e.stopPropagation());
  el.addEventListener('wheel', e => e.stopPropagation(), { passive: true });
  host.append(el);
  if (!S.win) S.win = {};
  const box = () => { const r = host.getBoundingClientRect(); return { W: Math.max(1, r.width), H: Math.max(1, r.height) }; };
  let st = S.win[key] || null;
  function apply() {
    const { W, H } = box();
    if (!st) st = fwinDefault(W, H, key);
    const isMax = !!st.max || W < 520;
    el.classList.toggle('max', isMax);
    maxBtn.replaceChildren(icon(isMax ? IC.shrink : IC.expand));
    maxBtn.setAttribute('aria-label', isMax ? 'Küçült' : 'Tam ekran');
    if (isMax) { Object.assign(el.style, { left: '', top: '', width: '', height: '' }); return; }
    const w = clamp(st.w * W, Math.min(minW, W - 8), W - 8), hh = clamp(st.h * H, Math.min(minH, H - 8), H - 8);
    const x = clamp(st.x * W, 4, W - w - 4), y = clamp(st.y * H, 4, H - hh - 4);
    Object.assign(el.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
  }
  function save() { S.win[key] = st; saveSettings(); }
  function drag(e, mode) {
    if (e.button > 0) return;
    e.preventDefault(); e.stopPropagation();
    const { W, H } = box();
    if (el.classList.contains('max')) {
      if (mode !== 'move' || W < 520) return;
      // tam ekrandan sürükleyince eski boyutuna dönüp parmağın altında kalır
      const d = fwinDefault(W, H, key); st = { ...(st && !st.max ? st : d), ...(st && st.w && st.w < 1 ? {} : { w: d.w, h: d.h }), max: false };
      const hr = host.getBoundingClientRect(); st.x = clamp((e.clientX - hr.left) / W - st.w / 2, 0, 1 - st.w); st.y = clamp((e.clientY - hr.top) / H - .02, 0, 1 - st.h); apply();
    }
    const r0 = { x: el.offsetLeft, y: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight }, sx = e.clientX, sy = e.clientY;
    const tgt = e.currentTarget; try { tgt.setPointerCapture(e.pointerId); } catch (er) { }
    el.classList.add('moving'); document.body.classList.add('fwin-dragging');
    const mv = ev => {
      const dx = ev.clientX - sx, dy = ev.clientY - sy, b = { ...r0 };
      if (mode === 'move') { b.x += dx; b.y += dy; }
      else {
        if (mode.includes('l')) { b.x = r0.x + dx; b.w = r0.w - dx; if (b.w < minW) { b.x -= minW - b.w; b.w = minW; } }
        if (mode.includes('r')) b.w = Math.max(minW, r0.w + dx);
        if (mode.includes('t')) { b.y = r0.y + dy; b.h = r0.h - dy; if (b.h < minH) { b.y -= minH - b.h; b.h = minH; } }
        if (mode.includes('b')) b.h = Math.max(minH, r0.h + dy);
      }
      b.w = Math.min(b.w, W - 8); b.h = Math.min(b.h, H - 8);
      st = { x: b.x / W, y: b.y / H, w: b.w / W, h: b.h / H, max: false }; apply();
      if (api.onResize) api.onResize();
    };
    const up = () => { el.classList.remove('moving'); document.body.classList.remove('fwin-dragging'); tgt.removeEventListener('pointermove', mv); tgt.removeEventListener('pointerup', up); tgt.removeEventListener('pointercancel', up); save(); if (api.onResize) api.onResize(); };
    tgt.addEventListener('pointermove', mv); tgt.addEventListener('pointerup', up); tgt.addEventListener('pointercancel', up);
  }
  head.addEventListener('pointerdown', e => { if (e.target.closest('button, input, select, a')) return; drag(e, 'move'); });
  head.addEventListener('dblclick', e => { if (!e.target.closest('button')) toggleMax(); });
  function toggleMax() { const { W, H } = box(); if (W < 520) return; st = st && !st.max ? { ...st, max: true } : { ...(st && st.w < 1 ? st : fwinDefault(W, H, key)), max: false }; apply(); save(); if (api.onResize) setTimeout(api.onResize, 30); }
  maxBtn.addEventListener('click', toggleMax);
  closeBtn.addEventListener('click', () => { if (onClose) onClose(); else api.close(); });
  const onRs = () => { if (el.isConnected && !el.hidden) { apply(); if (api.onResize) api.onResize(); } };
  addEventListener('resize', onRs);
  const api = {
    el, head, titleEl, subEl,
    setTitle(t, s) { titleEl.textContent = t || ''; if (s != null) subEl.textContent = s; },
    show() { el.hidden = false; apply(); if (api.onResize) requestAnimationFrame(api.onResize); },
    hide() { el.hidden = true; },
    close() { removeEventListener('resize', onRs); el.remove(); },
    get open() { return el.isConnected && !el.hidden; },
    toggleMax, apply, onResize: null
  };
  apply();
  return api;
}
window.makeFwin = makeFwin;
