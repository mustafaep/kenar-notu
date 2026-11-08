'use strict';
/* =========================================================
   Yeni defter: kapak + sayfa şablonu seçimi; var olan notlara kapak ekleme/değiştirme;
   sayfa eklerken şablonlar. Çizimler covers.js'te.
   ========================================================= */
IC.cover = IC.cover || '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v18"/><path d="M12 8h4"/><path d="M12 11h3"/>';
const TPL_GROUPS = [['Kâğıt', PAPER_ORDER], ['Ders', ['cornell', 'okuma', 'harita']], ['Dil', ['kelime', 'gramer', 'yazma']], ['Sınav', ['hata']], ['Plan', ['haftalik', 'gunluk', 'toplanti']]];
const nbYear = () => String(new Date().getFullYear());
const coverOf = n => (n && n.pages && n.pages[0] && n.pages[0].bg === 'cover' && n.pages[0].cover) || (n && n.cover) || null;
window.coverOf = coverOf;

/* yüksek çözünürlüklü küçük tuval */
function nbCanvas(w, hgt) { const r = Math.min(3, Math.max(1, devicePixelRatio || 1)); const c = h('canvas', { width: Math.round(w * r), height: Math.round(hgt * r) }); c.style.width = w + 'px'; c.style.height = hgt + 'px'; c._r = r; return c; }
function paintCover(c, cover) { const ctx = c.getContext('2d'), k = c.width / 595; ctx.setTransform(k, 0, 0, k, 0, 0); drawCover(ctx, 595, 842, cover); }
/* kâğıt türleri kendi son ayarlarıyla çizilir (her tür ayrı hatırlanır) */
const paperPref = bg => PAPERS[bg] ? { ...((S.prefs.paperBy || {})[bg] || {}) } : null;
function paintPage(c, bg, paper) { const ctx = c.getContext('2d'); ctx.setTransform(1, 0, 0, 1, 0, 0); const pp = paper !== undefined ? paper : paperPref(bg); drawBg(ctx, { w: 595, h: 842, bg, ...(pp ? { paper: pp } : {}) }, c.width / 595); }
function savePaperPref(bg, paper) { if (!PAPERS[bg]) return; if (!S.prefs.paperBy) S.prefs.paperBy = {}; S.prefs.paperBy[bg] = { ...paper }; saveSettings(); }
window.paperPref = paperPref;
function coverCanvas(cover, width) { const c = h('canvas', { width: Math.round(width), height: Math.round(width * 842 / 595) }); paintCover(c, cover); return c; }
window.coverCanvas = coverCanvas;

/* ---------- seçim ekranı ----------
   mode 'new': yeni defter (kapak + sayfa). mode 'cover': var olan nota kapak (yalnız kapak sekmesi). */
function notebookSheet({ mode = 'new', title = '', cover = null, isPdf = false, bg: bg0 = null, paper: paper0 = null, onDone }) {
  const last = S.prefs.nbLast || {};
  const st = {
    d: cover ? cover.d : (last.d === null ? null : last.d || 'ebru'), pal: cover ? cover.pal : (last.pal || null),
    title: cover ? cover.title || title : title, sub: cover ? cover.sub || '' : '', year: cover ? !!cover.year : last.year !== false,
    seed: cover ? cover.seed : (Math.random() * 1e9) | 0, bg: bg0 || last.bg || 'lined', tab: mode === 'page' ? 'page' : 'cover', asPage: false, all: false
  };
  st.paper = paper0 ? { ...paper0 } : (paperPref(st.bg) || {});
  const back = h('div', { class: 'modal-back nbback' });
  const close = () => { back.remove(); removeEventListener('keydown', onKey, true); };
  const onKey = e => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); } };
  addEventListener('keydown', onKey, true);
  const curCover = () => st.d ? { d: st.d, pal: st.pal || COVERS[st.d].pal, title: st.title.trim() || (mode === 'new' ? 'Adsız defter' : title), sub: st.sub.trim(), year: st.year ? nbYear() : '', seed: st.seed } : null;

  // önizleme
  const pvCover = nbCanvas(208, 294), pvPage = nbCanvas(150, 212);
  const pvWrap = h('div', { class: 'nbpv' },
    h('figure', { class: 'nbbook' }, pvCover, h('figcaption', null, 'Kapak')),
    mode !== 'cover' ? h('figure', { class: 'nbpage' + (mode === 'page' ? ' big' : '') }, pvPage, h('figcaption', null, mode === 'page' ? 'Sayfa' : 'İlk sayfa')) : null);
  if (mode === 'page') pvWrap.firstChild.hidden = true;
  function paintPreview() {
    const c = curCover();
    pvCover.parentNode.classList.toggle('none', !c);
    if (c) paintCover(pvCover, c); else { const x = pvCover.getContext('2d'); x.setTransform(1, 0, 0, 1, 0, 0); x.clearRect(0, 0, pvCover.width, pvCover.height); }
    if (mode !== 'cover') paintPage(pvPage, st.bg, PAPERS[st.bg] ? st.paper : null);
  }

  // kapak sekmesi
  const tIn = h('input', { type: 'text', id: 'nbTitle', value: st.title, placeholder: 'ör. İngilizce kelimeler', maxlength: '60', autocomplete: 'off' });
  const sIn = h('input', { type: 'text', id: 'nbSub', value: st.sub, placeholder: 'ör. Ünite 1–20 (isteğe bağlı)', maxlength: '60', autocomplete: 'off' });
  const yIn = h('input', { type: 'checkbox', id: 'nbYear', class: 'switch', role: 'switch' }); yIn.checked = st.year;
  const covGrid = h('div', { class: 'nbcovers', role: 'radiogroup', 'aria-label': 'Kapak' });
  const palRow = h('div', { class: 'nbpals', role: 'radiogroup', 'aria-label': 'Renk' });
  const covTiles = {};
  const noneTile = h('button', { type: 'button', class: 'nbtile nbnone', role: 'radio', 'aria-label': 'Kapaksız', onclick: () => { st.d = null; sync(); } }, h('span', { class: 'nbx' }, 'Kapaksız'));
  covGrid.append(noneTile);
  for (const id of COVER_ORDER) {
    const c = nbCanvas(86, 122);
    const b = h('button', { type: 'button', class: 'nbtile', role: 'radio', 'aria-label': COVERS[id].name, onclick: () => { if (st.d !== id) { st.d = id; st.pal = null; } sync(); } }, c, h('span', null, COVERS[id].name));
    covTiles[id] = { b, c }; covGrid.append(b);
  }
  for (const pid of CV_PAL_ORDER) {
    const p = CV_PALS[pid];
    const b = h('button', { type: 'button', class: 'nbpal', role: 'radio', title: p.name, 'aria-label': p.name, onclick: () => { st.pal = pid; sync(); } }, h('i', { style: { background: p.base } }));
    b._pid = pid; palRow.append(b);
  }
  let tT = 0;
  const repaintTiles = () => { for (const id of COVER_ORDER) { const t = covTiles[id]; paintCover(t.c, { d: id, pal: st.d === id ? (st.pal || COVERS[id].pal) : COVERS[id].pal, title: st.title.trim() || 'Defter', sub: '', year: '', seed: st.seed }); } };
  tIn.addEventListener('input', () => { st.title = tIn.value; paintPreview(); clearTimeout(tT); tT = setTimeout(repaintTiles, 220); });
  sIn.addEventListener('input', () => { st.sub = sIn.value; paintPreview(); });
  yIn.addEventListener('change', () => { st.year = yIn.checked; paintPreview(); });
  const coverTab = h('div', { class: 'nbtab' },
    h('div', { class: 'nbfields' }, h('label', { class: 'field', for: 'nbTitle' }, mode === 'new' ? 'Defterin adı' : 'Kapaktaki başlık', tIn), h('label', { class: 'field', for: 'nbSub' }, 'Alt başlık', sIn)),
    covGrid,
    h('div', { class: 'nbpalw' }, h('span', { class: 'nblab' }, 'Renk'), palRow, h('label', { class: 'nbyear', for: 'nbYear' }, 'Yıl', yIn)),
    mode === 'cover' && isPdf ? toggleRow('nbAsPage', 'Kapağı ilk sayfa olarak da ekle', false, v => { st.asPage = v; }, 'Kapalıyken kapak yalnız kitaplıkta görünür, PDF dosyasına dokunulmaz') : null);

  // sayfa sekmesi
  const pageTiles = {};
  /* kâğıt ayarları: seçili kâğıt türü için aralık, renkler, kenar, başlık satırı */
  const paperBox = h('div', { class: 'nbpaper' });
  function buildPaperBox() {
    paperBox.innerHTML = '';
    const T = PAPERS[st.bg]; paperBox.hidden = !T; if (!T) return;
    const o = paperOpts(st.bg, st.paper), set = (k, v) => { st.paper[k] = v; buildPaperBox(); paintPreview(); const t = pageTiles[st.bg]; if (t) paintPage(t._c, st.bg, st.paper); };
    const row = (lab, ...els) => h('div', { class: 'nbprow' }, h('span', { class: 'nblab' }, lab), ...els);
    paperBox.append(h('div', { class: 'nbphead' }, h('b', null, T.name), h('small', null, 'kâğıt ayarları · bu tür için hatırlanır')));
    if (T.sps) paperBox.append(row('Aralık', segRow(T.sps.map(([mm, l], i) => [String(i), l + ' · ' + String(mm).replace('.', ',') + ' mm']), String(Math.min(T.sps.length - 1, st.paper.spi == null ? 1 : st.paper.spi)), v => set('spi', +v), 'Aralık')));
    const sw = (map, cur, key) => h('div', { class: 'nbsw' }, ...Object.entries(map).map(([k, [nm, col]]) => { const b = h('button', { type: 'button', class: 'nbswb' + (cur === k ? ' on' : ''), title: nm, 'aria-label': nm, 'aria-pressed': String(cur === k), onclick: () => set(key, k) }, h('i', { style: { background: col } })); return b; }));
    paperBox.append(row('Kâğıt', sw(PAPER_COLS, o.pcKey, 'pc'), o.dark ? h('small', { class: 'nbhint' }, 'Koyu kâğıtta açık renk kalem kullan') : null));
    if (st.bg !== 'seyes') paperBox.append(row('Çizgi', sw(LINE_COLS, o.lcKey, 'lc')));
    if (T.margin) paperBox.append(row('Kenar', segRow([['none', 'Yok'], ['left', 'Sol'], ['right', 'Sağ'], ['both', 'İki yan']], o.mg, v => set('mg', v), 'Kenar çizgisi')));
    const tg = h('div', { class: 'nbptg' },
      toggleRow('nbHd', 'Başlık satırı', !!o.hd, v => set('hd', v), 'Üstte konu ve tarih'),
      T.major ? toggleRow('nbMj', 'Her 5 karede koyu çizgi', o.mj !== false, v => set('mj', v), 'Ölçmeyi ve hizalamayı kolaylaştırır') : null);
    paperBox.append(tg);
  }
  const pageTab = h('div', { class: 'nbtab' });
  for (const [g, ids] of TPL_GROUPS) {
    const row = h('div', { class: 'nbtpls', role: 'radiogroup', 'aria-label': g });
    for (const id of ids) { const c = nbCanvas(70, 99); paintPage(c, id); const b = h('button', { type: 'button', class: 'nbtile pg', role: 'radio', 'aria-label': BG_NAMES[id], onclick: () => { if (st.bg !== id) { (st.papers = st.papers || {})[st.bg] = st.paper; st.bg = id; st.paper = st.papers[id] || paperPref(id) || {}; } sync(); } }, c, h('span', null, BG_NAMES[id])); b._c = c; pageTiles[id] = b; row.append(b); }
    pageTab.append(h('h4', { class: 'nbgrp' }, g), row);
    if (g === 'Kâğıt') pageTab.append(paperBox);
  }

  // sekmeler
  const tabs = mode === 'new' ? segRow([['cover', 'Kapak'], ['page', 'Sayfa şablonu']], st.tab, v => { st.tab = v; sync(); }, 'Bölüm') : null;
  const body = h('div', { class: 'nbbody' }, coverTab, pageTab);
  function sync() {
    coverTab.hidden = st.tab !== 'cover'; pageTab.hidden = st.tab !== 'page';
    noneTile.classList.toggle('on', !st.d); noneTile.setAttribute('aria-checked', String(!st.d));
    for (const id of COVER_ORDER) { const on = st.d === id; covTiles[id].b.classList.toggle('on', on); covTiles[id].b.setAttribute('aria-checked', String(on)); }
    const pal = st.d ? (st.pal || COVERS[st.d].pal) : null;
    for (const b of palRow.children) { const on = b._pid === pal; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); b.disabled = !st.d; }
    for (const id in pageTiles) { const on = st.bg === id; pageTiles[id].classList.toggle('on', on); pageTiles[id].setAttribute('aria-checked', String(on)); }
    buildPaperBox();
    repaintTiles(); paintPreview();
  }
  const okLabel = mode === 'new' ? 'Defteri oluştur' : mode === 'page' ? 'Uygula' : 'Kapağı uygula';
  const ttl = mode === 'new' ? 'Yeni defter' : mode === 'page' ? 'Sayfa kâğıdı' : 'Kapak';
  const box = h('div', { class: 'modal wide nbbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': ttl },
    h('div', { class: 'nbhead' }, h('h3', null, ttl), tabs, h('span', { class: 'grow' }),
      h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: close }, icon(IC.close))),
    h('div', { class: 'nbmain' }, pvWrap, body),
    h('div', { class: 'nbfoot' },
      mode === 'page' ? h('label', { class: 'nball', for: 'nbAll' }, (() => { const c = h('input', { type: 'checkbox', id: 'nbAll' }); c.addEventListener('change', () => { st.all = c.checked; }); return c; })(), 'Defterdeki bütün kâğıt sayfalarına uygula') : null,
      mode === 'cover' && cover ? h('button', { class: 'btn danger', type: 'button', onclick: () => { close(); onDone({ cover: null, remove: true }); } }, 'Kapağı kaldır') : null,
      h('span', { class: 'grow' }),
      h('button', { class: 'btn', type: 'button', onclick: close }, 'Vazgeç'),
      h('button', { class: 'btn primary', type: 'button', onclick: () => {
        const c = curCover();
        if (mode !== 'page') S.prefs.nbLast = { d: st.d, pal: st.pal, bg: st.bg, year: st.year }; savePaperPref(st.bg, st.paper); saveSettings();
        close(); onDone({ cover: c, bg: st.bg, paper: PAPERS[st.bg] ? { ...st.paper } : null, title: st.title.trim(), asPage: st.asPage, all: st.all });
      } }, okLabel)));
  back.append(box); back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  document.body.append(back);
  sync();
  setTimeout(() => { if (mode === 'new' && !st.title) tIn.focus(); }, 60);
}
window.notebookSheet = notebookSheet;

/* ---------- yeni defter ---------- */
async function newNotebook({ cover, bg, paper, title }) {
  const t = Date.now();
  const name = title || (cover && cover.title !== 'Adsız defter' ? cover.title : '') || 'Not · ' + new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' });
  const pages = [];
  if (cover) pages.push({ id: uid(), k: 'blank', w: 595, h: 842, bg: 'cover', cover });
  pages.push({ id: uid(), k: 'blank', w: 595, h: 842, bg: bg || 'lined', ...(paper ? { paper } : {}) });
  const note = { id: uid(), name, created: t, updated: t, opened: t, pages, ann: {}, od: null };
  const th = await renderThumb(note.pages[0], null, null, 240);
  await persistNoteRecord(note, th.toDataURL('image/jpeg', .85));
  await openNote(note.id);
  // kapaklı defter: yazmaya ilk sayfadan başla
  if (cover && typeof goToPage === 'function') setTimeout(() => goToPage(1), 120);
}
newBlankNote = async function (bg = 'lined') { return newNotebook({ cover: null, bg }); };
blankMenu = function () { notebookSheet({ mode: 'new', onDone: o => newNotebook(o) }); };
window.newNotebook = newNotebook;

/* ---------- var olan nota kapak ---------- */
async function coverForNote(id) {
  const open = ed.note && ed.note.id === id;
  if (open) finishAll();
  const n = open ? ed.note : await Store.get('notes', id); if (!n) return;
  const isPdf = n.kind === 'md' || n.pages.some(p => p.k === 'pdf');
  const cur = coverOf(n), onPage = !!(n.pages[0] && n.pages[0].bg === 'cover');
  notebookSheet({ mode: 'cover', title: n.name, cover: cur, isPdf: isPdf && !onPage, onDone: async ({ cover, remove, asPage }) => {
    const base = n.pages[0] && n.pages[0].k !== 'pdf' ? n.pages[0] : { w: 595, h: 842 };
    const portrait = (base.w || 595) <= (base.h || 842);
    const mk = c => ({ id: uid(), k: 'blank', w: portrait ? 595 : 842, h: portrait ? 842 : 595, bg: 'cover', cover: c });
    const pageWay = !remove && (onPage || !isPdf || asPage);
    if (open && (onPage || pageWay || remove)) {
      if (remove) { if (onPage) pagesOp(pages => pages.splice(0, 1)); delete n.cover; }
      else if (onPage) { n.pages[0].cover = cover; delete n.cover; ed.pageVer.set(n.pages[0].id, (ed.pageVer.get(n.pages[0].id) || 0) + 1); rebuildAfterPages(); changed(null); }
      else { pagesOp(pages => pages.unshift(mk(cover))); delete n.cover; }
      if (remove && !onPage) changed(null);
      await saveNote(true); toast(remove ? 'Kapak kaldırıldı' : 'Kapak uygulandı', 1500); return;
    }
    if (remove) { if (onPage) n.pages.shift(); delete n.cover; }
    else if (pageWay) { if (onPage) n.pages[0].cover = cover; else n.pages.unshift(mk(cover)); delete n.cover; }
    else n.cover = cover;
    let th;
    try {
      const c0 = coverOf(n);
      if (c0) th = coverCanvas(c0, 240).toDataURL('image/jpeg', .85);
      else if (n.pages[0] && n.pages[0].k !== 'pdf') th = (await renderThumb(n.pages[0], n.ann[n.pages[0].id], null, 240)).toDataURL('image/jpeg', .85);
      else if (n.kind !== 'md') { const rec = await Store.get('pdfs', n.id); const doc = rec && await loadPdf(rec.bytes || rec.data); th = (await renderThumb(n.pages[0], n.ann[n.pages[0].id], doc, 240)).toDataURL('image/jpeg', .85); }
      else if (typeof mdThumb === 'function') th = await mdThumb(n);
    } catch (e) { }
    await persistNoteRecord(n, th);
    if (typeof renderLibrary === 'function') renderLibrary();
    toast(remove ? 'Kapak kaldırıldı' : 'Kapak uygulandı', 1500);
  } });
}
window.coverForNote = coverForNote;

/* PDF ya da md notunda kapak yalnız kitaplıkta: küçük resim her kayıtta kapaktan alınır (başka yerler sayfa resmi verse de) */
{
  const pr = persistNoteRecord;
  persistNoteRecord = async function (note, thumb) {
    if (thumb !== undefined && note && note.cover && !(note.pages && note.pages[0] && note.pages[0].bg === 'cover')) {
      try { thumb = coverCanvas(note.cover, 240).toDataURL('image/jpeg', .85); } catch (e) { }
    }
    return pr(note, thumb);
  };
}

/* ---------- sayfa eklerken şablonlar ---------- */
addPagePicker = function (anchor, idx) {
  const lastBg = (ed.pvs[Math.max(0, idx - 1)] && ed.pvs[Math.max(0, idx - 1)].meta.bg) || null;
  openPop(anchor, () => {
    const wrap = h('div', { class: 'col nbpick' }, h('h3', null, idx >= ed.pvs.length ? 'Sona sayfa ekle' : `Sayfa ${idx + 1} olarak ekle`));
    if (lastBg && lastBg !== 'cover' && (TPLS[lastBg] || BG_NAMES[lastBg])) {
      const lastPaper = ed.pvs[Math.max(0, idx - 1)].meta.paper; const c = nbCanvas(48, 68); paintPage(c, lastBg, lastPaper || null);
      wrap.append(h('button', { type: 'button', class: 'nbsame', onclick: () => { closePop(); addPageAt(idx, lastBg, lastPaper ? { ...lastPaper } : null); } }, c, h('span', null, h('b', null, 'Öncekiyle aynı'), h('small', null, BG_NAMES[lastBg]))));
    }
    for (const [g, ids] of TPL_GROUPS) {
      const grid = h('div', { class: 'tpls' });
      for (const bg of ids) { const c = nbCanvas(48, 68); paintPage(c, bg); grid.append(h('button', { type: 'button', class: 'tpl', onclick: () => { closePop(); addPageAt(idx, bg, paperPref(bg)); } }, c, BG_NAMES[bg])); }
      wrap.append(h('h4', { class: 'nbgrp' }, g), grid);
    }
    return wrap;
  });
};

/* ---------- sayfanın kâğıdını değiştir ---------- */
function changePaper(i) {
  const pv = ed.pvs[i]; if (!pv || pv.meta.k !== 'blank' || pv.meta.bg === 'cover') return;
  notebookSheet({ mode: 'page', bg: pv.meta.bg || 'plain', paper: pv.meta.paper || null, onDone: ({ bg, paper, all }) => {
    const ids = all ? ed.note.pages.filter(p => p.k === 'blank' && p.bg !== 'cover' && (PAPERS[p.bg || 'plain'] || p === pv.meta)).map(p => p.id) : [pv.meta.id];
    pagesOp(pages => { for (let k = 0; k < pages.length; k++) if (ids.includes(pages[k].id)) { const m = { ...pages[k], bg }; if (paper) m.paper = paper; else delete m.paper; pages[k] = m; } });
    for (const id of ids) ed.pageVer.set(id, (ed.pageVer.get(id) || 0) + 1);
    toast(ids.length > 1 ? ids.length + ' sayfanın kâğıdı değişti' : 'Sayfanın kâğıdı değişti', 1500);
  } });
}
window.changePaper = changePaper;
