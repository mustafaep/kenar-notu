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
      const r = await sendToNative(blob, od.name || 'Belge.pdf', 'application/pdf', ['write', od.id, od.lm || 0, sizes.length ? sizes.join(',') : -1, force ? 1 : 0, uid()].join('\n'));
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
    const m = [...document.querySelectorAll('.modal-back')].pop(); if (m) { if (m._close) m._close(); else m.remove(); return true; }
    if (pop && !pop.hidden) { closePop(); return true; }
    if (window.pfBack && pfBack()) return true;
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
    try { const note = await createNoteFromPdf(od.name.replace(/\.pdf$/i, ''), bytes, { od, id: replaceId, onProg: (i, n) => pr.set(i / n, `Sayfalar hazırlanıyor ${i}/${n}`) }); pr.done(); await openNote(note.id); if (!od.canWrite) toast('Bu konum dosyaya yazma izni vermedi. Notlarınız ' + DV.da + ' kayıtlı; kaydederken OneDrive’da yeni bir dosya seçmeniz istenecek. İpucu: dosyayı seçicinin sol menüsündeki “OneDrive”dan seçin, “Son kullanılanlar”dan değil.', 7000); }
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
    if (n && n.od) {
      // dosya başka cihazda değişmiş: üzerine yazmadan birleştir (öbür cihazda yalnız notlar değiştiyse ya da bu notta PDF'ten başka bir şey yoksa)
      const pr = progress('Diğer cihazdaki değişiklikler birleştiriliyor…');
      let r = null; try { const rec = await Store.get('pdfs', local.id); r = await safAutoMerge(n, rec ? rec.bytes : null, { bytes, lm: od.lm, size: od.size }); } catch (e) { r = null; }
      pr.done();
      if (r === 'merged' || r === 'synced') { if (od.canWrite && n.od.canWrite === false) { n.od.canWrite = true; await persistNoteRecord(n); } await openNote(local.id); if (r === 'merged' && S.od.auto && ed.note && ed.note.id === local.id) syncNote(ed.note, ed.pdfBytes); return; }
      modal({ title: 'Dosya başka bir yerde değişmiş', text: `“${od.name}” bu cihazdaki notlu sürümünden sonra başka bir yerde, notlar dışında da değiştirilmiş (ör. bilgisayarda düzenlenmiş). Kendiliğinden birleştiremiyorum; hiçbir şey silinmedi.`, actions: [
        { label: 'Bu cihazdaki notu aç', onClick: () => openNote(local.id) },
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
    od.settle = null;
    // boyut bizim son yazdığımızla aynıysa OneDrive yüklemeyi bitirmiştir; değilse dosyayı başka bir cihaz değiştirmiştir
    // (o zaman tarih benimsenmez: yazmadan önce birleştirme devreye girer)
    if (m.size == null || m.size < 0 || m.size === od.size) { od.lm = m.lastModified; od.eTag = String(od.lm); }
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
  const chk = checking.get(note); if (chk) { try { await chk; } catch (e) { } }
  setSyncState(note, 'busy');
  try {
    // Yazmadan önce: dosya başka bir cihazda değiştiyse önce birleştir (üzerine yazma).
    // Açılıştaki denetim yapılamadıysa (od.verify) dosyanın içeriğine bakmadan yazılmaz.
    if (od.mode !== 'copy' && !opt.force && od.canWrite !== false) {
      const ch = od.verify || safRemoteChanged(od);
      if (ch) {
        const m = await safAutoMerge(note, bytes);
        if (m === 'ask' || m === 'fail') { od.state = 'conflict'; await persistNoteRecord(note); setSyncState(note, 'conflict'); return 'conflict'; }
        od.verify = false;
        if (m === 'synced') { setSyncState(note, 'synced'); return 'ok'; }
        if (note._adopted) bytes = note._adopted;
      }
    }
    delete note._adopted;
    od.rev = (od.rev || 0) + 1; note._rev = knDevId() + ':' + od.rev;
    let out; try { out = await buildPdf(note, bytes); } finally { delete note._rev; }
    if (od.mode !== 'copy') {
      // dosya kısaltılamazsa sonda artık kalmasın: yeni içerik, dosyanın şimdiki boyuna doldurulur (padPdfTo)
      let cur = -1; try { const m = JSON.parse(Native.docInfo(od.id) || '{}'); if (m && m.size >= 0) cur = +m.size; } catch (e) { }
      const target = Math.max(cur, od.size || 0);
      if (target > out.length && target - out.length < 64 * 1024 * 1024) out = padPdfTo(out, target);
    }
    const body = lastBuildInfo.body; const blob = new Blob([out], { type: 'application/pdf' });
    const hash = await sha256Hex(out);
    if (od.mode !== 'copy' && hash && od.hash === hash && !opt.force) {
      // içerik son kaydedilenle aynı: OneDrive'a yeniden yükleme yok
      od.dirty = false; od.state = 'synced'; od.base = stickyBase(note); pushBody(od, body); await persistNoteRecord(note); setSyncState(note, 'synced'); return 'ok';
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
      od.base = stickyBase(note); pushBody(od, body); // bir sonraki birleştirmenin tabanı
      od.hashes = [hash, ...(od.hashes || []).filter(x => x !== hash)].slice(0, 8);   // kendi yazdıklarımızı tanımak için
      od.settle = isOneDriveSaf(od) ? { lm0: od.lm, at: Date.now(), until: Date.now() + safSettleEstimate(r.size) } : null;
      await persistNoteRecord(note); setSyncState(note, 'synced'); return 'ok'; }
    if (r.status === 'conflict') {
      // yazarken fark edildi: birleştirip bir kez daha dene
      if (!opt._retried) { const m = await safAutoMerge(note, bytes); if (m === 'merged' || m === 'own') { const b2 = note._adopted || bytes; delete note._adopted; return syncSaf(note, b2, { ...opt, _retried: true }); } if (m === 'synced') { setSyncState(note, 'synced'); return 'ok'; } }
      od.state = 'conflict'; await persistNoteRecord(note); setSyncState(note, 'conflict'); return 'conflict';
    }
    if (r.status === 'denied') { od.canWrite = false; od.state = 'readonly'; od.lastError = r.error || 'Yazma izni yok'; await persistNoteRecord(note); setSyncState(note, 'readonly'); return 'readonly'; }
    od.state = 'error'; od.lastError = r.status === 'denied' ? 'Yazma izni verilmedi (' + (r.error || '') + ')' : r.status === 'timeout' ? (r.error || 'Zaman aşımı') + '. OneDrive uygulamasını açıp oturumun açık olduğunu ve internet bağlantısını kontrol edin.' : (r.error || 'Bilinmeyen hata');
    setSyncState(note, 'error', { message: od.lastError });
    return 'error';
  } catch (e) { od.state = 'error'; od.lastError = (e && e.message) || String(e); setSyncState(note, 'error', e); return 'error'; }
}
/* =========================================================
   Senkronizasyon: OneDrive'daki dosya başka bir cihazda (ör. telefonda) değiştiyse ÜZERİNE YAZILMAZ.
   Önce güncel dosya okunur, yapışkan notlar üç yönlü birleştirilir (son eşitlemedeki durum = taban):
     · yalnız orada değişen/eklenen not alınır, yalnız burada değişen korunur, iki yerde birden değişende ikisi de tutulur;
     · bir yerde silinip öbür yerde değişmemişse silinir.
   Notlar dışındaki içerik (çizim, metin, sayfalar) için: dosyadaki /KNBody parmak izi son eşitlemedekiyle aynıysa öbür cihazda
   yalnız notlar değişmiştir → burada her şey korunur. Bu notta PDF'in kendisinden başka bir şey yoksa (telefon) dosyanın güncel
   sürümü alınır. İkisi de değilse kullanıcıya sorulur.
   ========================================================= */
const FTAG = (EMBED ? 's' : 'm') + Math.random().toString(36).slice(2, 6), fetchReqs = new Map();
window.__docFetched = j => { let r; try { r = JSON.parse(j); } catch (e) { return; } const f = fetchReqs.get(r.id); if (f) { fetchReqs.delete(r.id); f(r); } };
function safFetch(od) {
  return new Promise((res, rej) => {
    if (!Native || !Native.docFetch) { rej(new Error('Bu sürüm dosyayı okuyamıyor')); return; }
    const id = 'f' + FTAG + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
    const to = setTimeout(() => { fetchReqs.delete(id); rej(new Error('OneDrive dosyası okunamadı (zaman aşımı)')); }, 180000);
    fetchReqs.set(id, r => {
      clearTimeout(to);
      if (!r.ok) { rej(new Error(r.error || 'Dosya okunamadı')); return; }
      try {
        const parts = [];
        for (let i = 0; i < r.chunks; i++) { const bin = atob(Native.docFetchChunk(id, i)); const u = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u[k] = bin.charCodeAt(k); parts.push(u); }
        Native.docFetchDone(id);
        new Blob(parts).arrayBuffer().then(buf => res({ bytes: buf, lm: r.lastModified || 0, size: r.size }), rej);
      } catch (e) { try { Native.docFetchDone(id); } catch (er) { } rej(e); }
    });
    try { Native.docFetch(od.id, id); } catch (e) { clearTimeout(to); fetchReqs.delete(id); rej(e); }
  });
}
/* Dosya bu cihazın son eşitlemesinden sonra başka yerde değişti mi? (OneDrive'ın bizim yazımızı tamamlaması değişiklik sayılmaz) */
function safRemoteChanged(od) {
  if (!Native || !od || od.kind !== 'saf' || od.mode === 'copy') return null;
  let m = null; try { m = JSON.parse(Native.docInfo(od.id) || '{}'); } catch (e) { }
  if (!m || !m.lastModified || !od.lm || m.lastModified === od.lm) return null;
  const known = new Set([od.size, ...(od.sizes || [])].filter(x => x != null && x >= 0));
  if (m.size != null && m.size >= 0 && known.has(m.size)) return null;
  return m;
}
/* bu cihazın yazdığı ya da tamamen içine aldığı dosya içeriklerinin özetleri */
function ownHashes(note) { const od = note.od || {}; return [...new Set([od.hash, ...(od.hashes || []), note.srcHash].filter(Boolean))]; }
function pushBody(od, b) { if (!b) return; od.bodyKey = b; od.bodies = [b, ...(od.bodies || []).filter(x => x !== b)].slice(0, 8); }
window.pushBody = pushBody;
/* Dosyada notlar dışındaki içerik (çizim, metin, sayfalar) bu cihazın bildiği bir hâl mi? Öyleyse öbür cihaz yalnız notları değiştirmiştir. */
async function remoteBodyKnown(note, info, rPages, own) {
  if (!knTrusted(info)) return false;
  const od = note.od, cu = (info && info.Custom) || {}, rBody = typeof cu.KNBody === 'string' ? cu.KNBody : null;
  if (rPages.length !== note.pages.length) return false;
  if (rBody && [od.bodyKey, ...(od.bodies || [])].includes(rBody)) return true;
  if (typeof cu.KNSrc === 'string' && own.includes(cu.KNSrc)) return true;              // telefon: bu cihazın yazdığı dosyadan türemiş
  if (rBody && rBody[0] === 'b') for (const H of own) if (await pristineFp(H, rPages) === rBody) return true;  // aynısı, eski telefon yazımı
  return false;
}
async function knMergeRemote(note, localBytes, remote, forceMode) {
  const od = note.od;
  // dosyadaki, bu cihazın yazdığı (ya da zaten içine aldığı) bayt bayt aynı içerik mi? → başkasının değişikliği yok.
  // Etiket (/KNRev) tek başına yetmez: başka bir uygulama dosyayı düzenlerken belge bilgisini olduğu gibi bırakabilir.
  const rh = await knSha(remote.bytes), own = ownHashes(note);
  if (rh && own.includes(rh)) {
    od.lm = remote.lm || od.lm; od.eTag = String(od.lm); if (remote.size != null) { od.size = remote.size; od.sizes = [...new Set([remote.size, ...(od.sizes || [])])].slice(0, 12); }
    if (od.state === 'conflict' || od.state === 'error') od.state = od.dirty ? 'pending' : 'synced';
    return { mode: 'own' };
  }
  const doc = await loadPdf(remote.bytes);
  let info = {}; try { const md = await doc.getMetadata(); info = (md && md.info) || {}; } catch (e) { }
  const cu = info.Custom || {};
  const rPages = await pdfPagesMeta(doc); try { await doc.destroy(); } catch (e) { }
  const rBody = typeof cu.KNBody === 'string' ? cu.KNBody : null;
  let mode;
  if (forceMode === 'stickies' || await remoteBodyKnown(note, info, rPages, own)) mode = 'stickies';   // forceMode: kullanıcı seçti
  else if (notePristine(note)) mode = 'adopt';
  else return { mode: 'ask' };
  const kn = +cu.KNNotes > 0 ? await readKnNotes(remote.bytes, rPages) : { pages: [] };
  const base = od.base || null, st = { added: 0, changed: 0, removed: 0, both: 0 };
  const L = new Map(), R = new Map(), out = new Map();
  note.pages.forEach((p, pi) => { for (const n of ((note.ann[p.id] || {}).n || [])) L.set(n.id, { n, pi }); });
  kn.pages.forEach((list, pi) => { for (const n of list) R.set(n.id, { n, pi }); });
  for (const id of new Set([...L.keys(), ...R.keys()])) {
    const l = L.get(id), r = R.get(id), b = base && base[id];
    if (l && r) {
      const ls = stickySig(l.n), rs = stickySig(r.n);
      if (ls === rs && l.pi === r.pi) out.set(id, l);
      else if (b && ls === b.sig && l.pi === b.pi) { out.set(id, r); st.changed++; }   // yalnız orada değişmiş
      else if (b && rs === b.sig && r.pi === b.pi) out.set(id, l);                    // yalnız burada değişmiş
      else { out.set(id, l); const c = { ...r.n, id: uid(), title: (r.n.title || 'Not') + ' · diğer cihaz' }; out.set(c.id, { n: c, pi: r.pi }); st.both++; }
    } else if (l) {
      if (b && stickySig(l.n) === b.sig) st.removed++;  // orada silinmiş, burada değişmemiş
      else out.set(id, l);
    } else if (r) {
      if (b && stickySig(r.n) === b.sig) continue;        // burada silinmiş, orada değişmemiş
      out.set(id, r); st.added++;
    }
  }
  const sameAsRemote = out.size === R.size && [...out].every(([id, v]) => R.has(id) && R.get(id).pi === v.pi && stickySig(R.get(id).n) === stickySig(v.n));
  if (mode === 'adopt') {
    note.pages = rPages; note.ann = {};
    note.srcPages = rPages.length; note.srcBody = rBody; note.srcHash = await knSha(remote.bytes);
    await Store.put('pdfs', { id: note.id, bytes: remote.bytes });
    note._adopted = remote.bytes;
  } else for (const p of note.pages) { const A = note.ann[p.id]; if (A) A.n = []; }
  for (const { n, pi } of out.values()) { const p = note.pages[Math.min(pi, note.pages.length - 1)]; const A = note.ann[p.id] || (note.ann[p.id] = { s: [], t: [], i: [], n: [] }); if (!A.n) A.n = []; A.n.push(n); }
  // dosyanın şimdiki hâli yeni taban (yazım başarılı olursa birleşmiş hâl taban olur)
  const rb = {}; R.forEach((v, id) => { rb[id] = { sig: stickySig(v.n), pi: v.pi }; });
  od.base = rb;
  if (mode === 'adopt') pushBody(od, rBody || await noteBodyFp(note, remote.bytes));
  else if (rBody) od.bodies = [...new Set([...(od.bodies || []), rBody])].slice(-8);   // öbür cihazın bildiği hâl de bizim geçmişimiz
  if (rh) od.hashes = [rh, ...(od.hashes || []).filter(x => x !== rh)].slice(0, 8);      // bu içerik artık burada
  od.lm = remote.lm || od.lm; od.eTag = String(od.lm); if (remote.size != null) { od.size = remote.size; od.sizes = [...new Set([remote.size, ...(od.sizes || [])])].slice(0, 12); }
  od.hash = null; od.dirty = !sameAsRemote; od.state = od.dirty ? 'pending' : 'synced'; od.syncedAt = Date.now();
  note.updated = Date.now();
  return { mode, stats: st, needWrite: !sameAsRemote };
}
/* Dönen: 'merged' (birleşti, yazılması gerekiyor) · 'synced' (dosyadakiyle aynı) · 'ask' (kullanıcı seçmeli) · 'fail' */
async function safAutoMerge(note, bytes, remote, forceMode) {
  try { remote = remote || await safFetch(note.od); } catch (e) { note.od.lastError = e.message; return 'fail'; }
  let r; try { r = await knMergeRemote(note, bytes, remote, forceMode); } catch (e) { note.od.lastError = e.message; return 'fail'; }
  if (r.mode === 'ask') return 'ask';
  if (r.mode === 'own') { await persistNoteRecord(note); return note.od.dirty ? 'own' : 'synced'; } // dosyadaki bizim yazımımız
  await persistNoteRecord(note);
  if (ed.note === note) {
    if (r.mode === 'adopt') { const id = note.id; setTimeout(() => { if (ed.note && ed.note.id === id) { savePos(); openNote(id); } }, 0); }
    else { for (const pv of ed.pvs) renderStickies(pv); ed.undo.length = 0; ed.redo.length = 0; updateUndoBtns(); }
  }
  const s = r.stats, msg = [s.added && s.added + ' yeni', s.changed && s.changed + ' değişen', s.removed && s.removed + ' silinen', s.both && s.both + ' iki yerde birden değişen (ikisi de tutuldu)'].filter(Boolean).join(', ');
  toast(r.mode === 'adopt' ? 'Dosyanın güncel sürümü açıldı' + (msg ? ' · notlar: ' + msg : '') : msg ? 'Diğer cihazdaki notlar birleştirildi: ' + msg : 'Diğer cihazdaki sürümle eşitlendi', 4000);
  return r.needWrite ? 'merged' : 'synced';
}
window.safAutoMerge = safAutoMerge;
/* Çakışmada kullanıcının seçimi: dosyadaki notları buraya al, çizimler/sayfalar bu cihazdaki gibi kalsın, sonra kaydet */
window.safTakeNotes = async (note, bytes) => {
  const pr = progress('Dosyadaki notlar alınıyor…');
  const m = await safAutoMerge(note, bytes, null, 'stickies'); pr.done();
  if (m === 'fail') { toast('Dosya okunamadı: ' + (note.od.lastError || '') + '. Hiçbir şeyin üzerine yazılmadı.', 4500); return; }
  note.od.verify = false; note.od.state = 'pending';
  const r = await syncNote(note, ed.note === note ? ed.pdfBytes : bytes);
  if (r === 'conflict') resolveConflict(note, ed.note === note ? ed.pdfBytes : bytes);
};
/* Not açılınca: OneDrive'daki dosyanın İÇERİĞİ okunup bu cihazın son yazdığıyla karşılaştırılır (OneDrive'ın tarih/boyut
   bilgisi başka cihazdaki değişikliği geç gösterebilir). Değiştiyse hemen birleştirilir; yeni biçimle hiç kaydedilmemişse bir kez kaydedilir. */
const CHECK_MAX = 80 * 1024 * 1024, checking = new WeakMap();   // açılış denetimi sürerken yazma bekler (Promise nota konamaz: IndexedDB'ye yazılamaz)
async function safCheckNow(note, manual) {
  const od = note.od;
  let info = null; try { info = JSON.parse(Native.docInfo(od.id) || '{}'); } catch (e) { }
  const meta = safRemoteChanged(od);
  if (!Native.docFetch || (info && info.size > CHECK_MAX && !meta && !manual)) return meta ? 'changed' : 'skip';
  if (ed.note === note) renderStatus('checking');
  const r = await safAutoMerge(note, ed.note === note ? ed.pdfBytes : null);
  if (r === 'fail') {
    // içerik okunamadı: dosyaya bakmadan yazılmaz; kaydederken yeniden denenir
    od.verify = true; await persistNoteRecord(note);
    if (meta) { od.state = 'conflict'; await persistNoteRecord(note); }
  } else od.verify = false;
  return r;
}
window.safCheckNow = safCheckNow;
window.safCheckOnOpen = async (note, manual) => {
  if (!Native || !note || !note.od || note.od.kind !== 'saf' || note.od.mode === 'copy' || note.od.canWrite === false) return;
  if (!manual) { await new Promise(r => setTimeout(r, 700)); if (ed.note !== note) return; }
  if (syncRuns.get(note) || checking.get(note)) return;
  const od = note.od;
  let done; checking.set(note, new Promise(r => { done = r; }));
  let r;
  try { r = await safCheckNow(note, manual); } catch (e) { r = 'fail'; od.lastError = e.message; } finally { checking.delete(note); done(); }
  if (ed.note !== note) return;
  if (r === 'skip' || r === 'changed') { if (r === 'changed') { od.state = 'conflict'; await persistNoteRecord(note); renderStatus('conflict'); } else renderStatus(); return; }
  if (r === 'fail') {
    renderStatus(od.state === 'conflict' ? 'conflict' : undefined);
    toast('OneDrive’daki dosya denetlenemedi' + (od.lastError ? ' (' + od.lastError + ')' : '') + '. Dosyaya bakılmadan üzerine yazılmayacak; kaydederken yeniden denenecek.', 5200);
    return;
  }
  if (r === 'ask') { od.state = 'conflict'; await persistNoteRecord(note); renderStatus('conflict'); toast('Bu dosya başka bir yerde, notlar dışında da değişmiş. Ne yapılacağını seçmek için üstteki durum satırına dokunun.', 5200); return; }
  if (r === 'merged' || r === 'own') { renderStatus('pending'); if (S.od.auto) { clearTimeout(ed.syncT); ed.syncT = setTimeout(autoSync, 1500); } return; }
  // 'synced': dosya bu cihazdakiyle aynı
  if (!od.bodyKey && S.od.auto) {
    // 2.7 öncesi kaydedilmiş: notlar gerçek PDF notu olsun ve birleştirme tabanı kurulsun diye bir kez yeniden yaz
    od.dirty = true; renderStatus('pending'); clearTimeout(ed.syncT); ed.syncT = setTimeout(autoSync, 4000); return;
  }
  renderStatus('synced');
  if (manual) toast('OneDrive’daki dosya bu cihazdakiyle aynı; başka yerde değişiklik yok.', 2600);
};
/* Dosyadaki sürümü aç (bu cihazdaki çizimler dosyada zaten görünür; düzenlenebilir olmaktan çıkar) */
async function safOpenRemote(note) {
  const pr = progress('Dosyadaki sürüm açılıyor…');
  try {
    const rm = await safFetch(note.od);
    const od = { ...note.od, lm: rm.lm, eTag: String(rm.lm), size: rm.size, sizes: [rm.size], state: 'synced', dirty: false, hash: null };
    if (ed.note && ed.note.id === note.id) { ed.note.od.dirty = false; await closeEditor(); }
    const n = await createNoteFromPdf(note.name, rm.bytes, { od, id: note.id });
    pr.done(); await openNote(n.id);
  } catch (e) { pr.done(); toast('Dosyadaki sürüm açılamadı: ' + (e.message || e), 4200); }
}
window.safOpenRemote = safOpenRemote;

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
      : `“${od.name}” dosyasına yazılamadı. Sağlayıcının yanıtı: ${od.lastError || 'bilinmiyor'}. Notlarınız ${DV.da} güvende; aşağıdaki yollardan biriyle kaydedebilirsiniz.`,
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
