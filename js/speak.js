'use strict';
/* =========================================================
   Sesli okuma
   PDF’te bir kelimeye parmakla basılı tutunca kelime sesli okunur (varsayılan: İngiliz İngilizcesi, kadın sesi).
   Android: cihazın metin okuma motoru (Speaker.java). Web: tarayıcının speechSynthesis’i.
   Türkçe harf içeren metinler Türkçe sesle okunur.
   ========================================================= */
const TTS = { voices: [], onVoices: null };
const TTS_NATIVE = () => !!(window.KenarNative && window.KenarNative.speak);
const TTS_TR = /[çğıöşüÇĞİÖŞÜ]/;

window.__ttsReady = () => { ttsLoadVoices(); };
function ttsLoadVoices() {
  if (TTS_NATIVE()) { try { TTS.voices = JSON.parse(KenarNative.ttsVoices() || '[]'); } catch (e) { TTS.voices = []; } }
  else if ('speechSynthesis' in window) {
    TTS.voices = speechSynthesis.getVoices().filter(v => /^(en|tr)\b/i.test(v.lang)).map(v => ({ name: v.name, lang: v.lang.replace('_', '-'), female: webFemale(v.name), male: webMale(v.name), local: v.localService, installed: true }));
  }
  if (TTS.onVoices) TTS.onVoices();
}
if ('speechSynthesis' in window && !TTS_NATIVE()) { try { speechSynthesis.addEventListener('voiceschanged', ttsLoadVoices); } catch (e) { } }
function webFemale(n) { return /female|woman|libby|sonia|maisie|hazel|susan|serena|kate|stephanie|amy|emma|martha|fiona|moira|tessa|samantha|zira|aria|jenny|yelda|emel|filiz|seda/i.test(n); }
function webMale(n) { return /\bmale\b|ryan|thomas|daniel|george|oliver|arthur|guy|david|mark|ahmet|tolga/i.test(n) && !webFemale(n); }

function speakLangOf(text) { return TTS_TR.test(text) ? 'tr-TR' : (S.voice.lang || 'en-GB'); }
function pickWebVoice(lang) {
  const vs = speechSynthesis.getVoices(); if (!vs.length) return null;
  if (lang.startsWith('en') && S.voice.name) { const v = vs.find(x => x.name === S.voice.name); if (v) return v; }
  const want = lang.toLowerCase(), base = want.split('-')[0];
  let best = null, bs = -1e9;
  for (const v of vs) {
    const l = v.lang.replace('_', '-').toLowerCase(); if (l.split('-')[0] !== base) continue;
    let sc = (l === want ? 100 : 0) + (webFemale(v.name) ? 50 : webMale(v.name) ? -30 : 0) + (v.localService ? 10 : 0) + (/google|natural|online/i.test(v.name) ? 5 : 0);
    if (sc > bs) { bs = sc; best = v; }
  }
  return best;
}
function speakText(text, opts = {}) {
  text = String(text || '').replace(/\s+/g, ' ').trim(); if (!text) return;
  if (text.length > 4000) text = text.slice(0, 4000);
  const lang = opts.lang || speakLangOf(text), rate = clamp(Number(S.voice.rate) || 1, .5, 1.6);
  if (TTS_NATIVE()) {
    let r = 'error'; try { r = KenarNative.speak(text, lang, rate, lang.startsWith('en') ? (S.voice.name || '') : ''); } catch (e) { }
    if (r === 'nolang') toastAction(lang.startsWith('tr') ? 'Türkçe ses yüklü değil.' : 'İngiliz İngilizcesi ses paketi yüklü değil.', 'Ses ayarları', () => { try { KenarNative.ttsSettings(); } catch (e) { } });
    else if (r === 'noengine') toast((PHONE ? 'Telefonda' : 'Tablette') + ' metin okuma motoru bulunamadı (Ayarlar → Genel yönetim → Metin okuma).', 4200);
    return;
  }
  if (!('speechSynthesis' in window)) { toast('Bu tarayıcı sesli okumayı desteklemiyor', 2400); return; }
  try {
    speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text); u.lang = lang; u.rate = rate;
    const v = pickWebVoice(lang); if (v) u.voice = v;
    speechSynthesis.speak(u);
  } catch (e) { toast('Sesli okunamadı', 2000); }
}
function speakStop() {
  if (TTS_NATIVE()) { try { KenarNative.speakStop(); } catch (e) { } }
  else if ('speechSynthesis' in window) try { speechSynthesis.cancel(); } catch (e) { }
}
window.speakText = speakText; window.speakStop = speakStop;

/* ---------- ayarlar ---------- */
function voiceLabel(v) {
  const g = v.female ? 'Kadın' : v.male ? 'Erkek' : 'Ses';
  const where = v.local === false ? 'internet' : 'cihazda';
  const short = v.name.replace(/^(en|tr)[-_][A-Za-z]{2}[-_]?/i, '').replace(/-local$|-network$/i, '').slice(0, 26);
  return `${g} · ${v.lang} · ${where}${short ? ' · ' + short : ''}`;
}
function voiceSettingsGroups() {
  const sel = h('select', { 'aria-label': 'İngilizce ses', style: { width: '100%' } });
  const fill = () => {
    const en = TTS.voices.filter(v => /^en/i.test(v.lang) && v.installed !== false)
      .sort((a, b) => (b.lang === 'en-GB') - (a.lang === 'en-GB') || (b.female - a.female) || a.name.localeCompare(b.name));
    sel.innerHTML = '';
    sel.append(h('option', { value: '' }, 'Otomatik: İngiliz kadın sesi'));
    for (const v of en) sel.append(h('option', { value: v.name }, voiceLabel(v)));
    sel.value = S.voice.name && en.some(v => v.name === S.voice.name) ? S.voice.name : '';
  };
  TTS.onVoices = () => { if (sel.isConnected) fill(); else TTS.onVoices = null; };
  ttsLoadVoices(); fill();
  setTimeout(() => { if (sel.isConnected) ttsLoadVoices(); }, 1200);
  sel.addEventListener('change', () => { S.voice.name = sel.value; saveSettings(); speakText('Hello! This is how I sound.', { lang: 'en-GB' }); });
  return [
    sGroup(null, [
      toggleRow('setVoice', 'Kelimeye basılı tutunca sesli oku', S.voice.hold, v => { S.voice.hold = v; saveSettings(); }, 'Seçim çubuğundaki “Dinle” her zaman çalışır')
    ]),
    sGroup('Ses', [
      sRow('İngilizce ses', null, h('div', { class: 'selectw' }, sel, icon(IC.chev)), true),
      rangeRow('setRate', 'Konuşma hızı', 50, 150, 5, Math.round((S.voice.rate || 1) * 100), v => '%' + Math.round(v), v => { S.voice.rate = v / 100; saveSettings(); }),
      h('div', { class: 'sbtns' },
        h('button', { class: 'btn small', type: 'button', onclick: () => speakText('Hello! This is how I sound.', { lang: 'en-GB' }) }, icon(IC.speak), 'Dene'),
        TTS_NATIVE() ? h('button', { class: 'btn small', type: 'button', onclick: () => { try { KenarNative.ttsSettings(); } catch (e) { } } }, icon(IC.gear), 'Ses ayarları') : null)
    ], TTS_NATIVE() ? 'İngiliz sesi listede yoksa “Ses ayarları”ndan tercih edilen motorun (Samsung ya da Google) İngilizce (Birleşik Krallık) ses paketini indirin.' : 'Tarayıcıdaki sesler kullanılır; İngiliz kadın sesi varsa otomatik seçilir.')
  ];
}
