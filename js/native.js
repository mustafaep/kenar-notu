'use strict';
/* =========================================================
   Android uygulaması köprüsü (yalnızca APK içinde etkin)
   Kaydet / paylaş / panoya kopyala, geri tuşu, tam ekran,
   sistem çubuğu rengi ve "Birlikte aç" ile gelen PDF'ler.
   ========================================================= */
const Native = window.KenarNative || null;
let kenarReadyResolve; const kenarReady = new Promise(r => { kenarReadyResolve = r; });

if (Native) {
  document.documentElement.classList.add('native-app');
  const waiters = {};
  window.__kenarNativeDone = (action, ok, msg) => { const w = waiters[action]; delete waiters[action]; if (w) w({ ok, msg }); };
  const b64chunk = blob => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => { const s = String(r.result); res(s.slice(s.indexOf(',') + 1)); }; r.onerror = () => rej(r.error); r.readAsDataURL(blob); });
  async function sendToNativeRaw(blob, name, mime, action) {
    const CH = 3 * 1024 * 1024;
    Native.begin(name, mime || blob.type || 'application/octet-stream');
    for (let off = 0; off < blob.size; off += CH) Native.chunk(await b64chunk(blob.slice(off, off + CH)));
    const parts = action.split('\n'); const key = parts[0] === 'write' && parts[5] ? 'write:' + parts[5] : parts[0];
    const limit = parts[0] === 'write' ? 150 * 1000 : 10 * 60 * 1000;
    const done = new Promise(res => { waiters[key] = res; setTimeout(() => { if (waiters[key]) { delete waiters[key]; res({ ok: false, msg: parts[0] === 'write' ? JSON.stringify({ status: 'timeout', error: 'OneDrive uygulaması yanıt vermedi' }) : 'timeout' }); } }, limit); });
    Native.finish(action);
    return done;
  }
  // Tüm aktarımlar sırayla ve ana pencere üzerinden yapılır (yan pencere de bunu kullanır)
  let sendQ = Promise.resolve();
  const sendLocal = (...a) => { const p = sendQ.then(() => sendToNativeRaw(...a)); sendQ = p.catch(() => { }); return p; };
  if (!EMBED) window.__nativeSend = sendLocal;
  const sendToNative = (...a) => { try { if (EMBED && parent.__nativeSend) return parent.__nativeSend(...a); } catch (e) { } return sendLocal(...a); };
  /* OneDrive (ve diğer dosya sağlayıcıları) üzerindeki PDF'e doğrudan yazma */
  window.nativeDoc = {
    open() { if (EMBED) { try { parent.__incomingTarget = window; parent.__incomingAt = Date.now(); } catch (e) { } } Native.openDocument(); },
    async write(od, blob, force) {
      // kendi yazdığımız boyutlar: OneDrive yüklemeyi sonradan bitirip tarihi değiştirince yanlış "çakışma" çıkmasın
      const sizes = [...new Set([od.size, ...(od.sizes || [])].filter(x => x != null && x >= 0))].slice(0, 12);
      const r = await sendToNative(blob, od.name || 'Belge.pdf', 'application/pdf', ['write', od.id, od.lm || 0, sizes.length ? sizes.join(',') : -1, force || od.alwaysOverwrite ? 1 : 0, uid()].join('\n'));
      try { return JSON.parse(r.msg); } catch (e) { return { status: 'error', error: r.msg }; }
    },
    async saveLink(name, blob) {
      const r = await sendToNative(blob, name, 'application/pdf', 'savelink');
      if (!r.ok) return r.msg === 'cancel' ? null : { error: r.msg };
      try { return JSON.parse(r.msg); } catch (e) { return { error: r.msg }; }
    }
  };
  saveBlob = async function (name, blob) {
    const r = await sendToNative(blob, name, blob.type, 'save');
    if (r.ok) toast('Kaydedildi'); else if (r.msg !== 'cancel') toast('Kaydedilemedi: ' + r.msg, 4000);
  };
  shareBlob = async function (name, blob) { await sendToNative(blob, name, blob.type, 'share'); return true; };
  window.saveToGallery = async function (blob, name) {
    const r = await sendToNative(blob, name, 'image/png', 'gallery');
    if (r.ok) toast('Galeriye kaydedildi · Resimler › Kenar Notu', 2600); else toast('Galeriye kaydedilemedi: ' + r.msg, 4500);
    return r.ok;
  };
  copyText = function (t) { Native.copyText(t); toast('Kopyalandı', 1200); };
  window.uploadToOneDriveApp = async function (name, blob) { await sendToNative(blob, name, 'application/pdf', 'share:com.microsoft.skydrive'); };
  copyImage = async function (blob) { const r = await sendToNative(blob, 'Kenar Notu ' + Date.now() + '.png', 'image/png', 'copy'); toast(r.ok ? 'Görüntü panoya kopyalandı' : 'Kopyalanamadı'); };
  // Paylaş menülerinin görünmesi için
  if (!navigator.canShare) navigator.canShare = () => true;

  // Tam ekran: sistem çubuklarını gizle
  let imm = false;
  try { Object.defineProperty(document, 'fullscreenElement', { configurable: true, get: () => imm ? document.documentElement : null }); } catch (e) { }
  document.documentElement.requestFullscreen = () => { imm = true; Native.setImmersive(true); return Promise.resolve(); };
  document.exitFullscreen = () => { imm = false; Native.setImmersive(false); return Promise.resolve(); };

  // Sistem çubuğu rengini temaya uydur
  const baseTheme = applyTheme;
  applyTheme = function () {
    baseTheme();
    try {
      const cs = getComputedStyle(document.documentElement);
      const c = (cs.getPropertyValue('--chrome') || '#FFFFFF').trim();
      const dark = cs.colorScheme === 'dark' || document.documentElement.getAttribute('data-theme') === 'dark' || (!document.documentElement.getAttribute('data-theme') && matchMedia('(prefers-color-scheme: dark)').matches);
      if (!EMBED) Native.setBars(c.length === 4 ? '#' + c[1] + c[1] + c[2] + c[2] + c[3] + c[3] : c, !dark);
    } catch (e) { }
  };

  // Dış bağlantıları tarayıcıda aç
  document.addEventListener('click', e => {
    const a = e.target.closest && e.target.closest('a[href^="http"]');
    if (a && !/^https:\/\/localhost\//.test(a.href)) { e.preventDefault(); Native.openUrl(a.href); }
  }, true);

  // Android geri tuşu: önce açık pencereyi, sonra düzenleyiciyi kapat
  window.kenarBack = () => {
    if (ed.capture) { captureEnd(); return true; }
    const od = document.querySelector('.od-back'); if (od) { od.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); if (od.isConnected) od.remove(); return true; }
    const m = [...document.querySelectorAll('.modal-back')].pop(); if (m) { m.remove(); return true; }
    if (pop && !pop.hidden) { closePop(); return true; }
    if (ed.editing) { finishText(); return true; }
    if (ed.sel) { clearSel(); return true; }
    if (typeof pgridEl !== 'undefined' && pgridEl) { closePgrid(); return true; }
    if (typeof dictEl !== 'undefined' && dictEl) { closeDict(); return true; }
    if (TS.sel) { textSelClear(); return true; }
    if (!edView.hidden && !$('#ppanel').hidden && innerWidth <= 760) { setPanel(false); return true; }
    if (!edView.hidden) { closeEditor(); return true; }
    if (libSelecting()) { libSelectEnd(); return true; }
    if (libState.view !== 'all') { libGoBack(); return true; }
    return false;
  };
  // Uygulama arka plana geçerken kaydet
  window.kenarFlush = () => { try { if (ed.note) { finishText(); saveNote(true); } } catch (e) { } };
}

// "Birlikte aç" / "Paylaş" ile gelen PDF
window.kenarIncoming = async () => {
  if (!Native) return;
  // Yan pencerenin istediği dosyayı ona ilet
  const tgt = window.__incomingTarget;
  if (tgt && tgt !== window && Date.now() - (window.__incomingAt || 0) < 10 * 60 * 1000) {
    window.__incomingTarget = null;
    try { if (!tgt.closed && tgt.kenarIncoming) return tgt.kenarIncoming(); } catch (e) { }
  }
  await kenarReady;
  const n = Native.incomingChunks(); if (!n) return;
  const name = Native.incomingName() || 'Belge.pdf';
  let meta = {}; try { meta = JSON.parse(Native.incomingMeta() || '{}'); } catch (e) { }
  const parts = [];
  for (let i = 0; i < n; i++) { const bin = atob(Native.incomingChunk(i)); const u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); parts.push(u); }
  Native.incomingDone();
  if (ed.note) await closeEditor();
  if (meta.kind === 'doc') { openLinkedDoc(meta, name, await new Blob(parts).arrayBuffer()); return; }
  importPdf(new File(parts, name, { type: 'application/pdf' }));
};

/* Seçilen dosyayı nota bağla ya da tablette notu olan dosyayı aç */
const providerLabel = p => /skydrive|onedrive|microsoft/i.test(p || '') ? 'OneDrive' : /google/i.test(p || '') ? 'Google Drive' : 'cihazdaki dosya';
function safLink(meta, fallbackName, size) {
  return { kind: 'saf', id: meta.uri, name: meta.name || fallbackName, lm: meta.lastModified || 0, eTag: String(meta.lastModified || 0), size: meta.size != null ? meta.size : size,
    provider: meta.provider || '', place: providerLabel(meta.provider), mode: 'overwrite', syncedAt: Date.now(), state: 'synced', canWrite: meta.canWrite !== false };
}
async function openLinkedDoc(meta, name, bytes) {
  const od = safLink(meta, name, bytes.byteLength);
  const idx = await odMetaIndex(); const local = idx.get(od.id);
  const fresh = async replaceId => {
    const pr = progress('PDF açılıyor…');
    try { const note = await createNoteFromPdf(od.name.replace(/\.pdf$/i, ''), bytes, { od, id: replaceId, onProg: (i, n) => pr.set(i / n, `Sayfalar hazırlanıyor ${i}/${n}`) }); pr.done(); await openNote(note.id); if (!od.canWrite) toast('Bu konum dosyaya yazma izni vermedi. Notlarınız tablette kayıtlı; kaydederken OneDrive’da yeni bir dosya seçmeniz istenecek. İpucu: dosyayı seçicinin sol menüsündeki “OneDrive”dan seçin, “Son kullanılanlar”dan değil.', 7000); }
    catch (e) { pr.done(); toast('PDF açılamadı. Dosya bozuk ya da parola korumalı olabilir.', 4200); }
  };
  if (local) {
    const n = await Store.get('notes', local.id);
    if (n && n.od && (n.od.lm === od.lm || !od.lm)) {
      // aynı dosya zaten kitaplıkta: açık klasördeysek oraya taşı, yazma iznini tazele
      if (local.folder !== curFolder() && curFolder()) { local.folder = curFolder(); await Store.put('meta', local); toast('Bu dosya zaten kitaplıktaydı; bu klasöre taşındı', 2600); }
      if (od.canWrite && n.od.canWrite === false) { n.od.canWrite = true; await persistNoteRecord(n); }
      openNote(local.id); return;
    }
    if (n) {
      modal({ title: 'Dosya başka bir yerde değişmiş', text: `“${od.name}” bu tabletteki notlu sürümünüzden sonra güncellenmiş.`, actions: [
        { label: 'Tabletteki notu aç', onClick: () => openNote(local.id) },
        { label: 'Dosyadaki sürümü aç', kind: 'primary', onClick: () => fresh(local.id) }] });
      return;
    }
  }
  fresh(null);
}
/* OneDrive bir yazımı arka planda yükler. Yükleme bitmeden aynı dosyaya tekrar yazılırsa OneDrive bunu çakışma sayıp
   “Dosya 1.pdf”, “Dosya 2.pdf” … adlı kopyalar oluşturur. Bu yüzden: aynı içerik ikinci kez yazılmaz ve önceki yükleme
   bitene (dosyanın değişiklik zamanı OneDrive tarafından güncellenene) kadar yeni yazım bekletilir. */
const isOneDriveSaf = od => od && od.kind === 'saf' && od.place === 'OneDrive';
function safSettleEstimate(size) { return clamp(25000 + (size || 0) / 120, 30000, 8 * 60000); } // ~120 KB/sn yükleme varsayımı
function safSettled(od) {
  const st = od && od.settle; if (!st) return true;
  if (Date.now() > st.until) { od.settle = null; return true; }
  let m = null; try { m = JSON.parse(Native.docInfo(od.id) || '{}'); } catch (e) { }
  if (m && m.lastModified && st.lm0 && m.lastModified !== st.lm0) {
    od.settle = null; od.lm = m.lastModified; od.eTag = String(od.lm);
    if (m.size != null && m.size >= 0) od.sizes = [...new Set([m.size, ...(od.sizes || [])])].slice(0, 12);
    return true;
  }
  return false;
}
const safWaitT = new Map();
function deferSafSync(note, bytes) {
  if (safWaitT.has(note.id)) return;
  const tick = () => {
    safWaitT.delete(note.id);
    // not yeniden açıldıysa güncel nesneyi kullan (eski nesneyle eski içerik yazılmasın)
    const n = ed.note && ed.note.id === note.id ? ed.note : note, b = ed.note && ed.note.id === note.id ? ed.pdfBytes : bytes;
    if (!n.od || !n.od.dirty) return;
    if (!safSettled(n.od)) { safWaitT.set(note.id, setTimeout(tick, 5000)); return; }
    syncNote(n, b).then(() => { if (typeof libView !== 'undefined' && !libView.hidden) renderLibrary(); });
  };
  safWaitT.set(note.id, setTimeout(tick, 5000));
}
async function sha256Hex(buf) {
  try { const d = await crypto.subtle.digest('SHA-256', buf); return [...new Uint8Array(d)].map(x => x.toString(16).padStart(2, '0')).join(''); } catch (e) { return ''; }
}
async function syncSaf(note, bytes, opt = {}) {
  const od = note.od;
  if (isOneDriveSaf(od) && od.mode !== 'copy' && !safSettled(od)) {
    od.dirty = true; await persistNoteRecord(note); setSyncState(note, 'uploading'); deferSafSync(note, bytes);
    return 'wait';
  }
  setSyncState(note, 'busy');
  try {
    const out = await buildPdf(note, bytes); const blob = new Blob([out], { type: 'application/pdf' });
    const hash = await sha256Hex(out);
    if (od.mode !== 'copy' && hash && od.hash === hash && !opt.force) {
      // içerik son kaydedilenle aynı: OneDrive'a yeniden yükleme yok
      od.dirty = false; od.state = 'synced'; await persistNoteRecord(note); setSyncState(note, 'synced'); return 'ok';
    }
    if (od.mode === 'copy') {
      const r = await nativeDoc.saveLink(safeName(od.name.replace(/\.pdf$/i, '') + ' (notlu)') + '.pdf', blob);
      if (!r) { od.mode = 'overwrite'; setSyncState(note, od.state === 'conflict' ? 'conflict' : 'pending'); return 'skip'; }
      if (r.error) throw new Error(r.error);
      Object.assign(od, safLink({ ...r, canWrite: true }, od.name, r.size)); od.hash = hash;
      od.settle = isOneDriveSaf(od) ? { lm0: od.lm, at: Date.now(), until: Date.now() + safSettleEstimate(r.size) } : null;
      od.dirty = false; await persistNoteRecord(note); setSyncState(note, 'synced'); toast('“' + od.name + '” kaydedildi. Değişiklikler artık bu dosyaya yazılacak.', 4000); return 'ok';
    }
    if (od.canWrite === false) { od.state = 'readonly'; setSyncState(note, 'readonly'); return 'readonly'; }
    const r = await nativeDoc.write(od, blob, opt.force);
    if (r.status === 'ok') { buildNotice(od);
      od.sizes = [...new Set([r.size, od.size, ...(od.sizes || [])].filter(x => x != null && x >= 0))].slice(0, 12);
      od.lm = r.lastModified || 0; od.eTag = String(od.lm); od.size = r.size; od.syncedAt = Date.now(); od.dirty = false; od.state = 'synced'; od.hash = hash;
      od.settle = isOneDriveSaf(od) ? { lm0: od.lm, at: Date.now(), until: Date.now() + safSettleEstimate(r.size) } : null;
      await persistNoteRecord(note); setSyncState(note, 'synced'); return 'ok'; }
    if (r.status === 'conflict') { od.state = 'conflict'; await persistNoteRecord(note); setSyncState(note, 'conflict'); return 'conflict'; }
    if (r.status === 'denied') { od.canWrite = false; od.state = 'readonly'; od.lastError = r.error || 'Yazma izni yok'; await persistNoteRecord(note); setSyncState(note, 'readonly'); return 'readonly'; }
    od.state = 'error'; od.lastError = r.status === 'denied' ? 'Yazma izni verilmedi (' + (r.error || '') + ')' : r.status === 'timeout' ? (r.error || 'Zaman aşımı') + '. OneDrive uygulamasını açıp oturumun açık olduğunu ve internet bağlantısını kontrol edin.' : (r.error || 'Bilinmeyen hata');
    setSyncState(note, 'error', { message: od.lastError });
    return 'error';
  } catch (e) { od.state = 'error'; od.lastError = (e && e.message) || String(e); setSyncState(note, 'error', e); return 'error'; }
}
/* Dosyaya doğrudan yazılamadığında seçenekler */
function buildNotice(od) {
  if (lastBuildInfo.cleaned && !od.cleanNoted) { od.cleanNoted = true; toast('Bu PDF şifreli (düzenleme kısıtlı) ya da hasarlıydı. Notlarınız işlenebilsin diye kaydederken kısıtlama kaldırıldı ve dosya onarıldı.', 6500); }
  if (lastBuildInfo.rasterPages) toast(lastBuildInfo.rasterPages + ' sayfa okunamadığı için görüntü olarak kaydedildi.', 5000);
}
function safErrorDialog(note, bytes) {
  const od = note.od; const ro = od.state === 'readonly' || od.canWrite === false;
  modal({
    title: ro ? 'Bu dosya yalnızca okunabilir' : (od.place === 'OneDrive' ? 'OneDrive' : 'Dosya') + ' güncellenemedi',
    text: ro ? `${od.place === 'OneDrive' ? 'OneDrive' : 'Bu konum'} “${od.name}” dosyasının üzerine yazmaya izin vermiyor (dosya paylaşılan, salt okunur ya da “Son kullanılanlar”/“Dosyalarım” üzerinden seçilmiş olabilir). Notlarınız tablette güvende. “Yeni dosya olarak kaydet” ile OneDrive’da bir klasör seçin; sonraki tüm kayıtlar otomatik olarak o dosyaya yazılır.`
      : `“${od.name}” dosyasına yazılamadı. Sağlayıcının yanıtı: ${od.lastError || 'bilinmiyor'}. Notlarınız tablette güvende; aşağıdaki yollardan biriyle kaydedebilirsiniz.`,
    actions: [
      { label: 'Kapat' },
      { label: 'OneDrive uygulamasıyla kopya yükle', onClick: async () => { const out = await buildPdf(note, bytes); toast('OneDrive aynı adlı dosya varsa yanına “… 1.pdf” gibi yeni bir kopya oluşturur.', 4500); await uploadToOneDriveApp(safeName(od.name), new Blob([out], { type: 'application/pdf' })); } },
      ro ? null : { label: 'Tekrar dene', onClick: () => syncNow() },
      { label: 'Yeni dosya olarak kaydet', kind: 'primary', onClick: async () => { od.mode = 'copy'; const r = await syncNote(note, bytes); if (r === 'error') safErrorDialog(note, bytes); } }
    ].filter(Boolean)
  });
}
async function nativeSaveNew(note, bytes) {
  const pr = progress('PDF hazırlanıyor…');
  try {
    const out = await buildPdf(note, bytes, f => pr.set(f)); pr.done();
    const r = await nativeDoc.saveLink(safeName(note.name) + '.pdf', new Blob([out], { type: 'application/pdf' }));
    if (!r) return; if (r.error) { toast('Kaydedilemedi: ' + r.error, 4000); return; }
    note.od = safLink({ ...r, canWrite: true }, safeName(note.name) + '.pdf', r.size);
    await persistNoteRecord(note); if (ed.note === note) renderStatus('synced');
    toast(`“${note.od.name}” ${note.od.place === 'OneDrive' ? 'OneDrive’a' : ''} kaydedildi. Değişiklikler artık bu dosyaya yazılacak.`.replace('  ', ' '), 4200);
  } catch (e) { pr.done(); toast('Kaydedilemedi: ' + (e.message || e), 4000); }
}

if (!Native) window.saveToGallery = async (blob, name) => { await saveBlob(name, blob); return true; };
