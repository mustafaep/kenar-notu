'use strict';
/* =========================================================
   OneDrive (Microsoft Graph + MSAL)
   - Giriş: yönlendirme ile (tablet ve ana ekran uygulamasında güvenilir)
   - Açma: PDF indirilir, not bu dosyaya bağlanır
   - Kaydetme: notlu PDF aynı dosyaya (eTag kontrollü) ya da yanına kopya olarak yazılır
   ========================================================= */
const GRAPH = 'https://graph.microsoft.com/v1.0';
const OD_SCOPES = ['Files.ReadWrite', 'User.Read'];
const OD = {
  pca: null, account: null, user: null, ready: false, initErr: null,
  clientId() { return (S.od.clientId || (window.KENAR_CONFIG && window.KENAR_CONFIG.oneDriveClientId) || '').trim(); },
  redirectUri() { return location.origin + location.pathname; },
  supported() { return location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1'; },
  async init() {
    this.ready = false; this.pca = null; this.account = null; this.initErr = null;
    const id = this.clientId();
    if (!id || !this.supported() || typeof msal === 'undefined') return;
    try {
      this.pca = new msal.PublicClientApplication({
        auth: { clientId: id, authority: 'https://login.microsoftonline.com/common', redirectUri: this.redirectUri(), navigateToLoginRequestUrl: false },
        cache: { cacheLocation: 'localStorage' }
      });
      await this.pca.initialize();
      const res = await this.pca.handleRedirectPromise();
      this.account = (res && res.account) || this.pca.getAllAccounts()[0] || null;
      if (this.account) this.pca.setActiveAccount(this.account);
      this.ready = true;
    } catch (e) { this.initErr = e; console.warn('OneDrive başlatılamadı', e); }
  },
  signedIn() { return !!(this.ready && this.account); },
  accountName() { return this.account ? (this.account.username || this.account.name || '') : ''; },
  async login() {
    if (!this.pca) await this.init();
    if (!this.pca) throw new Error('OneDrive yapılandırması eksik.');
    try { sessionStorage.setItem('kn.resume', JSON.stringify({ od: true, note: ed.note ? ed.note.id : null })); } catch (e) { }
    if (ed.note) await saveNote(true);
    await this.pca.loginRedirect({ scopes: OD_SCOPES, prompt: 'select_account' });
  },
  async logout() {
    if (!this.pca || !this.account) return;
    const acc = this.account; this.account = null;
    try { await this.pca.clearCache({ account: acc }); } catch (e) { try { localStorage.removeItem('msal.account.keys'); } catch (er) { } }
  },
  async token() {
    if (!this.signedIn()) throw Object.assign(new Error('OneDrive oturumu yok.'), { code: 'signin' });
    try { return (await this.pca.acquireTokenSilent({ scopes: OD_SCOPES, account: this.account })).accessToken; }
    catch (e) {
      if (e instanceof msal.InteractionRequiredAuthError || /interaction_required|login_required|consent_required/.test(e.errorCode || '')) {
        try { sessionStorage.setItem('kn.resume', JSON.stringify({ od: true, note: ed.note ? ed.note.id : null })); } catch (er) { }
        if (ed.note) await saveNote(true);
        await this.pca.acquireTokenRedirect({ scopes: OD_SCOPES, account: this.account });
        throw Object.assign(new Error('Yeniden giriş gerekiyor.'), { code: 'redirect' });
      }
      throw e;
    }
  },
  async api(path, opt = {}) {
    if (!navigator.onLine) throw Object.assign(new Error('İnternet bağlantısı yok.'), { code: 'offline' });
    const tok = await this.token();
    const r = await fetch(path.startsWith('http') ? path : GRAPH + path, { method: opt.method || 'GET', body: opt.body, headers: Object.assign({ Authorization: 'Bearer ' + tok }, opt.headers || {}) });
    if (!r.ok) {
      let body = null; try { body = await r.json(); } catch (e) { }
      const msg = body && body.error && body.error.message;
      throw Object.assign(new Error(msg || ('OneDrive hatası ' + r.status)), { status: r.status, body });
    }
    if (opt.raw) return r;
    return r.status === 204 ? null : r.json();
  },
  async me() { try { this.user = await this.api('/me?$select=displayName,userPrincipalName,mail'); } catch (e) { } return this.user; },
  SEL: 'id,name,size,lastModifiedDateTime,folder,file,eTag,parentReference',
  async list(id) {
    let url = (id === 'root' ? '/me/drive/root/children' : `/me/drive/items/${id}/children`) + `?$top=200&$select=${this.SEL}`;
    const out = [];
    for (let i = 0; i < 6 && url; i++) { const r = await this.api(url); out.push(...r.value); url = r['@odata.nextLink'] || null; }
    return out;
  },
  async search(q) { const r = await this.api(`/me/drive/root/search(q='${encodeURIComponent(q.replace(/'/g, "''"))}')?$top=100&$select=${this.SEL}`); return r.value; },
  async item(id) { return this.api(`/me/drive/items/${id}?$select=${this.SEL},@microsoft.graph.downloadUrl`); },
  async download(id) {
    const it = await this.item(id); const url = it['@microsoft.graph.downloadUrl'];
    const r = url ? await fetch(url) : await this.api(`/me/drive/items/${id}/content`, { raw: true });
    if (!r.ok) throw new Error('Dosya indirilemedi.');
    return { item: it, bytes: await r.arrayBuffer() };
  },
  async put(id, blob, eTag) {
    const headers = { 'Content-Type': 'application/pdf' }; if (eTag) headers['If-Match'] = eTag;
    return this.api(`/me/drive/items/${id}/content`, { method: 'PUT', body: blob, headers });
  },
  async putNew(parentId, name, blob) {
    const base = parentId === 'root' ? '/me/drive/root:/' : `/me/drive/items/${parentId}:/`;
    return this.api(`${base}${encodeURIComponent(name)}:/content?@microsoft.graph.conflictBehavior=rename`, { method: 'PUT', body: blob, headers: { 'Content-Type': 'application/pdf' } });
  }
};
const isPdfItem = it => it.file && (/\.pdf$/i.test(it.name) || /pdf/.test(it.file.mimeType || ''));

/* ---------- not ↔ OneDrive bağlantısı ---------- */
async function odMetaIndex() { const m = new Map(); for (const x of await Store.all('meta')) if (x.odId) m.set(x.odId, x); return m; }
async function openFromOneDrive(item, closeSheet) {
  const idx = await odMetaIndex(); const local = idx.get(item.id);
  if (local) {
    const n = await Store.get('notes', local.id);
    if (n && n.od && n.od.eTag === item.eTag) { if (closeSheet) closeSheet(); openNote(local.id); return; }
    if (n) {
      modal({
        title: 'Dosya OneDrive’da değişmiş', text: `“${item.name}” bu tabletteki notlu sürümünüzden sonra başka bir yerde güncellenmiş.`,
        actions: [
          { label: 'Tabletteki notu aç', onClick: () => { if (closeSheet) closeSheet(); openNote(local.id); } },
          { label: 'OneDrive sürümünü aç', kind: 'primary', onClick: async () => { if (closeSheet) closeSheet(); await importFromOneDrive(item, local.id); } }
        ]
      });
      return;
    }
  }
  if (closeSheet) closeSheet();
  await importFromOneDrive(item, null);
}
async function importFromOneDrive(item, replaceId) {
  const pr = progress('OneDrive’dan indiriliyor…');
  try {
    const { item: it, bytes } = await OD.download(item.id);
    pr.set(.5, 'Sayfalar hazırlanıyor…');
    const od = { id: it.id, name: it.name, parentId: it.parentReference && it.parentReference.id, eTag: it.eTag, mode: S.od.saveMode, syncedAt: Date.now(), state: 'synced' };
    const note = await createNoteFromPdf(it.name.replace(/\.pdf$/i, ''), bytes, { od, id: replaceId, onProg: (i, n) => pr.set(.5 + .5 * i / n, `Sayfalar hazırlanıyor ${i}/${n}`) });
    pr.done(); openNote(note.id);
  } catch (e) { pr.done(); odError(e, 'Dosya açılamadı'); }
}
function odError(e, prefix) {
  if (e && e.code === 'redirect') return;
  const m = e && e.code === 'offline' ? 'İnternet bağlantısı yok.' : e && e.status === 404 ? 'Dosya OneDrive’da bulunamadı.' : e && e.status === 413 ? 'Dosya OneDrive’a tek seferde yüklenemeyecek kadar büyük (250 MB üstü).' : (e && e.message) || 'Bilinmeyen hata';
  toast((prefix ? prefix + ': ' : '') + m, 4500);
}

/* Notu OneDrive'a yaz. Dönen: 'ok' | 'conflict' | 'error' | 'skip'
   Aynı not için aynı anda tek yazma; yazma sürerken yapılan değişiklikler kaybolmaz. */
const syncRuns = new WeakMap(), noteVer = new WeakMap(), syncingIds = new Set(), syncById = new Map();
function bumpNoteVer(note) { if (note) noteVer.set(note, (noteVer.get(note) || 0) + 1); }
async function syncNote(note, bytes, opt = {}) {
  if (!note || !note.od) return 'skip';
  while (syncRuns.get(note)) {
    try { await syncRuns.get(note); } catch (e) { }
    if (!opt.force && note.od && !note.od.dirty && note.od.state === 'synced') return 'ok';
  }
  if (!note.od) return 'skip';
  const ver = noteVer.get(note) || 0;
  const p = note.od.kind === 'saf' ? syncSaf(note, bytes, opt) : syncGraph(note, bytes, opt);
  syncRuns.set(note, p); syncingIds.add(note.id); syncById.set(note.id, p);
  try {
    const r = await p;
    if (r === 'ok' && (noteVer.get(note) || 0) !== ver) {
      note.od.dirty = true; setSyncState(note, 'pending');
      if (S.od.auto && ed.note === note) { clearTimeout(ed.syncT); ed.syncT = setTimeout(autoSync, 5000); }
    }
    return r;
  } finally { syncRuns.delete(note); syncingIds.delete(note.id); if (syncById.get(note.id) === p) syncById.delete(note.id); }
}
async function syncGraph(note, bytes, opt = {}) {
  if (!OD.signedIn()) { setSyncState(note, 'signin'); return 'skip'; }
  if (!navigator.onLine) { setSyncState(note, 'offline'); return 'skip'; }
  setSyncState(note, 'busy');
  try {
    const out = await buildPdf(note, bytes);
    const blob = new Blob([out], { type: 'application/pdf' });
    const od = note.od; let res;
    if (od.mode === 'copy') {
      if (od.copyId) res = await OD.put(od.copyId, blob, opt.force ? null : od.copyETag);
      else { res = await OD.putNew(od.parentId || 'root', od.name.replace(/\.pdf$/i, '') + ' (notlu).pdf', blob); od.copyId = res.id; od.copyName = res.name; }
      od.copyETag = res.eTag;
    } else {
      res = await OD.put(od.id, blob, opt.force ? null : od.eTag);
      od.eTag = res.eTag;
    }
    od.syncedAt = Date.now(); od.dirty = false; od.state = 'synced';
    await persistNoteRecord(note);
    setSyncState(note, 'synced');
    return 'ok';
  } catch (e) {
    if (e && e.code === 'redirect') return 'skip';
    if (e && (e.status === 412 || e.status === 409)) { note.od.state = 'conflict'; setSyncState(note, 'conflict'); return 'conflict'; }
    if (e && e.status === 404 && note.od.mode === 'copy' && note.od.copyId) { note.od.copyId = null; return syncGraph(note, bytes, opt); }
    note.od.state = 'error'; setSyncState(note, e && e.code === 'offline' ? 'offline' : 'error', e); return 'error';
  }
}
function resolveConflict(note, bytes) {
  const always = note.od.kind === 'saf' ? toggleRow('odAlways', 'Bu dosya için bir daha sorma', false, () => { }, 'Hep tabletteki notlu sürümü yaz') : null;
  modal({
    title: 'OneDrive’daki dosya değişmiş',
    text: 'Bu PDF siz açtıktan sonra başka bir yerde (bilgisayar, başka bir cihaz) güncellenmiş görünüyor. Ne yapalım?',
    body: always,
    actions: [
      { label: 'Vazgeç' },
      { label: 'Notlu kopya kaydet', onClick: async () => { note.od.mode = 'copy'; const r = await syncNote(note, bytes); if (r === 'ok' && note.od.kind !== 'saf') toast('“' + (note.od.copyName || 'notlu kopya') + '” olarak kaydedildi', 3500); } },
      { label: 'Üzerine yaz', kind: 'primary', onClick: async () => { if (always && always.querySelector('input').checked) note.od.alwaysOverwrite = true; const r = await syncNote(note, bytes, { force: true }); if (r === 'ok') toast('OneDrive’daki dosya güncellendi'); } }
    ]
  });
}
function setSyncState(note, st, err) { if (ed.note === note) renderStatus(st, err); }

/* ---------- OneDrive penceresi ---------- */
function openOneDrive(opts = {}) {
  closePop();
  const mode = opts.mode || 'open';
  // Android uygulamasında: Microsoft kaydı gerekmeden, tabletteki OneDrive uygulaması üzerinden
  if (Native && !OD.signedIn() && !opts.graph) {
    if (mode === 'save') { if (opts.note) nativeSaveNew(opts.note, opts.bytes); }
    else { toast('Dosya seçicide sol menüden “OneDrive”ı seçin', 3200); nativeDoc.open(); }
    return () => {};
  }
  const back = h('div', { class: 'od-back' });
  const close = () => { back.remove(); document.removeEventListener('keydown', esc); };
  const esc = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc);
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  const box = h('section', { class: 'od', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'OneDrive' });
  back.append(box); document.body.append(back);
  const st = { path: [{ id: 'root', name: 'OneDrive' }], items: [], q: '', searching: false };

  const head = () => {
    const who = h('div', { class: 'who' }, h('h2', null, mode === 'save' ? 'OneDrive’a kaydet' : 'OneDrive'), h('small', null, OD.signedIn() ? OD.accountName() + ' olarak bağlı' : 'Bağlı değil'));
    const out = h('div', { class: 'od-head' }, h('span', { class: 'ico' }, icon(IC.cloud)), who);
    if (OD.signedIn()) out.append(h('button', { class: 'btn small', type: 'button', onclick: async () => { await OD.logout(); toast('OneDrive hesabından çıkıldı'); render(); refreshRail(); } }, icon(IC.logout), 'Hesaptan çık'));
    out.append(h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: close }, icon(IC.close)));
    return out;
  };
  const setupView = () => {
    const wrap = h('div', { class: 'od-setup' });
    if (!OD.supported()) {
      wrap.append(h('p', null, 'OneDrive bağlantısı yalnızca uygulama güvenli bir adresten (https) açıldığında çalışır. README dosyasındaki “Yayınlama” adımlarıyla uygulamayı yayınlayıp tabletten o adresle açın.'));
      return wrap;
    }
    if (!OD.clientId()) {
      const inp = h('input', { type: 'text', id: 'odClient', placeholder: '00000000-0000-0000-0000-000000000000', autocomplete: 'off', spellcheck: 'false' });
      const uri = OD.redirectUri();
      wrap.append(
        h('p', null, 'OneDrive’a bağlanmak için Microsoft’a bu uygulamayı bir kez tanıtmanız gerekir. Ücretsizdir ve yaklaşık 3 dakika sürer.'),
        h('ol', null,
          h('li', null, h('a', { href: 'https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade', target: '_blank', rel: 'noopener' }, 'Microsoft Entra yönetim merkezinde'), ' “Yeni kayıt” açın. Hesap türü olarak “Herhangi bir kuruluş dizinindeki hesaplar ve kişisel Microsoft hesapları” seçin.'),
          h('li', null, 'Yönlendirme URI’si için platform olarak “Tek sayfalı uygulama (SPA)” seçip şu adresi girin:', h('div', { class: 'code' }, h('span', null, uri), h('button', { class: 'btn small', type: 'button', onclick: () => copyText(uri) }, 'Kopyala'))),
          h('li', null, 'Kayıt sayfasındaki “Uygulama (istemci) kimliği” değerini aşağıya yapıştırın.')),
        h('label', { class: 'field', for: 'odClient' }, 'Uygulama (istemci) kimliği', inp),
        h('div', { class: 'row', style: { display: 'flex', gap: '10px', justifyContent: 'flex-end' } },
          h('button', { class: 'btn primary', type: 'button', onclick: async () => {
            const v = inp.value.trim(); if (!/^[0-9a-f-]{36}$/i.test(v)) { toast('Kimlik 36 karakterlik bir GUID olmalı.'); return; }
            S.od.clientId = v; saveSettings(); try { localStorage.setItem('kn.settings', JSON.stringify(S)); } catch (e) { }
            await OD.init(); render();
          } }, 'Kaydet ve devam et')));
      return wrap;
    }
    wrap.append(
      h('p', null, 'Microsoft hesabınızla giriş yapın. Kenar Notu yalnızca dosyalarınızı okumak ve sizin kaydettiğiniz PDF’leri yazmak için izin ister.'),
      OD.initErr ? h('p', { class: 'notice' }, 'Önceki deneme başarısız oldu: ' + (OD.initErr.message || OD.initErr)) : null,
      h('div', null, h('button', { class: 'btn primary', type: 'button', onclick: async () => { try { await OD.login(); } catch (e) { toast(e.message || 'Giriş başlatılamadı', 4000); } } }, icon(IC.cloud), 'Microsoft hesabıyla giriş yap')),
      h('button', { class: 'btn small', type: 'button', style: { alignSelf: 'flex-start' }, onclick: () => { S.od.clientId = ''; saveSettings(); OD.init().then(render); } }, 'Uygulama kimliğini değiştir'));
    return wrap;
  };
  let listEl, crumbEl;
  const browseView = () => {
    crumbEl = h('nav', { class: 'crumbs', 'aria-label': 'Klasör yolu' });
    const q = h('input', { type: 'search', placeholder: 'OneDrive’da ara', 'aria-label': 'OneDrive’da ara', value: st.q });
    q.addEventListener('keydown', e => { if (e.key === 'Enter') { st.q = q.value.trim(); load(); } });
    q.addEventListener('search', () => { st.q = q.value.trim(); load(); });
    const bar = h('div', { class: 'od-bar' }, crumbEl, h('label', { class: 'search' }, icon(IC.search), q));
    if (mode === 'save') bar.append(h('button', { class: 'btn primary', type: 'button', onclick: () => saveHere() }, icon(IC.up), 'Bu klasöre kaydet'));
    else bar.append(h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Yenile', onclick: () => load() }, icon(IC.sync)));
    listEl = h('div', { class: 'od-list', role: 'list' });
    const foot = h('div', { class: 'od-foot' },
      h('div', { class: 'grp' }, h('span', { class: 'lbl' }, 'Kaydederken'), segRow([['overwrite', 'Dosyanın üzerine yaz'], ['copy', 'Notlu kopya oluştur']], S.od.saveMode, v => { S.od.saveMode = v; saveSettings(); }, 'Kaydetme biçimi')),
      toggleRow('odAuto', 'Değişiklikleri otomatik eşitle', S.od.auto, v => { S.od.auto = v; saveSettings(); }),
      h('p', { class: 'notice' }, 'Başka bir cihazda değişen dosyanın üzerine sormadan yazılmaz. Notlar dosyaya kalıcı olarak işlenir; düzenlenebilir katmanlar bu tablette kalır.'));
    return [bar, listEl, foot];
  };
  const crumbs = () => {
    crumbEl.innerHTML = '';
    if (st.q) { crumbEl.append(h('button', { type: 'button', onclick: () => { st.q = ''; render(); } }, 'OneDrive'), h('span', null, '/'), h('button', { type: 'button' }, `“${st.q}” araması`)); return; }
    st.path.forEach((p, i) => { if (i) crumbEl.append(h('span', null, '/')); crumbEl.append(h('button', { type: 'button', onclick: () => { st.path = st.path.slice(0, i + 1); load(); } }, p.name)); });
  };
  const rows = async () => {
    const idx = await odMetaIndex();
    listEl.innerHTML = '';
    listEl.append(h('div', { class: 'od-row hd', role: 'presentation' }, h('span', null, 'Ad'), h('span', { class: 'c2' }, 'Değiştirilme'), h('span', { class: 'c3' }, 'Boyut'), h('span', null, 'Durum')));
    const items = st.items.filter(it => it.folder || isPdfItem(it)).sort((a, b) => (!!b.folder - !!a.folder) || a.name.localeCompare(b.name, 'tr'));
    if (!items.length) { listEl.append(h('div', { class: 'od-msg' }, st.q ? 'Aramayla eşleşen PDF ya da klasör yok.' : 'Bu klasörde PDF ya da klasör yok.')); return; }
    for (const it of items) {
      const local = idx.get(it.id); let chip = null;
      if (local) chip = local.odETag && local.odETag !== it.eTag ? h('span', { class: 'chip warn' }, 'Başka yerde değişti') : h('span', { class: 'chip ok' }, icon(IC.check), 'Bu tablette notlu');
      const isF = !!it.folder;
      const b = h('button', { class: 'od-row', type: 'button', role: 'listitem', disabled: mode === 'save' && !isF ? true : null },
        h('span', { class: 'nm' }, h('span', { class: 'fi ' + (isF ? 'f' : 'p') }, isF ? icon(IC.folder) : 'PDF'), h('span', null, it.name)),
        h('span', { class: 'mut c2' }, fmtDate(Date.parse(it.lastModifiedDateTime))),
        h('span', { class: 'mut c3' }, isF ? (it.folder.childCount || 0) + ' öğe' : fmtSize(it.size)),
        h('span', null, chip));
      b.addEventListener('click', () => { if (isF) { st.q = ''; st.path.push({ id: it.id, name: it.name }); load(); } else openFromOneDrive(it, close); });
      listEl.append(b);
    }
  };
  async function load() {
    if (!listEl) return; crumbs();
    listEl.innerHTML = ''; listEl.append(h('div', { class: 'od-msg' }, 'Yükleniyor…'));
    try {
      st.items = st.q ? await OD.search(st.q) : await OD.list(st.path[st.path.length - 1].id);
      await rows();
    } catch (e) {
      if (e && e.code === 'redirect') return;
      listEl.innerHTML = '';
      listEl.append(h('div', { class: 'od-msg' }, h('span', null, e && e.code === 'offline' ? 'İnternet bağlantısı yok.' : 'Dosyalar yüklenemedi: ' + ((e && e.message) || '')), h('button', { class: 'btn', type: 'button', onclick: load }, 'Tekrar dene')));
    }
  }
  async function saveHere() {
    const folder = st.path[st.path.length - 1]; const note = opts.note; if (!note) return;
    const pr = progress('OneDrive’a kaydediliyor…');
    try {
      const out = await buildPdf(note, opts.bytes, f => pr.set(f * .7));
      pr.set(.8, 'Yükleniyor…');
      const res = await OD.putNew(folder.id, safeName(note.name) + '.pdf', new Blob([out], { type: 'application/pdf' }));
      note.od = { id: res.id, name: res.name, parentId: folder.id, eTag: res.eTag, mode: 'overwrite', syncedAt: Date.now(), state: 'synced', own: true };
      await persistNoteRecord(note); pr.done(); close();
      if (ed.note === note) renderStatus('synced');
      toast(`“${res.name}” OneDrive’a kaydedildi. Değişiklikler artık bu dosyaya yazılacak.`, 4200);
    } catch (e) { pr.done(); odError(e, 'Kaydedilemedi'); }
  }
  function render() {
    box.innerHTML = ''; box.append(head());
    if (!OD.signedIn()) { box.append(setupView()); return; }
    box.append(...browseView()); load();
    OD.me().then(u => { if (u) { const s = box.querySelector('.who small'); if (s) s.textContent = (u.mail || u.userPrincipalName || OD.accountName()) + ' olarak bağlı'; } });
  }
  render();
  return close;
}
