'use strict';
/* =========================================================
   Sayfayı düzelt
   1) Düzeltilecek sayfalar seçilir (sayfa seçici; açık sayfa hazır seçili gelir).
   2) Her sayfanın görüntüsü yapay zekâya gönderilir (önce Gemini, olmazsa Claude; iki sayfa aynı anda).
      Model sayfadaki yazıları okuyup düzeltir ve sırayla, yazı yazı geri verir; her yazının görevini de söyler:
      sayfa başlığı, bölüm başlığı, terim (anlamıyla), anlamı, örnek cümle, çeviri, ipucu, açıklama, metin.
   3) Uygulama yazıları bu görevlere göre kullanıcının kalem stilleriyle nota sırayla dizer (pagelayout.js):
      el yazısının yerine ya da seçilen sayfalardan sonra yeni sayfalara.
   Geliştir (isteğe bağlı, seçicideki düğmeler): örnek cümle ekle, kelimeleri anlat, kendi isteğin, çalışma kağıdı.
   Çalışma kağıdı okunan yazılardan ikinci bir istekle (görüntüsüz) hazırlanır.
   Sonuç önce önizlenir (Uygula / Vazgeç); istenirse sayfadan çıkınca o sayfa için kendiliğinden hazırlanır.
   ========================================================= */
const PF = { panel: null, pick: null, job: null, fixedVer: new Map(), lastPage: 0, chip: null, autoT: 0 };
const PF_GEMINI_DEFAULT = 'gemini-3.8-flash', PF_CLAUDE_DEFAULT = 'claude-sonnet-5-5';
const PF_MAX = 20, PF_PAR = 2;

function pfHasWriting(pv) { const A = ed.note && pv && ed.note.ann[pv.meta.id]; return !!(A && (A.s.some(s => s.t !== 'hl') || A.t.some(t => t.text && t.text.trim()))); }
const pfPickable = pv => !!pv && (pv.meta.k === 'pdf' || pfHasWriting(pv));

/* ---------- sağlayıcılar: önce Gemini, olmazsa Claude ---------- */
const pfModelName = (prov, m) => prov === 'gemini' ? ((G_MODELS.find(x => x[0] === m) || [m, m])[1].split(' · ')[0]) : ((AI_MODELS.find(x => x[0] === m) || [m, m])[1].split(' · ')[0]);
function pfProviders() {
  const c = aiCfg(), P = S.pageFix;
  const gm = P.gmodel || PF_GEMINI_DEFAULT, cm = P.cmodel || PF_CLAUDE_DEFAULT;
  const gem = { id: 'gemini', name: 'Gemini', model: gm, ok: !!c.gkey, run: a => geminiStream({ ...c, provider: 'gemini', gmodel: gm }, a) };
  const cla = { id: 'claude', name: 'Claude', model: cm, ok: !!c.key, run: a => claudeStream({ ...c, provider: 'claude', model: cm }, a) };
  const order = P.first === 'claude' ? [cla, gem] : [gem, cla];
  return P.fallback === false ? order.slice(0, 1) : order;
}
function pfParse(text, check, salvage) {
  let t = (text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null;
  try { const j = JSON.parse(t.slice(a, b + 1)); return j && (!check || check(j)) ? j : null; } catch (e) { if (!salvage) return null; }
  // yanıt sınırda kesildiyse: son tamamlanan öğeye kadar al, diziyi kapat
  for (let k = b, n = 0; k > a && n < 40; k = t.lastIndexOf('}', k - 1), n++) {
    try { const j = JSON.parse(t.slice(a, k + 1) + ']}'); if (j && (!check || check(j))) return j; } catch (e) { }
  }
  return null;
}
async function pfAsk(parts, onStep, o = {}) {
  const notes = [], spent = [];
  if (!navigator.onLine) throw Object.assign(new Error('İnternet bağlantısı yok. Sayfa bağlantı gelince düzeltilebilir.'), { code: 'offline' });
  for (const pr of pfProviders()) {
    if (!pr.ok) { notes.push(pr.name + ' anahtarı yok'); continue; }
    if (onStep) onStep(pr);
    try {
      const { text, usage } = await pr.run({ system: o.system, messages: [{ role: 'user', content: parts }], maxTokens: o.maxTokens || 6000, tag: o.tag });
      if (usage) spent.push(usage);
      const j = pfParse(text, o.check, o.salvage);
      if (j) return { j, by: pr, notes, usage: spent };
      notes.push(pr.name + ' yanıtı okunamadı');
    } catch (e) {
      notes.push(pr.name + ': ' + (e.status === 429 ? 'günlük/dakikalık sınır doldu' : e.status === 403 || e.status === 401 ? 'anahtar geçersiz' : (e.message || 'hata')));
    }
  }
  const nokey = !pfProviders().some(p => p.ok);
  throw Object.assign(new Error(nokey ? 'Sayfayı düzeltmek için Gemini ya da Claude anahtarı girin.' : 'Sayfa okunamadı · ' + notes.join(' · ')), { code: nokey ? 'nokey' : 'fail', usage: spent });
}

/* ---------- sayfa seçici ---------- */
function pageFixStart(pv = currentPage()) {
  if (!ed.note) return;
  closePop();
  pfPicker(pv ? [ed.pvs.indexOf(pv)] : []);
}
window.pageFixStart = pageFixStart;
function pfPickClose() { if (PF.pick) { PF.pick.remove(); PF.pick = null; } }
/* Düzenlenen yazı nereye: 'none' (yalnız çalışma kağıdı) yalnızca çalışma kağıdı açıkken */
function pfDest() { const d = S.pageFix.dest; return d === 'new' ? 'new' : d === 'none' && S.pageFix.boost.sheet ? 'none' : 'replace'; }
function pfPicker(pre) {
  pfPickClose(); pfClose();
  if (typeof closePgrid === 'function') closePgrid();
  if (narrowPanel()) setPanel(false);
  const sel = new Set(pre.filter(i => i >= 0 && pfPickable(ed.pvs[i])));
  const B = S.pageFix.boost;
  let dest = pfDest(), askOpen = !!B.ask.trim();
  const el = PF.pick = h('div', { class: 'pgrid-back pfpick', role: 'dialog', 'aria-label': 'Sayfayı düzelt: sayfaları seç' });
  const title = h('b', null, '');
  const written = () => ed.pvs.map((pv, i) => pfHasWriting(pv) ? i : -1).filter(i => i >= 0);
  const goBtn = h('button', { class: 'btn primary', type: 'button' });
  const wBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { const w = written().slice(0, PF_MAX); const all = w.length && w.every(i => sel.has(i)); sel.clear(); if (!all) w.forEach(i => sel.add(i)); upd(); } }, icon(IC.pen), 'Yazılı sayfalar');
  const nBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { sel.clear(); upd(); } }, 'Hiçbiri');
  const hint = h('small', { class: 'pfdhint' }), bhint = h('small', { class: 'pfdhint pfbhint' });
  const cells = [];
  // Geliştir: yapay zekâ yazdıklarına ekleme yapsın, çalışma kağıdı hazırlasın
  const chip = (k, ic, label, tip) => { const b = h('button', { class: 'btn small pfb', type: 'button', title: tip, 'aria-pressed': 'false' }, icon(ic), label); b.addEventListener('click', () => { B[k] = !B[k]; saveSettings(); if (k === 'sheet') mkDest(); upd(); }); return b; };
  const cEx = chip('ex', IC.text, 'Örnek cümleler', 'Her terime 1-2 yeni örnek cümle ve çevirisi');
  const cExp = chip('explain', IC.notes, 'Kelimeleri anlat', 'Sözcük türü, okunuş, kullanım, eş/zıt anlam, sık yapılan hata');
  const cSheet = chip('sheet', IC.file, 'Çalışma kağıdı', 'Alıştırmalar ve cevap anahtarı yeni sayfalara');
  const askIn = h('input', { type: 'text', class: 'pfask', maxlength: '400', enterkeyhint: 'done', 'aria-label': 'Yapay zekâya kendi isteğin', placeholder: 'Kendi isteğin: ör. eş anlamlılarını da yaz · B1 seviyesinde olsun · 10 soru yeter' });
  askIn.value = B.ask;
  askIn.addEventListener('input', () => { B.ask = askIn.value; saveSettings(); });
  askIn.addEventListener('keydown', e => { if (e.key === 'Enter') askIn.blur(); });
  const cAsk = h('button', { class: 'btn small pfb', type: 'button', 'aria-pressed': 'false', title: 'Yapay zekâya kendi isteğini yaz' }, icon(IC.rename), 'Kendi isteğin');
  cAsk.addEventListener('click', () => { askOpen = !askOpen; if (!askOpen) { askIn.value = ''; B.ask = ''; saveSettings(); } upd(); if (askOpen) askIn.focus(); });
  const destWrap = h('span', { class: 'pfdseg' });
  const mkDest = () => {
    if (!B.sheet && dest === 'none') dest = 'replace';
    destWrap.innerHTML = '';
    destWrap.append(segRow([['replace', 'Yazının yerine'], ['new', 'Yeni sayfalara'], ...(B.sheet ? [['none', 'Yalnız çalışma kağıdı']] : [])], dest, v => { dest = v; S.pageFix.dest = v; saveSettings(); upd(); }, 'Düzenlenen yazı nereye'));
  };
  const upd = () => {
    title.textContent = sel.size ? (sel.size === 1 ? 'Sayfa ' + ([...sel][0] + 1) + ' seçildi' : sel.size + ' sayfa seçildi') : 'Düzeltilecek sayfaları seçin';
    goBtn.innerHTML = ''; goBtn.append(icon(IC.send), dest === 'none' ? 'Çalışma kağıdı hazırla' : sel.size > 1 ? sel.size + ' sayfayı gönder' : 'Gönder'); goBtn.disabled = !sel.size;
    cells.forEach((c, i) => { c.classList.toggle('sel', sel.has(i)); c.setAttribute('aria-pressed', sel.has(i) ? 'true' : 'false'); });
    const w = written(); wBtn.classList.toggle('on', !!w.length && w.every(i => sel.has(i)));
    hint.textContent = dest === 'none' ? 'Sayfalar olduğu gibi kalır; okunan yazılardan bir çalışma kağıdı hazırlanıp son seçilen sayfadan sonra eklenir.'
      : dest === 'new' ? 'Seçilen sayfalar olduğu gibi kalır; temiz yazı son seçilen sayfadan sonra yeni sayfalara yazılır.'
        : 'El yazısı silinir, temiz yazı aynı sayfadan başlar; art arda seçilen sayfalar birlikte akar. PDF sayfalarında yazı ardından gelen yeni sayfaya yazılır.';
    const on = (b, v) => { b.classList.toggle('on', !!v); b.setAttribute('aria-pressed', v ? 'true' : 'false'); };
    const none = dest === 'none';
    on(cEx, B.ex && !none); on(cExp, B.explain && !none); on(cSheet, B.sheet); on(cAsk, askOpen);
    cEx.disabled = cExp.disabled = none;
    askIn.hidden = !askOpen;
    const add = [!none && B.ex && 'örnek cümle', !none && B.explain && 'açıklama'].filter(Boolean);
    const t = [];
    if (add.length) t.push('Yapay zekâ yazdıklarına ' + add.join(' ve ') + ' ekler' + (S.pageFix.boost.mark !== false ? '; eklenenler kenarda mor çizgiyle işaretlenir.' : '.'));
    if (B.sheet) t.push('Çalışma kağıdı' + (B.answers !== false ? ' ve cevap anahtarı' : '') + ' yeni sayfalara eklenir.');
    if (none && (B.ex || B.explain)) t.push('Yalnız çalışma kağıdında yazılara ekleme yapılmaz.');
    if (!t.length) t.push('İstersen yapay zekâ yazdıklarını geliştirsin: örnek cümle eklesin, kelimeleri anlatsın ya da çalışma kağıdı hazırlasın.');
    bhint.textContent = t.join(' ');
  };
  mkDest();
  const grid = h('div', { class: 'pgrid' });
  const io = new IntersectionObserver(ents => ents.forEach(en => { if (en.isIntersecting) { io.unobserve(en.target); drawPanelThumb(en.target); } }), { root: grid, rootMargin: '300px' });
  ed.pvs.forEach((pv, i) => {
    const ok = pfPickable(pv);
    const holder = h('div', { class: 'pt', style: { aspectRatio: pv.meta.w + '/' + pv.meta.h } }); holder._pv = pv;
    const cell = h('div', { class: 'pitem big' + (ok ? '' : ' nowr') + (ed.curPage === i + 1 ? ' on' : ''), role: 'button', tabindex: '0', 'aria-label': 'Sayfa ' + (i + 1) + (ok ? '' : ' · yazı yok') },
      holder, h('span', { class: 'pn' }, String(i + 1), pv.meta.k === 'pdf' ? h('i', { class: 'ptag' }, 'PDF') : null, ok ? null : h('i', { class: 'ptag' }, 'boş')), ok ? h('span', { class: 'chk' }, icon(IC.check)) : null);
    const tap = () => {
      if (!ok) { toast('Bu sayfada düzeltilecek yazı yok', 1500); return; }
      if (sel.has(i)) sel.delete(i); else { if (sel.size >= PF_MAX) { toast('Bir seferde en fazla ' + PF_MAX + ' sayfa gönderilebilir', 2000); return; } sel.add(i); }
      upd();
    };
    cell.addEventListener('click', tap);
    cell.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tap(); } });
    cells.push(cell); grid.append(cell); io.observe(holder);
  });
  goBtn.addEventListener('click', async () => {
    const pvs = [...sel].sort((a, b) => a - b).map(i => ed.pvs[i]).filter(Boolean);
    if (!pvs.length) return;
    pfPickClose();
    const job = await pageFixRun(pvs, { dest, kind: S.pageFix.kind || 'auto', boost: { ...B, ask: askOpen ? B.ask : '' } });
    if (!job) return;
    if (S.pageFix.review === false && (!job.sheet || plSheetReady(job))) plApply(job); else plOpen(job);
  });
  el.append(
    h('div', { class: 'pgrid-head' },
      h('span', { class: 'pfpico' }, icon(IC.fixText)),
      h('div', { class: 'tt' }, title, h('small', null, 'Seçtiğin sayfaların görüntüsü yapay zekâya gönderilir. Yazılar düzeltilip görevleriyle (başlık, terim, örnek, çeviri…) geri gelir; uygulama onları kalem stillerinle sırayla nota yazar.')),
      wBtn, nBtn,
      h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: pfPickClose }, icon(IC.close))),
    grid,
    h('div', { class: 'pgrid-foot pfpfoot' },
      h('div', { class: 'pfopts' },
        h('div', { class: 'pfdest' }, h('span', { class: 'lbl' }, 'Not türü'), segRow(PL_KINDS, S.pageFix.kind || 'auto', v => { S.pageFix.kind = v; saveSettings(); }, 'Not türü'),
          h('small', { class: 'muted' }, 'Yazılar bu türün kalem stilleriyle yazılır (Otomatik: yapay zekâ sayfaya bakıp seçer, stiller araç çubuğundaki seçili takımdan)')),
        h('div', { class: 'pfdest' }, h('span', { class: 'lbl' }, 'Düzenlenen yazı'), destWrap, hint),
        h('div', { class: 'pfdest pfboost' }, h('span', { class: 'lbl' }, icon(IC.spark), 'Geliştir'), h('span', { class: 'pfbs' }, cEx, cExp, cSheet, cAsk), bhint),
        askIn),
      goBtn));
  el.addEventListener('pointerdown', e => e.stopPropagation());
  $('#edView .ebody').append(el);
  upd();
  requestAnimationFrame(() => { const f = cells[[...sel].sort((a, b) => a - b)[0]]; if (f) f.scrollIntoView({ block: 'center' }); });
}

/* ---------- çalıştır ---------- */
async function pageFixRun(pvs, opts = {}) {
  if (PF.job && PF.job.reading) { toast('Sayfalar zaten okunuyor…', 1600); return null; }
  if (PF.chip) { PF.chip.remove(); PF.chip = null; }
  pfClose();
  const list = [...new Set(pvs)].filter(pv => ed.pvs.includes(pv)).sort((a, b) => ed.pvs.indexOf(a) - ed.pvs.indexOf(b)).slice(0, PF_MAX);
  if (!list.length) return null;
  // kendiliğinden düzeltmede (quiet) geliştirme ve çalışma kağıdı yok
  const job = PF.job = plNewJob(list, opts.dest || (opts.quiet ? (S.pageFix.dest === 'new' ? 'new' : 'replace') : pfDest()), opts.quiet ? null : opts.boost, opts.kind || S.pageFix.kind || 'auto');
  job.reading = true;
  const total = list.length;
  const chip = opts.quiet ? null : pfBusyChip(total > 1 ? total + ' sayfa okunuyor…' : 'Sayfa okunuyor…', () => plStop(job));
  const label = (done, pr) => (pr ? pr.name : 'Yapay zekâ') + (total > 1 ? ' ' + total + ' sayfayı okuyor · ' + done + ' hazır' : ' sayfayı okuyor…');
  try {
    await plReadAll(job, job.pages, (done, pr) => { if (pr) job.lastPr = pr; if (chip) chip.set(label(done, job.lastPr)); });
    if (job.fatal) throw job.fatal;
    if (!job.pages.some(pg => pg.items && pg.items.length)) {
      if (job.stopped) { PF.job = null; return null; }
      const e = (job.pages.find(pg => pg.err) || {}).err;
      throw e || new Error('Sayfalardan yazı çıkarılamadı. Yeniden deneyin.');
    }
    if (job.sheet && !job.stopped) {
      if (chip) chip.set((job.lastPr ? job.lastPr.name : 'Yapay zekâ') + ' çalışma kağıdı hazırlıyor…');
      job.stop = false;
      job.stopP = new Promise(res => { job.stopRes = res; });
      await Promise.race([plSheetRead(job, pr => { job.lastPr = pr; if (chip) chip.set(pr.name + ' çalışma kağıdı hazırlıyor…'); }), job.stopP]);
    }
    return job;
  } catch (e) {
    if (!opts.quiet) { if (e.code === 'nokey') toastAction(e.message, 'Bağla', () => aiSettingsModal()); else toast(e.message, 5200); }
    if (PF.job === job) PF.job = null;
    return null;
  } finally { job.reading = false; if (chip) chip.done(); }
}

/* ---------- pencere ---------- */
function pfClose(keepJob) {
  if (PF.panel) { PF.panel.remove(); PF.panel = null; }
  if (!keepJob && PF.job && !PF.job.reading) PF.job = null;
}
/* Android geri tuşu */
window.pfBack = () => { if (PF.pick) { pfPickClose(); return true; } if (PF.panel) { pfClose(); return true; } return false; };

function placePageFixUi() {
  if (!ed.note) return;
  // sayfadan çıkınca kendiliğinden düzelt
  if (S.pageFix.when === 'leave' && ed.curPage && ed.curPage !== PF.lastPage) {
    const prev = PF.lastPage && ed.pvs[PF.lastPage - 1]; PF.lastPage = ed.curPage;
    if (prev) { clearTimeout(PF.autoT); PF.autoT = setTimeout(() => pfAuto(prev), 1500); }
  }
}
window.placePageFixUi = placePageFixUi;
async function pfAuto(pv) {
  if (!ed.note || !ed.pvs.includes(pv) || PF.job || PF.panel || PF.pick) return;
  if (ed.pvs[ed.curPage - 1] === pv) return; // geri döndü
  const ver = ed.pageVer.get(pv.meta.id) || 0;
  if (PF.fixedVer.get(pv.meta.id) === ver || !pfHasWriting(pv)) return;
  if (!pfProviders().some(p => p.ok)) return;
  const job = await pageFixRun([pv], { quiet: true });
  if (!job) return;
  if (S.pageFix.review === false) { plApply(job); return; }
  pfReadyChip(job);
}
function pfReadyChip(job) {
  if (PF.chip) PF.chip.remove();
  const pv = pvById(job.pages[0].pv.meta.id) || job.pages[0].pv, no = ed.pvs.indexOf(pv) + 1;
  PF.chip = h('div', { class: 'floaty pfchip' }, icon(IC.fixText), h('span', null, 'Sayfa ' + no + ': düzenleme hazır'),
    h('button', { class: 'btn small primary', type: 'button', onclick: () => { PF.chip.remove(); PF.chip = null; if (ed.pvs[ed.curPage - 1] !== pv) goToPage(ed.pvs.indexOf(pv)); setTimeout(() => plOpen(job), 250); } }, 'Gör'),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: () => { PF.chip.remove(); PF.chip = null; PF.job = null; } }, icon(IC.close)));
  PF.chip.addEventListener('pointerdown', e => e.stopPropagation());
  $('#ui').append(PF.chip);
  setTimeout(() => { if (PF.chip) { PF.chip.remove(); PF.chip = null; if (!PF.panel) PF.job = null; } }, 20000);
}
function pfBusyChip(text, onStop) {
  const span = h('span', null, text);
  const el = h('div', { class: 'floaty pfchip busy' + (onStop ? ' stop' : '') }, h('i', { class: 'spin' }), span,
    onStop ? h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Durdur', title: 'Durdur', onclick: () => onStop() }, icon(IC.close)) : null);
  el.addEventListener('pointerdown', e => e.stopPropagation());
  $('#ui').append(el);
  return { set: t => { span.textContent = t; }, done: () => el.remove() };
}
window.pageFixReset = () => { clearTimeout(PF.autoT); pfPickClose(); pfClose(); if (PF.job) plStop(PF.job); PF.job = null; if (PF.chip) { PF.chip.remove(); PF.chip = null; } PF.fixedVer.clear(); PF.lastPage = 0; };

/* ---------- ayarlar ---------- */
function pageFixSettingsGroups() {
  const c = aiCfg(), P = S.pageFix, B = P.boost, M = plStyleMap(plKindSet(P.kind || 'auto'));
  const askIn = h('input', { type: 'text', class: 'pfask', maxlength: '400', 'aria-label': 'Kendi isteğin', placeholder: 'Ör. eş anlamlılarını da yaz · B1 seviyesinde olsun' });
  askIn.value = B.ask; askIn.addEventListener('input', () => { B.ask = askIn.value; saveSettings(); });
  const gsel = h('select', { 'aria-label': 'Gemini modeli' }, ...G_MODELS.map(([v, l]) => h('option', { value: v }, l)));
  gsel.value = P.gmodel || PF_GEMINI_DEFAULT; if (gsel.value !== (P.gmodel || PF_GEMINI_DEFAULT)) gsel.append(h('option', { value: P.gmodel }, P.gmodel)), gsel.value = P.gmodel;
  gsel.addEventListener('change', () => { P.gmodel = gsel.value; saveSettings(); });
  const csel = h('select', { 'aria-label': 'Claude modeli' }, ...AI_MODELS.map(([v, l]) => h('option', { value: v }, l)));
  csel.value = P.cmodel || PF_CLAUDE_DEFAULT; csel.addEventListener('change', () => { P.cmodel = csel.value; saveSettings(); });
  const selw = s => h('div', { class: 'selectw' }, s, icon(IC.chev));
  const sample = s => h('span', { class: 'plsw', style: { color: s.color, fontFamily: FONTS[s.font] || FONTS.sans, fontWeight: String(s.wt) } }, (s.prefix ? s.prefix + ' ' : '') + 'Aa');
  return [
    sGroup('Düzen', [
      sRow('Not türü', 'Yapay zekâ yazıların görevini bu türe göre seçer; yazılar bu türün kalem stili takımıyla yazılır. Otomatik: sayfaya bakıp kendisi anlar.',
        segRow(PL_KINDS, P.kind || 'auto', v => { P.kind = v; saveSettings(); }, 'Not türü'), true),
      sRow('Düzenlenen yazı nereye', 'Yazının yerine: el yazısı silinir, temiz yazı aynı sayfadan başlar (art arda seçilen sayfalar birlikte akar; PDF sayfalarında ardından gelen yeni sayfaya yazılır). Yeni sayfalara: seçilen sayfalar olduğu gibi kalır.',
        segRow([['replace', 'Yazının yerine'], ['new', 'Yeni sayfalara'], ...(B.sheet ? [['none', 'Yalnız çalışma kağıdı']] : [])], pfDest(), v => { P.dest = v; saveSettings(); }, 'Düzenlenen yazı nereye'), true),
      toggleRow('pfFixes', 'Düzeltmeleri sonuna yaz', P.fixes !== false, v => { P.fixes = v; saveSettings(); }, 'Kırmızı kalemle: ✗ yazdığın · ✓ doğrusu · kısa açıklama'),
      toggleRow('pfReview', 'Uygulamadan önce önizle', P.review !== false, v => { P.review = v; saveSettings(); }, 'Kapalıysa doğrudan uygulanır (Geri al ile dönülür)')
    ]),
    sGroup('Geliştir', [
      toggleRow('pfbEx', 'Örnek cümle ekle', B.ex, v => { B.ex = v; saveSettings(); }, 'Her terime 1-2 yeni örnek cümle ve Türkçe çevirisi'),
      toggleRow('pfbExplain', 'Kelimeleri anlat', B.explain, v => { B.explain = v; saveSettings(); }, 'Sözcük türü ve okunuş, kullanım, sık birlikte kullanılanlar, eş/zıt anlam, sık yapılan hata'),
      toggleRow('pfbSheet', 'Çalışma kağıdı hazırla', B.sheet, v => { B.sheet = v; saveSettings(); }, 'Okunan yazılardan alıştırmalar (boşluk doldurma, eşleştirme, çeviri, cümle kurma…); düzenlenen sayfalardan sonra yeni sayfalara, cevap yazacak yer bırakılarak'),
      toggleRow('pfbAns', 'Cevap anahtarı ekle', B.answers !== false, v => { B.answers = v; saveSettings(); }, 'Çalışma kağıdından sonra ayrı sayfada'),
      toggleRow('pfbMark', 'Eklenenleri işaretle', B.mark !== false, v => { B.mark = v; saveSettings(); }, 'Yapay zekânın eklediği satırların yanında kenarda mor çizgi'),
      sRow('Kendi isteğin', 'Sayfa seçme ekranında “Kendi isteğin” açıkken gönderilir', askIn, true)
    ], 'Bunları sayfa seçme ekranındaki Geliştir düğmeleriyle de açıp kapatabilirsin. Çalışma kağıdında sorular Metin, şıklar Anlamı, yönergeler Açıklama stiliyle yazılır. Sayfadan çıkınca kendiliğinden düzeltmede geliştirme yapılmaz.'),
    sGroup('Görevler ve kalem stilleri', PL_ROLES.map(([r, lab]) => { const s = M[r]; return sRow(lab, s.borrowed ? s.name + ' stiliyle' : s.name, sample(s)); }),
      'Yapay zekâ her yazının görevini söyler, uygulama o görevin kalem stilini kullanır. Stiller seçili not türünün takımından gelir (araç çubuğu → Stiller); takımda olmayan görev için öbür takımlardaki en yakın stil kullanılır. Stilleri orada düzenleyebilirsin.'),
    sGroup('Ne zaman', [
      sRow('Sayfa ne zaman düzeltilsin', 'Sayfadan çıkınca: yazdığın sayfadan çıktığında o sayfa arka planda hazırlanır', segRow([['manual', 'Ben isteyince'], ['leave', 'Sayfadan çıkınca']], P.when || 'manual', v => { P.when = v; saveSettings(); }, 'Ne zaman'), true)
    ]),
    sGroup('Yapay zekâ', [
      sRow('İlk tercih', null, segRow([['gemini', 'Önce Gemini'], ['claude', 'Önce Claude']], P.first || 'gemini', v => { P.first = v; saveSettings(); }, 'İlk tercih'), true),
      toggleRow('pfFallback', 'Olmazsa diğerini kullan', P.fallback !== false, v => { P.fallback = v; saveSettings(); }, 'Anahtar yoksa, günlük sınır dolduysa ya da hata olursa'),
      sRow('Gemini modeli', null, selw(gsel)),
      sRow('Claude modeli', null, selw(csel))
    ], 'Gemini anahtarı: ' + (c.gkey ? 'var' : 'yok') + ' · Claude anahtarı: ' + (c.key ? 'var' : 'yok') + '. Her seçilen sayfanın görüntüsü ayrı bir istek olarak gönderilir.')
  ];
}
