'use strict';
/* =========================================================
   Yan yana belge: sağda uygulamanın ikinci bir örneği (iframe).
   İki taraf aynı kitaplığı paylaşır; aynı not iki yerde açılamaz.
   ========================================================= */
window.__ed = ed;
let splitEl = null;
function sideWin() { try { return splitEl && !splitEl.hidden ? splitEl.querySelector('iframe').contentWindow : null; } catch (e) { return null; } }
function splitOpen() { return !!(splitEl && !splitEl.hidden); }
function otherNoteId() {
  try {
    if (EMBED) { const pe = parent.__ed; return pe && pe.note ? pe.note.id : null; }
    const w = sideWin(); return w && w.__ed && w.__ed.note ? w.__ed.note.id : null;
  } catch (e) { return null; }
}
function toolbarSplitState() { $$('.tool[data-item="split"]').forEach(b => b.classList.toggle('on', splitOpen())); }
function applySplitW() { if (splitEl) splitEl.style.width = Math.round(clamp(S.splitW || .42, .25, .75) * 100) + '%'; }
function toggleSplit(openId) { if (EMBED) return; if (splitOpen()) closeSplit(); else openSplit(openId); }
function openSplit(openId) {
  if (EMBED) return;
  if (!splitEl) {
    const iframe = h('iframe', { title: 'Yan belge', src: location.pathname + '?embed=1' + (openId ? '#open=' + openId : ''), allow: 'clipboard-write' });
    const handle = h('div', { class: 'split-handle', title: 'Genişliği ayarlamak için sürükleyin', role: 'separator', 'aria-orientation': 'vertical' }, h('i'));
    const closeBtn = h('button', { class: 'ibtn split-close', type: 'button', 'aria-label': 'Yan belgeyi kapat', title: 'Yan belgeyi kapat', onclick: closeSplit }, icon(IC.close));
    splitEl = h('div', { class: 'sidepane' }, handle, iframe, closeBtn);
    $('#edView .ebody').append(splitEl);
    handle.addEventListener('pointerdown', e => {
      e.preventDefault(); try { handle.setPointerCapture(e.pointerId); } catch (er) { }
      handle.classList.add('drag'); document.body.classList.add('split-dragging');
      const box = $('#edView .ebody').getBoundingClientRect();
      const mv = ev => { S.splitW = clamp((box.right - ev.clientX) / box.width, .25, .75); applySplitW(); };
      const up = () => { handle.classList.remove('drag'); document.body.classList.remove('split-dragging'); handle.removeEventListener('pointermove', mv); saveSettings(); };
      handle.addEventListener('pointermove', mv);
      handle.addEventListener('pointerup', up, { once: true }); handle.addEventListener('pointercancel', up, { once: true });
    });
  } else {
    splitEl.hidden = false;
    if (openId) { const w = sideWin(); if (w && w.openNote) w.openNote(openId); }
  }
  applySplitW(); toolbarSplitState(); activePane = 'side'; markActive(); updateUndoBtns(); if (window.__syncHeader) window.__syncHeader();
}
async function closeSplit() {
  if (!splitEl) return;
  const w = sideWin();
  try { if (w && w.__ed && w.__ed.note && w.closeEditor) await w.closeEditor(); } catch (e) { }
  splitEl.hidden = true; toolbarSplitState(); activePane = 'main'; markActive(); updateUndoBtns(); if (window.__syncHeader) window.__syncHeader();
}

/* Aynı not iki tarafta açılmasın */
{
  const base = openNote;
  openNote = async function (id) {
    if (otherNoteId() === id) { toast(EMBED ? 'Bu not ana pencerede açık' : 'Bu not yan pencerede açık', 2600); return; }
    return base(id);
  };
}

/* ---------- etkin bölme: ana araç çubuğu hangi tarafa dokunulduysa orada çalışır ---------- */
let activePane = 'main';
function activeSide() { if (EMBED || activePane !== 'side' || !splitOpen()) return null; const w = sideWin(); return w && w.__ed && w.__ed.note ? w : null; }
function markActive() {
  const on = splitOpen(); document.body.classList.toggle('split-on', on);
  stage.classList.toggle('act', on && activePane === 'main');
  if (splitEl) splitEl.classList.toggle('act', on && activePane === 'side');
}
if (EMBED) {
  document.documentElement.classList.add('embed');
  try { const ps = parent.__getS && parent.__getS(); if (ps && ps.prefs) S = ps; } catch (e) { }
  window.__syncTool = t => { try { if (ed.tool !== t) setTool(t); else { refreshToolbar(); updateCursorStyle(); } } catch (e) { } };
  window.__syncView = () => { try { applyTheme(); if (ed.note) { setInvert(S.prefs.invert); applyViewPrefs(); refreshToolbar(); updateCursorStyle(); } } catch (e) { } };
  { const b9 = renderStatus; renderStatus = (st, err) => { b9(st, err); try { parent.__sideStatus && parent.__sideStatus(); } catch (e) { } }; }
  stage.addEventListener('pointerdown', () => { try { parent.__setActivePane('side'); } catch (e) { } }, true);
  { const b0 = updateUndoBtns; updateUndoBtns = () => { b0(); try { parent.updateUndoBtns(); } catch (e) { } }; }
  // yan bölme: araç çubuğu yok; küçük bir başlık çipi
  const chipTitle = h('b', null, '');
  const chipMore = h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Yan belge seçenekleri' }, icon(IC.more));
  const chip = h('div', { class: 'floaty sidechip' },
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Sayfalar', title: 'Sayfalar', onclick: () => setPanel($('#ppanel').hidden) }, icon(IC.gridI)), chipTitle, chipMore);
  chipMore.addEventListener('click', () => {
    const od = ed.note && ed.note.od;
    openPop(chipMore, () => menu([
      { label: 'Başka belge aç', icon: IC.notes, onClick: () => closeEditor() },
      od ? { label: 'Şimdi kaydet', icon: IC.cloudOk, sub: od.name || '', onClick: syncNow } : { label: 'OneDrive’a kaydet…', icon: IC.cloud, onClick: () => openOneDrive({ mode: 'save', note: ed.note, bytes: ed.pdfBytes }) },
      { label: 'PDF olarak indir', icon: IC.dl, onClick: () => exportNote(ed.note, ed.pdfBytes) },
      { label: 'Tüm sayfalar', icon: IC.gridI, onClick: openPgrid },
      { label: 'Belgede ara', icon: IC.search, onClick: () => { S.panelTab = 'find'; setPanel(true); } },
      '-',
      { label: 'Yan pencereyi kapat', icon: IC.close, onClick: () => { try { parent.closeSplit(); } catch (e) { } } }
    ]));
  });
  $('#ui').append(chip);
  const upd = () => { chipTitle.textContent = ed.note ? ed.note.name : ''; };
  { const b1 = openNote; openNote = async id => { const r = await b1(id); upd(); try { parent.__setActivePane('side'); parent.__sideStatus(); } catch (e) { } return r; }; }
  { const b2 = closeEditor; closeEditor = async () => { const r = await b2(); try { parent.__setActivePane('main'); } catch (e) { } return r; }; }
  window.__chipUpd = upd;
  $('#titleIn').addEventListener('change', upd);
} else {
  window.__setActivePane = p => { if (activePane === p) return; activePane = p; markActive(); updateUndoBtns(); syncHeader(); };
  // üst çubuk (başlık, durum, Kaydet, Sayfalar, ⋯) etkin belgeyi gösterir
  let lastMainStatus = [];
  { const b8 = renderStatus; renderStatus = (st, err) => { lastMainStatus = [st, err]; if (activeSide()) return; b8(st, err); }; window.__mainRenderStatus = b8; }
  function syncHeader() {
    const w = activeSide();
    if (w) {
      $('#titleIn').value = w.__ed.note.name;
      const ss = w.document.getElementById('status'), ms = $('#status');
      if (ss) { ms.className = ss.className; ms.innerHTML = ss.innerHTML; ms.title = ss.title; }
      $('#pagesBtn').classList.toggle('on', !w.document.getElementById('ppanel').hidden);
    } else if (ed.note) {
      $('#titleIn').value = ed.note.name; window.__mainRenderStatus(...lastMainStatus);
      $('#pagesBtn').classList.toggle('on', !$('#ppanel').hidden);
    }
  }
  window.__sideStatus = () => { if (activeSide()) syncHeader(); };
  window.__syncHeader = syncHeader;
  const capt = (sel, ev, fn) => $(sel).addEventListener(ev, e => { const w = activeSide(); if (!w) return; e.stopImmediatePropagation(); e.preventDefault(); fn(w, e); }, true);
  capt('#titleIn', 'change', w => { const v = $('#titleIn').value.trim(); if (!v) { $('#titleIn').value = w.__ed.note.name; return; } w.__ed.note.name = v; w.document.getElementById('titleIn').value = v; w.scheduleSave(); if (w.__chipUpd) w.__chipUpd(); });
  capt('#status', 'click', w => { w.document.getElementById('status').click(); });
  capt('#pagesBtn', 'click', w => { w.setPanel(w.document.getElementById('ppanel').hidden); syncHeader(); });
  capt('#exportBtn', 'click', w => {
    const E = w.__ed; if (!E.note) return; w.finishAll(); const od = E.note.od;
    openPop($('#exportBtn'), () => menu([
      { label: 'Sağdaki belge: ' + E.note.name, icon: IC.split, disabled: true, onClick: () => { } },
      od ? { label: (od.kind === 'saf' && od.place !== 'OneDrive' ? 'Dosyaya' : 'OneDrive’a') + ' şimdi kaydet', icon: IC.cloudOk, sub: od.name, onClick: () => w.syncNow() } : { label: 'OneDrive’a kaydet…', icon: IC.cloud, sub: 'Klasör seçin', onClick: () => w.openOneDrive({ mode: 'save', note: E.note, bytes: E.pdfBytes }) },
      { label: 'PDF olarak indir', icon: IC.dl, sub: 'Notlar vektör olarak işlenir', onClick: () => w.exportNote(E.note, E.pdfBytes) },
      { label: 'Paylaş', icon: IC.up, onClick: () => w.exportNote(E.note, E.pdfBytes, true) }
    ]));
  });
  // ayar değişiklikleri yan belgeye de uygulanır (tema, görünüm, kalem)
  { const b7 = saveSettings; let t7 = 0; saveSettings = () => { b7(); clearTimeout(t7); t7 = setTimeout(() => { const sw = sideWin(); try { if (sw && sw.__syncView) sw.__syncView(); } catch (e) { } }, 60); }; }
  { const b6 = undo, b5r = redo; undo = () => { const w = activeSide(); if (w) return w.undo(); return b6(); }; redo = () => { const w = activeSide(); if (w) return w.redo(); return b5r(); }; }
  stage.addEventListener('pointerdown', () => window.__setActivePane('main'), true);
  { const b0 = updateUndoBtns; updateUndoBtns = () => { const w = activeSide(); if (w) { $('#undoBtn').disabled = !w.__ed.undo.length; $('#redoBtn').disabled = !w.__ed.redo.length; } else b0(); }; }
  const routeBtn = (sel, fn) => $(sel).addEventListener('click', e => { const w = activeSide(); if (!w) return; e.stopImmediatePropagation(); fn(w); }, true);
  routeBtn('#undoBtn', w => w.undo()); routeBtn('#redoBtn', w => w.redo());
  { const b1 = setTool; setTool = t => { b1(t); const w = sideWin(); if (w && w.__syncTool) w.__syncTool(t); }; }
  { const b2 = refreshToolbar; refreshToolbar = () => { b2(); const w = sideWin(); try { if (w && w.updateCursorStyle) w.updateCursorStyle(); } catch (e) { } }; }
  { const b3 = toolbarAction; toolbarAction = (id, b) => {
    const w = activeSide();
    if (w && id === 'image') { sideImage = w; $('#imgIn').click(); return; }
    if (w && ['capture', 'find', 'pgrid', 'sticky'].includes(id)) { w.toolbarAction(id); return; }
    b3(id, b);
    if (['invert', 'readonly'].includes(id)) { const sw = sideWin(); if (sw && sw.__syncView) sw.__syncView(); }
  }; }
  { const b4 = setInvert; setInvert = on => { b4(on); const sw = sideWin(); if (sw && sw.__syncView) sw.__syncView(); }; }
  { const b5 = setReadOnly; setReadOnly = (on, q) => { b5(on, q); const sw = sideWin(); try { if (sw && sw.setReadOnly && sw.__ed && sw.__ed.note) sw.setReadOnly(S.prefs.readOnly, true); } catch (e) { } }; }
  let sideImage = null;
  $('#imgIn').addEventListener('change', async e => {
    const w = sideImage; sideImage = null; if (!w) return;
    e.stopImmediatePropagation(); const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const r = await fileToDataUrl(f); w.insertImage(r.src, r.w / DPR(), r.h / DPR()); } catch (er) { toast('Görsel açılamadı.'); }
  }, true);
  // Android köprüsü olaylarını yan tarafa da ilet
  const fwd = name => { const base = window[name]; window[name] = (...a) => { const r = base ? base(...a) : undefined; try { const w = sideWin(); if (w && w[name]) w[name](...a); } catch (e) { } return r; }; };
  fwd('__penButton'); fwd('kenarFlush');
  const baseBack = window.kenarBack;
  if (baseBack) window.kenarBack = () => {
    const busy = document.querySelector('.modal-back, .od-back') || (pop && !pop.hidden) || ed.capture || ed.editing || ed.sel || TS.sel || dictEl;
    if (!busy && splitOpen()) { const w = sideWin(); let r = false; try { r = w && w.kenarBack && w.kenarBack(); } catch (e) { } if (!r) closeSplit(); return true; }
    if (dictEl) { closeDict(); return true; }
    if (TS.sel) { textSelClear(); return true; }
    return baseBack();
  };
}
