'use strict';
/* =========================================================
   Sayfayı düzenle (not sayfaları)
   Yapay zekâ sayfadaki bütün yazıyı (el yazısı satırları + metin kutuları) ve kullanıcının kalem stillerini alır;
   her satırın görevini (başlık, terim, anlamı, örnek, çeviri, ipucu…) belirleyip temize çekilmiş bir ders notu
   döndürür. Yerleşimi uygulama yapar: girintiler, aralıklar, "terim : anlamı" aynı satırda iki renk, bölüm
   başlığının altında fosforlu vurgu, sığmayan satırlar sonraki sayfaya. Düzeltilen hatalar isteğe bağlı olarak
   sonda kırmızı kalemle listelenir. PDF sayfalarında kullanılmaz (orada yerinde düzeltme yapılır).
   ========================================================= */
const PL_SYSTEM = `Sen bir not alma uygulamasında el yazısıyla tutulmuş bir not sayfasını temize çeken yardımcısın.
Görüntüde kullanıcının kalemle yazdığı bir not sayfası var. Kırmızı numaralı her parça bir el yazısı satırı, daha önce metne çevrilmiş bir metin kutusu ya da bir çizimdir. Parçaların listesi (mürekkep renkleriyle) ve kullanıcının kalem stilleri ayrıca verilir.
Görevin: sayfadaki her şeyi okuyup AYNI içeriği bu stillerle temiz ve düzenli bir ders notu olarak yeniden yazmak. Hedef düzen (kelime defteri):
  Bölüm başlığı
  terim : anlamı
     İngilizce örnek cümle
        Türkçe çevirisi
     ipucu / not

Kurallar:
- Birbirine yakın yazılmış satırlar tek cümle DEĞİLDİR. Her satırın görevine bak: terim, anlamı, örnek cümle, çeviri, ipucu ayrı satırlardır. Bir cümleyi yalnızca gerçekten alt satıra taşmışsa (aynı renk, cümle bitmemiş) birleştir.
- Stili seçerken önce mürekkep rengine bak: kullanıcı her görevi kendi rengiyle yazar ve renklerin hangi stillere karşılık geldiği listede yazıyor. Aynı renkte birden çok stil varsa yazının büyüklüğüne ve içeriğine göre seç (büyük yazı başlıktır, İngilizce tam cümle örnektir, Türkçe karşılığı çeviridir).
- Terim ve anlamı aynı satırdaysa (ör. "notice : fark etmek", "notice - fark etmek", "notice = fark etmek") tek satır ver: "t" terim, "m" anlamı; "s" terimin stili. Birden çok terim aynı anlamı paylaşıyorsa ayrı satırlar yaz.
- El yazısı okuma hatalarını ve yazım hatalarını (İngilizce ve Türkçe) düzelt; İngilizce cümlelerdeki dil bilgisi hatalarını da düzelt. Anlamı değiştirme, sırayı değiştirme, kullanıcının yazmadığı içerik ekleme (çeviri, örnek, ipucu uydurma).
- Düzelttiğin anlamlı hataları (dil bilgisi, yanlış kelime, yanlış anlam, yanlış çeviri) "fixes" listesine yaz: "wrong" kullanıcının yazdığı (yalnızca ilgili kısım yeterli), "right" doğrusu, "note" kısa Türkçe açıklama (kural, fark, örnek). El yazısı okuma kaynaklı küçük harf hatalarını yazma. Hata yoksa boş liste ver.
- ↳ ★ ✗ ✓ • gibi satır başı işaretlerini yazma; uygulama stile göre ekler. İpucu ve açıklamalarda önemli kısa kısmı **iki yıldız** arasına alabilirsin (az kullan).
- Çizim, şekil, ok, tablo gibi metin olmayan parçalar için metin yazma; ait olduğu yere {"draw": numara} koy.
- Okunamayan kısmı bağlama göre en olası kelimeyle tamamla.
Yalnızca şu biçimde geçerli JSON döndür, başka hiçbir şey yazma:
{"lines":[{"s":2,"t":"Kelime öğrenmek"},{"s":3,"t":"notice","m":"fark etmek, dikkat etmek"},{"s":5,"t":"Notice how words commonly go together."},{"s":6,"t":"Kelimelerin genellikle nasıl birlikte kullanıldığına dikkat et."},{"s":7,"t":"Fiil **pronounce**, isim **pronunciation**."},{"draw":9}],"fixes":[{"wrong":"The software make it possible","right":"The software makes it possible","note":"Özne tekil → fiile -s gelir."}]}`;

/* ---------- stiller ---------- */
function plRole(name, prefix, size) {
  const n = (name || '').toLocaleLowerCase('tr'), p = prefix || '', z = size || 12;
  if (p === '✗' || /hatal|yanlış/.test(n)) return 'wrong';
  if (p === '✓' || /doğru/.test(n)) return 'right';
  if (p === '↳' || /çeviri|türkçe/.test(n)) return 'trans';
  if (p === '★' || /ipucu|dikkat|hatırlat/.test(n)) return 'tip';
  if (/açıklama/.test(n)) return 'note';
  if (/sayfa başlığı|^başlık$/.test(n) || z >= 24) return 'title';
  if (/başlık/.test(n) || z >= 16) return 'section';
  if (/terim|kelime/.test(n)) return 'term';
  if (/anlam/.test(n)) return 'meaning';
  if (/örnek|cümle|ingilizce/.test(n)) return 'example';
  return 'plain';
}
function plStyles() {
  const favs = S.fav.filter(f => f.name && f.text && f.text.size);
  return (favs.length ? favs : STYLE_FAVS).map((f, i) => {
    const prefix = f.text.prefix || '';
    return { n: i + 1, name: f.name, color: (f.color || '#1f2f5c').toLowerCase(), font: f.text.font || 'kalam', wt: f.text.wt || 400, size: f.text.size, prefix, role: plRole(f.name, prefix, f.text.size) };
  });
}
const plByRole = (styles, role) => styles.find(s => s.role === role);
function plColorDist(a, b) { try { const x = hexRgb(a), y = hexRgb(b); return Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); } catch (e) { return 999; } }
function plStylesForColor(c, styles) {
  c = (c || '').toLowerCase();
  const ex = styles.filter(s => s.color === c); if (ex.length) return ex;
  let best = 1e9; for (const s of styles) best = Math.min(best, plColorDist(c, s.color));
  return best < 70 ? styles.filter(s => plColorDist(c, s.color) <= best + 1) : [];
}

/* ---------- sayfadaki parçalar: her el yazısı satırı ayrı (paragraf birleştirme yok) ---------- */
function plBlocks(pv) {
  const A = ann(pv.meta.id);
  const ink = A.s.filter(s => s.t !== 'hl');
  const hs = ink.map(s => { const b = strokeBB(s); return b.y1 - b.y0; }).sort((a, b) => a - b);
  const med = hs.length ? hs[hs.length >> 1] : 14;
  const big = s => { const b = strokeBB(s); return (b.y1 - b.y0) > Math.max(70, med * 3.2) && (b.x1 - b.x0) > Math.max(70, med * 3.2); };
  const blocks = [];
  const small = ink.filter(s => !big(s));
  for (const l of small.length ? splitLines(small) : []) blocks.push({ kind: 'ink', strokes: l.strokes, bb: { ...l.bb }, lineH: l.lineH });
  const groups = [];
  for (const s of ink.filter(big)) {
    const b = strokeBB(s);
    const g = groups.find(g => b.x0 < g.bb.x1 + 12 && b.x1 > g.bb.x0 - 12 && b.y0 < g.bb.y1 + 12 && b.y1 > g.bb.y0 - 12);
    if (g) { g.strokes.push(s); g.bb = bbUnion(g.bb, b); } else groups.push({ kind: 'draw', strokes: [s], bb: { ...b } });
  }
  blocks.push(...groups);
  for (const t of A.t) if (t.text && t.text.trim()) blocks.push({ kind: 'text', t, bb: { x0: t.x, y0: t.y, x1: t.x + (t.w || 20), y1: t.y + (t.h || 20) } });
  blocks.sort((a, b) => (a.bb.y0 - b.bb.y0) || (a.bb.x0 - b.bb.x0));
  blocks.forEach((b, i) => { b.id = i + 1; });
  return blocks;
}
/* satırdaki renkler soldan sağa */
function plInkColors(strokes) {
  const m = new Map();
  for (const s of strokes) { const c = (s.c || '').toLowerCase(), b = strokeBB(s), e = m.get(c) || { x: b.x0, n: 0 }; e.x = Math.min(e.x, b.x0); e.n += (b.x1 - b.x0) + (b.y1 - b.y0); m.set(c, e); }
  return [...m.entries()].filter(([, e]) => e.n > 6).sort((a, b) => a[1].x - b[1].x).map(([c]) => c);
}
function plDescribe(blocks, styles) {
  const sty = c => { const l = plStylesForColor(c, styles); return c + (l.length ? ' (' + l.map(s => s.name).join(' / ') + ')' : ''); };
  return blocks.map(b => {
    if (b.kind === 'draw') return `${b.id}: çizim/şekil`;
    if (b.kind === 'text') { const t = b.t, st = styles.find(s => s.color === (t.color || '').toLowerCase() && Math.abs(s.size - t.size) < .6); return `${b.id}: metin kutusu · ${st ? st.name + ' stili' : sty(t.color)} · «${t.text.replace(/\s+/g, ' ').slice(0, 400)}»`; }
    const cols = plInkColors(b.strokes);
    return `${b.id}: el yazısı satırı · yazı yüksekliği ~${Math.round(b.lineH || (b.bb.y1 - b.bb.y0))} · ${cols.length > 1 ? 'renkler soldan sağa: ' : 'renk: '}${cols.map(sty).join(', ')}`;
  }).join('\n');
}

/* ---------- yapay zekâ ---------- */
const plClean = s => String(s == null ? '' : s).replace(/\r/g, '').replace(/^[\s↳★✗✓✔✘•·]+/, '').replace(/[ \t]+/g, ' ').trim();
async function plRun(pv, opts = {}) {
  const styles = plStyles(), blocks = plBlocks(pv);
  if (!blocks.some(b => b.kind !== 'draw')) { if (!opts.quiet) toast('Bu sayfada düzenlenecek yazı yok', 1800); return null; }
  const job = PF.job = { mode: 'layout', pv, blocks, styles, ver: ed.pageVer.get(pv.meta.id) || 0 };
  const chip = opts.quiet ? null : pfBusyChip('Sayfa okunuyor…');
  try {
    const img = await pfImage(pv, blocks, 1500);
    const sl = styles.map(s => `${s.n} · ${s.name} · ${s.color} · ${FONT_LABEL[s.font] || s.font} ${s.wt >= 700 ? 'Bold ' : s.wt <= 300 ? 'Light ' : ''}${String(s.size).replace('.', ',')}${s.prefix ? ' · başına ' + s.prefix + ' eklenir' : ''}`).join('\n');
    const fixes = S.pageFix.fixes !== false;
    const text = 'Kalem stilleri (s numarası · ad · renk · yazı):\n' + sl + '\n\nSayfadaki parçalar (yukarıdan aşağıya):\n' + plDescribe(blocks, styles) +
      '\n\n' + (fixes ? 'Düzeltme listesi (fixes) isteniyor.' : 'Düzeltme listesi istenmiyor; fixes boş olsun.') + '\n\nJSON:';
    const res = await pfAsk([{ type: 'image', mime: 'image/jpeg', data: img }, { type: 'text', text }], pr => { if (chip) chip.set(pr.name + ' sayfayı düzenliyor…'); }, { system: PL_SYSTEM, check: j => Array.isArray(j.lines), maxTokens: 9000 });
    job.by = res.by; job.notes = res.notes;
    const fallback = plByRole(styles, 'plain') || plByRole(styles, 'example') || styles[0];
    const usedDraw = new Set();
    job.items = res.j.lines.map(x => {
      if (!x || typeof x !== 'object') return null;
      if (x.draw != null) { const b = blocks.find(b => b.id === Number(x.draw)); if (!b || b.kind === 'text' || usedDraw.has(b)) return null; usedDraw.add(b); return { draw: b, on: true }; }
      const st = styles.find(s => s.n === Number(x.s)) || fallback;
      let t = plClean(x.t), m = x.m != null ? plClean(x.m) : '';
      if (!m && st.role === 'term') { const k = t.search(/\s[:=–—-]\s/); if (k > 0) { m = plClean(t.slice(k + 2)); t = t.slice(0, k).trim(); } }
      if (!t && !m) return null;
      const ms = x.ms != null ? (styles.find(s => s.n === Number(x.ms)) || null) : null;
      return { s: st.n, ms: ms ? ms.n : 0, t, m, on: true };
    }).filter(Boolean);
    job.fixes = (fixes && Array.isArray(res.j.fixes) ? res.j.fixes : []).map(f => ({ wrong: plClean(f && f.wrong), right: plClean(f && f.right), note: plClean(f && f.note), on: true })).filter(f => f.wrong || f.right);
    job.showFixes = job.fixes.length > 0;
    if (!job.items.length) throw Object.assign(new Error('Yapay zekâ sayfadan satır çıkaramadı. Yeniden deneyin.'), { code: 'fail' });
    PF.fixedVer.set(pv.meta.id, job.ver);
    return job;
  } catch (e) {
    if (!opts.quiet) { if (e.code === 'nokey') toastAction(e.message, 'Bağla', () => aiSettingsModal()); else toast(e.message, 5200); }
    PF.job = null; return null;
  } finally { if (chip) chip.done(); if (PF.job === job && !job.items) PF.job = null; }
}

/* ---------- yerleşim ---------- */
const PL_INDENT = { title: 0, section: 0, term: 0, plain: 0, meaning: 1, example: 1, tip: 1, trans: 2, note: 2, wrong: 0, right: 0 };
const PL_STEP = [0, 17, 31];
function plGap(prev, role) {
  if (!prev) return 0;
  if (role === 'title') return 18;
  if (role === 'section') return prev === 'title' ? 12 : 17;
  if (prev === 'section') return 1;
  if (prev === 'title') return role === 'plain' ? -3 : 9;
  if (role === 'draw' || prev === 'draw') return 6;
  if (role === 'example' || role === 'trans' || role === 'tip' || role === 'note' || role === 'right' || role === 'meaning') return -3.5;
  if (role === 'wrong') return 5;
  return prev === 'term' ? 3.5 : 4.5;
}
const plFont = (st, wt) => `${wt || st.wt} ${st.size}px ${FONTS[st.font] || FONTS.sans}`;
function plCtx() { if (!plCtx.g) plCtx.g = document.createElement('canvas').getContext('2d'); return plCtx.g; }
function plMeasure(st, s, wt) { const g = plCtx(); g.font = plFont(st, wt); return g.measureText(s).width; }
/* mw: kutunun en geniş hâli (3 + 3 pt iç boşluk dahil) */
function plBox(st, text, x, y, mw, wt) {
  const g = plCtx(); g.font = plFont(st, wt);
  const lines = wrapLines(g, text, Math.max(20, mw - 6));
  const w = Math.ceil(Math.max(...lines.map(l => g.measureText(l).width))) + 6;
  const W = wt || st.wt;
  return { id: uid(), x, y, text, size: st.size, color: st.color, font: st.font, bold: W >= 700, wt: W, w, h: lines.length * st.size * 1.3 + 4, mw: Math.round(mw) };
}
function plSegs(s) { const out = []; s.split(/(\*\*[^*]+\*\*)/).forEach(p => { if (!p) return; const b = /^\*\*[^*]+\*\*$/.test(p); out.push({ text: b ? p.slice(2, -2) : p, b }); }); return out; }
const plPlain = s => s.replace(/\*\*([^*]+)\*\*/g, '$1').replace(/__([^_]+)__/g, '$1');
/* bir satırın kutuları (y = 0'a göre); { role, h, t:[], s:[] } */
function plRowText(st, text, x, R, extra) {
  const role = extra && extra.role || st.role;
  const pre = st.prefix && !text.startsWith(st.prefix) ? st.prefix + ' ' : '';
  const t = [], s = [];
  if (extra && extra.m) {
    const ms = extra.mst, term = plPlain(pre + text), mtext = ': ' + plPlain(extra.m);
    const tw = plMeasure(st, term), sp = plMeasure(st, ' ');
    if (tw < (R - x) * .55) {
      const a = plBox(st, term, x, 0, R - x + 3); const x2 = x + tw + sp; const b = plBox(ms, mtext, x2, (st.size - ms.size) * .9, R - x2 + 3);
      t.push(a, b); return { role, h: Math.max(a.h, b.y + b.h), t, s };
    }
    const a = plBox(st, term, x, 0, R - x + 3), b = plBox(ms, plPlain(extra.m), x + PL_STEP[1], a.h - 3.5, R - x - PL_STEP[1] + 3);
    t.push(a, b); return { role, h: b.y + b.h, t, s };
  }
  const full = pre + text, segs = plSegs(full);
  if (segs.some(g => g.b) && plMeasure(st, plPlain(full)) + segs.filter(g => g.b).length * 2 <= R - x - 3) {
    let cx = x;
    for (const g of segs) {
      const wt = g.b ? Math.max(700, st.wt) : st.wt, lead = (g.text.match(/^\s*/) || [''])[0], core = g.text.trim();
      if (core) t.push(plBox(st, core, cx + plMeasure(st, lead, wt), 0, R - cx + 3, wt));
      cx += plMeasure(st, g.text, wt);
    }
    return { role, h: Math.max(...t.map(b => b.h)), t, s };
  }
  const box = plBox(st, plPlain(full), x, 0, R - x + 3); t.push(box);
  if (role === 'section') {
    // başlığın alt yarısına fosforlu vurgu
    const tw = Math.min(box.w - 6, R - x), cy = 2 + st.size * .15 + st.size * .74, w = st.size * .5, pts = [];
    for (let px = x + 1; px <= x + 5 + tw; px += 3) pts.push(px, cy, w);
    if (pts.length >= 6) s.push({ id: uid(), t: 'hl', c: '#ffd43b', o: .42, p: new Float32Array(pts) });
  }
  return { role, h: box.h, t, s };
}
function plLayout(pv, job) {
  const meta = pv.meta, styles = job.styles;
  const L = meta.bg === 'lined' ? 74 : 50, R = meta.w - 46, TOP = 46, BOT = meta.h - 44;
  const st = n => styles.find(s => s.n === n) || styles[0];
  const meaningSt = plByRole(styles, 'meaning');
  const rows = [];
  for (const it of job.items) {
    if (!it.on) continue;
    if (it.draw) { const b = it.draw.bb; rows.push({ role: 'draw', h: b.y1 - b.y0, draw: it.draw }); continue; }
    const S0 = st(it.s);
    if (it.m && it.t) { rows.push(plRowText(S0, it.t, L + PL_STEP[S0.role === 'meaning' ? 0 : (PL_INDENT[S0.role] || 0)], R, { m: it.m, mst: it.ms ? st(it.ms) : (meaningSt || S0) })); continue; }
    const txt = it.t || it.m, role = S0.role === 'meaning' && !it.t ? 'meaning' : S0.role;
    rows.push(plRowText(S0, txt, L + PL_STEP[PL_INDENT[role] || 0], R));
  }
  if (job.showFixes && job.fixes.some(f => f.on)) {
    const wr = plByRole(styles, 'wrong'), rt = plByRole(styles, 'right'), nt = plByRole(styles, 'note') || plByRole(styles, 'trans') || styles[0];
    const sec = plByRole(styles, 'section') || styles[0];
    rows.push(plRowText({ ...sec, color: wr ? wr.color : '#c0392b' }, 'Kırmızı kalem · düzeltmeler', L, R, { role: 'section' }));
    for (const f of job.fixes) {
      if (!f.on) continue;
      if (f.wrong) rows.push(plRowText(wr || { ...nt, prefix: '✗', color: '#c0392b' }, f.wrong, L + 4, R, { role: 'wrong' }));
      if (f.right) rows.push(plRowText(rt || { ...nt, prefix: '✓', color: '#1b6e3c' }, f.right, L + 4, R, { role: 'right' }));
      if (f.note) rows.push(plRowText(nt, f.note, L + 21, R, { role: 'note' }));
    }
  }
  const pages = [{ t: [], s: [] }];
  let y = TOP, prev = null, top = true;
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], nx = rows[i + 1];
    let ny = top ? TOP : y + plGap(prev, r.role);
    const keep = (r.role === 'section' || r.role === 'title' || r.role === 'term') && nx && nx.role !== r.role ? nx.h + plGap(r.role, nx.role) : 0;
    if (!top && ny + r.h + keep > BOT) { pages.push({ t: [], s: [] }); ny = TOP; }
    const pg = pages[pages.length - 1];
    if (r.draw) { const dy = ny - r.draw.bb.y0; for (const s of r.draw.strokes) pg.s.push(transformStroke(s, [1, 0, 0, 1, 0, dy])); }
    else {
      for (const b of r.t) pg.t.push({ ...b, y: b.y + ny });
      for (const s of r.s) { const p = new Float32Array(s.p); for (let k = 1; k < p.length; k += 3) p[k] += ny; pg.s.push({ ...s, p }); }
    }
    y = ny + r.h; prev = r.role; top = false;
  }
  return { pages, rows: rows.length };
}
/* sayfadan kalkacaklar: el yazısı satırları, metin kutuları, taşınan çizimler ve üzerlerindeki fosforlu kalem */
function plRemovals(job) {
  const A = ann(job.pv.meta.id), moved = new Set(job.items.filter(it => it.draw && it.on).map(it => it.draw));
  const rs = new Set(), rt = new Set(), gone = [];
  for (const b of job.blocks) {
    if (b.kind === 'text') { rt.add(b.t); gone.push(b.bb); }
    else if (b.kind === 'ink' && !(job.items.some(it => it.draw === b && !it.on))) { b.strokes.forEach(s => rs.add(s)); gone.push(b.bb); }
    else if (b.kind === 'draw' && moved.has(b)) { b.strokes.forEach(s => rs.add(s)); gone.push(b.bb); }
  }
  for (const s of A.s) if (s.t === 'hl') {
    const b = strokeBB(s), area = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
    if (gone.some(g => Math.max(0, Math.min(b.x1, g.x1) - Math.max(b.x0, g.x0)) * Math.max(0, Math.min(b.y1, g.y1) - Math.max(b.y0, g.y0)) > area * .3)) rs.add(s);
  }
  return { rs, rt };
}
function plEmpty(pid) { const A = ed.note.ann[pid]; return !A || (!A.s.length && !A.t.length && !(A.i || []).length && !(A.n || []).length); }

/* ---------- uygula ---------- */
function plApply(job) {
  const pv = job.pv; PF.job = null;
  if (!ed.pvs.includes(pv)) return;
  const lay = plLayout(pv, job);
  if (!lay.rows) { toast('Uygulanacak satır yok', 1500); return; }
  const pid = pv.meta.id, A = ann(pid), b0 = snap(pid), { rs, rt } = plRemovals(job), no = ed.pvs.indexOf(pv) + 1;
  A.s = [...A.s.filter(s => !rs.has(s)), ...lay.pages[0].s];
  A.t = [...A.t.filter(t => !rt.has(t)), ...lay.pages[0].t];
  const ops = [{ k: 'page', pid, b: b0, a: snap(pid) }];
  let added = 0, used = 0;
  if (lay.pages.length > 1) {
    const pagesB = ed.note.pages.slice(); let idx = ed.note.pages.findIndex(p => p.id === pid);
    for (const pg of lay.pages.slice(1)) {
      idx++;
      let meta = ed.note.pages[idx];
      if (!(meta && meta.k !== 'pdf' && plEmpty(meta.id))) { meta = { id: uid(), k: 'blank', w: pv.meta.w, h: pv.meta.h, bg: pv.meta.bg }; ed.note.pages.splice(idx, 0, meta); added++; } else used++;
      const NA = ann(meta.id), nb = snap(meta.id); NA.s = [...NA.s, ...pg.s]; NA.t = [...NA.t, ...pg.t];
      ops.push({ k: 'page', pid: meta.id, b: nb, a: snap(meta.id) });
    }
    if (added) { ops.unshift({ k: 'pages', b: pagesB, a: ed.note.pages.slice() }); rebuildAfterPages(); }
  }
  pushOp(ops.length === 1 ? ops[0] : { k: 'multi', ops });
  for (const p of ed.pvs) if (ops.some(o => o.pid === p.meta.id)) renderLayer(p);
  requestFrame(true); refreshPanel && refreshPanel();
  PF.fixedVer.set(pid, ed.pageVer.get(pid) || 0);
  const more = lay.pages.length - 1;
  toast('Sayfa ' + no + ' düzenlendi' + (more ? ' · ' + more + ' sayfaya devam etti' + (added ? ' (' + added + ' yeni sayfa)' : '') : '') + ' · geri almak için ↶', 3000);
  if (!more && window.flowSuggest) flowSuggest(pv);
}

/* ---------- önizleme penceresi ---------- */
async function plPreview(job, box) {
  const pv = job.pv, lay = plLayout(pv, job), A = ann(pv.meta.id), { rs, rt } = plRemovals(job);
  const W = Math.round((box.clientWidth || 360) * Math.min(2, devicePixelRatio || 1));
  const cvs = [];
  const a0 = { s: [...A.s.filter(s => !rs.has(s)), ...lay.pages[0].s], t: [...A.t.filter(t => !rt.has(t)), ...lay.pages[0].t], i: A.i, n: A.n };
  cvs.push(await renderThumb(pv.meta, a0, null, W));
  let idx = ed.pvs.indexOf(pv);
  for (const pg of lay.pages.slice(1)) {
    idx++; const nx = ed.pvs[idx], reuse = nx && nx.meta.k !== 'pdf' && plEmpty(nx.meta.id);
    const c = await renderThumb({ k: 'blank', w: pv.meta.w, h: pv.meta.h, bg: pv.meta.bg }, { s: pg.s, t: pg.t, i: [], n: [] }, null, W);
    c._lab = reuse ? 'Sayfa ' + (idx + 1) + ' (boş sayfa kullanılır)' : 'Yeni sayfa eklenir'; cvs.push(c);
  }
  if (job.previewTok !== box._tok) return;
  box.innerHTML = '';
  cvs.forEach((c, i) => { c.className = 'plpage'; if (i) box.append(h('div', { class: 'plsep' }, c._lab)); box.append(c); });
}
function plOpen(job) {
  pfClose(true);
  PF.job = job;
  const styles = job.styles;
  const body = h('div', { class: 'plbody' });
  let tab = 'preview', tok = 0;
  const applyBtn = h('button', { class: 'btn small primary', type: 'button', onclick: () => { pfClose(); plApply(job); } }, 'Uygula');
  const segBtns = {};
  const show = t => {
    tab = t; Object.entries(segBtns).forEach(([k, b]) => { b.classList.toggle('on', k === t); b.setAttribute('aria-checked', k === t ? 'true' : 'false'); });
    body.innerHTML = ''; body.scrollTop = 0;
    if (t === 'preview') { const pbox = h('div', { class: 'plprev' }, h('i', { class: 'spin' })); body.append(pbox); pbox._tok = job.previewTok = ++tok; requestAnimationFrame(() => plPreview(job, pbox)); }
    else if (t === 'lines') body.append(plLinesList(job, styles));
    else body.append(plFixesList(job));
    applyBtn.disabled = !job.items.some(x => x.on && !x.draw);
  };
  const seg = h('div', { class: 'seg plseg', role: 'radiogroup', 'aria-label': 'Görünüm' });
  const addSeg = (k, label) => { const b = h('button', { type: 'button', role: 'radio', onclick: () => show(k) }, label); segBtns[k] = b; seg.append(b); };
  addSeg('preview', 'Önizleme'); addSeg('lines', 'Satırlar (' + job.items.filter(x => !x.draw).length + ')');
  if (job.fixes.length) addSeg('fixes', 'Düzeltmeler (' + job.fixes.length + ')');
  const by = job.by ? job.by.name + ' · ' + pfModelName(job.by.id, job.by.model) : '';
  const note = job.notes && job.notes.length ? job.notes.join(' · ') + ' → ' + (job.by ? job.by.name : '') + ' kullanıldı.' : '';
  PF.panel = h('section', { class: 'uiwin pfwin plwin', role: 'dialog', 'aria-label': 'Sayfayı düzenle' },
    h('div', { class: 'pfhead' }, h('span', { class: 'ico' }, icon(IC.fixText)), h('div', { class: 'tt' }, h('b', null, 'Sayfa ' + (ed.pvs.indexOf(job.pv) + 1) + ' · düzenlendi'), h('small', null, by)),
      h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: () => pfClose() }, icon(IC.close))),
    note ? h('p', { class: 'notice pfnote' }, note) : null,
    h('div', { class: 'plsegw' }, seg),
    body,
    h('div', { class: 'pffoot' }, h('small', { class: 'plhint' }, 'Sayfadaki yazı bu düzenle değiştirilir'), h('button', { class: 'btn small', type: 'button', onclick: () => pfClose() }, 'Vazgeç'), applyBtn));
  PF.panel.addEventListener('pointerdown', e => e.stopPropagation());
  $('#ui').append(PF.panel);
  show(tab);
}
function plStyleSelect(styles, val, onChange, allowNone) {
  const sel = h('select', { class: 'plsel', 'aria-label': 'Stil' }, allowNone ? h('option', { value: '0' }, 'Anlamı (otomatik)') : null, ...styles.map(s => h('option', { value: String(s.n) }, s.name)));
  sel.value = String(val);
  const paint = () => { const s = styles.find(x => x.n === Number(sel.value)); sel.style.color = s ? s.color : ''; sel.style.borderColor = s ? s.color + '66' : ''; };
  sel.addEventListener('change', () => { paint(); onChange(Number(sel.value)); }); paint();
  return sel;
}
function plTa(value, st, onInput, ph) {
  const ta = h('textarea', { rows: '1', spellcheck: 'false', placeholder: ph || '' }); ta.value = value || '';
  const style = s => { if (!s) return; ta.style.color = s.color; ta.style.fontFamily = FONTS[s.font] || FONTS.sans; ta.style.fontWeight = String(s.wt); };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', () => { onInput(ta.value); grow(); }); style(st); requestAnimationFrame(grow);
  ta._style = style; return ta;
}
function plLinesList(job, styles) {
  const list = h('div', { class: 'pflist pllist' });
  const st = n => styles.find(s => s.n === n) || styles[0];
  for (const it of job.items) {
    if (it.draw) {
      const cb = h('input', { type: 'checkbox', class: 'switch sm', 'aria-label': 'Çizim akışa alınsın' }); cb.checked = it.on; cb.addEventListener('change', () => { it.on = cb.checked; });
      list.append(h('div', { class: 'pfrow pldraw' }, h('div', { class: 'pft' }, h('b', null, 'Çizim'), h('small', null, 'Açıksa yazının arasında yerine taşınır, kapalıysa olduğu yerde kalır')), cb));
      continue;
    }
    const s0 = st(it.s);
    const ta = plTa(it.t, s0, v => { it.t = v; it.on = !!(v.trim() || (it.m || '').trim()); cb.checked = it.on; });
    const mta = it.m != null && it.m !== '' ? plTa(it.m, it.ms ? st(it.ms) : (plByRole(styles, 'meaning') || s0), v => { it.m = v; }, 'Anlamı') : null;
    const sel = plStyleSelect(styles, it.s, n => { it.s = n; ta._style(st(n)); });
    const cb = h('input', { type: 'checkbox', class: 'switch sm', 'aria-label': 'Satır sayfaya yazılsın' }); cb.checked = it.on; cb.addEventListener('change', () => { it.on = cb.checked; row.classList.toggle('same', !it.on); });
    const row = h('div', { class: 'pfrow plrow ind' + (PL_INDENT[s0.role] || 0) + (it.on ? '' : ' same') }, h('div', { class: 'pft' }, sel, ta, mta), cb);
    list.append(row);
  }
  return list;
}
function plFixesList(job) {
  const list = h('div', { class: 'pflist pllist' });
  list.append(toggleRow('plShowFixes', 'Düzeltmeleri sayfanın sonuna yaz', job.showFixes, v => { job.showFixes = v; }, 'Kırmızı kalemle: ✗ yazdığın · ✓ doğrusu · açıklama'));
  for (const f of job.fixes) {
    const w = plTa(f.wrong, { color: '#c0392b', font: 'kalam', wt: 400 }, v => { f.wrong = v; }, '✗ Yazdığın');
    const r = plTa(f.right, { color: '#1b6e3c', font: 'kalam', wt: 400 }, v => { f.right = v; }, '✓ Doğrusu');
    const n = plTa(f.note, { color: '#8e2a20', font: 'kalam', wt: 300 }, v => { f.note = v; }, 'Açıklama');
    const cb = h('input', { type: 'checkbox', class: 'switch sm', 'aria-label': 'Düzeltme listelensin' }); cb.checked = f.on; cb.addEventListener('change', () => { f.on = cb.checked; row.classList.toggle('same', !f.on); });
    const row = h('div', { class: 'pfrow plfix' + (f.on ? '' : ' same') }, h('div', { class: 'pft' }, w, r, n), cb);
    list.append(row);
  }
  return list;
}
