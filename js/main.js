'use strict';
/* =========================================================
   Başlangıç
   ========================================================= */
pop = $('#pop');
document.addEventListener('pointerdown', e => { if (pop.hidden || pop.contains(e.target)) return; if (popAnchor && popAnchor.contains(e.target)) popAnchorTapped(popAnchor); else closePop(); }, true);
addEventListener('resize', () => placePop());

function newMenu(anchor) {
  openPop(anchor, () => menu([
    { label: 'PDF ekle', icon: IC.fileIn, sub: 'Tabletteki dosyalardan', onClick: () => $('#fileIn').click() },
    { label: 'OneDrive’dan aç', icon: IC.cloud, sub: 'Değişiklikler dosyaya yazılır', onClick: () => openOneDrive() },
    { label: 'Boş not', icon: IC.blank, sub: 'Çizgili, kareli, noktalı', onClick: () => blankMenu(anchor) },
    { label: 'Klasör', icon: IC.folderPlus, sub: curFolder() ? 'Bu klasörün içinde' : 'Notlarınızı gruplayın', onClick: () => newFolder(curFolder()) }
  ]));
}
$('#newBtn').addEventListener('click', () => newMenu($('#newBtn')));
$('#selBtn').addEventListener('click', () => { libState.sel = libState.sel ? null : new Set(); renderLibrary(); });
$('#fileIn').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; importPdf(f); });
$('#q').addEventListener('input', () => renderLibrary());
$('#sortSel').addEventListener('change', () => { S.sort = $('#sortSel').value; saveSettings(); renderLibrary(); });

let dragDepth = 0, dropHint = null;
addEventListener('dragenter', e => { if (!libView.hidden && e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { dragDepth++; if (!dropHint) { dropHint = h('div', { class: 'drop-hint' }, 'PDF dosyasını bırakın'); document.body.append(dropHint); } } });
addEventListener('dragleave', () => { if (--dragDepth <= 0 && dropHint) { dropHint.remove(); dropHint = null; dragDepth = 0; } });
addEventListener('dragover', e => { if (!libView.hidden) e.preventDefault(); });
addEventListener('drop', e => { if (libView.hidden) return; e.preventDefault(); dragDepth = 0; if (dropHint) { dropHint.remove(); dropHint = null; } const f = e.dataTransfer.files[0]; if (f) importPdf(f); });

/* Android "Paylaş → Kenar Notu" ve dosya açma (ana ekrana eklenmiş uygulamada) */
if ('launchQueue' in window) {
  try { window.launchQueue.setConsumer(async p => { if (p.files && p.files.length) { const f = await p.files[0].getFile(); importPdf(f); } }); } catch (e) { }
}

(async function init() {
  applyTheme();
  if (window.matchMedia) matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);
  await Store.open();
  $('#storeNote').innerHTML = Store.ok
    ? 'Notlar bu tabletin depolamasında tutulur. OneDrive’a bağlı notlar ayrıca dosyanın kendisine yazılır.'
    : 'Tarayıcı depolaması kapalı olduğu için notlar yalnızca bu oturumda kalır. Çalışmanızı <b>Kaydet</b> menüsünden cihaza ya da OneDrive’a alın.';
  await OD.init();
  let seeded = false; try { seeded = localStorage.getItem('kn.seeded') === '1'; } catch (e) { }
  if (!seeded) { const all = await Store.all('meta'); if (!all.length) await seedSample(); try { localStorage.setItem('kn.seeded', '1'); } catch (e) { } }
  await renderLibrary();
  let resume = null; try { resume = JSON.parse(sessionStorage.getItem('kn.resume') || 'null'); sessionStorage.removeItem('kn.resume'); } catch (e) { }
  if (resume) {
    if (OD.signedIn()) toast('OneDrive’a bağlandı: ' + OD.accountName(), 3000);
    if (resume.note) { await openNote(resume.note); if (ed.note && ed.note.od && ed.note.od.dirty && OD.signedIn()) syncNow(); }
    else if (resume.od && OD.signedIn()) openOneDrive();
  }
  kenarReadyResolve();
  if (EMBED) { const m = /#open=([\w-]+)/.exec(location.hash); if (m) openNote(m[1]); return; }
  if (Native) { window.kenarIncoming(); return; }
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    try { await navigator.serviceWorker.register('sw.js'); } catch (e) { }
  }
})();
