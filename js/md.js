'use strict';
/* =========================================================
   Markdown okuyucu + Obsidian kasası + tuval bağlantıları
   - md dosyası DEĞİŞTİRİLMEZ; okunur, aranır, sesli okunur, sözlük/YZ ile açıklanır.
   - Notlar belgenin yanındaki “Ad.canvas” tuvaline yazılır (Obsidian Canvas biçimi).
   - Not kaydı: { kind: 'md', vault: { tree, parent, doc, name, path, lm, size, cv: { doc, hash, lm } }, canvas, canvasBase }
     md metni Store 'pdfs' içinde UTF-8 bayt olarak durur (çoğaltma vb. olduğu gibi çalışsın).
   ========================================================= */
const MDV = { note: null, text: '', parsed: null, cv: null, findHits: [], findI: -1 };
const mdOpen = () => !!(MDV.note && !$('#mdView').hidden);
window.mdOpen = mdOpen;
const te = new TextEncoder(), td = new TextDecoder();
const mdBase = n => String(n || '').replace(/\.(md|markdown|txt)$/i, '');
if (!S.md) S.md = { size: 18, serif: true, width: 44 };

/* ---------------- görünüm ---------------- */
const mdView = h('section', { class: 'view mdv', id: 'mdView', hidden: true });
{
  const ib = (id, ic, label, fn) => { const b = h('button', { class: 'ibtn', id, type: 'button', 'aria-label': label, title: label }, icon(ic)); b.addEventListener('click', e => { e.stopPropagation(); fn(b); }); return b; };
  const findIn = h('input', { type: 'search', id: 'mdFindIn', placeholder: 'Belgede ara', autocomplete: 'off', enterkeyhint: 'search' });
  const findCnt = h('small', { id: 'mdFindCnt' }, '');
  const findBar = h('div', { class: 'mdfind', id: 'mdFind', hidden: true }, icon(IC.search), findIn, findCnt,
    ib('mdFindPrev', IC.chevR, 'Önceki', () => findStep(-1)), ib('mdFindNext', IC.chevR, 'Sonraki', () => findStep(1)), ib('mdFindClose', IC.close, 'Aramayı kapat', () => findClose()));
  findBar.querySelector('#mdFindPrev svg').style.transform = 'rotate(180deg)';
  findIn.addEventListener('input', () => { clearTimeout(findIn._t); findIn._t = setTimeout(() => findRun(findIn.value), 180); });
  findIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); findStep(e.shiftKey ? -1 : 1); } if (e.key === 'Escape') findClose(); });
  const bar = h('header', { class: 'mdbar' },
    ib('mdBack', IC.back, 'Kitaplığa dön', () => closeMd()),
    ib('mdTocBtn', IC.toc, 'İçindekiler', () => toggleToc()),
    h('div', { class: 'mdtitle' }, h('b', { id: 'mdTitle' }, ''), h('small', { id: 'mdStatus' }, '')),
    ib('mdFindBtn', IC.search, 'Belgede ara', () => { findBar.hidden = !findBar.hidden; if (!findBar.hidden) { findIn.focus(); findIn.select(); } else findClose(); }),
    ib('mdSpeakBtn', IC.speak, 'Sesli oku', b => speakToggle(b)),
    ib('mdDictBtn', IC.spark, 'Sözlük / soru', () => openDict('')),
    ib('mdCanvasBtn', IC.canvas, 'Tuval', () => toggleMdCanvas()),
    ib('mdMoreBtn', IC.more, 'Diğer', b => mdMore(b)));
  const toc = h('nav', { class: 'mdtoc', id: 'mdToc', hidden: true, 'aria-label': 'İçindekiler' });
  const art = h('article', { class: 'mdart mdc', id: 'mdArt' });
  const scroll = h('div', { class: 'mdscroll', id: 'mdScroll' }, art);
  const body = h('div', { class: 'mdbody' }, toc, scroll, h('div', { id: 'mdUi', class: 'mdui' }));
  mdView.append(bar, findBar, body);
  $('#app').append(mdView);
  scroll.addEventListener('scroll', () => { clearTimeout(scroll._t); scroll._t = setTimeout(savePosMd, 300); hideTapChip(); }, { passive: true });
}
const $art = () => $('#mdArt'), $scroll = () => $('#mdScroll');
function applyMdPrefs() {
  const a = $art(); if (!a) return;
  a.style.setProperty('--mdsize', (S.md.size || 18) + 'px');
  a.style.setProperty('--mdw', (S.md.width || 44) + 'em');
  a.classList.toggle('sans', !S.md.serif);
}

/* ---------------- not kaydı ---------------- */
async function mdThumb(name, text) {
  const W = 240, H = 320, d = 2, cv = document.createElement('canvas'); cv.width = W * d; cv.height = H * d;
  const c = cv.getContext('2d'); c.scale(d, d); c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
  c.fillStyle = '#7048e8'; c.fillRect(0, 0, W, 5);
  c.fillStyle = '#1a2033'; c.font = '700 17px Georgia, serif';
  const wrap = (t, x, y, mw, lh, max) => { const ws = t.split(/\s+/); let line = '', n = 0; for (const w of ws) { const tt = line ? line + ' ' + w : w; if (c.measureText(tt).width > mw && line) { c.fillText(line, x, y); y += lh; line = w; if (++n >= max) return y; } else line = tt; } if (line) { c.fillText(line, x, y); y += lh; } return y; };
  let y = wrap(mdBase(name), 18, 36, W - 36, 22, 2) + 6;
  c.font = '12px Georgia, serif'; c.fillStyle = '#4a5368';
  const lines = String(text || '').split('\n').map(MD.plainLine).filter(Boolean).slice(0, 30);
  for (const l of lines) { if (y > H - 14) break; y = wrap(l, 18, y, W - 36, 16, 3) + 4; }
  return cv.toDataURL('image/jpeg', .8);
}
async function createMdNote(name, text, vault) {
  const t = Date.now();
  const note = { id: uid(), name: mdBase(name), kind: 'md', pages: [], ann: {}, created: t, updated: t, folder: typeof curFolder === 'function' ? curFolder() : null, vault: vault || null, canvas: null, canvasBase: null };
  await Store.put('pdfs', { id: note.id, bytes: te.encode(text).buffer });
  await persistNoteRecord(note, await mdThumb(name, text));
  if (vault) vaultIndexSet(vault.doc, note.id);
  return note;
}
window.createMdNote = createMdNote;
async function mdTextOf(id) { const r = await Store.get('pdfs', id); if (!r) return ''; if (typeof r.text === 'string') return r.text; try { return td.decode(r.bytes); } catch (e) { return ''; } }
async function importMdFile(f) {
  const text = await f.text();
  const n = await createMdNote(f.name, text, null);
  renderLibrary(); openNote(n.id);
}
window.importMdFile = importMdFile;
/* kasa belge kimliği → not kimliği (aynı dosya ikinci kez açılınca aynı not) */
function vaultIndex() { try { return JSON.parse(localStorage.getItem('kn.vidx') || '{}') || {}; } catch (e) { return {}; } }
function vaultIndexSet(doc, id) { const m = vaultIndex(); if (id) m[doc] = id; else delete m[doc]; try { localStorage.setItem('kn.vidx', JSON.stringify(m)); } catch (e) { } }

/* ---------------- açma / kapama ---------------- */
{
  const base = openNote;
  openNote = async function (id, ...a) {
    const n = await Store.get('notes', id);
    if (n && n.kind === 'md') return openMd(n);
    if (mdOpen()) await closeMd(true);
    return base(id, ...a);
  };
}
{
  const base = closeEditor;
  closeEditor = async function (...a) { if (mdOpen()) return closeMd(); return base(...a); };
}
async function openMd(note) {
  if (ed.note) await closeEditor();
  if (MDV.note && MDV.note.id !== note.id) await closeMd(true);
  MDV.note = note; MDV.text = await mdTextOf(note.id);
  const m = await Store.get('meta', note.id); if (m) { m.opened = Date.now(); await Store.put('meta', m); }
  libView.hidden = true; edView.hidden = true; mdView.hidden = false; closePop();
  $('#mdTitle').textContent = note.name;
  setMdStatus(note.vault ? 'Obsidian kasası · ' + (note.vault.path || note.vault.name) : 'Bu ' + DV.da);
  applyMdPrefs(); renderMd();
  requestAnimationFrame(() => { const p = (S.mdPos || {})[note.id]; if (p) $scroll().scrollTop = p; });
  // kasadaki dosya değiştiyse güncel hâlini al (md'ye yazılmaz, yalnız okunur)
  if (note.vault && vaultReady()) setTimeout(() => refreshFromVault(note), 50);
  if (note.canvasOpen) setTimeout(() => { if (MDV.note === note) toggleMdCanvas(true); }, 80);
}
window.openMd = openMd;
async function closeMd(quiet) {
  const n = MDV.note; if (!n) return;
  savePosMd(); if (window.speakStop) speakStop(); hideSelBar(); hideTapChip();
  if (MDV.cv) { n.canvasOpen = true; MDV.cv.close(); MDV.cv = null; } else n.canvasOpen = false;
  await persistNoteRecord(n);
  if (n.vault && n._cvDirty) vaultCanvasSave(n).catch(() => { });
  MDV.note = null; MDV.text = ''; $art().innerHTML = ''; mdView.hidden = true;
  if (!quiet) { libView.hidden = false; renderLibrary(); }
}
window.closeMd = closeMd;
function savePosMd() { if (!MDV.note) return; S.mdPos = S.mdPos || {}; S.mdPos[MDV.note.id] = Math.round($scroll().scrollTop); const ks = Object.keys(S.mdPos); if (ks.length > 200) delete S.mdPos[ks[0]]; saveSettings(); }
function setMdStatus(t, warn) { const s = $('#mdStatus'); s.textContent = t || ''; s.classList.toggle('warn', !!warn); }

/* ---------------- çizim ---------------- */
function renderMd() {
  const a = $art(); MDV.parsed = MD.parse(MDV.text); MDV.lines = MDV.text.replace(/\r\n?/g, '\n').split('\n');
  a.innerHTML = MDV.parsed.html || '<p class="muted">Bu belge boş.</p>';
  if (MDV.parsed.props) a.prepend(h('details', { class: 'mdprops' }, h('summary', null, 'Özellikler'), h('pre', null, MDV.parsed.props)));
  for (const c of a.querySelectorAll('.callout[data-fold] > .ct')) c.addEventListener('click', () => c.parentElement.classList.toggle('folded'));
  loadEmbeds(a);
  buildToc(); drawMarks();
  if (!$('#mdFind').hidden && $('#mdFindIn').value) findRun($('#mdFindIn').value);
}
function buildToc() {
  const t = $('#mdToc'); t.innerHTML = '';
  const hs = MDV.parsed.heads;
  t.append(h('b', null, 'İçindekiler'));
  if (!hs.length) t.append(h('p', { class: 'muted' }, 'Bu belgede başlık yok.'));
  const min = Math.min(...hs.map(x => x.lv));
  for (const x of hs) t.append(h('button', { type: 'button', class: 'lv' + (x.lv - min), onclick: () => { scrollToLine(x.l, true); if (innerWidth < 900) t.hidden = true; } }, x.text || '—'));
  $('#mdTocBtn').classList.toggle('on', !t.hidden);
}
function toggleToc() { const t = $('#mdToc'); t.hidden = !t.hidden; $('#mdTocBtn').classList.toggle('on', !t.hidden); }
function blockForLine(line) {
  let best = null, bestL = -1;
  for (const el of $art().querySelectorAll('[data-l]')) {
    const l = +el.dataset.l, le = el.dataset.le != null ? +el.dataset.le : l;
    if (l <= line && line <= le && l >= bestL) { best = el; bestL = l; }
  }
  if (!best) for (const el of $art().querySelectorAll('[data-l]')) { if (+el.dataset.l >= line) { best = el; break; } }
  return best;
}
function scrollToLine(line, flash) {
  const el = blockForLine(line); if (!el) return;
  const sc = $scroll(), r = el.getBoundingClientRect(), sr = sc.getBoundingClientRect();
  sc.scrollTo({ top: sc.scrollTop + r.top - sr.top - 24, behavior: 'smooth' });
  if (flash) { el.classList.remove('mdflash'); void el.offsetWidth; el.classList.add('mdflash'); }
}
async function loadEmbeds(a) {
  for (const el of a.querySelectorAll('.embed[data-embed]')) {
    const name = el.dataset.embed.split('#')[0];
    if (!/\.(png|jpe?g|gif|webp|svg)$/i.test(name)) { el.classList.add('file'); continue; }
    if (!MDV.note || !MDV.note.vault || !vaultReady()) continue;
    try {
      const f = await vaultResolve(MDV.note.vault, name); if (!f) continue;
      const r = JSON.parse(Native.treeRead(MDV.note.vault.tree, f.id, 'b64') || '{}'); if (!r.ok) continue;
      const mime = /\.png$/i.test(name) ? 'image/png' : /\.gif$/i.test(name) ? 'image/gif' : /\.webp$/i.test(name) ? 'image/webp' : /\.svg$/i.test(name) ? 'image/svg+xml' : 'image/jpeg';
      if (mime === 'image/svg+xml') continue;   // güvenlik: svg gömülmez
      el.replaceWith(h('img', { src: 'data:' + mime + ';base64,' + r.b64, alt: name, loading: 'lazy' }));
    } catch (e) { }
  }
}

/* ---------------- seçim çubuğu ve satıra dokunma ---------------- */
let selBar = null, tapChip = null;
function hideSelBar() { if (selBar) { selBar.remove(); selBar = null; } }
function hideTapChip() { if (tapChip) { tapChip.remove(); tapChip = null; } }
function selInfo() {
  const s = getSelection(); if (!s || s.isCollapsed || !s.rangeCount) return null;
  const r = s.getRangeAt(0); if (!$art().contains(r.commonAncestorContainer)) return null;
  const text = s.toString().trim(); if (!text) return null;
  return { range: r, text, line: lineOfNode(r.startContainer, r.startOffset) };
}
/* bir DOM konumunun kaynak satırı: bloğun ilk satırı + öncesindeki satır kırmaları */
function lineOfNode(node, offset) {
  let el = node.nodeType === 1 ? node : node.parentElement;
  const blk = el && el.closest('[data-l]'); if (!blk) return 0;
  let line = +blk.dataset.l;
  if (blk.tagName === 'P' || blk.tagName === 'LI' || blk.tagName === 'PRE') {
    const rng = document.createRange(); rng.setStart(blk, 0);
    try { rng.setEnd(node, offset); } catch (e) { return line; }
    const frag = rng.cloneContents();
    if (blk.tagName === 'PRE') line += (frag.textContent.match(/\n/g) || []).length + 1;
    else line += frag.querySelectorAll('br').length;
  }
  return line;
}
function showSelBar() {
  const si = selInfo(); if (!si) { hideSelBar(); return; }
  hideTapChip();
  const rect = si.range.getBoundingClientRect(), host = $('#mdView').getBoundingClientRect();
  const b = (ic, label, fn) => h('button', { class: 'btn', type: 'button', onpointerdown: e => e.preventDefault(), onclick: () => { const s2 = selInfo() || si; fn(s2); } }, icon(ic), label);
  hideSelBar();
  selBar = h('div', { class: 'floaty selbar tbar mdsel' },
    b(IC.canvas, 'Tuvale not', s2 => { getSelection().removeAllRanges(); hideSelBar(); mdNoteAt(s2.line, s2.text); }),
    b(IC.spark, 'Anlamı', s2 => { const ctx = (s2.range.startContainer.parentElement.closest('[data-l]') || {}).textContent || ''; hideSelBar(); openDict(s2.text, ctx, null); }),
    b(IC.translate, 'Çevir', s2 => { hideSelBar(); openDict(s2.text, '', null, 'translate'); }),
    b(IC.speak, 'Dinle', s2 => { if (window.speakText) speakText(s2.text); }),
    b(IC.copy, 'Kopyala', s2 => { copyText(s2.text); getSelection().removeAllRanges(); hideSelBar(); }));
  $('#mdView').append(selBar);
  const bw = selBar.offsetWidth, bh = selBar.offsetHeight;
  let x = clamp(rect.left + rect.width / 2 - bw / 2 - host.left, 8, host.width - bw - 8), y = rect.top - host.top - bh - 10;
  if (y < 60) y = rect.bottom - host.top + 10;
  Object.assign(selBar.style, { left: x + 'px', top: y + 'px' });
}
document.addEventListener('selectionchange', () => { if (!mdOpen()) return; clearTimeout(showSelBar._t); showSelBar._t = setTimeout(showSelBar, 260); });
$('#mdArt').addEventListener('click', e => {
  const a = e.target.closest('a');
  if (a && a.classList.contains('wl')) { e.preventDefault(); openWikiLink(a.dataset.wl); return; }
  if (a && a.dataset.fn) { e.preventDefault(); const t = document.getElementById('fn-' + a.dataset.fn); if (t) t.scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
  if (a) return;
  if (e.target.closest('.mdmark')) return;
  const s = getSelection(); if (s && !s.isCollapsed) return;
  const blk = e.target.closest('[data-l]'); if (!blk) { hideTapChip(); return; }
  // satıra dokununca küçük “bu satıra not” düğmesi
  const line = lineOfNode(e.target.nodeType === 3 ? e.target : e.target, 0) || +blk.dataset.l;
  const caret = document.caretRangeFromPoint ? document.caretRangeFromPoint(e.clientX, e.clientY) : null;
  const ln = caret && blk.contains(caret.startContainer) ? lineOfNode(caret.startContainer, caret.startOffset) : line;
  hideTapChip();
  const host = $('#mdView').getBoundingClientRect();
  tapChip = h('button', { class: 'floaty mdtap', type: 'button', onclick: ev => { ev.stopPropagation(); hideTapChip(); mdNoteAt(ln, MD.plainLine(MDV.lines[ln] || '')); } }, icon(IC.canvas), (ln + 1) + '. satıra not');
  $('#mdView').append(tapChip);
  Object.assign(tapChip.style, { left: clamp(e.clientX - host.left - tapChip.offsetWidth / 2, 8, host.width - tapChip.offsetWidth - 8) + 'px', top: Math.max(60, e.clientY - host.top - 54) + 'px' });
  clearTimeout(tapChip._t); const tc = tapChip; tc._t = setTimeout(() => { if (tapChip === tc) hideTapChip(); }, 3200);
});

/* ---------------- arama ---------------- */
function findClear() { for (const m of $art().querySelectorAll('mark.mdhit')) { const p = m.parentNode; p.replaceChild(document.createTextNode(m.textContent), m); p.normalize(); } MDV.findHits = []; MDV.findI = -1; $('#mdFindCnt').textContent = ''; }
function findRun(q) {
  findClear(); q = (q || '').trim(); if (q.length < 2) return;
  const lq = q.toLocaleLowerCase('tr'); const walker = document.createTreeWalker($art(), NodeFilter.SHOW_TEXT); const nodes = [];
  while (walker.nextNode()) nodes.push(walker.currentNode);
  for (const n of nodes) {
    const t = n.nodeValue, lt = t.toLocaleLowerCase('tr'); let i = lt.indexOf(lq); if (i < 0) continue;
    const frag = document.createDocumentFragment(); let last = 0;
    while (i >= 0) { frag.append(t.slice(last, i)); const m = h('mark', { class: 'mdhit' }, t.slice(i, i + q.length)); frag.append(m); MDV.findHits.push(m); last = i + q.length; i = lt.indexOf(lq, last); }
    frag.append(t.slice(last)); n.parentNode.replaceChild(frag, n);
  }
  $('#mdFindCnt').textContent = MDV.findHits.length ? '0/' + MDV.findHits.length : 'yok';
  if (MDV.findHits.length) findStep(1);
}
function findStep(d) {
  const hs = MDV.findHits; if (!hs.length) return;
  if (MDV.findI >= 0) hs[MDV.findI].classList.remove('cur');
  MDV.findI = (MDV.findI + d + hs.length) % hs.length; const m = hs[MDV.findI]; m.classList.add('cur');
  m.scrollIntoView({ behavior: 'smooth', block: 'center' }); $('#mdFindCnt').textContent = (MDV.findI + 1) + '/' + hs.length;
}
function findClose() { findClear(); $('#mdFind').hidden = true; }

/* ---------------- sesli okuma ---------------- */
let speaking = false;
function speakToggle(b) {
  if (speaking) { speakStop(); speaking = false; b.classList.remove('on'); return; }
  const si = selInfo(); let text = si ? si.text : '';
  if (!text) {
    // ekranda görünen ilk bloktan başla
    const sr = $scroll().getBoundingClientRect(); const blocks = [...$art().querySelectorAll(':scope > [data-l]')];
    const i = Math.max(0, blocks.findIndex(el => el.getBoundingClientRect().bottom > sr.top + 10));
    text = blocks.slice(i).map(el => el.innerText).join('\n').slice(0, 4000);
  }
  if (!text) return;
  speakText(text); speaking = true; b.classList.add('on');
  clearTimeout(speakToggle._t); speakToggle._t = setTimeout(() => { speaking = false; b.classList.remove('on'); }, Math.min(600000, text.length * 75));
}

/* ---------------- diğer menüsü ---------------- */
function mdMore(anchor) {
  const n = MDV.note;
  openPop(anchor, () => h('div', { class: 'mdmore' },
    h('div', { class: 'mdsize' }, h('span', null, 'Yazı boyutu'),
      h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Küçült', onclick: () => { S.md.size = Math.max(13, (S.md.size || 18) - 1); saveSettings(); applyMdPrefs(); } }, icon(IC.minus)),
      h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Büyüt', onclick: () => { S.md.size = Math.min(30, (S.md.size || 18) + 1); saveSettings(); applyMdPrefs(); } }, icon(IC.plus))),
    menu([
      { label: S.md.serif ? 'Yalın yazı tipi' : 'Tırnaklı yazı tipi', icon: IC.text, onClick: () => { S.md.serif = !S.md.serif; saveSettings(); applyMdPrefs(); } },
      { label: (S.md.width || 44) > 50 ? 'Dar sütun' : 'Geniş sütun', icon: IC.split, onClick: () => { S.md.width = (S.md.width || 44) > 50 ? 44 : 70; saveSettings(); applyMdPrefs(); } },
      { label: S.prefs.theme === 'dark' ? 'Açık tema' : 'Koyu tema', icon: IC.moon, onClick: () => { S.prefs.theme = S.prefs.theme === 'dark' ? 'light' : 'dark'; saveSettings(); applyTheme(); } },
      PHONE ? { label: 'Sesli oku', icon: IC.speak, sub: 'Seçili metni ya da ekrandakinden itibaren', onClick: () => speakToggle($('#mdSpeakBtn')) } : null,
      PHONE ? { label: 'Sözlük / soru', icon: IC.spark, onClick: () => openDict('') } : null,
      n && n.vault && vaultReady() ? { label: 'Dosyayı yeniden oku', icon: IC.sync, sub: 'Kasadaki güncel hâli', onClick: () => refreshFromVault(n, true) } : null,
      '-',
      { label: 'Tuvali indir (.canvas)', icon: IC.dl, sub: 'Obsidian’da açılır', onClick: () => downloadText(mdBase(n.name) + '.canvas', cvSer(cvNormalize(n.canvas || cvEmpty())), 'application/json') },
      { label: 'Markdown olarak indir', icon: IC.dl, onClick: () => downloadText(mdBase(n.name) + '.md', MDV.text, 'text/markdown') }
    ])));
}
function downloadText(name, text, type) { const a = h('a', { href: URL.createObjectURL(new Blob([text], { type: type + ';charset=utf-8' })), download: name }); document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 2000); }

/* ---------------- tuval: md ---------------- */
function anchoredNodes(n) { return ((n.canvas && n.canvas.nodes) || []).filter(x => x.kn); }
/* kartın satırı: alıntı hâlâ aynı satırda değilse en yakın eşleşen satıra taşınır (dosya başka yerde düzenlenmiş olabilir) */
function resolveLine(kn) {
  const L = MDV.lines || []; if (kn.line == null) return null;
  const q = (kn.quote || '').replace(/\s+/g, ' ').trim().slice(0, 80).toLocaleLowerCase('tr');
  if (!q) return Math.min(kn.line, L.length - 1);
  const has = i => MD.plainLine(L[i] || '').replace(/\s+/g, ' ').toLocaleLowerCase('tr').includes(q.slice(0, Math.min(40, q.length)));
  if (has(kn.line)) return kn.line;
  for (let d = 1; d < L.length; d++) { if (has(kn.line - d)) return kn.line - d; if (has(kn.line + d)) return kn.line + d; }
  return -1;
}
function drawMarks() {
  for (const m of $art().querySelectorAll('.mdmark')) m.remove();
  const n = MDV.note; if (!n) return;
  const byBlock = new Map();
  for (const x of anchoredNodes(n)) {
    const l = resolveLine(x.kn); if (l == null || l < 0) continue;
    const el = blockForLine(l); if (!el) continue;
    if (!byBlock.has(el)) byBlock.set(el, []); byBlock.get(el).push(x);
  }
  for (const [el, xs] of byBlock) {
    const col = cvColor(xs[0].color);
    const b = h('button', { class: 'mdmark', type: 'button', title: xs.length > 1 ? xs.length + ' not' : 'Tuvaldeki not', 'aria-label': 'Tuvaldeki notu göster', style: col ? { '--c': col } : null,
      onclick: e => { e.stopPropagation(); toggleMdCanvas(true); setTimeout(() => MDV.cv && MDV.cv.focusNode(xs[0].id), 60); } }, icon(IC.canvas), xs.length > 1 ? h('span', null, String(xs.length)) : null);
    el.classList.add('hasmark'); el.append(b);
  }
}
function mdDocPath(n) { return n.vault && n.vault.path ? n.vault.path : mdBase(n.name) + '.md'; }
function mdCanvasCtx(n) {
  const path = mdDocPath(n);
  return {
    host: $('#mdUi'), key: 'canvas', title: mdBase(n.name) + '.canvas',
    getData: () => n.canvas || cvEmpty(),
    setData: (d, why) => { n.canvas = JSON.parse(JSON.stringify(d)); n._cvDirty = true; n.updated = Date.now(); persistNoteRecord(n); drawMarks(); if (n.vault && vaultReady()) { clearTimeout(n._cvT); n._cvT = setTimeout(() => vaultCanvasSave(n).catch(e => setMdStatus('Tuval kasaya yazılamadı: ' + (e.message || e), true)), why === 'close' ? 0 : 2500); } },
    view: n.canvasView || null, saveView: v => { n.canvasView = v; persistNoteRecord(n); },
    docNode: () => ({ file: path }),
    isDoc: x => x.type === 'file' && (x.file === path || x.file.split('/').pop() === path.split('/').pop()),
    goto: kn => { if (kn.subpath) { const hd = MDV.parsed.heads.find(x => '#' + x.text === kn.subpath || x.text === kn.subpath.replace(/^#/, '')); if (hd) scrollToLine(hd.l, true); return; } const l = resolveLine(kn); if (l == null || l < 0) { toast('Bu satır belgede bulunamadı (dosya değişmiş olabilir).', 2600); return; } scrollToLine(l, true); },
    anchorLabel: kn => { const l = resolveLine(kn); return l == null || l < 0 ? 'yeri bulunamadı' : (l + 1) + '. satır'; },
    onClose: () => { MDV.cv = null; $('#mdCanvasBtn').classList.remove('on'); }
  };
}
async function toggleMdCanvas(forceOpen) {
  const n = MDV.note; if (!n) return;
  if (MDV.cv) { if (forceOpen === true) { MDV.cv.show(); return; } MDV.cv.close(); return; }
  if (n.vault && vaultReady()) { try { await vaultCanvasLoad(n); } catch (e) { setMdStatus('Tuval kasadan okunamadı: ' + (e.message || e), true); } }
  MDV.cv = openCanvas(mdCanvasCtx(n));
  $('#mdCanvasBtn').classList.add('on');
}
function mdNoteAt(line, quote) {
  const go = () => MDV.cv.addAnchored({ line, quote: (quote || '').slice(0, 280) }, quote, (line + 1) + '. satır');
  if (MDV.cv) go(); else toggleMdCanvas(true).then(go);
}
window.mdNoteAt = mdNoteAt;

/* ---------------- tuval: PDF ---------------- */
TB_ITEMS.canvas = { name: 'Tuval', ic: IC.canvas };
if (!TB_DEFAULT.order.includes('canvas')) TB_DEFAULT.order.splice(TB_DEFAULT.order.indexOf('split') + 1, 0, 'canvas');
if (!PHONE_TOOLS.includes('canvas')) PHONE_TOOLS.push('canvas');
let pdfCv = null;
{ const b = toolbarAction; toolbarAction = (id, btn) => { if (id === 'canvas') { togglePdfCanvas(); return; } return b(id, btn); }; }
function pdfDocPath(n) { return n.vault && n.vault.path ? n.vault.path : (n.od && n.od.name) || (n.name + '.pdf'); }
function pdfCanvasCtx(n) {
  const path = pdfDocPath(n);
  return {
    host: $('#edView .ebody'), key: 'canvas', title: mdBase(String(path).split('/').pop().replace(/\.pdf$/i, '')) + '.canvas',
    getData: () => n.canvas || cvEmpty(),
    setData: (d, why) => { n.canvas = JSON.parse(JSON.stringify(d)); n._cvDirty = true; if (ed.note === n) scheduleSave(); else persistNoteRecord(n); if (n.vault && vaultReady()) { clearTimeout(n._cvT); n._cvT = setTimeout(() => vaultCanvasSave(n).catch(e => toast('Tuval kasaya yazılamadı: ' + (e.message || e), 3000)), why === 'close' ? 0 : 2500); } },
    view: n.canvasView || null, saveView: v => { n.canvasView = v; },
    docNode: () => ({ file: path }),
    isDoc: x => x.type === 'file' && (x.file === path || x.file.split('/').pop() === String(path).split('/').pop()),
    goto: kn => { const p = kn.page || (kn.subpath && +(/page=(\d+)/.exec(kn.subpath) || [])[1]); if (p && ed.note === n) goToPage(p - 1); },
    anchorLabel: kn => kn.page ? kn.page + '. sayfa' : 'Belgede',
    onClose: () => { pdfCv = null; refreshToolbar(); }
  };
}
async function togglePdfCanvas(forceOpen) {
  const n = ed.note; if (!n) return;
  if (pdfCv) { if (forceOpen === true) { pdfCv.show(); return; } pdfCv.close(); return; }
  if (n.vault && vaultReady()) { try { await vaultCanvasLoad(n); } catch (e) { toast('Tuval kasadan okunamadı: ' + (e.message || e), 3000); } }
  pdfCv = openCanvas(pdfCanvasCtx(n));
  pdfCv.win.el.addEventListener('pointerdown', () => { });
}
window.togglePdfCanvas = togglePdfCanvas;
function pdfNoteAt(page, quote) {
  const go = () => pdfCv.addAnchored({ page, quote: (quote || '').slice(0, 280) || undefined }, quote, page + '. sayfa');
  if (pdfCv) go(); else togglePdfCanvas(true).then(go);
}
/* PDF'te metin seçiliyken: "Tuvale not" */
{
  const b = textSelBar;
  textSelBar = () => {
    b(); const S2 = TS.sel; if (!TS.bar || !S2) return;
    const btn = h('button', { class: 'btn', type: 'button', onclick: () => { const t = rangeText(S2.range); const pi = ed.pvs.indexOf(S2.pv); textSelClear(); pdfNoteAt(pi + 1, t); } }, icon(IC.canvas), 'Tuvale not');
    TS.bar.insertBefore(btn, TS.bar.firstChild); placeTextBar();
  };
}
{ const b = closeEditor; closeEditor = async (...a) => { if (pdfCv && !mdOpen()) { const n = ed.note; pdfCv.close(); pdfCv = null; if (n) n.canvasOpen = true; } return b(...a); }; }

/* ---------------- Obsidian kasası (Android: klasör izni) ---------------- */
const vaultReady = () => !!(Native && Native.treeList && S.vault && S.vault.tree);
window.vaultReady = vaultReady;
window.__treePicked = j => { let r = {}; try { r = JSON.parse(j); } catch (e) { } const f = treeWait; treeWait = null; if (f) f(r); };
let treeWait = null;
function pickVault() {
  if (!Native || !Native.treePick) { toast('Kasa klasörü yalnız Android uygulamasında seçilebilir. Burada “Markdown dosyası ekle”yi kullanın.', 3800); return Promise.resolve(null); }
  return new Promise(res => { treeWait = r => { if (r && r.uri) { S.vault = { tree: r.uri, root: r.root, name: r.name || 'Kasa' }; saveSettings(); res(S.vault); } else res(null); }; Native.treePick(); });
}
function treeList(tree, doc) { let r = []; try { r = JSON.parse(Native.treeList(tree, doc) || '[]'); } catch (e) { } return Array.isArray(r) ? r : []; }
/* kasada ada göre dosya bul: önce aynı klasör, sonra kök, sonra tüm kasa (en fazla 3000 öğe) */
async function vaultResolve(v, name) {
  const want = name.split('/').pop().toLowerCase();
  const inDir = d => treeList(v.tree, d).find(f => !f.dir && f.name.toLowerCase() === want);
  let f = inDir(v.parent); if (f) return f;
  f = inDir(S.vault.root); if (f) return f;
  const q = [S.vault.root]; let seen = 0;
  while (q.length && seen < 3000) { const d = q.shift(); for (const e of treeList(v.tree, d)) { seen++; if (e.dir) { if (!/^\./.test(e.name)) q.push(e.id); } else if (e.name.toLowerCase() === want) return e; } await new Promise(r => setTimeout(r, 0)); }
  return null;
}
async function openWikiLink(target) {
  const [file, sub] = target.split('#');
  if (!file || file === mdBase(MDV.note.name)) { if (sub) { const hd = MDV.parsed.heads.find(x => x.text === sub || x.id === MD.slug(sub)); if (hd) scrollToLine(hd.l, true); } return; }
  if (!MDV.note.vault || !vaultReady()) { toast('Bağlantılı notu açmak için Obsidian kasasından açın.', 2600); return; }
  const name = /\.\w+$/.test(file) ? file : file + '.md';
  const pr = progress('“' + file + '” aranıyor…');
  const f = await vaultResolve(MDV.note.vault, name); pr.done();
  if (!f) { toast('“' + file + '” kasada bulunamadı.', 2600); return; }
  await openVaultEntry(f, f.parent || MDV.note.vault.parent, (MDV.note.vault.path || '').split('/').slice(0, -1).join('/'));
}
async function openVaultEntry(f, parent, dirPath) {
  const v = S.vault; const path = (dirPath ? dirPath + '/' : '') + f.name;
  const ctx = { tree: v.tree, parent, doc: f.id, name: f.name, path };
  if (/\.pdf$/i.test(f.name)) {
    window.__vaultPending = { ...ctx, at: Date.now() };
    try { Native.treeOpenDoc(v.tree, f.id); } catch (e) { toast('Açılamadı: ' + e.message, 3000); }
    return;
  }
  const pr = progress('Açılıyor…');
  let r = {}; try { r = JSON.parse(Native.treeRead(v.tree, f.id, 'text') || '{}'); } catch (e) { r = { error: e.message }; }
  pr.done();
  if (!r.ok) { toast('Dosya okunamadı: ' + (r.error || ''), 3200); return; }
  const id = vaultIndex()[f.id]; let n = id ? await Store.get('notes', id) : null;
  if (n && n.kind === 'md') {
    if ((await mdTextOf(n.id)) !== r.text) { await Store.put('pdfs', { id: n.id, bytes: te.encode(r.text).buffer }); n.vault = { ...n.vault, ...ctx, lm: r.lm, size: r.size }; await persistNoteRecord(n, await mdThumb(n.name, r.text)); }
  } else n = await createMdNote(f.name, r.text, { ...ctx, lm: r.lm, size: r.size });
  closePop(); document.querySelectorAll('.modal-back.vaultback').forEach(x => x.remove());
  openNote(n.id);
}
/* PDF kasadan açıldıysa notu kasaya bağla (tuvali yanına yazılabilsin) */
{
  const base = openLinkedDoc;
  openLinkedDoc = async (meta, name, bytes) => {
    const r = await base(meta, name, bytes);
    const p = window.__vaultPending;
    if (p && Date.now() - p.at < 120000 && ed.note && ed.note.od && (ed.note.od.name === p.name || name === p.name)) { window.__vaultPending = null; ed.note.vault = { tree: p.tree, parent: p.parent, doc: p.doc, name: p.name, path: p.path }; scheduleSave(); }
    return r;
  };
}
async function refreshFromVault(n, manual) {
  let st = {}; try { st = JSON.parse(Native.treeStat(n.vault.tree, n.vault.doc) || '{}'); } catch (e) { }
  if (!st.ok) { setMdStatus('Kasadaki dosyaya ulaşılamadı; son okunan hâli gösteriliyor', true); return; }
  if (!manual && st.lm && st.lm === n.vault.lm && st.size === n.vault.size) return;
  let r = {}; try { r = JSON.parse(Native.treeRead(n.vault.tree, n.vault.doc, 'text') || '{}'); } catch (e) { }
  if (!r.ok || MDV.note !== n) return;
  n.vault.lm = r.lm; n.vault.size = r.size;
  if (r.text !== MDV.text) {
    MDV.text = r.text; await Store.put('pdfs', { id: n.id, bytes: te.encode(r.text).buffer }); await persistNoteRecord(n, await mdThumb(n.name, r.text));
    const top = $scroll().scrollTop; renderMd(); $scroll().scrollTop = top; toast('Dosyanın güncel hâli açıldı', 2000);
  } else { await persistNoteRecord(n); if (manual) toast('Dosya değişmemiş', 1600); }
}
/* tuval dosyası: belgenin yanında “Ad.canvas” */
const cvName = n => (n.vault.name || n.name).replace(/\.(md|markdown|pdf)$/i, '') + '.canvas';
async function shaText(t) { return knSha(te.encode(t)); }
async function vaultCanvasRead(n) {
  const v = n.vault; v.cv = v.cv || {};
  if (!v.cv.doc) { const f = treeList(v.tree, v.parent).find(x => !x.dir && x.name === cvName(n)); if (f) v.cv.doc = f.id; }
  if (!v.cv.doc) return null;
  const r = JSON.parse(Native.treeRead(v.tree, v.cv.doc, 'text') || '{}');
  if (!r.ok) { if (/bulunamad|not found|FileNotFound/i.test(r.error || '')) { v.cv.doc = null; return null; } throw new Error(r.error || 'okunamadı'); }
  let d; try { d = JSON.parse(r.text || '{}'); } catch (e) { throw new Error('Tuval dosyası bozuk (JSON değil); üzerine yazılmadı'); }
  return { data: cvNormalize(d), text: r.text, hash: await shaText(r.text), lm: r.lm };
}
async function vaultCanvasLoad(n) {
  const rm = await vaultCanvasRead(n); if (!rm) return;
  const v = n.vault;
  if (v.cv.hash === rm.hash) return;      // son yazdığımız/okuduğumuz hâl
  const local = n.canvas || cvEmpty();
  const { data, stats } = cvMerge(n.canvasBase || cvEmpty(), local, rm.data);
  n.canvas = data; n.canvasBase = rm.data; v.cv.hash = rm.hash; v.cv.lm = rm.lm;
  n._cvDirty = cvSer(data) !== cvSer(rm.data);
  await persistNoteRecord(n);
  if (stats.added + stats.changed + stats.removed + stats.both) toast('Tuval başka yerde değişmiş; birleştirildi (' + [stats.added && stats.added + ' yeni', stats.changed && stats.changed + ' değişen', stats.removed && stats.removed + ' silinen', stats.both && stats.both + ' iki yerde değişen'].filter(Boolean).join(', ') + ')', 3400);
  if (n._cvDirty) vaultCanvasSave(n).catch(() => { });
}
async function vaultCanvasSave(n) {
  if (!n.vault || !vaultReady()) return;
  if (n._cvSaving) { n._cvAgain = true; return; }
  n._cvSaving = true;
  try {
    const v = n.vault; v.cv = v.cv || {};
    // yazmadan önce oku: başka yerde (Obsidian, öbür cihaz) değiştiyse birleştir — üzerine yazma
    const rm = await vaultCanvasRead(n);
    let data = cvNormalize(n.canvas || cvEmpty());
    if (rm && rm.hash !== v.cv.hash) {
      const m = cvMerge(n.canvasBase || cvEmpty(), data, rm.data); data = m.data; n.canvas = data;
      if (MDV.note === n && MDV.cv) MDV.cv.setData(data); if (ed.note === n && pdfCv) pdfCv.setData(data);
      if (MDV.note === n) drawMarks();
    }
    const text = cvSer(data);
    if (rm && text === rm.text) { v.cv.hash = rm.hash; n.canvasBase = data; n._cvDirty = false; await persistNoteRecord(n); return; }
    const r = JSON.parse(Native.treeWrite(v.tree, v.parent, v.cv.doc || '', cvName(n), text, 'application/json') || '{}');
    if (!r.ok) throw new Error(r.error || 'yazılamadı');
    v.cv.doc = r.doc; v.cv.lm = r.lm; v.cv.hash = await shaText(text); n.canvasBase = data; n._cvDirty = false;
    await persistNoteRecord(n);
    if (MDV.note === n) setMdStatus('Tuval kasaya kaydedildi · ' + cvName(n));
  } finally { n._cvSaving = false; if (n._cvAgain) { n._cvAgain = false; setTimeout(() => vaultCanvasSave(n).catch(() => { }), 400); } }
}
window.vaultCanvasSave = vaultCanvasSave;

/* kasa gezgini */
async function openVaultBrowser() {
  if (!vaultReady()) { const v = await pickVault(); if (!v) return; }
  const stack = [{ id: S.vault.root, name: S.vault.name }];
  const list = h('div', { class: 'vlist' }), crumbs = h('div', { class: 'vcrumbs' });
  const back = h('div', { class: 'modal-back vaultback' });
  const box = h('div', { class: 'modal wide vaultbox', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Obsidian kasası' },
    h('div', { class: 'vhead' }, h('h2', null, 'Obsidian kasası'), h('button', { class: 'btn small', type: 'button', onclick: async () => { back.remove(); S.vault = null; saveSettings(); await openVaultBrowser(); } }, 'Başka klasör seç'),
      h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: () => back.remove() }, icon(IC.close))),
    crumbs, list, h('p', { class: 'muted small' }, 'Markdown dosyaları okunur, değiştirilmez. Notlar dosyanın yanındaki “Ad.canvas” tuvaline yazılır.'));
  back.append(box); back.addEventListener('pointerdown', e => { if (e.target === back) back.remove(); }); back._close = () => back.remove();
  document.body.append(back);
  const draw = () => {
    const cur = stack[stack.length - 1];
    crumbs.innerHTML = ''; stack.forEach((s, i) => { if (i) crumbs.append(h('span', null, '›')); crumbs.append(h('button', { type: 'button', class: 'linkish', onclick: () => { stack.length = i + 1; draw(); } }, s.name)); });
    list.innerHTML = ''; list.append(h('p', { class: 'muted' }, 'Yükleniyor…'));
    setTimeout(() => {
      const items = treeList(S.vault.tree, cur.id).filter(f => !/^\./.test(f.name) && (f.dir || /\.(md|markdown|pdf)$/i.test(f.name)))
        .sort((a, b) => (b.dir - a.dir) || a.name.localeCompare(b.name, 'tr'));
      list.innerHTML = '';
      if (!items.length) list.append(h('p', { class: 'muted' }, 'Bu klasörde Markdown ya da PDF yok.'));
      const dirPath = stack.slice(1).map(s => s.name).join('/');
      for (const f of items) list.append(h('button', { type: 'button', class: 'vitem' + (f.dir ? ' dir' : ''), onclick: () => { if (f.dir) { stack.push({ id: f.id, name: f.name }); draw(); } else openVaultEntry(f, cur.id, dirPath); } },
        icon(f.dir ? IC.folder : /\.pdf$/i.test(f.name) ? IC.fileIn : IC.md), h('span', null, f.dir ? f.name : f.name.replace(/\.md$/i, '')), f.dir ? icon(IC.chevR) : h('small', null, fmtDate(f.lm))));
    }, 10);
  };
  draw();
}
window.openVaultBrowser = openVaultBrowser;

/* ---------------- kitaplık bağlantıları ---------------- */
const mdIn = h('input', { type: 'file', id: 'mdIn', accept: '.md,.markdown,text/markdown,text/plain', hidden: true });
document.body.append(mdIn);
mdIn.addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) importMdFile(f); });
{
  const base = newMenu;
  newMenu = anchor => {
    base(anchor);
    const m = pop.querySelector('.menu') || pop.firstElementChild; if (!m) return;
    const add = (label, sub, ic, fn) => m.append(h('button', { type: 'button', role: 'menuitem', onclick: () => { closePop(); fn(); } }, icon(ic), h('span', null, label, h('small', null, sub))));
    if (Native && Native.treePick) add('Obsidian kasasından aç', S.vault ? S.vault.name : 'Markdown ve PDF; notlar tuvale', IC.vault, openVaultBrowser);
    add('Markdown dosyası ekle', 'Okumak ve tuvalde not almak için', IC.md, () => mdIn.click());
  };
}
{
  const base = exportFromLibrary;
  exportFromLibrary = async (id, share) => { const n = await Store.get('notes', id); if (n && n.kind === 'md') { downloadText(mdBase(n.name) + '.md', await mdTextOf(id), 'text/markdown'); return; } return base(id, share); };
}
{
  const base = newMeta;
  newMeta = (note, thumb, old) => { const m = base(note, thumb, old); m.kind = note.kind || 'pdf'; if (note.kind === 'md') m.pageCount = 0; return m; };
}
/* geri tuşu */
{
  const base = window.kenarBack;
  window.kenarBack = () => {
    if (mdOpen()) {
      if (document.querySelector('.modal-back')) { const m = document.querySelector('.modal-back'); if (m._close) m._close(); else m.remove(); return true; }
      if (pop && !pop.hidden) { closePop(); return true; }
      if (typeof dictEl !== 'undefined' && dictEl) { closeDict(); return true; }
      if (selBar) { getSelection().removeAllRanges(); hideSelBar(); return true; }
      if (MDV.cv) { MDV.cv.close(); return true; }
      if (!$('#mdFind').hidden) { findClose(); return true; }
      closeMd(); return true;
    }
    if (pdfCv && ed.note && !document.querySelector('.modal-back') && (!pop || pop.hidden)) { pdfCv.close(); return true; }
    return base ? base() : false;
  };
}
/* sözlük penceresi md görünümünde de açılsın */
{ const base = dictHost; dictHost = () => mdOpen() ? $('#mdUi') : base(); }
