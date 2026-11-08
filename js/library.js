'use strict';
/* =========================================================
   Kitaplık: notlar, son açılanlar, favoriler, ekran görüntüleri
   ========================================================= */
const VIEWS = { all: 'Tüm notlar', recent: 'Son açılanlar', fav: 'Favoriler', shots: 'Ekran görüntüleri' };
let libState = { view: 'all', sel: null };
/* ---------- klasörler (ayarlarda tutulur; not–klasör ilişkisi meta.folder) ---------- */
const FOLDER_COLORS = ['#2F5BEA', '#EE5A43', '#2F9E44', '#F2B705', '#6741D9', '#0C8599', '#C2255C', '#5A6478'];
function folders() { if (!Array.isArray(S.folders)) S.folders = []; return S.folders; }
function folderById(id) { return id ? folders().find(f => f.id === id) || null : null; }
function curFolder() { return libState.view.startsWith('f:') ? libState.view.slice(2) : null; }
function childFolders(pid) { return folders().filter(f => (f.parent || null) === (pid || null)).sort((a, b) => a.name.localeCompare(b.name, 'tr')); }
function folderPath(id) { const out = []; let f = folderById(id), guard = 0; while (f && guard++ < 50) { out.unshift(f); f = folderById(f.parent); } return out; }
function subtreeIds(id) { const out = new Set([id]); let grew = true; while (grew) { grew = false; for (const f of folders()) if (f.parent && out.has(f.parent) && !out.has(f.id)) { out.add(f.id); grew = true; } } return out; }
libState.view = (S.libView in VIEWS) || (String(S.libView).startsWith('f:') && folderById(String(S.libView).slice(2))) ? S.libView : 'all';
function setLibView(v) { libState.view = v; libState.sel = null; if (!EMBED) { S.libView = v; saveSettings(); } renderLibrary(); try { $('#libMain').scrollTop = 0; } catch (e) { } }
function libGoBack() { const f = folderById(curFolder()); setLibView(f && f.parent && folderById(f.parent) ? 'f:' + f.parent : 'all'); }
function libSelecting() { return !!libState.sel; }
function libSelectEnd() { libState.sel = null; renderLibrary(); }
function newFolder(parent, after) {
  const inp = h('input', { type: 'text', id: 'folderIn', value: '', maxlength: '60', placeholder: 'Örn. Ders notları' });
  let color = FOLDER_COLORS[folders().length % FOLDER_COLORS.length];
  const sw = h('div', { class: 'fcolors' }); FOLDER_COLORS.forEach(c => { const b = h('button', { type: 'button', class: 'sw' + (c === color ? ' on' : ''), style: { background: c }, 'aria-label': 'Renk ' + c, onclick: () => { color = c; [...sw.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); } }); sw.append(b); });
  const pf = folderById(parent);
  modal({ title: 'Yeni klasör', text: pf ? `“${pf.name}” içinde oluşturulacak.` : null, body: h('div', { class: 'col', style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, h('label', { class: 'field', for: 'folderIn' }, 'Klasör adı', inp), sw),
    actions: [{ label: 'Vazgeç' }, { label: 'Oluştur', kind: 'primary', onClick: () => { const v = inp.value.trim(); if (!v) { toast('Bir ad yazın'); return false; } const f = { id: uid(), name: v, color, parent: parent || null, created: Date.now() }; folders().push(f); saveSettings(); if (after) after(f); else renderLibrary(); toast('Klasör oluşturuldu', 1200); } }] });
}
function renameFolder(f) {
  const inp = h('input', { type: 'text', id: 'folderIn', value: f.name, maxlength: '60' });
  let color = f.color || FOLDER_COLORS[0];
  const sw = h('div', { class: 'fcolors' }); FOLDER_COLORS.forEach(c => { const b = h('button', { type: 'button', class: 'sw' + (c === color ? ' on' : ''), style: { background: c }, 'aria-label': 'Renk ' + c, onclick: () => { color = c; [...sw.children].forEach(x => x.classList.remove('on')); b.classList.add('on'); } }); sw.append(b); });
  modal({ title: 'Klasörü düzenle', body: h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } }, h('label', { class: 'field', for: 'folderIn' }, 'Klasör adı', inp), sw),
    actions: [{ label: 'Vazgeç' }, { label: 'Kaydet', kind: 'primary', onClick: () => { const v = inp.value.trim(); if (!v) return false; f.name = v; f.color = color; saveSettings(); renderLibrary(); } }] });
}
async function deleteFolder(f) {
  const ids = subtreeIds(f.id); const metas = (await Store.all('meta')).filter(m => ids.has(m.folder));
  modal({ title: `“${f.name}” silinsin mi?`, text: metas.length ? `Klasör${ids.size > 1 ? ' ve alt klasörleri' : ''} silinir. İçindeki ${metas.length} not silinmez; ${folderById(f.parent) ? '“' + folderById(f.parent).name + '”' : '“Tüm notlar”'} altına taşınır.` : 'Klasör boş; yalnızca klasör kaldırılır.',
    actions: [{ label: 'Vazgeç' }, { label: 'Klasörü sil', kind: 'danger', onClick: async () => {
      for (const m of metas) { m.folder = f.parent || null; await Store.put('meta', m); }
      S.folders = folders().filter(x => !ids.has(x.id)); saveSettings();
      if (curFolder() && ids.has(curFolder())) setLibView(f.parent ? 'f:' + f.parent : 'all'); else renderLibrary();
      toast('Klasör silindi');
    } }] });
}
/* Klasör seçici: notları ya da bir klasörü taşımak için */
function folderPicker(title, exclude, onPick) {
  const list = h('div', { class: 'fpick' });
  let close = null;
  const row = (f, depth) => {
    const dis = exclude && f && exclude.has(f.id);
    list.append(h('button', { type: 'button', class: 'fprow', disabled: dis ? true : null, style: { paddingLeft: (12 + depth * 20) + 'px' }, onclick: async () => { close(); await onPick(f ? f.id : null); } },
      h('span', { class: 'fico', style: { color: f ? f.color : 'var(--muted)' } }, icon(f ? IC.folder : IC.notes)), h('span', null, f ? f.name : 'Klasörsüz (Tüm notlar)')));
    if (f) for (const c of childFolders(f.id)) row(c, depth + 1);
  };
  row(null, 0); for (const f of childFolders(null)) row(f, 0);
  close = modal({ title, body: list, actions: [{ label: 'Yeni klasör', onClick: () => { newFolder(null, async nf => { await onPick(nf.id); }); } }, { label: 'Vazgeç' }] });
}
async function moveNotesTo(ids, fid) {
  for (const id of ids) { const m = await Store.get('meta', id); if (m) { m.folder = fid || null; await Store.put('meta', m); } }
  const f = folderById(fid); toast(`${ids.length > 1 ? ids.length + ' not' : 'Not'} ${f ? '“' + f.name + '” klasörüne' : 'klasör dışına'} taşındı`, 1800);
  renderLibrary();
}
function folderMenu(anchor, f) {
  openPop(anchor, () => menu([
    { label: 'Aç', icon: IC.folder, onClick: () => setLibView('f:' + f.id) },
    { label: 'İçinde yeni klasör', icon: IC.folderPlus, onClick: () => newFolder(f.id) },
    { label: 'Ad ve renk', icon: IC.rename, onClick: () => renameFolder(f) },
    { label: 'Taşı…', icon: IC.move, onClick: () => folderPicker(`“${f.name}” nereye taşınsın?`, subtreeIds(f.id), pid => { f.parent = pid || null; saveSettings(); renderLibrary(); toast('Klasör taşındı', 1200); }) },
    '-',
    { label: 'Klasörü sil', icon: IC.trash, danger: true, onClick: () => deleteFolder(f) }
  ]));
}

function newMeta(note, thumb, old) {
  return {
    id: note.id, name: note.name, created: note.created, updated: note.updated, opened: (old && old.opened) || note.opened || note.updated,
    pageCount: note.pages.length, hasPdf: note.pages.some(p => p.k === 'pdf'), thumb: thumb !== undefined ? thumb : (old && old.thumb) || null,
    sample: !!note.sample, fav: !!(old && old.fav), folder: old ? (old.folder || null) : (note.folder !== undefined ? note.folder : curFolder()), odId: note.od ? note.od.id : null, odETag: note.od ? note.od.eTag : null,
    odState: note.od ? note.od.state || null : null,
    cover: !!(note.cover || (note.pages && note.pages[0] && note.pages[0].bg === 'cover'))
  };
}
async function persistNoteRecord(note, thumb) {
  const ids = new Set(note.pages.map(p => p.id)); const annOut = {};
  for (const k in note.ann) { const a = note.ann[k]; if (ids.has(k) && (a.s.length || a.t.length || (a.i && a.i.length) || (a.n && a.n.length))) annOut[k] = a; }
  await Store.put('notes', { ...note, ann: annOut });
  const old = await Store.get('meta', note.id);
  await Store.put('meta', newMeta(note, thumb, old));
}
async function createNoteFromPdf(name, bytes, opt = {}) {
  const doc = await loadPdf(bytes);
  const pages = await pdfPagesMeta(doc, opt.onProg);
  const t = Date.now();
  const note = { id: opt.id || uid(), name: name || 'Adsız PDF', created: t, updated: t, opened: t, pages, ann: {}, od: opt.od || null };
  // PDF'te Kenar Notu'nun yazdığı yapışkan notlar varsa geri al (açılır kapanır notlar olarak)
  await knImportInto(note, doc, bytes);
  const th = await renderThumb(pages[0], note.ann[pages[0].id] || null, doc, 240);
  await doc.destroy();
  await Store.put('pdfs', { id: note.id, bytes });
  await persistNoteRecord(note, th.toDataURL('image/jpeg', .82));
  return note;
}
/* kaynak PDF'in bilgileri ve içindeki notlar → nota; OneDrive bağlıysa senkronizasyon tabanı da kurulur */
async function knImportInto(note, doc, bytes) {
  note.srcPages = note.pages.length;
  let cu = {}; try { const md = await doc.getMetadata(); cu = (md && md.info && md.info.Custom) || {}; } catch (e) { }
  note.srcBody = typeof cu.KNBody === 'string' ? cu.KNBody : null;
  try { note.srcHash = await knSha(bytes); } catch (e) { }
  if (+cu.KNNotes > 0) {
    try {
      const kn = await readKnNotes(bytes, note.pages);
      kn.pages.forEach((list, i) => { const p = note.pages[i]; if (p && list.length) { const A = note.ann[p.id] || (note.ann[p.id] = { s: [], t: [], i: [], n: [] }); A.n = list; } });
    } catch (e) { }
  }
  if (note.od) { note.od.base = stickyBase(note); pushBody(note.od, await noteBodyFp(note, bytes)); }
}
async function importPdf(file) {
  if (!file) return;
  if (!/pdf$/i.test(file.type) && !/\.pdf$/i.test(file.name)) { toast('Yalnızca PDF dosyaları eklenebilir.'); return; }
  const pr = progress('PDF açılıyor…');
  try {
    const buf = await file.arrayBuffer();
    const note = await createNoteFromPdf(file.name.replace(/\.pdf$/i, ''), buf, { onProg: (i, n) => pr.set(i / n, `Sayfalar hazırlanıyor ${i}/${n}`) });
    pr.done(); openNote(note.id);
  } catch (e) {
    pr.done();
    toast(e && e.name === 'PasswordException' ? 'Bu PDF parola korumalı. Parolasız bir kopyasını ekleyin.' : (e && e.message && e.message.startsWith('PDF motoru') ? e.message : 'PDF açılamadı. Dosya bozuk olabilir.'), 4200);
  }
}
async function newBlankNote(bg = 'lined') {
  const t = Date.now();
  const note = { id: uid(), name: 'Not · ' + new Date(t).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' }), created: t, updated: t, opened: t, pages: [{ id: uid(), k: 'blank', w: 595, h: 842, bg }], ann: {}, od: null };
  const th = await renderThumb(note.pages[0], null, null, 240);
  await persistNoteRecord(note, th.toDataURL('image/jpeg', .82));
  openNote(note.id);
}
function blankMenu(anchor) {
  openPop(anchor, () => {
    const grid = h('div', { class: 'tpls' });
    for (const bg of ['plain', 'lined', 'grid', 'dots']) {
      const cv = h('canvas', { width: 96, height: 128 }); drawBg(cv.getContext('2d'), { w: 96, h: 128, bg }, 1);
      grid.append(h('button', { type: 'button', class: 'tpl', onclick: () => { closePop(); newBlankNote(bg); } }, cv, BG_NAMES[bg]));
    }
    return h('div', { class: 'col' }, h('h3', null, 'Boş not'), grid);
  });
}

/* ---------- yan menü ---------- */
async function refreshRail() {
  const metas = await Store.all('meta'); const shots = await Store.all('shots');
  $('#railLogo').innerHTML = LOGO_SVG(40) + '<span class="wm">Kenar <em>Notu</em></span>';
  const counts = { all: metas.length, recent: Math.min(20, metas.length), fav: metas.filter(m => m.fav).length, shots: shots.length };
  const ics = { all: IC.notes, recent: IC.clock, fav: IC.star, shots: IC.shots };
  const nav = $('#navMain'); nav.innerHTML = '';
  for (const v in VIEWS) nav.append(h('button', { type: 'button', class: 'navi' + (libState.view === v ? ' on' : ''), 'aria-current': libState.view === v ? 'page' : null, onclick: () => setLibView(v) }, icon(ics[v]), h('span', null, VIEWS[v]), counts[v] && v !== 'recent' ? h('span', { class: 'cnt' }, String(counts[v])) : null));
  const fnav = $('#navFolders'); fnav.innerHTML = '';
  const cur = curFolder(), top = cur ? (folderPath(cur)[0] || {}).id : null;
  fnav.append(h('div', { class: 'lblrow' }, h('span', { class: 'lbl' }, 'Klasörler'), h('button', { type: 'button', class: 'ibtn small', 'aria-label': 'Yeni klasör', title: 'Yeni klasör', onclick: () => newFolder(null) }, icon(IC.folderPlus))));
  const fcount = id => { const ids = subtreeIds(id); return metas.filter(m => ids.has(m.folder)).length; };
  for (const f of childFolders(null)) {
    const b = h('button', { type: 'button', class: 'navi' + (top === f.id ? ' on' : ''), onclick: () => setLibView('f:' + f.id) }, h('span', { class: 'fico', style: { color: f.color } }, icon(IC.folder)), h('span', null, f.name), h('span', { class: 'cnt' }, String(fcount(f.id) || '')));
    let lt = 0; b.addEventListener('pointerdown', () => { clearTimeout(lt); lt = setTimeout(() => { b._long = true; folderMenu(b, f); }, 520); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => b.addEventListener(t, () => clearTimeout(lt)));
    b.addEventListener('click', e => { if (b._long) { b._long = false; e.stopImmediatePropagation(); } }, true);
    b.addEventListener('contextmenu', e => { e.preventDefault(); folderMenu(b, f); });
    fnav.append(b);
  }
  if (!folders().length) fnav.append(h('button', { type: 'button', class: 'navi dim', onclick: () => newFolder(null) }, icon(IC.folderPlus), h('span', null, 'Klasör oluştur')));
  const cloud = $('#navCloud'); cloud.innerHTML = '';
  cloud.append(h('span', { class: 'lbl' }, 'Bulut'),
    h('button', { type: 'button', class: 'navi', onclick: () => openOneDrive() }, icon(IC.cloud), h('span', null, 'OneDrive', h('small', null, OD.signedIn() ? OD.accountName() : Native ? DV.Daki + ' OneDrive ile' : OD.clientId() ? 'Giriş yapılmadı' : 'Bağlanmadı')), h('span', { class: 'dot' + (OD.signedIn() || Native ? ' ok' : '') })),
    h('button', { type: 'button', class: 'navi', onclick: () => openSettings() }, icon(IC.gear), h('span', null, 'Ayarlar')));
  $('#penCard').innerHTML = '';
  $('#penCard').append(h('span', null, h('small', null, 'S Pen')), h('div', { class: 'row' }, h('span', { class: 'dot' + (S.prefs.penSeen ? ' ok' : '') }), S.prefs.penSeen ? 'Algılandı: basınç ve eğim açık' : 'Kalemle ekrana dokunun'));
}

/* ---------- içerik ---------- */
async function renderLibrary() {
  if (libState.view.startsWith('f:') && !folderById(curFolder())) libState.view = 'all';
  await refreshRail();
  const v = libState.view, fid = curFolder(), fold = folderById(fid);
  const crumbs = $('#libCrumbs'); crumbs.innerHTML = ''; crumbs.hidden = !fold;
  if (fold) {
    crumbs.append(h('button', { type: 'button', onclick: () => setLibView('all') }, 'Tüm notlar'));
    for (const f of folderPath(fid).slice(0, -1)) crumbs.append(h('span', null, '›'), h('button', { type: 'button', onclick: () => setLibView('f:' + f.id) }, f.name));
  }
  $('#libTitle').textContent = fold ? fold.name : VIEWS[v];
  $('#sortSel').parentElement.hidden = v === 'shots' || v === 'recent';
  $('#q').parentElement.hidden = v === 'shots';
  $('#selBtn').hidden = v === 'shots';
  $('#selBtn').classList.toggle('on', !!libState.sel);
  $('#selBtn').lastChild.textContent = libState.sel ? 'Bitti' : 'Seç';
  $('#sortSel').value = S.sort;
  const box = $('#libContent'); box.innerHTML = '';
  renderSelBar();
  if (v === 'shots') return renderShots(box);
  let all = await Store.all('meta');
  const q = $('#q').value.trim().toLocaleLowerCase('tr');
  let metas = all;
  if (v === 'fav') metas = metas.filter(m => m.fav);
  if (fold) { const ids = q ? subtreeIds(fid) : new Set([fid]); metas = metas.filter(m => ids.has(m.folder)); }
  const sort = v === 'recent' ? 'opened' : S.sort;
  const key = { updated: m => -m.updated, opened: m => -(m.opened || m.updated), created: m => -m.created, name: m => m.name.toLocaleLowerCase('tr') }[sort];
  metas.sort((a, b) => { const x = key(a), y = key(b); return typeof x === 'string' ? x.localeCompare(y, 'tr') : x - y; });
  if (v === 'recent') metas = metas.slice(0, 20);
  const list = q ? metas.filter(m => m.name.toLocaleLowerCase('tr').includes(q)) : metas;
  // klasör kutucukları
  const subs = (v === 'all' || fold) && !q && !libState.sel ? childFolders(fid) : [];
  if (subs.length || fold) {
    const fg = h('div', { class: 'fgrid' }); box.append(fg);
    for (const f of subs) {
      const ids = subtreeIds(f.id); const cnt = all.filter(m => ids.has(m.folder)).length; const nsub = childFolders(f.id).length;
      const more = h('button', { class: 'ibtn', type: 'button', 'aria-label': f.name + ' seçenekleri' }, icon(IC.dotsV));
      more.addEventListener('click', e => { e.stopPropagation(); folderMenu(more, f); });
      const tile = h('div', { class: 'ftile', role: 'button', tabindex: '0', 'aria-label': f.name + ' klasörü', onclick: () => setLibView('f:' + f.id), onkeydown: e => { if (e.key === 'Enter') setLibView('f:' + f.id); } },
        h('span', { class: 'fico', style: { color: f.color } }, icon(IC.folder)), h('span', { class: 'ft' }, h('b', null, f.name), h('small', null, `${cnt} not${nsub ? ' · ' + nsub + ' klasör' : ''}`)), more);
      tile.addEventListener('contextmenu', e => { e.preventDefault(); folderMenu(tile, f); });
      fg.append(tile);
    }
    fg.append(h('button', { type: 'button', class: 'ftile add', onclick: () => newFolder(fid) }, h('span', { class: 'fico' }, icon(IC.folderPlus)), h('span', { class: 'ft' }, h('b', null, fold ? 'Alt klasör' : 'Yeni klasör'))));
  }
  const grid = h('div', { class: 'grid' }); box.append(grid);
  if (!metas.length) {
    const addBtn = v === 'fav' ? null : h('button', { class: 'btn primary', type: 'button', onclick: e => newMenu(e.currentTarget) }, icon(IC.plus), 'Yeni not ya da PDF');
    grid.append(h('div', { class: 'empty' }, h('strong', null, fold ? 'Bu klasör boş' : v === 'fav' ? 'Favori not yok' : 'Henüz not yok'),
      h('span', null, fold ? 'Sağ üstteki “Yeni” ile PDF ya da boş not ekleyin; eklediğiniz notlar bu klasöre girer. Var olan bir notu taşımak için notun ⋮ menüsünden “Klasöre taşı”yı seçin.' : v === 'fav' ? 'Bir notun menüsünden “Favorilere ekle”yi seçin.' : 'PDF ekleyin, OneDrive’dan açın ya da boş bir sayfayla başlayın.'), addBtn));
    return;
  }
  if (!list.length) { grid.append(h('p', { class: 'notice' }, `“${$('#q').value}” ile eşleşen not yok.`)); return; }
  const sel = libState.sel;
  for (const m of list) {
    const more = h('button', { class: 'ibtn', type: 'button', 'aria-label': m.name + ' seçenekleri' }, icon(IC.dotsV));
    more.addEventListener('click', e => { e.stopPropagation(); noteMenu(more, m); });
    const thumb = h('div', { class: 'thumb' + (m.cover ? ' book' : '') }, m.thumb ? h('img', { src: m.thumb, alt: '' }) : h('span', { class: 'ph' }, 'Önizleme yok'));
    if (m.sample) thumb.append(h('span', { class: 'badge' }, 'Örnek'));
    if (m.kind === 'md') thumb.append(h('span', { class: 'kindb' }, 'MD'));
    if (m.fav) thumb.append(h('span', { class: 'starb', title: 'Favori' }, icon(IC.star)));
    if (m.odId) { const busy = syncingIds.has(m.id), bad = !busy && (m.odState === 'conflict' || m.odState === 'error' || m.odState === 'readonly'); thumb.append(h('span', { class: 'cloudb' + (bad ? ' warn' : '') + (busy ? ' busy' : ''), title: busy ? 'Kaydediliyor…' : bad ? 'OneDrive’a yazılamadı' : 'OneDrive’a bağlı' }, icon(busy ? IC.sync : bad ? IC.cloudOff : IC.cloudOk))); }
    if (sel) thumb.append(h('span', { class: 'chk' + (sel.has(m.id) ? ' on' : '') }, icon(IC.check)));
    const fo = !fold && folderById(m.folder);
    const card = h('article', { class: 'card' + (sel && sel.has(m.id) ? ' sel' : '') },
      h('button', { class: 'open', type: 'button', onclick: () => { if (libState.sel) { if (sel.has(m.id)) sel.delete(m.id); else sel.add(m.id); renderLibrary(); } else openNote(m.id); }, 'aria-label': m.name + (sel ? ' seç' : ' notunu aç') }, thumb),
      h('div', { class: 'card-meta' }, h('div', { class: 't' }, h('div', { class: 'n' }, m.name), h('div', { class: 'd' }, `${posLabel(m)}${fmtDate(v === 'recent' ? (m.opened || m.updated) : m.updated)}`),
        fo ? h('div', { class: 'fchip', style: { color: fo.color } }, icon(IC.folder), h('span', null, fo.name)) : null), sel ? null : more));
    // basılı tut: seçim modu
    let lt = 0; const ob = card.querySelector('.open');
    ob.addEventListener('pointerdown', () => { clearTimeout(lt); lt = setTimeout(() => { if (!libState.sel) { libState.sel = new Set([m.id]); ob._long = true; try { navigator.vibrate && navigator.vibrate(10); } catch (e) { } renderLibrary(); } }, 560); });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(t => ob.addEventListener(t, () => clearTimeout(lt)));
    ob.addEventListener('click', e => { if (ob._long) { ob._long = false; e.stopImmediatePropagation(); } }, true);
    grid.append(card);
  }
}
function renderSelBar() {
  let bar = $('#libSelBar'); const sel = libState.sel;
  if (!sel) { if (bar) bar.remove(); return; }
  if (!bar) { bar = h('div', { class: 'libselbar', id: 'libSelBar' }); $('#libView').append(bar); }
  bar.innerHTML = '';
  const ids = [...sel];
  bar.append(h('b', null, ids.length ? `${ids.length} not seçildi` : 'Not seçin'),
    h('button', { class: 'btn small', type: 'button', disabled: !ids.length, onclick: () => folderPicker(`${ids.length} not nereye taşınsın?`, null, fid => moveNotesTo(ids, fid).then(() => { libState.sel = null; renderLibrary(); })) }, icon(IC.folder), 'Klasöre taşı'),
    h('button', { class: 'btn small', type: 'button', disabled: !ids.length, onclick: async () => { const ms = await Promise.all(ids.map(id => Store.get('meta', id))); const on = !ms.every(m => m && m.fav); for (const m of ms) if (m) { m.fav = on; await Store.put('meta', m); } renderLibrary(); } }, icon(IC.star), 'Favori'),
    h('button', { class: 'btn small danger', type: 'button', disabled: !ids.length, onclick: () => modal({ title: `${ids.length} not silinsin mi?`, text: 'Seçilen notlar ve üzerlerindeki tüm yazılar bu ' + DV.dan + ' kalıcı olarak silinir. OneDrive’daki dosyalara dokunulmaz.', actions: [{ label: 'Vazgeç' }, { label: 'Sil', kind: 'danger', onClick: async () => { for (const id of ids) { await Store.del('meta', id); await Store.del('notes', id); await Store.del('pdfs', id); } libState.sel = null; renderLibrary(); toast(`${ids.length} not silindi`); } }] }) }, icon(IC.trash), 'Sil'),
    h('button', { class: 'btn small primary', type: 'button', onclick: libSelectEnd }, 'Bitti'));
}
function noteMenu(anchor, m) {
  openPop(anchor, () => menu([
    { label: 'Yeniden adlandır', icon: IC.rename, onClick: () => renameNote(m) },
    window.coverForNote ? { label: m.cover ? 'Kapağı değiştir' : 'Kapak ekle', icon: IC.cover, sub: m.hasPdf || m.kind === 'md' ? 'PDF’e dokunmadan kitaplıkta görünür' : 'Defterin ilk sayfası olur', onClick: () => coverForNote(m.id) } : null,
    { label: m.fav ? 'Favorilerden çıkar' : 'Favorilere ekle', icon: IC.star, onClick: async () => { m.fav = !m.fav; await Store.put('meta', m); renderLibrary(); } },
    { label: 'Klasöre taşı…', icon: IC.folder, sub: folderById(m.folder) ? 'Şu an: ' + folderById(m.folder).name : 'Klasörsüz', onClick: () => folderPicker(`“${m.name}” nereye taşınsın?`, null, fid => moveNotesTo([m.id], fid)) },
    { label: 'Seç', icon: IC.checkSq, onClick: () => { libState.sel = new Set([m.id]); renderLibrary(); } },
    { label: 'PDF olarak kaydet', icon: IC.dl, onClick: () => exportFromLibrary(m.id) },
    navigator.canShare ? { label: 'Paylaş', icon: IC.up, onClick: () => exportFromLibrary(m.id, true) } : null,
    m.odId ? { label: 'OneDrive bağlantısını kaldır', icon: IC.cloudOff, sub: 'Not bu ' + DV.da + ' kalır', onClick: async () => { const n = await Store.get('notes', m.id); if (n) { n.od = null; await persistNoteRecord(n); renderLibrary(); toast('OneDrive bağlantısı kaldırıldı'); } } } : null,
    { label: 'Çoğalt', icon: IC.copy, onClick: () => duplicateNote(m.id) },
    '-',
    { label: 'Sil', icon: IC.trash, danger: true, onClick: () => confirmDelete(m) }
  ]));
}
function renameNote(m) {
  const inp = h('input', { type: 'text', id: 'renameIn', value: m.name, maxlength: '120' });
  modal({ title: 'Yeniden adlandır', body: h('label', { class: 'field', for: 'renameIn' }, 'Not adı', inp), actions: [{ label: 'Vazgeç' }, { label: 'Kaydet', kind: 'primary', onClick: async () => { const v = inp.value.trim(); if (!v) return false; const n = await Store.get('notes', m.id); if (n) { n.name = v; await Store.put('notes', n); } m.name = v; await Store.put('meta', m); renderLibrary(); } }] });
}
function confirmDelete(m) {
  modal({ title: 'Not silinsin mi?', text: `“${m.name}” ve üzerindeki tüm notlar bu ${DV.dan} kalıcı olarak silinir.${m.odId ? ' OneDrive’daki dosyaya dokunulmaz.' : ''}`, actions: [{ label: 'Vazgeç' }, { label: 'Sil', kind: 'danger', onClick: async () => { await Store.del('meta', m.id); await Store.del('notes', m.id); await Store.del('pdfs', m.id); renderLibrary(); toast('Not silindi'); } }] });
}
async function duplicateNote(id) {
  const n = await Store.get('notes', id), m = await Store.get('meta', id); if (!n || !m) return;
  const nid = uid(); const t = Date.now();
  const copy = { ...n, id: nid, name: n.name + ' (kopya)', created: t, updated: t, od: null, sample: false, folder: m.folder || null };
  const pdf = await Store.get('pdfs', id); if (pdf) await Store.put('pdfs', { id: nid, bytes: pdf.bytes });
  await Store.put('notes', copy); await Store.put('meta', { ...newMeta(copy, m.thumb), fav: false });
  renderLibrary(); toast('Kopya oluşturuldu');
}
async function exportFromLibrary(id, share) { const n = await Store.get('notes', id); if (!n) return; const p = await Store.get('pdfs', id); exportNote(n, p && p.bytes, share); }

/* ---------- ekran görüntüleri ---------- */
const shotUrls = new Map();
function shotBlob(s) { return s.blob || new Blob([s.buf], { type: s.type || 'image/png' }); }
function shotUrl(s) { let u = shotUrls.get(s.id); if (!u) { u = URL.createObjectURL(shotBlob(s)); shotUrls.set(s.id, u); } return u; }
async function renderShots(box) {
  const shots = (await Store.all('shots')).sort((a, b) => b.created - a.created);
  if (!shots.length) { box.append(h('div', { class: 'empty' }, h('strong', null, 'Ekran görüntüsü yok'), h('span', null, 'Düzenleyicide araç çubuğundaki yakalama düğmesine dokunun ve kaydetmek istediğiniz alanı çizin.'))); return; }
  const g = h('div', { class: 'shotgrid' }); box.append(g);
  for (const s of shots) g.append(h('button', { type: 'button', class: 'shot', onclick: () => shotPreview(s) }, h('div', { class: 'im' }, h('img', { src: shotUrl(s), alt: 'Ekran görüntüsü' })), h('span', null, `${s.noteName || 'Not'} · ${fmtDate(s.created)}`)));
}
function shotPreview(s) {
  const name = `Kenar Notu ${new Date(s.created).toISOString().slice(0, 19).replace(/[T:]/g, '-')}.png`;
  modal({
    title: s.noteName || 'Ekran görüntüsü', wide: true, text: `${s.w} × ${s.h} piksel · ${fmtDate(s.created)}`,
    body: h('img', { class: 'preview-img', src: shotUrl(s), alt: 'Ekran görüntüsü' }),
    actions: [
      { label: 'Sil', kind: 'danger', onClick: async () => { await Store.del('shots', s.id); renderLibrary(); } },
      { label: 'Kopyala', onClick: async () => { await copyImage(shotBlob(s)); return false; } },
      navigator.canShare ? { label: 'Paylaş', onClick: async () => { await shareBlob(name, shotBlob(s)); return false; } } : null,
      Native ? { label: 'Galeriye kaydet', kind: 'primary', onClick: () => saveToGallery(shotBlob(s), name) } : { label: 'İndir', kind: 'primary', onClick: () => saveBlob(name, shotBlob(s)) }
    ].filter(Boolean)
  });
}
async function copyImage(blob) {
  try { await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]); toast('Görüntü panoya kopyalandı'); }
  catch (e) { toast('Pano bu tarayıcıda kullanılamıyor. “İndir” ile kaydedin.', 3600); }
}

/* ---------- ayarlar ---------- */
/* ---------- örnek not ---------- */
async function seedSample() {
  const t = Date.now() - 60000;
  const p1 = { id: uid(), k: 'blank', w: 595, h: 842, bg: 'lined' }, p2 = { id: uid(), k: 'blank', w: 595, h: 842, bg: 'grid' };
  const tx = (x, y, text, o = {}) => ({ id: uid(), x, y, text, size: o.size || 15, color: o.color || '#1a2033', font: o.font || 'sans', bold: !!o.bold });
  const lines = [
    'Kalem ucuna bastıkça çizgi kalınlaşır (basınç).',
    'Yan tuşa basılı tutarak yazın: geçici silgi.',
    'Kalemi ekrana yaklaştırın: uç boyutunu gösteren imleç.',
    'Çizgi sonunda kalemi bekletin: düz çizgi, daire, dörtgen.',
    'Kurşun kalemi yatırın: geniş gölgeleme (eğim).',
    'Yakalama düğmesiyle bir alan çizip ekran görüntüsü alın.',
    'İki parmakla dokunun: geri al. Üç parmak: yinele.'
  ];
  const texts = [tx(84, 40, 'S Pen ile hızlı başlangıç', { size: 26, font: 'serif', bold: true })];
  lines.forEach((l, i) => texts.push(tx(80, 102 + i * 28, '•  ' + l)));
  texts.push(tx(84, 330, 'Buraya yazın →', { size: 30, font: 'hand', color: '#2f5bea' }));
  const strokes = [
    simStroke('hl', 15, '#ffd43b', .5, Array.from({ length: 40 }, (_, k) => ({ x: 84 + 190 * k / 39, y: 142, p: 1 }))),
    simStroke('fountain', 2.4, '#1a2033', 1, sCurve(84, 82, 300, 6, 80)),
    simStroke('ballpoint', 1.8, '#c92a2a', 1, shapePoints({ kind: 'ellipse', cx: 178, cy: 352, rx: 114, ry: 32 }).map(q => ({ ...q, p: .6 })))
  ];
  const ar = []; for (let i = 0; i <= 30; i++) { const tt = i / 30; ar.push({ x: 300 + 90 * tt, y: 372 + 46 * tt * tt, p: .3 + .6 * Math.sin(tt * Math.PI) }); }
  strokes.push(simStroke('calli', 4.5, '#2f5bea', 1, ar));
  const note = { id: uid(), name: 'Örnek: S Pen rehberi', sample: true, created: t, updated: t, opened: t, od: null, pages: [p1, p2], ann: {
    [p1.id]: { s: strokes, t: texts, i: [] },
    [p2.id]: { s: [simStroke('brush', 8, '#0c8599', 1, sCurve(60, 120, 220, 40, 90)), simStroke('pencil', 3, '#5a6478', .9, sCurve(320, 120, 210, 30, 90))], t: [tx(60, 40, 'Deneme alanı', { size: 22, font: 'serif', bold: true })], i: [] }
  } };
  await loadFonts();
  const th = await renderThumb(p1, note.ann[p1.id], null, 240);
  await persistNoteRecord(note, th.toDataURL('image/jpeg', .82));
}

function posLabel(m) {
  let p = null; try { p = (JSON.parse(localStorage.getItem('kn.pos') || '{}'))[m.id]; } catch (e) { }
  return p && p.p > 0 ? `s. ${p.p + 1}/${m.pageCount} · ` : `${m.pageCount} sayfa · `;
}
