'use strict';
/* =========================================================
   Yapay zekâ sözlük ve sohbet: Claude (Anthropic) ya da Gemini (Google)
   Anahtar yalnızca bu cihazda tutulur; istek doğrudan sağlayıcıya gider.
   ========================================================= */
const AI_MODEL_DEFAULT = 'claude-haiku-5-5';
const AI_MODELS = [['claude-haiku-5-5', 'Haiku 5.5 · hızlı'], ['claude-sonnet-5-5', 'Sonnet 5.5 · ayrıntılı']];
const G_MODEL_DEFAULT = 'gemini-3.5-flash-lite';
const G_MODELS = [['gemini-3.5-flash-lite', 'Flash-Lite · hızlı'], ['gemini-3.8-flash', 'Flash · ayrıntılı']];
function aiCfg() { let c = {}; try { c = JSON.parse(localStorage.getItem('kn.ai') || '{}') || {}; } catch (e) { } if (!c.provider) c.provider = c.gkey && !c.key ? 'gemini' : 'claude'; return c; }
function aiSaveCfg(c) { try { localStorage.setItem('kn.ai', JSON.stringify(c)); } catch (e) { } }
function aiReady(c = aiCfg()) { return c.provider === 'gemini' ? !!c.gkey : !!c.key; }
function aiName(c = aiCfg()) { return c.provider === 'gemini' ? 'Gemini' : 'Claude'; }
function aiModel(c = aiCfg()) { return c.provider === 'gemini' ? (c.gmodel || G_MODEL_DEFAULT) : (c.model || AI_MODEL_DEFAULT); }
const aiCache = new Map();
const gNoThink = new Set();

/* İç ileti biçimi: { role: 'user'|'assistant', content: string | [{type:'text',text} | {type:'image',mime,data}] } */
async function aiStream({ system, messages, maxTokens = 1200, onText, signal, tag }) {
  const c = aiCfg();
  if (!aiReady(c)) throw Object.assign(new Error(aiName(c) + ' API anahtarı girilmedi.'), { code: 'nokey' });
  if (!navigator.onLine) throw Object.assign(new Error('İnternet bağlantısı yok.'), { code: 'offline' });
  return c.provider === 'gemini' ? geminiStream(c, { system, messages, maxTokens, onText, signal, tag }) : claudeStream(c, { system, messages, maxTokens, onText, signal, tag });
}
async function readSSE(r, onEvent) {
  const reader = r.body.getReader(); const dec = new TextDecoder(); let buf = '';
  for (;;) {
    const { value, done } = await reader.read(); if (done) break;
    buf += dec.decode(value, { stream: true });
    let i;
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
      if (!line.startsWith('data:')) continue;
      let ev; try { ev = JSON.parse(line.slice(5)); } catch (e) { continue; }
      onEvent(ev);
    }
  }
}
async function claudeStream(c, { system, messages, maxTokens, onText, signal, tag }) {
  const msgs = messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.map(p => p.type === 'image' ? { type: 'image', source: { type: 'base64', media_type: p.mime, data: p.data } } : { type: 'text', text: p.text }) }));
  const model = aiModel(c);
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal,
    headers: { 'content-type': 'application/json', 'x-api-key': c.key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify({ model, max_tokens: maxTokens, system, messages: msgs, stream: true })
  });
  if (!r.ok) {
    let msg = 'HTTP ' + r.status; try { const j = await r.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) { }
    const nice = r.status === 401 ? 'Claude API anahtarı geçersiz. Ayarlardan kontrol edin.' : r.status === 404 ? 'Model bulunamadı: ' + model + '. Ayarlardan başka bir model seçin.' : r.status === 429 ? 'İstek sınırına ulaşıldı. Biraz sonra tekrar deneyin.' : r.status === 400 && /credit|balance/i.test(msg) ? 'Claude API hesabınızda kredi yok (console.anthropic.com → Billing). Ücretsiz Gemini’yi deneyebilirsiniz.' : msg;
    throw Object.assign(new Error(nice), { status: r.status });
  }
  let text = '', stop = '', inp = 0, out = 0;
  try {
    await readSSE(r, ev => {
      if (ev.type === 'content_block_delta' && ev.delta && ev.delta.type === 'text_delta') { text += ev.delta.text; if (onText) onText(text); }
      else if (ev.type === 'message_start' && ev.message && ev.message.usage) { const u = ev.message.usage; inp = (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0); out = u.output_tokens || 0; }
      else if (ev.type === 'message_delta') { if (ev.delta && ev.delta.stop_reason) stop = ev.delta.stop_reason; if (ev.usage && ev.usage.output_tokens != null) out = ev.usage.output_tokens; }
      else if (ev.type === 'error') throw new Error((ev.error && ev.error.message) || 'Akış hatası');
    });
  } finally { var usage = window.usageAdd ? usageAdd({ prov: 'claude', model, tag, inp, out, think: 0 }) : null; }
  return { text, cut: stop === 'max_tokens', usage };
}
async function geminiStream(c, { system, messages, maxTokens, onText, signal, tag }) {
  const model = aiModel(c);
  const contents = messages.map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: typeof m.content === 'string' ? [{ text: m.content }] : m.content.map(p => p.type === 'image' ? { inlineData: { mimeType: p.mime, data: p.data } } : { text: p.text }) }));
  const call = async think => {
    const gen = { maxOutputTokens: maxTokens, temperature: .4 };
    if (think) gen.thinkingConfig = { thinkingLevel: 'minimal' };
    return fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`, {
      method: 'POST', signal, headers: { 'content-type': 'application/json', 'x-goog-api-key': c.gkey },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents, generationConfig: gen })
    });
  };
  let r = await call(!gNoThink.has(model));
  if (r.status === 400 && !gNoThink.has(model)) {
    let j = null; try { j = await r.clone().json(); } catch (e) { }
    if (j && j.error && /think/i.test(j.error.message || '')) { gNoThink.add(model); r = await call(false); }
  }
  if (!r.ok) {
    let msg = 'HTTP ' + r.status; try { const j = await r.json(); if (j && j.error && j.error.message) msg = j.error.message; } catch (e) { }
    const nice = /API key not valid|API_KEY_INVALID/i.test(msg) || r.status === 403 ? 'Gemini API anahtarı geçersiz. aistudio.google.com → Get API key bölümünden yeniden kopyalayın.' : r.status === 404 ? 'Gemini modeli bulunamadı: ' + model + '. Ayarlardan diğer modeli seçin ya da model adını yazın.' : r.status === 429 ? 'Gemini ücretsiz kullanım sınırına ulaşıldı. Biraz bekleyip tekrar deneyin.' : msg;
    throw Object.assign(new Error(nice), { status: r.status });
  }
  let text = '', fin = '', um = null;
  try {
    await readSSE(r, ev => {
      if (ev.error) throw new Error(ev.error.message || 'Akış hatası');
      if (ev.usageMetadata) um = ev.usageMetadata;
      const cand = ev.candidates && ev.candidates[0]; if (!cand) return;
      const parts = (cand.content && cand.content.parts) || [];
      for (const p of parts) if (p.text && !p.thought) { text += p.text; if (onText) onText(text); }
      if (cand.finishReason) fin = cand.finishReason;
    });
  } finally {
    // yanıt (düşünme dahil) ücretlendirilir: candidates + thoughts
    var usage = um && window.usageAdd ? usageAdd({ prov: 'gemini', model, tag, inp: um.promptTokenCount || 0, out: (um.candidatesTokenCount || 0) + (um.thoughtsTokenCount || 0), think: um.thoughtsTokenCount || 0 }) : null;
  }
  if (!text && fin === 'SAFETY') throw new Error('Gemini bu isteği yanıtlamadı (güvenlik filtresi).');
  return { text, cut: fin === 'MAX_TOKENS', usage };
}

const FOLLOW_RULE = '\nKullanıcı sonradan ek soru sorarsa yukarıdaki biçim sınırını uygulama; soruya uygun uzunlukta, açık ve Türkçe yanıt ver. Selamlama ya da kapanış cümlesi yazma.';
const DICT_SYSTEM = `Sen bir PDF okuma uygulamasında çalışan kısa ve net bir sözlük asistanısın. Kullanıcı Türkçe konuşuyor.
Kullanıcı bir kelime ya da kısa ifade seçer; varsa çevresindeki cümleyi de verir. Kelimeyi O BAĞLAMDAKİ anlamıyla açıkla.
Yanıtı Türkçe ver ve tam olarak şu biçimi kullan (gereksiz satırları atla, en fazla 9 satır):
**<kelime>** · <sözcük türü> · /<telaffuz, yabancı kelimeyse>/
**Anlamı:** <bu bağlamdaki anlamı, 1-2 cümle>
**Türkçesi:** <karşılığı; kelime zaten Türkçeyse bu satırı yazma>
**Diğer anlamları:** <varsa kısaca, virgülle>
**Örnek:** <orijinal dilde kısa bir örnek cümle> — <Türkçe çevirisi>
**Eş anlamlılar:** <2-4 kelime>` + FOLLOW_RULE;
const TERM_RULE = `
TERİMLER: Önemli teknik/akademik terimleri ve anahtar kelimeleri çevirirken İLK geçtikleri yerde orijinal hâlini parantez içinde ver; örn. "fotosentez (photosynthesis)", "dikkat mekanizması (attention mechanism)". Türkçeden İngilizceye çeviriyorsan önemli terimlerin Türkçesini parantez içinde ver. Gündelik kelimelere parantez ekleme; aynı terimi ikinci kez parantezle yazma. Özel isimleri, kısaltmaları (DNA, CNN, p < 0,05), formülleri, sayıları ve kaynak gösterimlerini ([12], Smith et al., 2020) çevirme, olduğu gibi bırak.`;
const PASSAGE_SYSTEM = `Sen bir PDF okuma uygulamasında çalışan yardımcısın. Kullanıcı Türkçe konuşuyor ve belgeden bir metin parçası seçti.
Yanıtı Türkçe ver:
**Özet:** <parçanın ne söylediği, 1-3 cümle>
**Türkçesi:** <parça Türkçe değilse akıcı Türkçe çevirisi; Türkçeyse bu bölümü yazma>
**Önemli kavramlar:** <her satırda "Türkçesi (orijinali): kısa anlamı"; en fazla 6 terim; yoksa yazma>` + TERM_RULE + FOLLOW_RULE;
const TRANSLATE_SYSTEM = `Sen bir çevirmensin. Kullanıcının verdiği metni Türkçeye çevir; metin zaten Türkçeyse İngilizceye çevir.
Yalnızca çeviriyi yaz; anlamı korunarak doğal, akademik metinlerde akademik bir dil kullan. Paragraf yapısını koru. Gerekirse en sonda tek satırlık "**Not:**" ekle (ör. deyim, çok anlamlı kelime).` + TERM_RULE + FOLLOW_RULE;
const CHAT_SYSTEM = `Sen bir PDF okuma ve not uygulamasında çalışan yardımcısın. Kullanıcı Türkçe konuşuyor. Soruları açık, doğru ve gerektiği kadar kısa yanıtla. Kelime sorulursa anlamını, Türkçesini ve bir örnek cümleyi ver. Selamlama ya da kapanış cümlesi yazma.`;
const HANDWRITING_SYSTEM = 'Görüntüde bir kişinin kalemle yazdığı el yazısı var. Yazıyı olduğu gibi düz metne çevir. Yalnızca metni yaz; açıklama, tırnak ya da yorum ekleme. Türkçe karakterleri (ç ğ ı İ ö ş ü) doğru kullan. Okunamayan kısmı en olası kelimeyle tamamla. Görüntüde yazı yoksa hiçbir şey yazma.';

function mdLite(t) {
  const esc = t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return esc.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>').replace(/^#{1,4}\s*(.+)$/gm, '<b>$1</b>').replace(/^\s*[-*]\s+/gm, '• ').replace(/\n/g, '<br>');
}
const plain = t => (t || '').replace(/\*\*(.+?)\*\*/g, '$1');

/* =========================================================
   Pencere: sürükle (başlık), boyutlandır (kenar ve köşeler), büyüt
   ========================================================= */
let dictEl = null, dictAbort = null;
function closeDict() { if (dictAbort) dictAbort.abort(); dictAbort = null; if (dictEl) dictEl.remove(); dictEl = null; }
function dictHost() { return $('#ui'); }
function dictDefaultBox(W, H) {
  if (W < 700) return { x: 8, y: Math.round(H * .36), w: W - 16, h: Math.round(H * .64) - 8 };
  const w = Math.min(420, W - 24); return { x: W - w - 12, y: 12, w, h: H - 84 };
}
function applyDictBox(win, box) {
  const host = dictHost(); const W = host.clientWidth, H = host.clientHeight;
  const b = box || dictDefaultBox(W, H);
  const w = clamp(b.w, Math.min(280, W - 8), W - 8), hh = clamp(b.h, Math.min(220, H - 8), H - 8);
  const x = clamp(b.x, 4, W - w - 4), y = clamp(b.y, 4, H - hh - 4);
  Object.assign(win.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: hh + 'px' });
  return { x, y, w, h: hh };
}
function winDrag(win, e, mode) {
  e.preventDefault(); e.stopPropagation();
  const host = dictHost().getBoundingClientRect();
  const r0 = { x: win.offsetLeft, y: win.offsetTop, w: win.offsetWidth, h: win.offsetHeight }, sx = e.clientX, sy = e.clientY;
  const tgt = e.currentTarget; try { tgt.setPointerCapture(e.pointerId); } catch (er) { }
  win.classList.add('moving'); win.classList.remove('max');
  const mv = ev => {
    const dx = ev.clientX - sx, dy = ev.clientY - sy; const b = { ...r0 };
    if (mode === 'move') { b.x += dx; b.y += dy; }
    else {
      if (mode.includes('l')) { b.x = r0.x + dx; b.w = r0.w - dx; if (b.w < 280) { b.x -= 280 - b.w; b.w = 280; } }
      if (mode.includes('r')) b.w = r0.w + dx;
      if (mode.includes('t')) { b.y = r0.y + dy; b.h = r0.h - dy; if (b.h < 220) { b.y -= 220 - b.h; b.h = 220; } }
      if (mode.includes('b')) b.h = r0.h + dy;
      b.w = Math.min(b.w, host.width - 8); b.h = Math.min(b.h, host.height - 8);
    }
    S.dictBox = applyDictBox(win, b);
  };
  const up = () => { win.classList.remove('moving'); tgt.removeEventListener('pointermove', mv); tgt.removeEventListener('pointerup', up); tgt.removeEventListener('pointercancel', up); saveSettings(); };
  tgt.addEventListener('pointermove', mv); tgt.addEventListener('pointerup', up); tgt.addEventListener('pointercancel', up);
}
addEventListener('resize', () => { if (dictEl && !dictEl.classList.contains('max')) S.dictBox = applyDictBox(dictEl, S.dictBox); });

/* =========================================================
   Sözlük / sohbet paneli
   mode: 'auto' (kelime ya da parça), 'translate'
   ========================================================= */
function openDict(word, context, place, mode = 'auto', image = null) {
  closeDict();
  word = (word || '').trim();
  const isWord = w => w.length <= 48 && w.split(/\s+/).length <= 4;
  const kind = !word && !image ? 'chat' : mode === 'translate' ? 'translate' : image || !isWord(word) ? 'passage' : 'word';
  const body = h('div', { class: 'dict-body', 'aria-live': 'polite' });
  const input = h('textarea', { id: 'dictIn', rows: '1', placeholder: word ? 'Başka bir şey sorun…' : 'Bir kelime, cümle ya da soru yazın', autocomplete: 'off', enterkeyhint: 'send' });
  const acts = h('div', { class: 'dict-acts', hidden: true });
  const titleEl = h('b', null, kind === 'translate' ? 'Çeviri' : kind === 'passage' ? (place && place.area ? 'Seçilen alan' : 'Seçilen metin') : word || 'Sözlük');
  const sub = h('small', null, aiReady() ? aiName() + ' · ' + aiModel() : 'Bağlı değil');
  const maxBtn = h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Büyüt', title: 'Büyüt / küçült', onclick: () => { const on = !dictEl.classList.contains('max'); dictEl.classList.toggle('max', on); if (!on) applyDictBox(dictEl, S.dictBox); maxBtn.replaceChildren(icon(on ? IC.shrink : IC.expand)); } }, icon(IC.expand));
  const sayBtn = word && kind !== 'chat' && window.speakText ? h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Sesli oku', title: 'Sesli oku', onclick: () => speakText(word) }, icon(IC.speak)) : null;
  const head = h('div', { class: 'dict-head', title: 'Taşımak için sürükleyin' }, h('span', { class: 'ico' }, icon(IC.spark)), h('div', { class: 'tt' }, titleEl, sub), sayBtn, maxBtn,
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Yapay zekâ ayarları', onclick: () => aiSettingsModal(() => { sub.textContent = aiName() + ' · ' + aiModel(); if (word) run(true); }) }, icon(IC.gear)),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: closeDict }, icon(IC.close)));
  head.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; winDrag(dictEl, e, 'move'); });
  head.addEventListener('dblclick', () => maxBtn.click());
  // kalemle yazma alanı
  const pad = handPad(text => { insertAtCursor(input, text); autoGrow(); });
  const padBtn = h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kalemle yaz', title: 'Kalemle yaz', onclick: () => { const on = pad.el.hidden; pad.el.hidden = !on; padBtn.classList.toggle('on', on); S.dictPad = on; saveSettings(); if (on) pad.fit(); } }, icon(IC.hand));
  const sendBtn = h('button', { class: 'btn primary small', type: 'submit', 'aria-label': 'Gönder' }, icon(IC.send));
  const form = h('form', { class: 'dict-ask' }, padBtn, input, sendBtn);
  const autoGrow = () => { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 150) + 'px'; };
  input.addEventListener('input', autoGrow);
  input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit ? form.requestSubmit() : form.dispatchEvent(new Event('submit', { cancelable: true })); } });
  form.addEventListener('submit', e => {
    e.preventDefault(); const q = input.value.trim(); if (!q) return; input.value = ''; autoGrow();
    if (!word && !image) { word = q; titleEl.textContent = q.length > 40 ? q.slice(0, 38) + '…' : q; chatStart(q); } else follow(q);
  });
  const grips = ['l', 'r', 'b', 't', 'bl', 'br', 'tl', 'tr'].map(d => { const g = h('i', { class: 'rz rz-' + d, 'aria-hidden': 'true' }); g.addEventListener('pointerdown', e => winDrag(dictEl, e, d)); return g; });
  dictEl = h('section', { class: 'dict uiwin', role: 'dialog', 'aria-label': 'Sözlük' }, head, body, acts, pad.el, form, ...grips);
  dictEl.addEventListener('pointerdown', e => e.stopPropagation());
  dictHost().append(dictEl);
  S.dictBox = applyDictBox(dictEl, S.dictBox);
  if (S.dictPad) { pad.el.hidden = false; padBtn.classList.add('on'); requestAnimationFrame(() => pad.fit()); }

  let history = [], lastAnswer = '', system = kind === 'word' ? DICT_SYSTEM : kind === 'passage' ? PASSAGE_SYSTEM : kind === 'translate' ? TRANSLATE_SYSTEM : CHAT_SYSTEM;
  const firstMax = kind === 'word' ? 900 : 2500;
  const showActs = cut => {
    acts.innerHTML = '';
    acts.append(...[
      cut ? h('button', { class: 'btn small primary', type: 'button', onclick: () => { body.append(h('div', { class: 'ctx q' }, 'Devam et')); ask('Yanıtın yarıda kaldı. Kaldığın yerden, tekrar etmeden devam et.', null, 2500); } }, icon(IC.chevR), 'Devam et') : null,
      h('button', { class: 'btn small', type: 'button', onclick: () => copyText(plain(lastAnswer)) }, icon(IC.copy), 'Kopyala'),
      place && place.pv ? h('button', { class: 'btn small primary', type: 'button', title: 'Yanıtı seçtiğiniz yerin üzerine yapıştır', onclick: () => stickyFromAnswer(place, word, lastAnswer, kind) }, icon(IC.sticky), 'Yapışkan not') : null,
      place && place.pv && kind === 'word' ? h('button', { class: 'btn small', type: 'button', title: 'Sayfanın kenarına mavi yazıyla ekle', onclick: () => addMeaningNote(place, word, lastAnswer, kind) }, icon(IC.text), 'Kenara yaz') : null,
      (word || image) && kind !== 'chat' ? h('button', { class: 'btn small', type: 'button', onclick: () => run(true) }, icon(IC.sync), 'Yeniden') : null].filter(Boolean));
    acts.hidden = false;
  };
  async function ask(userMsg, keyForCache, maxTokens) {
    if (dictAbort) dictAbort.abort();
    dictAbort = new AbortController();
    const ans = h('div', { class: 'ans' }, h('span', { class: 'wait' }, aiName() + ' yazıyor…'));
    body.append(ans); body.scrollTop = body.scrollHeight;
    sendBtn.disabled = true;
    try {
      history.push({ role: 'user', content: userMsg });
      const { text, cut } = await aiStream({ tag: 'dict', system, messages: history, maxTokens: maxTokens || 2500, signal: dictAbort.signal, onText: t => { ans.innerHTML = mdLite(t); if (body.scrollHeight - body.scrollTop - body.clientHeight < 120) body.scrollTop = body.scrollHeight; } });
      history.push({ role: 'assistant', content: text || '…' });
      ans.innerHTML = mdLite(text || 'Yanıt boş geldi.'); lastAnswer = text;
      if (cut) ans.append(h('div', { class: 'cutnote' }, 'Yanıt uzun olduğu için kesildi.'));
      if (keyForCache && !cut) aiCache.set(keyForCache, text);
      showActs(cut);
    } catch (e) {
      history.pop();
      if (e.name === 'AbortError') return;
      ans.innerHTML = '';
      ans.append(h('span', { class: 'err' }, e.message || String(e)));
      if (e.code === 'nokey' || e.status === 401 || e.status === 403 || e.status === 404 || /kredi/.test(e.message || '')) ans.append(h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn small primary', type: 'button', onclick: () => aiSettingsModal(() => { ans.remove(); sub.textContent = aiName() + ' · ' + aiModel(); if (word) run(true); }) }, 'Yapay zekâyı bağla')));
    } finally { sendBtn.disabled = false; }
  }
  const ctxOf = () => (context && context.trim() && context.trim() !== word ? context.trim().slice(0, 1500) : '');
  const prompt = () => image ? [{ type: 'image', mime: 'image/jpeg', data: image }, { type: 'text', text: (kind === 'translate' ? 'Bu görüntüdeki metni çevir.' : 'Bu görüntüdeki metni (el yazısı, tablo ya da taranmış sayfa olabilir) yukarıdaki biçimde açıkla.') + (word ? '\nAlanda okunabilen metin:  + word.slice(0, 4000) + ' : '') }]
    : kind === 'word' ? `Kelime/ifade: "${word}"` + (ctxOf() ? `\nGeçtiği cümle: "${ctxOf()}"` : '')
    : kind === 'translate' ? word.slice(0, 12000)
    : `Seçilen metin:\n"""${word.slice(0, 12000)}"""` + (ctxOf() && kind === 'passage' && ctxOf().length > word.length ? '' : '');
  function run(fresh) {
    body.innerHTML = ''; history = []; acts.hidden = true;
    if (kind === 'word' && ctxOf()) body.append(h('div', { class: 'ctx', title: 'Tamamını göster', onclick: e => e.currentTarget.classList.toggle('open') }, '“' + ctxOf().slice(0, 300) + (ctxOf().length > 300 ? '…' : '') + '”'));
    if (image) body.append(h('img', { class: 'ctximg', alt: 'Seçilen alan', src: 'data:image/jpeg;base64,' + image }));
    else if (kind !== 'word') body.append(h('div', { class: 'ctx', title: 'Tamamını göster', onclick: e => e.currentTarget.classList.toggle('open') }, '“' + word.slice(0, 400) + (word.length > 400 ? '…' : '') + '”'));
    const key = image ? null : aiModel() + '|' + kind + '|' + word + '|' + (context || '');
    if (!fresh && key && aiCache.has(key)) { const t = aiCache.get(key); history = [{ role: 'user', content: prompt() }, { role: 'assistant', content: t }]; lastAnswer = t; body.append(h('div', { class: 'ans', html: mdLite(t) })); showActs(false); return; }
    ask(prompt(), key, firstMax);
  }
  function chatStart(q) { body.innerHTML = ''; history = []; body.append(h('div', { class: 'ctx q' }, q)); ask(q, null, 2500); }
  function follow(q) { body.append(h('div', { class: 'ctx q' }, q)); ask(q, null, 2500); }
  if (word || image) run();
  else {
    body.append(h('p', { class: 'notice' }, 'PDF’te bir kelimeye ya da cümleye parmakla basılı tutup “Anlamı” veya “Çevir”e dokunun. Aşağıya yazabilir ya da soldaki kalem düğmesiyle S Pen ile el yazısıyla sorabilirsiniz.'));
    if (!aiReady()) body.append(h('div', { style: { marginTop: '10px' } }, h('button', { class: 'btn small primary', type: 'button', onclick: () => aiSettingsModal(() => { sub.textContent = aiName() + ' · ' + aiModel(); }) }, 'Yapay zekâyı bağla')));
    if (!S.dictPad) setTimeout(() => input.focus(), 50);
  }
}
function insertAtCursor(ta, text) {
  text = (text || '').trim(); if (!text) return;
  const a = ta.selectionStart != null && document.activeElement === ta ? ta.selectionStart : ta.value.length, b = ta.selectionEnd != null && document.activeElement === ta ? ta.selectionEnd : ta.value.length;
  const before = ta.value.slice(0, a), after = ta.value.slice(b);
  const sep = before && !/\s$/.test(before) ? ' ' : '';
  ta.value = before + sep + text + after;
  const pos = (before + sep + text).length; try { ta.setSelectionRange(pos, pos); } catch (e) { }
}

/* =========================================================
   Kalemle yazma alanı: yazmayı bırakınca el yazısı metne çevrilir
   ========================================================= */
function handPad(onText) {
  const cv = h('canvas', { class: 'padcv' });
  const status = h('span', { class: 'padst' }, 'Kalemle yazın');
  const el = h('div', { class: 'dict-pad', hidden: true }, cv,
    h('div', { class: 'padbar' }, status,
      h('button', { class: 'btn small', type: 'button', onclick: () => clear() }, icon(IC.eraser), 'Temizle'),
      h('button', { class: 'btn small', type: 'button', onclick: () => convert() }, icon(IC.check), 'Yazıya dök')));
  const ctx = cv.getContext('2d'); let W = 0, Hh = 0, d = 1;
  let strokes = [], cur = null, timer = 0, chain = Promise.resolve(), bb = null;
  function fit() { const r = cv.getBoundingClientRect(); if (!r.width) return; d = DPR(); W = r.width; Hh = r.height; cv.width = Math.round(W * d); cv.height = Math.round(Hh * d); redraw(); }
  function redraw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height); ctx.setTransform(d, 0, 0, d, 0, 0);
    ctx.strokeStyle = 'rgba(120,130,150,.35)'; ctx.lineWidth = 1; ctx.setLineDash([4, 5]); ctx.beginPath(); ctx.moveTo(14, Hh * .72); ctx.lineTo(W - 14, Hh * .72); ctx.stroke(); ctx.setLineDash([]);
    for (const s of strokes) drawS(s);
  }
  function drawS(s) {
    ctx.fillStyle = getComputedStyle(el).color || '#1a2033';
    for (let i = 0; i < s.length; i++) { const p = s[i]; ctx.beginPath(); ctx.arc(p.x, p.y, p.w / 2, 0, Math.PI * 2); ctx.fill(); if (i) { const q = s[i - 1]; ctx.lineWidth = (p.w + q.w) / 2; ctx.lineCap = 'round'; ctx.strokeStyle = ctx.fillStyle; ctx.beginPath(); ctx.moveTo(q.x, q.y); ctx.lineTo(p.x, p.y); ctx.stroke(); } }
  }
  const okPointer = e => e.pointerType === 'pen' || e.pointerType === 'mouse' || !S.prefs.penSeen || S.prefs.finger === 'finger';
  cv.addEventListener('pointerdown', e => {
    if (!okPointer(e)) return; e.preventDefault(); e.stopPropagation();
    if (e.pointerType === 'pen') { ed.lastPenAt = Date.now(); if (!S.prefs.penSeen) { S.prefs.penSeen = true; saveSettings(); } }
    try { cv.setPointerCapture(e.pointerId); } catch (er) { }
    clearTimeout(timer); const r = cv.getBoundingClientRect();
    cur = { id: e.pointerId, pts: [], r }; strokes.push(cur.pts); add(e);
  });
  const add = e => {
    const r = cur.r; const evs = (e.getCoalescedEvents && e.getCoalescedEvents().length) ? e.getCoalescedEvents() : [e];
    for (const ev of evs) {
      const x = ev.clientX - r.left, y = ev.clientY - r.top; const p = ev.pointerType === 'pen' ? (ev.pressure || .5) : .5;
      const pt = { x, y, w: 1.4 + p * 2.6, t: Date.now() }; cur.pts.push(pt);
      bb = bb ? { x0: Math.min(bb.x0, x), y0: Math.min(bb.y0, y), x1: Math.max(bb.x1, x), y1: Math.max(bb.y1, y) } : { x0: x, y0: y, x1: x, y1: y };
    }
    redraw();
  };
  cv.addEventListener('pointermove', e => { if (cur && e.pointerId === cur.id) { e.preventDefault(); add(e); } });
  const up = e => { if (!cur || e.pointerId !== cur.id) return; cur = null; ed.lastPenAt = Date.now(); clearTimeout(timer); timer = setTimeout(convert, 1300); };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  function clear() { clearTimeout(timer); strokes = []; bb = null; redraw(); status.textContent = 'Kalemle yazın'; }
  function snapshot() {
    if (!strokes.length || !bb) return null;
    const pad = 14, x0 = Math.max(0, bb.x0 - pad), y0 = Math.max(0, bb.y0 - pad), x1 = Math.min(W, bb.x1 + pad), y1 = Math.min(Hh, bb.y1 + pad);
    const k = Math.min(2, 900 / Math.max(1, x1 - x0));
    const c = document.createElement('canvas'); c.width = Math.max(8, Math.round((x1 - x0) * k)); c.height = Math.max(8, Math.round((y1 - y0) * k));
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.setTransform(k, 0, 0, k, -x0 * k, -y0 * k);
    g.fillStyle = g.strokeStyle = '#111'; g.lineCap = 'round';
    for (const s of strokes) for (let i = 0; i < s.length; i++) { const p = s[i]; g.beginPath(); g.arc(p.x, p.y, p.w / 2 + .3, 0, Math.PI * 2); g.fill(); if (i) { const q = s[i - 1]; g.lineWidth = (p.w + q.w) / 2 + .6; g.beginPath(); g.moveTo(q.x, q.y); g.lineTo(p.x, p.y); g.stroke(); } }
    return c.toDataURL('image/png').split(',')[1];
  }
  function convert() {
    clearTimeout(timer);
    const data = snapshot(); if (!data) return;
    const raw = strokes.map(s => s.map(p => [p.x, p.y, p.t || 0]));
    strokes = []; bb = null; redraw();
    const native = typeof HW_NATIVE === 'function' && HW_NATIVE();
    if (!native && !aiReady()) { status.textContent = 'El yazısını çevirmek için yapay zekâyı bağlayın (⚙)'; return; }
    status.textContent = 'Yazıya dökülüyor…';
    chain = chain.then(async () => {
      try {
        let t = '';
        if (native) { try { const r = await handNative(raw, S.hand.lang, ''); t = (r.corrected || '').trim(); } catch (e) { if (!aiReady()) throw e; } }
        if (!t) {
          const { text } = await aiStream({ tag: 'hand', system: HANDWRITING_SYSTEM, messages: [{ role: 'user', content: [{ type: 'image', mime: 'image/png', data }, { type: 'text', text: 'Bu el yazısını metne çevir.' }] }], maxTokens: 400 });
          t = (text || '').replace(/^["“”']+|["“”']+$/g, '').trim();
        }
        if (t) onText(t);
        status.textContent = t ? 'Eklendi · yazmaya devam edin' : 'Yazı okunamadı, tekrar deneyin';
      } catch (e) { status.textContent = e.message || 'Çevrilemedi'; }
    });
  }
  new ResizeObserver(() => { if (!el.hidden) fit(); }).observe(cv);
  return { el, fit };
}

/* Anlamı / çeviriyi sayfaya küçük bir metin notu olarak ekle */
function addMeaningNote(place, word, answer, kind) {
  const pv = place.pv; if (!pv || !ed.note) return;
  const P = plain(answer).split('\n').map(l => l.trim()).filter(Boolean);
  let txt;
  if (kind === 'word' || !kind) {
    const line = P.find(l => /^Anlamı:/i.test(l)) || P[1] || '';
    const tr = P.find(l => /^Türkçesi:/i.test(l));
    txt = word + ': ' + (tr ? tr.replace(/^Türkçesi:\s*/i, '') + ' — ' : '') + line.replace(/^Anlamı:\s*/i, '');
  } else txt = P.filter(l => !/^Not:/i.test(l)).join(' ').replace(/^(Özet|Türkçesi):\s*/i, '').slice(0, 420);
  const wrapAt = kind === 'word' || !kind ? 30 : 38, out = [];
  for (const para of txt.split('\n')) { let cur = ''; for (const w of para.split(' ')) { if ((cur + ' ' + w).trim().length > wrapAt) { out.push(cur.trim()); cur = w; } else cur += ' ' + w; } out.push(cur.trim()); }
  txt = out.join('\n');
  const pid = pv.meta.id, b = snap(pid);
  const size = 9.5, boxW = wrapAt * size * .55, x = clamp(pv.meta.w - boxW - 8, 4, pv.meta.w - 40), y = clamp(place.top != null ? place.top : place.y, 4, pv.meta.h - 20);
  ann(pid).t.push({ id: uid(), x, y, text: txt, size, color: '#2f5bea', font: 'sans', bold: false });
  renderLayer(pv); pushOp({ k: 'page', pid, b, a: snap(pid) });
  toast('Sayfanın kenarına eklendi; kement ile taşıyabilirsiniz', 2400);
}

/* ---------- ayarlar ---------- */
function aiSettingsModal(after) {
  const c = aiCfg();
  let provider = c.provider, model = c.model || AI_MODEL_DEFAULT, gmodel = c.gmodel || G_MODEL_DEFAULT;
  const inpStyle = 'height:46px;border-radius:12px;border:1px solid var(--line);background:var(--chrome);padding:0 14px;width:100%;-webkit-user-select:text;user-select:text';
  const key = h('input', { type: 'password', id: 'aiKey', value: c.key || '', placeholder: 'sk-ant-…', autocomplete: 'off', spellcheck: 'false' }); key.style.cssText = inpStyle;
  const gkey = h('input', { type: 'password', id: 'aiGKey', value: c.gkey || '', placeholder: 'AIza…', autocomplete: 'off', spellcheck: 'false' }); gkey.style.cssText = inpStyle;
  const gcustom = h('input', { type: 'text', id: 'aiGModel', value: G_MODELS.some(m => m[0] === gmodel) ? '' : gmodel, placeholder: 'İsteğe bağlı: başka bir model adı', autocomplete: 'off', spellcheck: 'false' }); gcustom.style.cssText = inpStyle;
  const status = h('p', { class: 'notice' });
  const claudeBox = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    h('p', { class: 'notice' }, 'console.anthropic.com → API Keys bölümünden anahtar oluşturun. Ücret API hesabınızdan düşer (Claude Pro aboneliği API kredisi içermez). Bir kelime sorgusu çok küçük bir tutardır.'),
    h('label', { class: 'field', for: 'aiKey' }, 'Claude API anahtarı', key),
    h('div', { class: 'lbl' }, 'Model'), segRow(AI_MODELS, model, v => { model = v; }, 'Claude modeli'));
  const geminiBox = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '12px' } },
    h('p', { class: 'notice' }, 'aistudio.google.com → “Get API key” → “Create API key”. Google hesabınızla ücretsiz alınır; ücretsiz katmanda günlük kullanım sınırı vardır ve Google ücretsiz katmandaki istekleri ürün geliştirmek için kullanabilir. Gemini öğrenci üyeliği bu anahtarı içermez ama gerekli de değildir.'),
    h('label', { class: 'field', for: 'aiGKey' }, 'Gemini API anahtarı', gkey),
    h('div', { class: 'lbl' }, 'Model'), segRow(G_MODELS, G_MODELS.some(m => m[0] === gmodel) ? gmodel : G_MODELS[0][0], v => { gmodel = v; gcustom.value = ''; }, 'Gemini modeli'),
    h('label', { class: 'field', for: 'aiGModel' }, 'Model adı (gelişmiş)', gcustom));
  const show = () => { claudeBox.hidden = provider !== 'claude'; geminiBox.hidden = provider !== 'gemini'; status.textContent = ''; };
  const body = h('div', { style: { display: 'flex', flexDirection: 'column', gap: '14px' } },
    h('p', { class: 'notice' }, 'Kelime anlamı, çeviri, sohbet ve kalemle yazmayı metne çevirmek için kullanılır. Anahtar yalnızca bu cihazda saklanır ve doğrudan sağlayıcıya gönderilir.'),
    h('div', { class: 'lbl' }, 'Sağlayıcı'),
    segRow([['claude', 'Claude'], ['gemini', 'Gemini (ücretsiz katman)']], provider, v => { provider = v; show(); }, 'Sağlayıcı'),
    claudeBox, geminiBox, status);
  show();
  const collect = () => ({ ...aiCfg(), provider, key: key.value.trim(), model, gkey: gkey.value.trim(), gmodel: gcustom.value.trim() || gmodel });
  modal({
    title: 'Yapay zekâ bağlantısı', body,
    actions: [
      { label: 'Test et', onClick: async () => {
        const nc = collect(); if (!aiReady(nc)) { status.textContent = 'Önce anahtarı yapıştırın.'; return false; }
        aiSaveCfg(nc); status.textContent = 'Deneniyor…';
        try { const t0 = now(); await aiStream({ system: 'Tek kelimeyle yanıt ver.', messages: [{ role: 'user', content: 'Merhaba de.' }], maxTokens: 20 }); status.textContent = `Bağlantı çalışıyor ✓ ${aiName(nc)} · ${aiModel(nc)} · ${((now() - t0) / 1000).toFixed(1).replace('.', ',')} sn`; }
        catch (e) { status.textContent = e.message; }
        return false;
      } },
      { label: 'Kaydet', kind: 'primary', onClick: () => { const nc = collect(); if (!aiReady(nc)) { toast('Anahtar boş'); return false; } aiSaveCfg(nc); toast(aiName(nc) + ' bağlandı', 1400); if (after) setTimeout(after, 50); } }
    ]
  });
}
