'use strict';
/* =========================================================
   Sayfayı düzelt
   Sayfanın tamamını (PDF + el yazısı) yapay zekâya bir kez okutur; her el yazısı bloğunu metne çevirir ve
   yazım/dil bilgisi hatalarını sayfanın bağlamına bakarak düzeltir. Konumları uygulama bilir: model yalnızca
   numaralı blokların metnini döndürür, düzen bozulmaz.
   Sağlayıcı: önce Gemini (ayarlardan değiştirilebilir); anahtar yoksa, günlük sınır dolduysa ya da hata olursa Claude.
   Sonuç önce önizlenir (Uygula / Vazgeç); istenirse sayfadan çıkınca kendiliğinden çalışır.
   ========================================================= */
const PF = { panel: null, badges: [], job: null, fixedVer: new Map(), lastPage: 0, chip: null, autoT: 0 };
const PF_GEMINI_DEFAULT = 'gemini-3.8-flash', PF_CLAUDE_DEFAULT = 'claude-sonnet-5-5';
const PAGEFIX_SYSTEM = `Sen bir not alma uygulamasında sayfadaki el yazılarını okuyup düzelten bir yardımcısın.
Görüntüde bir sayfa ve kullanıcının üzerine kalemle yazdıkları var. Kırmızı çerçeveli ve kırmızı numaralı her blok kullanıcının yazdığı bir el yazısı ya da daha önce metne çevrilmiş bir metin kutusudur.
Görevin: her numaralı bloğu oku. El yazısıysa metne çevir; metin kutusuysa kontrol et. Tanıma, yazım ve bariz dil bilgisi hatalarını EN AZ değişiklikle düzelt.
Kurallar:
- Metin Türkçe, İngilizce ya da karışık olabilir. Her kelimeyi kendi dilinde bırak; çevirme, yeniden yazma, anlamı değiştirme.
- Kullanıcının yazmadığı bilgiyi ekleme, eksik cevapları tamamlama. Sayfanın basılı metnini yalnızca okumayı kolaylaştıran bağlam olarak kullan (ör. alıştırmadaki fiil, konu terimleri).
- Bir bloğun içindeki satır sonları aynı cümlenin devamıysa birleştir; ayrı maddeler ya da ayrı satırlar ise \\n ile ayır.
- Blok bir çizim, şekil, ok, işaret, altı çizili/daire içine alma ya da karalamaysa type "drawing" ver ve text'i boş bırak.
- Okunamayan kısmı en olası kelimeyle tamamla.
Yalnızca şu biçimde geçerli JSON döndür, başka hiçbir şey yazma:
{"blocks":[{"id":1,"type":"text","text":"..."},{"id":2,"type":"drawing","text":""}]}`;

/* ---------- bloklar ---------- */
function pfBlocks(pv) {
  const A = ann(pv.meta.id);
  const ink = A.s.filter(s => s.t !== 'hl');
  const hs = ink.map(s => { const b = strokeBB(s); return b.y1 - b.y0; }).sort((a, b) => a - b);
  const med = hs.length ? hs[hs.length >> 1] : 14;
  // büyük daire/çerçeve/şekil gibi çizgiler yazı bloklarına katılmaz (mürekkep olarak kalır)
  const textInk = ink.filter(s => { const b = strokeBB(s); return !((b.y1 - b.y0) > Math.max(70, med * 3.2) && (b.x1 - b.x0) > Math.max(70, med * 3.2)); });
  const blocks = [];
  const lines = textInk.length ? splitLines(textInk) : [];
  let P = null;
  for (const l of lines) {
    const lh = Math.max(14, l.lineH);
    if (P && l.bb.y0 - P.last.y1 < lh * 1.3 && Math.abs(l.bb.x0 - P.bb.x0) < lh * 3) { P.strokes.push(...l.strokes); P.bb = bbUnion(P.bb, l.bb); P.last = l.bb; P.lines.push(l); }
    else { P = { kind: 'ink', strokes: [...l.strokes], bb: { ...l.bb }, last: l.bb, lines: [l] }; blocks.push(P); }
  }
  for (const t of A.t) if (t.text && t.text.trim()) blocks.push({ kind: 'text', t, bb: { x0: t.x, y0: t.y, x1: t.x + (t.w || 20), y1: t.y + (t.h || 20) } });
  blocks.sort((a, b) => (a.bb.y0 - b.bb.y0) || (a.bb.x0 - b.bb.x0));
  blocks.forEach((b, i) => { b.id = i + 1; if (b.kind === 'ink') b.lineH = medianLineH(b.lines); });
  return blocks;
}
function pfHasInk(pv) { const A = ed.note && ed.note.ann[pv.meta.id]; return !!(A && A.s.some(s => s.t !== 'hl')); }

/* ---------- sayfa görüntüsü (numaralı bloklarla) ---------- */
async function pfImage(pv, blocks) {
  const c = await renderThumb(pv.meta, ann(pv.meta.id), ed.pdf, 1300);
  const s = c.width / pv.meta.w, g = c.getContext('2d');
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.font = 'bold 22px Onest, Arial, sans-serif'; g.textBaseline = 'middle';
  for (const b of blocks) {
    const x = b.bb.x0 * s - 5, y = b.bb.y0 * s - 5, w = (b.bb.x1 - b.bb.x0) * s + 10, hh = (b.bb.y1 - b.bb.y0) * s + 10;
    g.strokeStyle = 'rgba(220,38,38,.9)'; g.lineWidth = 2; g.setLineDash([]); g.strokeRect(x, y, w, hh);
    const lab = String(b.id), tw = g.measureText(lab).width + 12;
    const lx = x - tw - 3 >= 0 ? x - tw - 3 : x, ly = x - tw - 3 >= 0 ? y : Math.max(0, y - 28);
    g.fillStyle = '#dc2626'; g.fillRect(lx, ly, tw, 26); g.fillStyle = '#fff'; g.fillText(lab, lx + 6, ly + 13);
  }
  return c.toDataURL('image/jpeg', .86).split(',')[1];
}
async function pfPageText(pv) {
  if (pv.meta.k !== 'pdf' || !ed.pdf) return '';
  try { const pg = await getPdfPage(pv.meta.i); const tc = await pg.getTextContent(); return tc.items.map(i => i.str + (i.hasEOL ? '\n' : ' ')).join('').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, 3500); }
  catch (e) { return ''; }
}

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
function pfParse(text) {
  let t = (text || '').trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '');
  const a = t.indexOf('{'), b = t.lastIndexOf('}'); if (a < 0 || b <= a) return null;
  try { const j = JSON.parse(t.slice(a, b + 1)); return j && Array.isArray(j.blocks) ? j : null; } catch (e) { return null; }
}
async function pfAsk(parts, onStep) {
  const notes = [];
  if (!navigator.onLine) throw Object.assign(new Error('İnternet bağlantısı yok. Sayfa bağlantı gelince düzeltilebilir.'), { code: 'offline' });
  for (const pr of pfProviders()) {
    if (!pr.ok) { notes.push(pr.name + ' anahtarı yok'); continue; }
    if (onStep) onStep(pr);
    try {
      const { text } = await pr.run({ system: PAGEFIX_SYSTEM, messages: [{ role: 'user', content: parts }], maxTokens: 6000 });
      const j = pfParse(text);
      if (j) return { j, by: pr, notes };
      notes.push(pr.name + ' yanıtı okunamadı');
    } catch (e) {
      notes.push(pr.name + ': ' + (e.status === 429 ? 'günlük/dakikalık sınır doldu' : e.status === 403 || e.status === 401 ? 'anahtar geçersiz' : (e.message || 'hata')));
    }
  }
  const nokey = !pfProviders().some(p => p.ok);
  throw Object.assign(new Error(nokey ? 'Sayfayı düzeltmek için Gemini ya da Claude anahtarı girin.' : 'Sayfa düzeltilemedi · ' + notes.join(' · ')), { code: nokey ? 'nokey' : 'fail' });
}

/* ---------- çalıştır ---------- */
async function pageFixRun(pv, opts = {}) {
  if (PF.job && !PF.job.items) { toast('Bir sayfa zaten düzeltiliyor…', 1600); return null; }
  if (PF.chip) { PF.chip.remove(); PF.chip = null; } pfClose();
  const blocks = pfBlocks(pv);
  if (!blocks.length) { if (!opts.quiet) toast('Bu sayfada düzeltilecek yazı yok', 1800); return null; }
  const job = PF.job = { pv, blocks, ver: ed.pageVer.get(pv.meta.id) || 0 };
  const chip = opts.quiet ? null : pfBusyChip('Sayfa okunuyor…');
  try {
    const [img, ptext] = await Promise.all([pfImage(pv, blocks), pfPageText(pv)]);
    const desc = blocks.map(b => b.kind === 'ink' ? `${b.id}: el yazısı (${b.lines.length} satır)` : `${b.id}: metin kutusu: «${b.t.text.replace(/\s+/g, ' ').slice(0, 300)}»`).join('\n');
    const parts = [{ type: 'image', mime: 'image/jpeg', data: img }, { type: 'text', text: 'Numaralı bloklar:\n' + desc + (ptext ? '\n\nSayfanın basılı metni (yalnızca bağlam):\n«' + ptext + '»' : '') + '\n\nJSON:' }];
    const res = await pfAsk(parts, pr => { if (chip) chip.set(pr.name + ' sayfayı okuyor…'); });
    job.by = res.by; job.notes = res.notes;
    const map = new Map(res.j.blocks.map(x => [Number(x.id), x]));
    job.items = blocks.map(b => {
      const r = map.get(b.id) || {}; const txt = String(r.text || '').replace(/\r/g, '').trim();
      const drawing = r.type === 'drawing' || (!txt && b.kind === 'ink');
      const before = b.kind === 'text' ? b.t.text : '';
      return { b, text: txt, drawing, changed: !drawing && !!txt && txt !== before.trim(), on: !drawing && !!txt && txt !== before.trim() };
    });
    PF.fixedVer.set(pv.meta.id, job.ver);
    return job;
  } catch (e) {
    if (!opts.quiet) { if (e.code === 'nokey') toastAction(e.message, 'Bağla', () => aiSettingsModal()); else toast(e.message, 5200); }
    PF.job = null; return null;
  } finally { if (chip) chip.done(); if (PF.job === job && !job.items) PF.job = null; }
}
async function pageFixStart(pv = currentPage()) {
  if (!pv) return;
  closePop();
  const job = await pageFixRun(pv);
  if (!job) return;
  if (S.pageFix.review === false) { pfApply(job, job.items.filter(x => x.on)); return; }
  pfOpen(job);
}
window.pageFixStart = pageFixStart;

/* ---------- önizleme penceresi ---------- */
function pfOpen(job) {
  pfClose(true);
  PF.job = job;
  const list = h('div', { class: 'pflist' });
  const count = () => job.items.filter(x => x.on).length;
  const applyBtn = h('button', { class: 'btn small primary', type: 'button', onclick: () => { const sel = job.items.filter(x => x.on); pfClose(); pfApply(job, sel); } });
  const upd = () => { applyBtn.textContent = 'Uygula (' + count() + ')'; applyBtn.disabled = !count(); pfBadges(); };
  for (const it of job.items) {
    if (it.drawing) continue;
    const ta = h('textarea', { rows: '1', spellcheck: 'false' }); ta.value = it.text;
    const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(160, ta.scrollHeight) + 'px'; };
    ta.addEventListener('input', () => { it.text = ta.value; it.on = !!ta.value.trim(); cb.checked = it.on; upd(); grow(); });
    const cb = h('input', { type: 'checkbox', class: 'switch sm', 'aria-label': 'Blok ' + it.b.id + ' uygulansın' }); cb.checked = it.on;
    cb.addEventListener('change', () => { it.on = cb.checked; upd(); });
    const before = it.b.kind === 'text' ? (it.changed ? 'Önce: «' + it.b.t.text.replace(/\s+/g, ' ').slice(0, 120) + '»' : 'Değişiklik yok') : 'El yazısı · ' + it.b.lines.length + ' satır';
    const row = h('div', { class: 'pfrow' + (it.changed ? '' : ' same'), 'data-id': it.b.id }, h('i', { class: 'pfn' }, String(it.b.id)), h('div', { class: 'pft' }, ta, h('small', null, before)), cb);
    row.addEventListener('pointerenter', () => pfBadges(it.b.id)); row.addEventListener('pointerleave', () => pfBadges());
    list.append(row); requestAnimationFrame(grow);
  }
  const drawings = job.items.filter(x => x.drawing).length;
  const by = job.by ? job.by.name + ' · ' + pfModelName(job.by.id, job.by.model) : '';
  const note = job.notes && job.notes.length ? job.notes.join(' · ') + ' → ' + (job.by ? job.by.name : '') + ' kullanıldı.' : '';
  PF.panel = h('section', { class: 'uiwin pfwin', role: 'dialog', 'aria-label': 'Sayfayı düzelt' },
    h('div', { class: 'pfhead' }, h('span', { class: 'ico' }, icon(IC.fixText)), h('div', { class: 'tt' }, h('b', null, 'Sayfa ' + (ed.pvs.indexOf(job.pv) + 1) + ' · öneriler'), h('small', null, by)),
      h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: () => pfClose() }, icon(IC.close))),
    note ? h('p', { class: 'notice pfnote' }, note) : null,
    list,
    drawings ? h('p', { class: 'notice pfnote' }, drawings + ' blok çizim olarak bırakıldı.') : null,
    h('div', { class: 'pffoot' }, h('button', { class: 'btn small', type: 'button', onclick: () => pfClose() }, 'Vazgeç'), applyBtn));
  PF.panel.addEventListener('pointerdown', e => e.stopPropagation());
  $('#ui').append(PF.panel); upd();
}
function pfClose(keepJob) {
  if (PF.panel) { PF.panel.remove(); PF.panel = null; }
  PF.badges.forEach(b => b.remove()); PF.badges = [];
  if (!keepJob) PF.job = null;
}
function pfBadges(focus) {
  PF.badges.forEach(b => b.remove()); PF.badges = [];
  const job = PF.job; if (!job || !PF.panel) return;
  for (const it of job.items) {
    if (it.drawing) continue;
    const el = h('button', { class: 'pfbadge' + (it.on ? '' : ' off') + (focus === it.b.id ? ' focus' : ''), type: 'button', title: 'Blok ' + it.b.id }, String(it.b.id));
    el._b = it.b; el.addEventListener('pointerdown', e => e.stopPropagation());
    el.addEventListener('click', () => { const r = PF.panel && PF.panel.querySelector(`.pfrow[data-id="${it.b.id}"]`); if (r) { r.scrollIntoView({ block: 'nearest' }); const ta = r.querySelector('textarea'); if (ta) ta.focus(); } });
    $('#ui').append(el); PF.badges.push(el);
  }
  placePageFixUi();
}
function placePageFixUi() {
  if (!ed.note) return;
  if (PF.badges.length && PF.job) {
    const v = ed.view, pv = PF.job.pv;
    for (const el of PF.badges) { const b = el._b; el.style.left = (v.tx + (pv.x + b.bb.x0) * v.z - 30) + 'px'; el.style.top = (v.ty + (pv.y + b.bb.y0) * v.z - 6) + 'px'; el.style.outline = ''; }
  }
  // sayfadan çıkınca kendiliğinden düzelt
  if (S.pageFix.when === 'leave' && ed.curPage && ed.curPage !== PF.lastPage) {
    const prev = PF.lastPage && ed.pvs[PF.lastPage - 1]; PF.lastPage = ed.curPage;
    if (prev) { clearTimeout(PF.autoT); PF.autoT = setTimeout(() => pfAuto(prev), 1500); }
  }
}
window.placePageFixUi = placePageFixUi;
async function pfAuto(pv) {
  if (!ed.note || !ed.pvs.includes(pv) || PF.job || PF.panel) return;
  if (ed.pvs[ed.curPage - 1] === pv) return; // geri döndü
  const ver = ed.pageVer.get(pv.meta.id) || 0;
  if (PF.fixedVer.get(pv.meta.id) === ver || !pfHasInk(pv)) return;
  if (!pfProviders().some(p => p.ok)) return;
  const job = await pageFixRun(pv, { quiet: true });
  if (!job) return;
  const n = job.items.filter(x => x.on).length;
  if (!n) { PF.job = null; return; }
  if (S.pageFix.review === false) { pfApply(job, job.items.filter(x => x.on)); return; }
  pfReadyChip(job, n);
}
function pfReadyChip(job, n) {
  if (PF.chip) PF.chip.remove();
  const no = ed.pvs.indexOf(job.pv) + 1;
  PF.chip = h('div', { class: 'floaty pfchip' }, icon(IC.fixText), h('span', null, 'Sayfa ' + no + ': ' + n + ' öneri hazır'),
    h('button', { class: 'btn small primary', type: 'button', onclick: () => { PF.chip.remove(); PF.chip = null; if (ed.pvs[ed.curPage - 1] !== job.pv) { goToPage(ed.pvs.indexOf(job.pv)); } setTimeout(() => pfOpen(job), 250); } }, 'Gör'),
    h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: () => { PF.chip.remove(); PF.chip = null; PF.job = null; } }, icon(IC.close)));
  PF.chip.addEventListener('pointerdown', e => e.stopPropagation());
  $('#ui').append(PF.chip);
  setTimeout(() => { if (PF.chip) { PF.chip.remove(); PF.chip = null; if (!PF.panel) PF.job = null; } }, 20000);
}
function pfBusyChip(text) {
  const el = h('div', { class: 'floaty pfchip busy' }, h('i', { class: 'spin' }), h('span', null, text));
  $('#ui').append(el);
  return { set: t => { el.querySelector('span').textContent = t; }, done: () => el.remove() };
}

/* ---------- uygula ---------- */
function pfStyleFor(color, lineH) {
  const c = (color || '').toLowerCase();
  const act = S.hand.style && (S.hand.style.color || '').toLowerCase() === c ? S.hand.style : null;
  if (act) return act;
  const cands = S.fav.filter(f => f.name && f.text && (f.color || '').toLowerCase() === c);
  if (!cands.length) return null;
  cands.sort((a, b) => Math.abs(a.text.size - lineH * .8) - Math.abs(b.text.size - lineH * .8)); // başlık mı normal mi: yazı boyutuna en yakın stil
  return { ...cands[0].text, color: cands[0].color, name: cands[0].name };
}
function pfApply(job, sel) {
  const pv = job.pv; if (!ed.pvs.includes(pv) || !sel.length) { PF.job = null; return; }
  const pid = pv.meta.id, A = ann(pid), b = snap(pid);
  let n = 0;
  for (const it of sel) {
    const text = (it.text || '').trim(); if (!text) continue;
    if (it.b.kind === 'text') {
      const t = it.b.t; if (!A.t.includes(t) || t.text === text) continue;
      A.t = A.t.map(x => x === t ? { ...t, text, w: 0, h: 0 } : x); n++;
    } else {
      const live = it.b.strokes.filter(s => A.s.includes(s)); if (!live.length) continue;
      const first = it.b.lines[0].bb, last = it.b.lines[it.b.lines.length - 1].bb, lh = it.b.lineH || 14;
      const st = pfStyleFor(live[0].c, lh), font = st && st.font ? st.font : (S.hand.font || 'hand');
      const size = st && st.size ? st.size : handFontSize(lh, font);
      const tx = st && st.prefix && !text.startsWith(st.prefix) ? st.prefix + ' ' + text : text;
      const hand = font === 'hand' || font === 'kalam';
      A.t.push({ id: uid(), x: Math.max(0, first.x0), y: Math.max(0, first.y0 - size * (hand ? .12 : .08)), text: tx, size, color: live[0].c || S.text.color, font, bold: !!(st && st.wt >= 700), wt: st && st.wt ? st.wt : 0, ink: { x0: first.x0, x1: last.x1, y0: last.y0, y1: last.y1 } });
      A.s = A.s.filter(s => !live.includes(s)); n++;
    }
  }
  PF.job = null;
  if (!n) { toast('Uygulanacak değişiklik yok', 1500); return; }
  pushOp({ k: 'page', pid, b, a: snap(pid) });
  renderLayer(pv); requestFrame(true); refreshPanel && refreshPanel();
  PF.fixedVer.set(pid, ed.pageVer.get(pid) || 0);
  toast('Sayfa ' + (ed.pvs.indexOf(pv) + 1) + ': ' + n + ' blok düzeltildi · geri almak için ↶', 2600);
  if (window.flowSuggest) flowSuggest(pv);
}
window.pageFixReset = () => { clearTimeout(PF.autoT); pfClose(); if (PF.chip) { PF.chip.remove(); PF.chip = null; } PF.fixedVer.clear(); PF.lastPage = 0; };

/* ---------- ayarlar ---------- */
function pageFixSettingsRows() {
  const c = aiCfg(), P = S.pageFix;
  const keys = h('p', { class: 'notice' }, 'Gemini anahtarı: ' + (c.gkey ? 'var' : 'yok') + ' · Claude anahtarı: ' + (c.key ? 'var' : 'yok') + '. Sayfanın görüntüsü seçilen sağlayıcıya gönderilir.');
  const gsel = h('select', { 'aria-label': 'Gemini modeli', style: { width: '100%' } }, ...G_MODELS.map(([v, l]) => h('option', { value: v }, l)));
  gsel.value = P.gmodel || PF_GEMINI_DEFAULT; if (gsel.value !== (P.gmodel || PF_GEMINI_DEFAULT)) gsel.append(h('option', { value: P.gmodel }, P.gmodel)), gsel.value = P.gmodel;
  gsel.addEventListener('change', () => { P.gmodel = gsel.value; saveSettings(); });
  const csel = h('select', { 'aria-label': 'Claude modeli', style: { width: '100%' } }, ...AI_MODELS.map(([v, l]) => h('option', { value: v }, l)));
  csel.value = P.cmodel || PF_CLAUDE_DEFAULT; csel.addEventListener('change', () => { P.cmodel = csel.value; saveSettings(); });
  return [
    h('span', { class: 'lbl' }, 'Sayfayı düzelt'),
    h('p', { class: 'notice' }, 'Sayfanın tamamını okuyup el yazısını metne çevirir ve bağlama bakarak düzeltir. Önce önizleme gösterilir.'),
    segRow([['gemini', 'Önce Gemini'], ['claude', 'Önce Claude']], P.first || 'gemini', v => { P.first = v; saveSettings(); }, 'İlk tercih'),
    toggleRow('pfFallback', 'Olmazsa diğerini kullan', P.fallback !== false, v => { P.fallback = v; saveSettings(); }, 'Anahtar yoksa, günlük sınır dolduysa ya da hata olursa'),
    h('label', { class: 'field' }, 'Gemini modeli', h('div', { class: 'selectw' }, gsel, icon(IC.chev))),
    h('label', { class: 'field' }, 'Claude modeli', h('div', { class: 'selectw' }, csel, icon(IC.chev))),
    h('div', { class: 'field' }, 'Ne zaman düzeltilsin', segRow([['manual', 'Ben isteyince'], ['leave', 'Sayfadan çıkınca']], P.when || 'manual', v => { P.when = v; saveSettings(); }, 'Ne zaman düzeltilsin')),
    toggleRow('pfReview', 'Uygulamadan önce önizle', P.review !== false, v => { P.review = v; saveSettings(); }, 'Kapalıysa öneriler doğrudan uygulanır (Geri al ile dönülür)'),
    keys
  ];
}
