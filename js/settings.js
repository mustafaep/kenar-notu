'use strict';
/* =========================================================
   Ayarlar
   Solda bölümler, sağda o bölümün ayarları (gruplu kartlar). Dar ekranda bölümler üstte yatay sekme olur.
   Düzenleyicideki ⋯ paneli yalnızca sık kullanılan işlemleri gösterir; ayrıntılar buradadır.
   ========================================================= */
const APP_VERSION = '2.9.2';
const SET_SECTIONS = [
  { id: 'view', name: 'Görünüm', ic: 'moon', lead: 'Tema, düzenleyici göstergeleri ve yan yana belge.' },
  { id: 'pen', name: 'S Pen ve dokunma', ic: 'pen', lead: 'Parmakla çizim, yan tuş ve hareketler.' },
  { id: 'hand', name: 'El yazısı', ic: 'hand', lead: 'Kalemle yazdıklarını metne çevirme ve düzeltme.' },
  { id: 'pagefix', name: 'Sayfayı düzelt', ic: 'fixText', lead: 'Sayfanın tamamını yapay zekâyla okuyup düzenleme.' },
  { id: 'voice', name: 'Sesli okuma', ic: 'speak', lead: 'Kelimeye basılı tutunca İngilizce okunuşu.' },
  { id: 'ai', name: 'Yapay zekâ', ic: 'spark', lead: 'Sözlük, çeviri, el yazısı ve sayfa düzeltme için bağlantı.' },
  { id: 'usage', name: 'Harcama', ic: 'chart', lead: 'Yapay zekâ isteklerinin tahmini maliyeti; bu cihazda tutulur.' },
  { id: 'cloud', name: 'OneDrive ve depolama', ic: 'cloud', lead: 'Dosyaların nereye kaydedildiği.' }
];
if (PHONE) for (const id of ['pen', 'hand', 'pagefix']) { const i = SET_SECTIONS.findIndex(s => s.id === id); if (i >= 0) SET_SECTIONS.splice(i, 1); }
let setLast = 'view';
function openSettings(section) {
  document.querySelectorAll('.setback').forEach(x => x.remove());
  closePop && closePop();
  const back = h('div', { class: 'modal-back setback' });
  const close = () => { back.remove(); };
  const nav = h('nav', { class: 'setnav', 'aria-label': 'Ayar bölümleri' });
  const main = h('div', { class: 'setmain' });
  const show = id => {
    const sec = SET_SECTIONS.find(s => s.id === id) || SET_SECTIONS[0]; setLast = sec.id;
    nav.querySelectorAll('button').forEach(b => { const on = b.dataset.id === sec.id; b.classList.toggle('on', on); b.setAttribute('aria-current', on ? 'page' : 'false'); if (on && b.scrollIntoView) try { b.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) { } });
    main.innerHTML = ''; main.scrollTop = 0;
    let body = [];
    try { body = setBuild(sec.id, close); } catch (e) { body = [h('p', { class: 'notice' }, 'Bu bölüm açılamadı: ' + e.message)]; }
    main.append(h('div', { class: 'sethd' }, h('h3', null, sec.name), h('p', null, sec.lead)), ...body);
  };
  for (const s of SET_SECTIONS) nav.append(h('button', { type: 'button', 'data-id': s.id, onclick: () => show(s.id) }, icon(IC[s.ic] || IC.gear), h('span', null, s.name)));
  nav.append(h('div', { class: 'setver' }, 'Kenar Notu ' + APP_VERSION));
  const win = h('div', { class: 'setwin', role: 'dialog', 'aria-modal': 'true', 'aria-label': 'Ayarlar' },
    h('header', { class: 'sethead' }, h('span', { class: 'ico' }, icon(IC.gear)), h('h2', null, 'Ayarlar'),
      h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: close }, icon(IC.close))),
    nav, main);
  back.append(win);
  back.addEventListener('pointerdown', e => { if (e.target === back) close(); });
  document.body.append(back);
  show(section || setLast);
  return close;
}
window.openSettings = openSettings;

function setBuild(id, close) {
  const refresh = () => { if (typeof applyViewPrefs === 'function' && ed && ed.note) applyViewPrefs(); };
  if (id === 'view') return [
    sGroup('Tema', [
      sRow('Renk teması', null, segRow([['system', 'Sistem'], ['light', 'Açık'], ['dark', 'Koyu']], S.prefs.theme, v => { S.prefs.theme = v; saveSettings(); applyTheme(); }, 'Tema'), true),
      toggleRow('sInvert2', 'PDF renklerini ters çevir', S.prefs.invert, v => { if (typeof setInvert === 'function' && ed && ed.note) setInvert(v); else { S.prefs.invert = v; saveSettings(); } }, 'Beyaz sayfalar koyu olur; gece okumak için')
    ]),
    sGroup('Düzenleyici', [
      toggleRow('setZoom', 'Yakınlaştırma düğmeleri', S.prefs.zoomCtl, v => { S.prefs.zoomCtl = v; saveSettings(); refresh(); }, 'Sağ alttaki − % + kontrolü'),
      toggleRow('setPager', 'Sayfa numarası', S.prefs.pager, v => { S.prefs.pager = v; saveSettings(); refresh(); }, 'Alttaki “3 / 12” göstergesi'),
      sRow('Kaydırma düğmeleri', 'Üst çubukta, Geri al’ın solunda. Yazarken diğer elinle dokun: sayfa kayar; basılı tutunca kaymaya devam eder.', segRow([['off', 'Kapalı'], ['rd', 'Sağa ve aşağı'], ['all', 'Dört yön']], S.prefs.pan || 'rd', v => { S.prefs.pan = v; saveSettings(); if (window.buildPanBtns) buildPanBtns(); }, 'Kaydırma düğmeleri'), true),
      sRow('Bir dokunuşta kayma', 'Ekranın ne kadarı kadar kaysın', segRow([['30', 'Az · %30'], ['50', 'Orta · %50'], ['75', 'Çok · %75']], String(S.prefs.panStep || 50), v => { S.prefs.panStep = +v; saveSettings(); }, 'Bir dokunuşta kayma'), true),
      PHONE ? null : sRow('Sayfayı sağa-sola kaydırma', 'Sayfa ekrana sığsa da yana kayar: parmakla yana sürükle ya da alttaki konum şeridini kullan. Serbest: sayfanın yarısına kadar ekrandan taşabilir, eline yer açılır. Bıraktığın yer bütün belgelerde hatırlanır.', segRow([['off', 'Kapalı'], ['edge', 'Kenara kadar'], ['free', 'Serbest']], S.prefs.shift || 'free', v => { S.prefs.shift = v; saveSettings(); if (window.applyShiftPrefs) applyShiftPrefs(); }, 'Sayfayı sağa-sola kaydırma'), true),
      PHONE ? null : toggleRow('setShiftCtl', 'Konum şeridi', S.prefs.shiftCtl !== false, v => { S.prefs.shiftCtl = v; saveSettings(); if (window.shiftSync) shiftSync(); }, 'Alttaki küçük şerit · sürükle: sayfa kayar · dokun: sayfa oraya gelir · iki kez dokun: ortalanır'),
      PHONE ? null : toggleRow('setBarTab', 'Üst çubuğu gizleme dili', S.prefs.barTab !== false, v => { S.prefs.barTab = v; if (!v) S.prefs.barUp = false; saveSettings(); if (window.applyBarPrefs) applyBarPrefs(); }, 'Üstteki küçük dil çubuğu yukarı saklar; seçtiğin düğmeler kenarda kalır'),
      toggleRow('setDockAlw', 'Kenar düğmeleri hep görünsün', !!S.prefs.dockAlways, v => { S.prefs.dockAlways = v; saveSettings(); if (window.buildDocks) buildDocks(); }, 'Kapalıyken yalnız üst çubuk gizliyken görünür'),
      h('div', { class: 'sbtns' }, h('button', { class: 'btn small', type: 'button', onclick: () => { close(); if (ed && ed.note && typeof toolbarEditor === 'function') openPop($('#moreBtn'), toolbarEditor); else toast('Araç çubuğunu bir not açıkken ⋯ menüsünden düzenleyin.', 2600); } }, icon(IC.gear), 'Araç çubuğunu düzenle'), h('button', { class: 'btn small', type: 'button', onclick: () => { close(); if (ed && ed.note && window.pinManager) openPop($('#ui .edock .tool') || $('#moreBtn'), pinManager); else toast('Kenar düğmelerini bir not açıkken düzenleyin.', 2600); } }, icon(IC.gear), 'Kenar düğmeleri'))
    ]),
    sGroup('Yan yana belge', [
      sRow('İkinci belgenin yeri', 'Otomatik: ekran yataysa yanda, dikse altta · Pencere: sayfanın üzerinde taşınır, boyutlanır, tam ekran yapılır', segRow([['auto', 'Otomatik'], ['side', 'Hep yanda'], ['below', 'Hep altta'], ['win', 'Pencere']], S.prefs.splitPos || 'auto', v => { const was = S.prefs.splitPos === 'win'; if ((v === 'win') !== was && window.setSplitMode) setSplitMode(v); else { S.prefs.splitPos = v; saveSettings(); if (window.applySplitW) applySplitW(); } }, 'İkinci belgenin yeri'), true)
    ])
  ];
  if (id === 'pen') return [
    sGroup('Kalem', [
      sRow('Parmakla çizim', 'Otomatik: S Pen algılanınca parmak yalnızca kaydırır', segRow([['auto', 'Otomatik'], ['pen', 'Yalnız S Pen'], ['finger', 'Parmak da çizer']], S.prefs.finger, v => { S.prefs.finger = v; saveSettings(); }), true),
      sRow('S Pen yan tuşu', 'Basılı tutarken geçici olarak çalışan araç', segRow([['eraser', 'Silgi'], ['lasso', 'Seçim'], ['hl', 'Fosforlu'], ['off', 'Kapalı']], S.prefs.side, v => { S.prefs.side = v; saveSettings(); }), true)
    ]),
    sGroup('Hareketler', [
      toggleRow('sTwo2', 'İki parmakla dokun: geri al', S.prefs.twoTap, v => { S.prefs.twoTap = v; saveSettings(); }, 'Üç parmakla dokunmak yineler'),
      toggleRow('sHover2', 'Havada imleç', S.prefs.hover, v => { S.prefs.hover = v; saveSettings(); }, 'Kalem yaklaşınca uç boyutunu gösterir'),
      toggleRow('sScr2', 'Karalayarak sil', S.feel.scratch !== false, v => { S.feel.scratch = v; saveSettings(); }, 'Yazının üzerini zikzakla karalayınca silinir')
    ]),
    sGroup('S Pen testi', [setPenPad()])
  ];
  if (id === 'hand') return window.handSettingsGroups ? handSettingsGroups() : [];
  if (id === 'pagefix') return window.pageFixSettingsGroups ? pageFixSettingsGroups() : [];
  if (id === 'voice') return window.voiceSettingsGroups ? voiceSettingsGroups() : [];
  if (id === 'usage') return window.usageSettingsGroups ? usageSettingsGroups() : [];
  if (id === 'ai') {
    const c = aiCfg();
    return [
      sGroup('Bağlantı', [
        sRow(aiReady() ? 'Bağlı · ' + aiName() : 'Bağlı değil', aiReady() ? 'Model: ' + aiModel() : 'Claude ya da ücretsiz Gemini anahtarı girin',
          h('button', { class: 'btn small', type: 'button', onclick: () => { close(); aiSettingsModal(); } }, icon(IC.spark), aiReady() ? 'Değiştir' : 'Bağla')),
        sRow('Gemini anahtarı', 'aistudio.google.com → Get API key (ücretsiz katman)', h('span', { class: 'chip' + (c.gkey ? ' info' : '') }, c.gkey ? 'Var' : 'Yok')),
        sRow('Claude anahtarı', 'console.anthropic.com', h('span', { class: 'chip' + (c.key ? ' info' : '') }, c.key ? 'Var' : 'Yok'))
      ], 'Anahtarlar yalnızca bu cihazda saklanır. Sayfayı düzelt önce Gemini’yi, olmazsa Claude’u kullanır (Sayfayı düzelt bölümünden değiştirilir).')
    ];
  }
  if (id === 'cloud') {
    const info = h('p', { class: 'sfoot' }, Store.ok ? 'Notlar bu ' + DV.in + ' uygulama deposunda tutulur.' : 'Tarayıcı depolaması kapalı; notlar yalnızca bu oturumda kalır.');
    try { navigator.storage.estimate().then(e => { if (info.isConnected && e.usage != null) info.textContent += ' Kullanılan: ' + fmtSize(e.usage) + '.'; }); } catch (e) { }
    const isApp = !!(window.KenarNative && window.KenarNative.openDocument);
    return [
      sGroup('OneDrive', [
        sRow(OD.signedIn() ? OD.accountName() : (isApp ? 'OneDrive uygulaması üzerinden' : 'Bağlı değil'), isApp ? 'Dosyayı OneDrive uygulamasından açın; notlu PDF aynı dosyaya yazılır' : (OD.clientId() ? 'Uygulama kimliği kayıtlı' : 'Microsoft hesabıyla bağlanın'),
          isApp ? null : h('button', { class: 'btn small', type: 'button', onclick: () => { close(); openOneDrive(); } }, icon(IC.cloud), OD.signedIn() ? 'Göz at' : 'Bağlan')),
        toggleRow('setAuto', 'Otomatik eşitle', S.od.auto, v => { S.od.auto = v; saveSettings(); }, 'Değişiklikler kısa bir süre sonra OneDrive’daki dosyaya yazılır'),
        !isApp && OD.clientId() ? h('div', { class: 'sbtns' }, h('button', { class: 'btn small', type: 'button', onclick: async () => { await OD.logout(); S.od.clientId = ''; saveSettings(); try { localStorage.setItem('kn.settings', JSON.stringify(S)); } catch (e) { } await OD.init(); close(); if (typeof refreshRail === 'function') refreshRail(); toast('OneDrive ayarı sıfırlandı'); } }, 'Uygulama kimliğini sıfırla')) : null
      ]),
      sGroup('Depolama', [sRow('Bu cihaz', null, null)], info)
    ];
  }
  return [];
}
/* S Pen deneme kutusu */
function setPenPad() {
  const out = h('div', { class: 'readout' }, S.prefs.penSeen ? 'Kalemi kutuya yaklaştırın veya dokundurun: basınç, eğim ve yan tuş burada görünür.' : 'Henüz kalem algılanmadı. S Pen ile kutuya dokunun.');
  const pad = h('div', { class: 'penpad' }, out);
  const show = e => {
    const tilt = Math.round(Math.hypot(e.tiltX || 0, e.tiltY || 0));
    const btn = (e.buttons & 32) ? 'silgi ucu' : (e.buttons & 2) ? '<b>yan tuş basılı</b>' : e.buttons ? 'temas' : 'havada';
    out.innerHTML = `tür <b>${e.pointerType}</b> · ${btn}<br>basınç <b>${(e.pressure || 0).toFixed(3)}</b> · eğim <b>${tilt}°</b><div class="meter"><i style="width:${Math.round((e.pressure || 0) * 100)}%"></i></div>`;
  };
  ['pointermove', 'pointerdown', 'pointerup'].forEach(t => pad.addEventListener(t, show));
  return pad;
}
