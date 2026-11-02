'use strict';
/* =========================================================
   Sayfayı düzelt: okuma ve yerleşim
   Seçilen her sayfanın görüntüsü yapay zekâya gönderilir. Model sayfadaki yazıları okuyup düzeltir ve okuma
   sırasıyla, yazı yazı geri verir; her yazının görevini de söyler (sayfa başlığı, bölüm başlığı, terim ve anlamı,
   anlamı, örnek cümle, çeviri, ipucu, açıklama, metin). Uygulama her görevi kullanıcının kalem stiline
   (favoriler) eşler ve yazıları nota sırayla dizer: girintiler, aralıklar, "terim : anlamı" aynı satırda iki
   renk, bölüm başlığının altında fosforlu vurgu, sığmayan satırlar sonraki sayfaya.
   Nereye:
   - Yazının yerine: el yazısı ve metin kutuları kalkar, temiz yazı aynı sayfadan başlar. Art arda seçilen not
     sayfaları birlikte akar. PDF sayfalarına dokunulmaz; onların yazısı ardından gelen yeni sayfaya yazılır.
   - Yeni sayfalara: seçilen sayfalar olduğu gibi kalır; temiz yazı son seçilen sayfadan sonra yeni sayfalara.
   - Yalnız çalışma kağıdı: sayfalara dokunulmaz; yalnızca çalışma kağıdı eklenir.
   Düzeltilen hatalar isteğe bağlı olarak sonda kırmızı kalemle listelenir.
   Geliştir (isteğe bağlı): yapay zekâ yazdıklarına örnek cümle ve çeviri ekler, terimleri ayrıntılı anlatır ya da
   kullanıcının kendi isteğini uygular; eklenen satırlar kenarda mor çizgiyle işaretlenir. Çalışma kağıdı: okunan
   yazılardan alıştırmalar hazırlanır, son sayfadan sonra yeni sayfalara yazılır; cevap anahtarı ayrı sayfadadır.
   ========================================================= */
const PL_SYSTEM = `Sen bir not alma uygulamasında el yazısıyla tutulmuş not sayfalarını temize çeken yardımcısın.
Sana bir sayfanın görüntüsü verilecek. Görevin: sayfadaki yazıları okumak, düzeltmek ve okuma sırasıyla, yazı yazı geri vermek. Her yazının görevini de sen belirlersin; uygulama yazıları bu görevlere göre kullanıcının kalem stilleriyle nota sırayla yazar.
Görevler ("r"):
  baslik   sayfanın ana başlığı
  bolum    bölüm ya da konu başlığı
  terim    öğrenilen kelime ya da kalıp; anlamı aynı satırdaysa "m" alanına yaz
  anlam    terimin anlamı (ayrı satırda yazılmışsa)
  ornek    örnek cümle (genellikle İngilizce)
  ceviri   örneğin ya da terimin çevirisi (genellikle Türkçe)
  ipucu    ipucu, kural, dikkat notu
  aciklama kısa açıklama ya da ek bilgi
  metin    bunların hiçbiri olmayan düz yazı
Kurallar:
- Yazıları sayfadaki sırayla ver (yukarıdan aşağıya; aynı satırda soldan sağa). Sırayı değiştirme, hiçbir yazıyı atlama.
- Birbirine yakın yazılmış satırlar tek cümle DEĞİLDİR: her satırın görevine bak; terim, anlamı, örnek, çeviri, ipucu ayrı öğelerdir. Bir cümleyi yalnızca gerçekten alt satıra taşmışsa (aynı renk, cümle bitmemiş) birleştir.
- Görevi belirlerken mürekkep rengine ve yazının büyüklüğüne de bak: kullanıcı her görevi genellikle kendi rengiyle yazar (renkleri aşağıda). Büyük yazı başlıktır; İngilizce tam cümle örnektir; altındaki Türkçe karşılığı çeviridir.
- "terim : anlamı", "terim - anlamı", "terim = anlamı" biçimindeki satır tek öğedir: {"r":"terim","t":"terim","m":"anlamı"}. Birden çok terim aynı anlamı paylaşıyorsa ayrı öğeler yaz.
- El yazısı okuma hatalarını, yazım hatalarını (İngilizce ve Türkçe) ve İngilizce cümlelerdeki dil bilgisi hatalarını düzelt. Anlamı değiştirme; geliştirme istenmedikçe kullanıcının yazmadığı içerik ekleme (çeviri, örnek, ipucu uydurma).
- Geliştirme istenirse (isteğin ayrıntısı sayfa bilgisinde yazar) kendi eklediğin her öğeye "ek":1 yaz ve onu ait olduğu yazının hemen ardına koy. Kullanıcının yazdıkları "ek" almaz.
- Düzelttiğin anlamlı hataları (dil bilgisi, yanlış kelime, yanlış anlam, yanlış çeviri) "fixes" listesine yaz: "wrong" kullanıcının yazdığı (yalnızca ilgili kısım), "right" doğrusu, "note" kısa Türkçe açıklama (kural, fark). El yazısı okuma kaynaklı küçük harf hatalarını yazma. Hata yoksa boş liste ver.
- ↳ ★ ✗ ✓ • gibi satır başı işaretlerini yazma; uygulama görevine göre ekler. İpucu ve açıklamalarda önemli kısa kısmı **iki yıldız** arasına alabilirsin (az kullan).
- Kırmızı çerçeveli ve "Ç" numaralı parçalar çizimdir (şekil, ok, tablo): metin yazma, ait olduğu yere {"draw": numara} koy.
- Okunamayan kısmı bağlama göre en olası kelimeyle tamamla.
Yalnızca şu biçimde geçerli JSON döndür, başka hiçbir şey yazma:
{"items":[{"r":"bolum","t":"Kelime öğrenmek"},{"r":"terim","t":"notice","m":"fark etmek, dikkat etmek"},{"r":"ornek","t":"Notice how words commonly go together."},{"r":"ceviri","t":"Kelimelerin genellikle nasıl birlikte kullanıldığına dikkat et."},{"r":"ipucu","t":"Fiil **pronounce**, isim **pronunciation**."},{"draw":1}],"fixes":[{"wrong":"The software make it possible","right":"The software makes it possible","note":"Özne tekil → fiile -s gelir."}]}`;

/* ---------- görevler ---------- */
const PL_ROLES = [['title', 'Sayfa başlığı', 'baslik'], ['section', 'Bölüm başlığı', 'bolum'], ['term', 'Terim', 'terim'], ['meaning', 'Anlamı', 'anlam'], ['example', 'Örnek cümle', 'ornek'],
  ['trans', 'Çeviri', 'ceviri'], ['tip', 'İpucu', 'ipucu'], ['note', 'Açıklama', 'aciklama'], ['plain', 'Metin', 'metin']];
const PL_ROLE_ALIAS = { sayfabasligi: 'title', anabaslik: 'title', title: 'title', heading: 'title', bolumbasligi: 'section', altbaslik: 'section', konu: 'section', section: 'section', subtitle: 'section', subheading: 'section',
  kelime: 'term', kalip: 'term', term: 'term', word: 'term', anlami: 'meaning', meaning: 'meaning', definition: 'meaning', ornekcumle: 'example', cumle: 'example', example: 'example', sentence: 'example',
  turkce: 'trans', translation: 'trans', dikkat: 'tip', kural: 'tip', tip: 'tip', hint: 'tip', not: 'note', note: 'note', duz: 'plain', normal: 'plain', text: 'plain', madde: 'plain', plain: 'plain' };
const plAscii = s => String(s || '').toLocaleLowerCase('tr').replace(/[çğıöşüâîû]/g, c => ({ ç: 'c', ğ: 'g', ı: 'i', ö: 'o', ş: 's', ü: 'u', â: 'a', î: 'i', û: 'u' })[c]).replace(/[^a-z]/g, '');
function plRoleOf(v) { const k = plAscii(v); const r = PL_ROLES.find(x => x[2] === k || x[0] === k); return r ? r[0] : PL_ROLE_ALIAS[k] || 'plain'; }
const plRoleName = r => (PL_ROLES.find(x => x[0] === r) || [0, r])[1];

/* ---------- kalem stilleri: görev → stil ---------- */
function plRole(name, prefix, size) {
  const n = (name || '').toLocaleLowerCase('tr'), p = prefix || '', z = size || 12;
  if (p === '✗' || /hatal|yanlış/.test(n)) return 'wrong';
  if (p === '✓' || /doğru/.test(n)) return 'right';
  if (/düzeltme/.test(n)) return 'fixnote';
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
function plStyleOf(f) { const prefix = f.text.prefix || ''; return { name: f.name, color: (f.color || '#1f2f5c').toLowerCase(), font: f.text.font || 'kalam', wt: f.text.wt || 400, size: f.text.size, prefix, role: plRole(f.name, prefix, f.text.size) }; }
function plStyleMap() {
  const user = S.fav.filter(f => f.name && f.text && f.text.size).map(plStyleOf), base = STYLE_FAVS.map(plStyleOf);
  const M = {};
  for (const r of [...PL_ROLES.map(x => x[0]), 'wrong', 'right', 'fixnote']) { const s = user.find(x => x.role === r) || base.find(x => x.role === r); if (s) M[r] = { ...s }; }
  const fb = { title: ['section'], section: ['title'], term: ['example'], meaning: ['term'], example: ['meaning'], trans: ['meaning', 'example'], tip: ['trans'], note: ['tip', 'trans'], plain: ['example', 'meaning', 'term'] };
  for (const r in fb) if (!M[r]) { const s = fb[r].map(x => M[x]).find(Boolean); if (s) M[r] = { ...s, prefix: '', borrowed: true }; }
  for (const [r, lab] of PL_ROLES) if (!M[r]) M[r] = { name: lab, color: '#1f2f5c', font: 'kalam', wt: 400, size: 12.5, prefix: '' };
  for (const [r] of PL_ROLES) M[r].role = r;
  // çalışma kağıdı: sorular Metin, şıklar Anlamı, yönergeler Açıklama stiliyle
  M.q = { ...M.plain, prefix: '', role: 'q' }; M.opt = { ...M.meaning, prefix: '', role: 'opt' }; M.ins = { ...M.note, prefix: '', role: 'ins' };
  return M;
}
/* yaklaşık renk adı (yapay zekâya renk alışkanlığını anlatmak için) */
function plColorName(hex) {
  let rgb; try { rgb = hexRgb(hex); } catch (e) { return ''; }
  const [R, G, B] = rgb.map(v => v / 255), mx = Math.max(R, G, B), mn = Math.min(R, G, B), l = (mx + mn) / 2, d = mx - mn;
  if (d < .07) return l < .22 ? 'siyah' : l > .85 ? 'beyaz' : 'gri';
  const s = d / (1 - Math.abs(2 * l - 1));
  let hu = mx === R ? ((G - B) / d) % 6 : mx === G ? (B - R) / d + 2 : (R - G) / d + 4; hu = (hu * 60 + 360) % 360;
  const dark = l < .3;
  const nm = hu < 15 || hu >= 345 ? (dark ? 'bordo' : 'kırmızı') : hu < 40 ? (l < .4 ? 'kahverengi' : 'turuncu') : hu < 65 ? 'sarı' : hu < 160 ? (dark ? 'koyu yeşil' : 'yeşil') : hu < 195 ? 'turkuaz' : hu < 250 ? (dark ? 'lacivert' : 'mavi') : hu < 290 ? 'mor' : 'pembe';
  return s < .2 ? 'grimsi ' + nm : nm;
}
function plLegend(M) {
  const by = new Map();
  for (const [r, lab] of PL_ROLES) { const s = M[r]; if (!s || s.borrowed || r === 'plain') continue; if (!by.has(s.color)) by.set(s.color, []); by.get(s.color).push(lab + (s.size >= 16 ? ' (büyük yazı)' : '')); }
  return [...by.entries()].map(([c, l]) => '- ' + c + ' ' + plColorName(c) + ': ' + l.join(', ')).join('\n');
}

/* ---------- sayfa: çizimler ve görüntü ---------- */
function plDraws(pv) {
  const ink = ann(pv.meta.id).s.filter(s => s.t !== 'hl');
  const hs = ink.map(s => { const b = strokeBB(s); return b.y1 - b.y0; }).sort((a, b) => a - b);
  const med = hs.length ? hs[hs.length >> 1] : 14;
  const big = s => { const b = strokeBB(s); return (b.y1 - b.y0) > Math.max(70, med * 3.2) && (b.x1 - b.x0) > Math.max(70, med * 3.2); };
  const groups = [];
  for (const s of ink.filter(big)) {
    const b = strokeBB(s);
    const g = groups.find(g => b.x0 < g.bb.x1 + 12 && b.x1 > g.bb.x0 - 12 && b.y0 < g.bb.y1 + 12 && b.y1 > g.bb.y0 - 12);
    if (g) { g.strokes.push(s); g.bb = bbUnion(g.bb, b); } else groups.push({ strokes: [s], bb: { ...b } });
  }
  groups.sort((a, b) => (a.bb.y0 - b.bb.y0) || (a.bb.x0 - b.bb.x0));
  groups.forEach((g, i) => { g.id = i + 1; });
  return groups;
}
async function plImage(pv, draws, width = 1500) {
  const c = await renderThumb(pv.meta, ann(pv.meta.id), ed.pdf, width);
  if (draws.length) {
    const s = c.width / pv.meta.w, g = c.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0); g.font = 'bold 22px Onest, Arial, sans-serif'; g.textBaseline = 'middle';
    for (const d of draws) {
      const x = d.bb.x0 * s - 5, y = d.bb.y0 * s - 5, w = (d.bb.x1 - d.bb.x0) * s + 10, hh = (d.bb.y1 - d.bb.y0) * s + 10;
      g.strokeStyle = 'rgba(220,38,38,.9)'; g.lineWidth = 2; g.strokeRect(x, y, w, hh);
      const lab = 'Ç' + d.id, tw = g.measureText(lab).width + 12, lx = x - tw - 3 >= 0 ? x - tw - 3 : x, ly = x - tw - 3 >= 0 ? y : Math.max(0, y - 28);
      g.fillStyle = '#dc2626'; g.fillRect(lx, ly, tw, 26); g.fillStyle = '#fff'; g.fillText(lab, lx + 6, ly + 13);
    }
  }
  return c.toDataURL('image/jpeg', .86).split(',')[1];
}
function plPageText(job, pg) {
  const L = ['Belgenin ' + (ed.pvs.indexOf(pg.pv) + 1) + '. sayfası.'];
  L.push(pg.kind === 'pdf'
    ? (pg.own ? 'Bu basılı bir PDF sayfası ve üzerinde kullanıcının notları var: yalnızca kullanıcının el yazısı notlarını ve metin kutularını al; basılı metni yalnızca okumayı kolaylaştıran bağlam olarak kullan.' : 'Bu bir PDF sayfası (taranmış ya da basılı). Sayfadaki yazıların hepsini al.')
    : 'Bu kullanıcının not sayfası: kalemle yazdıkları ve daha önce metne çevrilmiş metin kutuları var.');
  L.push('Kullanıcının mürekkep renkleri ve hangi görevde kullandığı:\n' + plLegend(job.map));
  if (pg.draws.length) L.push('Çizimler: ' + pg.draws.map(d => 'Ç' + d.id).join(', ') + ' (kırmızı çerçeveli). Ait oldukları yere {"draw": numara} koy.');
  L.push(job.wantFixes ? 'Düzeltme listesi (fixes) isteniyor.' : 'Düzeltme listesi istenmiyor; fixes boş olsun.');
  const b = job.enrich ? plBoostText(job.boost) : '';
  L.push(b || 'Geliştirme istenmiyor: yalnızca sayfada yazanları ver.');
  return L.join('\n\n') + '\n\nJSON:';
}
/* geliştirme isteği (örnek cümle, kelimeleri anlat, kullanıcının kendi isteği) */
function plBoostText(b) {
  const L = [];
  if (b.ex) L.push('- Örnek cümle: her terim (kelime, kalıp, kavram) için 1-2 yeni, doğal, günlük hayattan örnek cümle (ornek) ve her birinin hemen altına Türkçe çevirisi (ceviri). Kullanıcının zaten yazdığı örnekleri tekrarlama.');
  if (b.explain) L.push('- Kelimeleri anlat: her terimi biraz daha ayrıntılı anlat; terim başına 1-3 kısa öğe (aciklama ya da ipucu): sözcük türü ve okunuşu (örn. "fiil · /ˈnəʊtɪs/"), başka anlamları ve kullanımı, sık birlikte kullanıldığı kelimeler, eş ve zıt anlamlıları, sık yapılan hata ya da karıştırılan kelime. Kısa ve öğretici yaz; yalnızca o terim için gerçekten yararlı olanları ekle.');
  if (b.ask) L.push('- Kullanıcının isteği: "' + b.ask + '" (yalnızca sayfadaki yazılarla ilgili kısmını uygula; çalışma kağıdıyla ilgili bir istekse burada yok say).');
  if (!L.length) return '';
  return 'GELİŞTİRME İSTENİYOR. Kullanıcının yazdıklarını kurallara göre düzeltilmiş olarak ver; ayrıca şunları ekle ve eklediğin her öğeye "ek":1 yaz:\n' + L.join('\n') +
    '\nEklenenler de yukarıdaki görevleri kullanır. Sayfada terim yoksa (düz konu notu) konuyu anlamaya yardım edecek kısa açıklama ve örnekler ekle. Sayfa başına en çok 60 eklenen öğe.';
}

/* ---------- okuma ---------- */
const plClean = s => String(s == null ? '' : s).replace(/\r/g, '').replace(/^[\s↳★✗✓✔✘•·]+/, '').replace(/[ \t]+/g, ' ').trim();
/* boost: { ex, explain, sheet, ask, answers, mark } ya da null (yalnız düzelt) */
function plNewJob(pvs, dest, boost) {
  const b = boost || {}, ask = String(b.ask || '').trim().slice(0, 400);
  const sheet = !!b.sheet, d = dest === 'new' ? 'new' : dest === 'none' && sheet ? 'none' : 'replace';
  const fixes = S.pageFix.fixes !== false && d !== 'none';
  return { mode: 'pages', dest: d, map: plStyleMap(), wantFixes: fixes, showFixes: fixes,
    boost: { ex: !!b.ex, explain: !!b.explain, ask }, enrich: d !== 'none' && !!(b.ex || b.explain || ask), mark: b.mark !== false, showAdded: true,
    sheet: sheet ? { items: null, answers: [], title: '', err: null, reading: false, tk: 0, answersOn: b.answers !== false, ask } : null,
    pages: pvs.map(pv => ({ pv, kind: pv.meta.k === 'pdf' ? 'pdf' : 'note', own: pfHasWriting(pv), items: null, fixes: [], err: null, draws: [], strokes: new Set(), texts: new Set(), tk: 0 })) };
}
async function plReadPage(job, pg, onStep) {
  const tk = ++pg.tk; pg.reading = true; pg.err = null;
  try {
    const pv = pg.pv, A = ann(pv.meta.id);
    const draws = pg.kind === 'note' ? plDraws(pv) : [];
    const strokes = new Set(A.s.filter(s => s.t !== 'hl')), texts = new Set(A.t.filter(t => t.text && t.text.trim()));
    const ver = ed.pageVer.get(pv.meta.id) || 0;
    const img = await plImage(pv, draws);
    pg.draws = draws;
    const res = await pfAsk([{ type: 'image', mime: 'image/jpeg', data: img }, { type: 'text', text: plPageText(job, pg) }], onStep,
      { system: PL_SYSTEM, check: j => Array.isArray(j.items) || Array.isArray(j.lines), maxTokens: job.enrich ? 16000 : 9000, salvage: true });
    if (pg.tk !== tk) return false;
    const used = new Set();
    const items = (res.j.items || res.j.lines).map(x => {
      if (typeof x === 'string') return x.trim() ? { r: 'plain', t: plClean(x), m: '', on: true, pg } : null;
      if (!x || typeof x !== 'object') return null;
      if (x.draw != null) { const n = Number(String(x.draw).replace(/\D/g, '')), d = draws.find(d => d.id === n); if (!d || used.has(d)) return null; used.add(d); return { draw: d, on: true, pg }; }
      let r = plRoleOf(x.r || x.role || x.type), t = plClean(x.t != null ? x.t : x.text), m = plClean(x.m != null ? x.m : x.meaning);
      if (!t && m) { t = m; m = ''; if (r === 'term') r = 'meaning'; }
      if (!m && r === 'term') { const k = t.search(/\s[:=–—-]\s/); if (k > 0) { m = plClean(t.slice(k + 2)); t = t.slice(0, k).trim(); } }
      if (m && r !== 'term') r = 'term';
      const ek = !!x.ek && x.ek !== '0' && x.ek !== 'false';
      return t ? { r, t, m, on: true, pg, ek } : null;
    }).filter(Boolean);
    if (!items.some(it => !it.draw)) throw Object.assign(new Error('Sayfada yazı bulunamadı'), { code: 'empty' });
    Object.assign(pg, { by: res.by, notes: res.notes, items, strokes, texts, ver,
      fixes: (job.wantFixes && Array.isArray(res.j.fixes) ? res.j.fixes : []).map(f => ({ wrong: plClean(f && f.wrong), right: plClean(f && f.right), note: plClean(f && f.note), on: true, pg })).filter(f => f.wrong || f.right) });
    PF.fixedVer.set(pv.meta.id, ver);
    return true;
  } catch (e) {
    if (pg.tk !== tk) return false;
    throw e;
  } finally { if (pg.tk === tk) pg.reading = false; }
}
/* sayfalar sırayla, aynı anda en çok PF_PAR istek */
async function plReadAll(job, pages, onProgress) {
  let next = 0, done = 0;
  const work = async () => {
    while (next < pages.length && !job.stop) {
      const pg = pages[next++];
      try { await plReadPage(job, pg, pr => onProgress(done, pr)); }
      catch (e) { pg.err = e; pg.items = null; if (e.code === 'nokey' || e.code === 'offline') { job.fatal = e; job.stop = true; } }
      done++; onProgress(done);
    }
  };
  job.stopP = new Promise(res => { job.stopRes = res; });
  await Promise.race([Promise.all(Array.from({ length: Math.min(PF_PAR, pages.length) }, work)), job.stopP]);
}
function plStop(job) {
  job.stop = true; job.stopped = true;
  for (const pg of job.pages) if (pg.reading) { pg.tk++; pg.reading = false; }
  if (job.sheet && job.sheet.reading) { job.sheet.tk++; job.sheet.reading = false; }
  if (job.stopRes) job.stopRes();
}

/* ---------- çalışma kağıdı ---------- */
const PL_SHEET_SYSTEM = `Sen bir öğretmensin. Kullanıcının çalışma notlarından, tablette kalemle çözeceği bir çalışma kağıdı hazırlarsın.
Kurallar:
- Notlardaki terimlerin ve konuların hepsini kullan. Sorular notların dilinde olsun (İngilizce kelimeler için İngilizce cümleler); bölüm başlıkları ve yönergeler Türkçe.
- Notlara uygun 3-5 farklı alıştırma türü seç: boşluk doldurma (boşluk "______"), eşleştirme (terimler numaralı; anlamları harfli ve karışık sırada, ayrı satırlarda), çeviri (Türkçeden İngilizceye ve tersi), cümle kurma, doğru/yanlış, çoktan seçmeli (şıklar aynı satırda: "a) … b) … c) …").
- Her alıştırma: bölüm başlığı ("A. Boşlukları doldurun"), gerekiyorsa tek satır yönerge, sonra numaralı sorular. Numaralar her bölümde 1'den başlar.
- Cevabı kalemle uzun yazılacak sorulardan sonra (çeviri, cümle kurma) yazma yeri bırak: {"r":"bosluk","n":satır sayısı (1-3)}. Boşluk doldurma, eşleştirme ve çoktan seçmelide yazma yeri gerekmez.
- Toplam 15-30 soru; zorluk notlardaki seviyeye uygun olsun. Sorular notları ezberletmek yerine kullanmayı öğretsin.
- Cevap anahtarı istenirse "answers" içinde ver: her alıştırma için bölüm başlığı ve numaralı kısa cevaplar (aynı satırda birden çok cevap: "1. notice · 2. avoid").
- Önemli kısa kısmı **iki yıldız** arasına alabilirsin (az kullan). Satır başına ★ • gibi işaret koyma.
Görevler ("r"): baslik (kağıdın başlığı, en fazla bir tane), bolum (alıştırma başlığı), yonerge (kısa yönerge), soru (numaralı soru), secenek (soruya ait şıklar ya da eşleştirmenin harfli satırları), bosluk (yazma yeri), metin (diğer).
Yalnızca şu biçimde geçerli JSON döndür, başka hiçbir şey yazma:
{"title":"Çalışma kağıdı · Word formation","items":[{"r":"bolum","t":"A. Boşlukları doldurun"},{"r":"yonerge","t":"Kelimeler: notice, pronounce, avoid"},{"r":"soru","t":"1. Did you ______ the new sign on the door?"},{"r":"bolum","t":"B. Türkçeye çevirin"},{"r":"soru","t":"1. She noticed the mistake immediately."},{"r":"bosluk","n":1}],"answers":[{"r":"bolum","t":"A. Boşlukları doldurun"},{"r":"metin","t":"1. notice · 2. avoid · 3. pronounce"},{"r":"bolum","t":"B. Türkçeye çevirin"},{"r":"metin","t":"1. Hatayı hemen fark etti."}]}`;
const PL_SHEET_ROLE = { baslik: 'title', title: 'title', bolum: 'section', section: 'section', alistirma: 'section', yonerge: 'ins', talimat: 'ins', instruction: 'ins', soru: 'q', question: 'q',
  secenek: 'opt', sik: 'opt', siklar: 'opt', option: 'opt', options: 'opt', bosluk: 'gap', yazmayeri: 'gap', gap: 'gap', blank: 'gap', metin: 'plain', cevap: 'plain', answer: 'plain', text: 'plain' };
const PL_SHEET_ROLES = [['title', 'Başlık'], ['section', 'Bölüm'], ['ins', 'Yönerge'], ['q', 'Soru'], ['opt', 'Şık'], ['gap', 'Yazma yeri'], ['plain', 'Metin']];
function plSheetItem(x) {
  if (typeof x === 'string') return x.trim() ? { r: 'plain', t: plClean(x), on: true } : null;
  if (!x || typeof x !== 'object') return null;
  const r = PL_SHEET_ROLE[plAscii(x.r || x.role || x.type)] || 'plain';
  if (r === 'gap') return { r, n: Math.max(1, Math.min(4, Math.round(Number(x.n || x.lines || 1)) || 1)), t: '', on: true };
  const t = plClean(x.t != null ? x.t : x.text);
  return t ? { r, t, on: true } : null;
}
function plSheetText(job) {
  const L = ['Kullanıcının notları (görev: yazı):'];
  for (const pg of job.pages) if (pg.items) for (const it of pg.items) if (it.on && !it.draw && (it.t || it.m)) L.push(plRoleName(it.r) + ': ' + plPlain(it.t || '') + (it.m ? ' = ' + plPlain(it.m) : ''));
  if (job.sheet.ask) L.push('', 'Kullanıcının isteği: "' + job.sheet.ask + '" (yalnızca çalışma kağıdıyla ilgili kısmını uygula).');
  L.push('', job.sheet.answersOn ? 'Cevap anahtarı isteniyor.' : 'Cevap anahtarı istenmiyor; answers boş olsun.');
  return L.join('\n') + '\n\nJSON:';
}
async function plSheetRead(job, onStep) {
  const sh = job.sheet; if (!sh) return false;
  const tk = ++sh.tk; sh.reading = true; sh.err = null;
  try {
    if (!job.pages.some(pg => pg.items && pg.items.some(it => it.on && !it.draw))) throw new Error('Çalışma kağıdı için okunan yazı yok');
    const res = await pfAsk([{ type: 'text', text: plSheetText(job) }], onStep, { system: PL_SHEET_SYSTEM, check: j => Array.isArray(j.items), maxTokens: 12000, salvage: true });
    if (sh.tk !== tk) return false;
    const items = res.j.items.map(plSheetItem).filter(Boolean);
    if (!items.some(it => it.r !== 'gap' && it.r !== 'title')) throw new Error('Çalışma kağıdı boş geldi');
    const title = plClean(res.j.title) || (items.find(it => it.r === 'title') || {}).t || 'Çalışma kağıdı';
    const body = items.filter(it => it.r !== 'title');
    Object.assign(sh, { title, items: [{ r: 'title', t: title, on: true }, ...body], by: res.by, notes: res.notes,
      answers: (Array.isArray(res.j.answers) ? res.j.answers : []).map(plSheetItem).filter(it => it && it.r !== 'gap' && it.r !== 'title') });
    return true;
  } catch (e) {
    if (sh.tk !== tk) return false;
    sh.err = e; sh.items = null; return false;
  } finally { if (sh.tk === tk) sh.reading = false; }
}

/* ---------- yerleşim ---------- */
const PL_INDENT = { title: 0, section: 0, term: 0, plain: 0, meaning: 1, example: 1, tip: 1, trans: 2, note: 2, wrong: 0, right: 0, q: 0, opt: 1, ins: 0, gap: 0 };
const PL_STEP = [0, 17, 31];
const PL_LINE = 28, PL_MARK = '#8b5cf6';
function plGap(prev, role) {
  if (!prev) return 0;
  if (role === 'title') return 18;
  if (role === 'section') return prev === 'title' ? 12 : 17;
  if (role === 'gap') return 0;
  if (role === 'q') return prev === 'section' ? 3 : prev === 'ins' ? 5 : 8;
  if (role === 'opt') return prev === 'opt' ? -3 : -1.5;
  if (role === 'ins') return prev === 'section' ? 0 : 3;
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
/* düz çizgi darbesi (yazma yeri satırı, eklenenler için kenar işareti) */
function plLineStroke(x0, y0, x1, y1, w, c, o) {
  const n = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 5)), p = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { const k = i / (n - 1); p[3 * i] = x0 + (x1 - x0) * k; p[3 * i + 1] = y0 + (y1 - y0) * k; p[3 * i + 2] = w; }
  return { id: uid(), t: 'ballpoint', c, o, p };
}
const plSticky = (a, b) => !!(a && b && b.role !== a.role && (a.role === 'section' || a.role === 'title' || a.role === 'term' || a.role === 'ins' || (a.role === 'q' && (b.role === 'opt' || b.role === 'gap'))));
/* o.mark: yapay zekânın eklediği satırlar kenarda mor çizgiyle işaretlenir */
function plLayout(meta, items, M, fixes, o = {}) {
  const L = meta.bg === 'lined' ? 74 : 50, R = meta.w - 46, TOP = 46, BOT = meta.h - 44;
  const ruled = meta.bg === 'lined' || meta.bg === 'grid';
  const rows = [];
  for (const it of items) {
    if (!it.on) continue;
    if (it.draw) { const b = it.draw.bb; rows.push({ role: 'draw', h: b.y1 - b.y0, draw: it.draw }); continue; }
    if (it.r === 'gap') { const n = it.n || 1; rows.push({ role: 'gap', h: n * PL_LINE, n }); continue; }
    const r = M[it.r] ? it.r : 'plain', st = M[r], x = L + PL_STEP[PL_INDENT[r] || 0];
    let row = null;
    if (it.m && it.t) row = plRowText(st, it.t, x, R, { role: r, m: it.m, mst: M.meaning || st });
    else if (it.t || it.m) row = plRowText(st, it.t || it.m, x, R, { role: r });
    if (row) { row.ek = !!it.ek; rows.push(row); }
  }
  if (fixes && fixes.some(f => f.on)) {
    const wr = M.wrong, rt = M.right, nt = M.fixnote || M.note, sec = M.section;
    rows.push(plRowText({ ...sec, color: wr ? wr.color : '#c0392b' }, 'Kırmızı kalem · düzeltmeler', L, R, { role: 'section' }));
    for (const f of fixes) {
      if (!f.on) continue;
      if (f.wrong) rows.push(plRowText(wr || { ...nt, prefix: '✗', color: '#c0392b' }, f.wrong, L + 4, R, { role: 'wrong' }));
      if (f.right) rows.push(plRowText(rt || { ...nt, prefix: '✓', color: '#1b6e3c' }, f.right, L + 4, R, { role: 'right' }));
      if (f.note) rows.push(plRowText(nt, f.note, L + 21, R, { role: 'note' }));
    }
  }
  const pages = [];
  let y = TOP, prev = null, top = true;
  if (rows.length) pages.push({ t: [], s: [] });
  for (let i = 0; i < rows.length; i++) {
    const r = rows[i], nx = rows[i + 1];
    let ny = top ? TOP : y + plGap(prev, r.role);
    // başlık, terim, yönerge ve soru ardındakiyle aynı sayfada kalır (zincir: başlık → soru → yazma yeri)
    let keep = 0;
    for (let j = i, n = 0; n < 3 && plSticky(rows[j], rows[j + 1]); j++, n++) keep += rows[j + 1].h + plGap(rows[j].role, rows[j + 1].role);
    if (!top && ny + r.h + keep > BOT) { pages.push({ t: [], s: [] }); ny = TOP; }
    const pg = pages[pages.length - 1];
    if (r.draw) { const dy = ny - r.draw.bb.y0; for (const s of r.draw.strokes) pg.s.push(transformStroke(s, [1, 0, 0, 1, 0, dy])); }
    else if (r.role === 'gap') { if (!ruled) for (let k = 1; k <= r.n; k++) { const ly = ny + k * PL_LINE - 6; pg.s.push(plLineStroke(L + PL_STEP[1], ly, R, ly, .7, '#c3cad6', 1)); } }
    else {
      for (const b of r.t) pg.t.push({ ...b, y: b.y + ny });
      for (const s of r.s) { const p = new Float32Array(s.p); for (let k = 1; k < p.length; k += 3) p[k] += ny; pg.s.push({ ...s, p }); }
      if (r.ek && o.mark) pg.s.push(plLineStroke(L - 5, ny + 3, L - 5, ny + Math.max(6, r.h - 2), 2.2, PL_MARK, .7));
    }
    y = ny + r.h; prev = r.role; top = false;
  }
  return { pages, rows: rows.length };
}

/* ---------- plan: hangi yazı hangi sayfaya ---------- */
function plEmpty(pid) { const A = ed.note.ann[pid]; return !A || (!A.s.length && !A.t.length && !(A.i || []).length && !(A.n || []).length); }
/* sayfa listesi yeniden kurulduysa (sayfa eklendi/silindi) sayfa nesnelerini kimlikten tazele */
function plFresh(job) { for (const pg of job.pages) { const p = pvById(pg.pv.meta.id); if (p) pg.pv = p; } }
const plActive = job => { plFresh(job); return job.pages.filter(pg => ed.pvs.includes(pg.pv) && pg.items && pg.items.some(it => it.on && !it.draw)); };
function plRefMeta(pv) {
  if (pv && pv.meta.k !== 'pdf') return pv.meta;
  const n = ed.note.pages.find(p => p.k !== 'pdf'); if (n) return n;
  const portrait = !pv || pv.meta.w <= pv.meta.h;
  return { w: portrait ? 595 : 842, h: portrait ? 842 : 595, bg: 'lined' };
}
function plPlan(job) {
  const idx = pg => ed.pvs.indexOf(pg.pv);
  const act = plActive(job).sort((a, b) => idx(a) - idx(b));
  const selIds = new Set(act.map(pg => pg.pv.meta.id)), claimed = new Set(), groups = [];
  if (job.dest === 'none') return [];
  if (job.dest === 'new') { if (act.length) groups.push({ kind: 'new', pages: act }); }
  else for (const pg of act) {
    const g = groups[groups.length - 1];
    if (g && g.kind === pg.kind && idx(pg) === idx(g.pages[g.pages.length - 1]) + 1) g.pages.push(pg); else groups.push({ kind: pg.kind, pages: [pg] });
  }
  return groups.map(g => {
    const clear = g.kind === 'note', last = g.pages[g.pages.length - 1].pv;
    const base = clear ? g.pages[0].pv.meta : plRefMeta((g.pages.find(p => p.kind === 'note') || g.pages[0]).pv);
    const items = g.pages.flatMap(pg => pg.items), fixes = job.showFixes ? g.pages.flatMap(pg => pg.fixes) : [];
    const lay = plLayout(base, items, job.map, fixes, { mark: job.mark });
    const cont = clear ? g.pages.map(pg => ({ meta: pg.pv.meta, src: pg })) : [];
    let prev = last.meta.id, i = ed.note.pages.findIndex(p => p.id === prev), fresh = false;
    while (cont.length < lay.pages.length) {
      const nx = fresh ? null : ed.note.pages[i + 1];
      if (nx && nx.k !== 'pdf' && !selIds.has(nx.id) && !claimed.has(nx.id) && plEmpty(nx.id)) { cont.push({ meta: nx, reuse: true }); claimed.add(nx.id); i++; prev = nx.id; }
      else { const m = { id: uid(), k: 'blank', w: base.w, h: base.h, bg: base.bg || 'plain' }; cont.push({ meta: m, isNew: true, after: prev, first: !fresh }); prev = m.id; fresh = true; }
    }
    return { kind: g.kind, pages: g.pages, clear, last, slots: lay.pages.map((page, k) => ({ page, c: cont[k] })), left: cont.slice(lay.pages.length) };
  });
}
/* çalışma kağıdı ve cevap anahtarı: düzenlenen son sayfadan sonra yeni sayfalara (cevap anahtarı ayrı sayfadan başlar) */
const plSheetReady = job => !!(job.sheet && job.sheet.items && job.sheet.items.some(it => it.on && it.r !== 'title' && it.r !== 'gap'));
function plSheetPlan(job) {
  if (!plSheetReady(job)) return null;
  const sh = job.sheet; plFresh(job);
  const sel = job.pages.filter(pg => ed.pvs.includes(pg.pv));
  const ref = plRefMeta((sel.filter(p => p.kind === 'note').pop() || sel[sel.length - 1] || {}).pv);
  const base = { k: 'blank', w: ref.w, h: ref.h, bg: ref.bg || 'plain' };
  const pages = plLayout(base, sh.items, job.map, null).pages.map(page => ({ page, kind: 'sheet' }));
  const ans = sh.answersOn ? sh.answers.filter(it => it.on) : [];
  if (ans.length) for (const page of plLayout(base, [{ r: 'title', t: 'Cevap anahtarı', on: true }, ...ans], job.map, null).pages) pages.push({ page, kind: 'ans' });
  return { base, pages };
}
/* sayfadan kalkacaklar: okunan el yazısı ve metin kutuları (taşınmayan çizimler kalır) ve üzerlerindeki fosforlu kalem */
function plRemovals(pg) {
  const A = ann(pg.pv.meta.id), moved = new Set(pg.items.filter(it => it.draw && it.on).map(it => it.draw));
  const keep = new Set(); for (const d of pg.draws) if (!moved.has(d)) d.strokes.forEach(s => keep.add(s));
  const rs = new Set(), rt = new Set(), gone = [];
  for (const s of A.s) if (s.t !== 'hl' && pg.strokes.has(s) && !keep.has(s)) rs.add(s);
  if (rs.size) for (const l of splitLines([...rs])) gone.push(l.bb);
  for (const t of A.t) if (pg.texts.has(t)) { rt.add(t); gone.push({ x0: t.x, y0: t.y, x1: t.x + (t.w || 20), y1: t.y + (t.h || 20) }); }
  for (const s of A.s) if (s.t === 'hl') {
    const b = strokeBB(s), area = Math.max(1, (b.x1 - b.x0) * (b.y1 - b.y0));
    let ov = 0; for (const g of gone) ov += Math.max(0, Math.min(b.x1, g.x1) - Math.max(b.x0, g.x0)) * Math.max(0, Math.min(b.y1, g.y1) - Math.max(b.y0, g.y0));
    if (ov > area * .3) rs.add(s);
  }
  return { rs, rt };
}
/* Türkçe: "Sayfa 3’ten sonra" */
function trFrom(n) {
  const d = n % 10, t = Math.floor(n / 10) % 10;
  const suf = d ? ['', 'den', 'den', 'ten', 'ten', 'ten', 'dan', 'den', 'den', 'dan'][d] : t ? ['', 'dan', 'den', 'dan', 'tan', 'den', 'tan', 'ten', 'den', 'dan'][t] : 'den';
  return n + '’' + suf;
}

/* ---------- uygula ---------- */
function plApply(job) {
  if (PF.job === job) PF.job = null;
  const runs = plPlan(job), sp = plSheetPlan(job);
  if (!runs.some(r => r.slots.length) && !sp) { toast('Uygulanacak satır yok', 1500); return; }
  const srcNos = runs.flatMap(r => r.pages.map(pg => ed.pvs.indexOf(pg.pv) + 1));
  const pagesB = ed.note.pages.slice(), before = new Map(), touch = pid => { if (!before.has(pid)) before.set(pid, snap(pid)); };
  let added = 0, firstPid = null, flowPid = null, sheetPid = null;
  for (const run of runs) {
    if (run.clear) for (const pg of run.pages) {
      const pid = pg.pv.meta.id, A = ann(pid); touch(pid);
      const { rs, rt } = plRemovals(pg);
      A.s = A.s.filter(s => !rs.has(s)); A.t = A.t.filter(t => !rt.has(t));
    }
    for (const sl of run.slots) {
      const m = sl.c.meta;
      if (sl.c.isNew) { const i = ed.note.pages.findIndex(p => p.id === sl.c.after); ed.note.pages.splice(i + 1, 0, m); added++; }
      touch(m.id); const A = ann(m.id); A.s = [...A.s, ...sl.page.s]; A.t = [...A.t, ...sl.page.t];
      if (!firstPid) firstPid = m.id; if (run.clear) flowPid = m.id;
    }
  }
  // çalışma kağıdı: seçilen ve düzenlenen sayfaların en sonuncusundan sonra
  let sheetN = 0;
  if (sp) {
    const ids = new Set([...job.pages.map(pg => pg.pv.meta.id), ...runs.flatMap(r => r.slots.map(sl => sl.c.meta.id))]);
    let at = -1; ed.note.pages.forEach((p, i) => { if (ids.has(p.id)) at = i; });
    if (at < 0) at = ed.note.pages.length - 1;
    for (const sl of sp.pages) {
      const m = { id: uid(), k: 'blank', w: sp.base.w, h: sp.base.h, bg: sp.base.bg };
      ed.note.pages.splice(++at, 0, m); added++; sheetN++;
      touch(m.id); const A = ann(m.id); A.s = [...A.s, ...sl.page.s]; A.t = [...A.t, ...sl.page.t];
      if (!sheetPid) sheetPid = m.id;
    }
  }
  const ops = [...before.entries()].map(([pid, b]) => ({ k: 'page', pid, b, a: snap(pid) }));
  if (added) { ops.unshift({ k: 'pages', b: pagesB, a: ed.note.pages.slice() }); rebuildAfterPages(); }
  pushOp(ops.length === 1 ? ops[0] : { k: 'multi', ops });
  for (const p of ed.pvs) if (before.has(p.meta.id)) renderLayer(p);
  requestFrame(true); if (typeof refreshPanel === 'function') refreshPanel();
  for (const run of runs) for (const pg of run.pages) PF.fixedVer.set(pg.pv.meta.id, ed.pageVer.get(pg.pv.meta.id) || 0);
  const failed = job.pages.filter(pg => !pg.items).length;
  const si = sheetPid ? ed.pvs.findIndex(p => p.meta.id === sheetPid) : -1;
  const msg = [];
  if (srcNos.length) msg.push((srcNos.length === 1 ? 'Sayfa ' + srcNos[0] : srcNos.length + ' sayfa') + ' düzenlendi');
  if (added - sheetN) msg.push((added - sheetN) + ' yeni sayfa');
  if (si >= 0) msg.push((msg.length ? 'çalışma kağıdı' : 'Çalışma kağıdı eklendi:') + ' Sayfa ' + (si + 1) + (sheetN > 1 ? '–' + (si + sheetN) : ''));
  if (job.sheet && !sp) msg.push('çalışma kağıdı hazırlanamadı');
  if (failed) msg.push(failed + ' sayfa okunamadı');
  msg.push('geri almak için ↶');
  const fi = ed.pvs.findIndex(p => p.meta.id === firstPid);
  if (!runs.some(r => r.slots.length) && si >= 0) { toast(msg.join(' · '), 3600); goToPage(si); return; }
  if (si >= 0) toastAction(msg.join(' · '), 'Çalışma kağıdına git', () => { const k = ed.pvs.findIndex(p => p.meta.id === sheetPid); if (k >= 0) goToPage(k); });
  else toast(msg.join(' · '), 3200);
  if (fi >= 0 && ed.curPage !== fi + 1 && (job.dest === 'new' || runs.length > 1 || !runs[0].clear)) goToPage(fi);
  // yazının yerine yazıldıysa ve sayfada yer açıldıysa: sonraki sayfa buradan devam etsin mi? (ardından çalışma kağıdı geldiyse sorulmaz)
  const lp = !sp && flowPid && ed.pvs.find(p => p.meta.id === flowPid);
  if (lp && window.flowSuggest) flowSuggest(lp);
}

/* ---------- önizleme penceresi ---------- */
async function plPreview(job, box) {
  const runs = plPlan(job), W = Math.round((box.clientWidth || 360) * Math.min(2, devicePixelRatio || 1));
  const no = id => ed.pvs.findIndex(p => p.meta.id === id) + 1, out = [];
  const selNos = job.pages.filter(pg => ed.pvs.includes(pg.pv)).map(pg => no(pg.pv.meta.id));
  if (job.dest === 'none') out.push({ head: selNos.length === 1 ? 'Sayfa ' + selNos[0] + ' olduğu gibi kalır' : selNos.join(', ') + '. sayfalar olduğu gibi kalır' });
  for (const run of runs) {
    const rem = new Map(); if (run.clear) for (const pg of run.pages) rem.set(pg.pv.meta.id, plRemovals(pg));
    const rest = id => { const A = ann(id), r = rem.get(id); return { s: r ? A.s.filter(s => !r.rs.has(s)) : A.s.slice(), t: r ? A.t.filter(t => !r.rt.has(t)) : A.t.slice(), i: A.i || [], n: A.n || [] }; };
    if (!run.clear) out.push({ head: run.pages.length === 1 ? 'Sayfa ' + no(run.pages[0].pv.meta.id) + ' olduğu gibi kalır' : run.pages.map(pg => no(pg.pv.meta.id)).join(', ') + '. sayfalar olduğu gibi kalır' });
    for (const sl of run.slots) {
      const c = sl.c, b = c.isNew ? { s: [], t: [], i: [], n: [] } : rest(c.meta.id);
      const cv = await renderThumb(c.meta, { s: [...b.s, ...sl.page.s], t: [...b.t, ...sl.page.t], i: b.i, n: b.n }, null, W);
      out.push({ cv, label: c.isNew ? 'Yeni sayfa' + (c.first ? ' · Sayfa ' + trFrom(no(c.after) || ed.pvs.length) + ' sonra eklenir' : '') : c.reuse ? 'Sayfa ' + no(c.meta.id) + ' · boş sayfa kullanılır' : 'Sayfa ' + no(c.meta.id) });
    }
    for (const c of run.left) {
      const b = rest(c.meta.id), has = b.s.length || b.t.length || b.i.length || b.n.length;
      out.push({ cv: has ? await renderThumb(c.meta, b, null, W) : null, label: 'Sayfa ' + no(c.meta.id) + ' · yazısı öncekine taşındı' + (has ? '' : ', boş kalır') });
    }
  }
  if (job.sheet) {
    const sp = plSheetPlan(job);
    if (job.sheet.reading) out.push({ wait: 'Çalışma kağıdı hazırlanıyor…' });
    else if (sp) {
      const where = job.dest === 'none' ? 'Sayfa ' + trFrom(Math.max(...selNos, 0) || ed.pvs.length) + ' sonra eklenir' : 'düzenlenen sayfalardan sonra eklenir';
      let k = 0, ka = 0;
      for (const sl of sp.pages) {
        const cv = await renderThumb(sp.base, { s: sl.page.s, t: sl.page.t, i: [], n: [] }, null, W);
        const ans = sl.kind === 'ans', first = ans ? !ka++ : !k++;
        out.push({ cv, label: (ans ? 'Cevap anahtarı' : 'Çalışma kağıdı') + ' · yeni sayfa' + (first && !ans ? ' · ' + where : '') });
      }
    }
  }
  if (job.previewTok !== box._tok) return;
  box.innerHTML = '';
  if (!out.some(o => !o.head)) { box.append(...out.map(o => h('div', { class: 'plsep head' }, o.head)), h('p', { class: 'notice' }, job.sheet ? 'Eklenecek çalışma kağıdı yok.' : 'Sayfaya yazılacak satır yok.')); return; }
  for (const o of out) {
    if (o.head) { box.append(h('div', { class: 'plsep head' }, o.head)); continue; }
    if (o.wait) { box.append(h('div', { class: 'plsep plwait' }, h('i', { class: 'spin' }), o.wait)); continue; }
    box.append(h('div', { class: 'plsep' }, o.label)); if (o.cv) { o.cv.className = 'plpage'; box.append(o.cv); }
  }
}
function plOpen(job) {
  pfClose(true);
  PF.job = job;
  const M = job.map, body = h('div', { class: 'plbody' }), notes = h('div', { class: 'plnotes' });
  let tab = 'preview', tok = 0;
  const no = pg => ed.pvs.indexOf(pg.pv) + 1;
  const applyBtn = h('button', { class: 'btn small primary', type: 'button', onclick: () => { pfClose(); plApply(job); } }, 'Uygula');
  const segBtns = {}, title = h('b'), sub = h('small'), sh = job.sheet;
  const show = t => {
    tab = t; Object.entries(segBtns).forEach(([k, b]) => { b.classList.toggle('on', k === t); b.setAttribute('aria-checked', k === t ? 'true' : 'false'); });
    body.innerHTML = ''; body.scrollTop = 0;
    if (t === 'preview') { const pbox = h('div', { class: 'plprev' }, h('i', { class: 'spin' })); body.append(pbox); pbox._tok = job.previewTok = ++tok; requestAnimationFrame(() => plPreview(job, pbox)); }
    else if (t === 'lines') body.append(plLinesList(job, M, retry, () => show('lines')));
    else if (t === 'sheet') body.append(plSheetList(job, M, sheetRetry));
    else body.append(plFixesList(job));
    applyBtn.disabled = !!(sh && sh.reading) || !((job.dest !== 'none' && plActive(job).length) || plSheetReady(job));
  };
  const head = () => {
    plFresh(job);
    const ok = job.pages.filter(pg => pg.items);
    title.textContent = job.dest === 'none' ? (sh.reading ? 'Çalışma kağıdı hazırlanıyor…' : sh.items ? 'Çalışma kağıdı hazır' : 'Çalışma kağıdı hazırlanamadı')
      : job.pages.length === 1 ? 'Sayfa ' + no(job.pages[0]) + ' · düzenlendi' : ok.length === job.pages.length ? ok.length + ' sayfa düzenlendi' : ok.length + ' / ' + job.pages.length + ' sayfa düzenlendi';
    const bys = ok.filter(pg => pg.by).map(pg => pg.by); if (sh && sh.by) bys.push(sh.by);
    sub.textContent = [...new Map(bys.map(b => [b.id, b.name + ' · ' + pfModelName(b.id, b.model)])).values()].join(' + ');
    const n = ok.reduce((a, pg) => a + pg.items.filter(x => !x.draw).length, 0), nf = ok.reduce((a, pg) => a + pg.fixes.length, 0);
    if (segBtns.lines) segBtns.lines.textContent = 'Satırlar (' + n + ')';
    if (segBtns.fixes) { segBtns.fixes.textContent = 'Düzeltmeler (' + nf + ')'; segBtns.fixes.hidden = !nf || job.dest === 'none'; }
    if (segBtns.sheet) { const q = sh.items ? sh.items.filter(it => it.r === 'q').length : 0; segBtns.sheet.textContent = 'Çalışma kağıdı' + (q ? ' (' + q + ')' : ''); }
    notes.innerHTML = '';
    const pn = [...new Set([...ok, ...(sh && sh.items ? [sh] : [])].flatMap(pg => pg.notes && pg.notes.length ? [pg.notes.join(' · ') + ' → ' + pg.by.name + ' kullanıldı'] : []))];
    for (const t of pn) notes.append(h('p', { class: 'notice pfnote' }, t));
    for (const pg of job.pages) if (!pg.items) notes.append(h('p', { class: 'notice pfnote plfail' }, h('span', null, 'Sayfa ' + no(pg) + (pg.err ? ' okunamadı' + (pg.err.code === 'empty' ? ': yazı bulunamadı' : ' · ' + pg.err.message.replace(/^Sayfa okunamadı · /, '')) : ' okunmadı (durduruldu)')),
      h('button', { class: 'btn small', type: 'button', onclick: e => retry(pg, e.currentTarget) }, icon(IC.sync), 'Yeniden dene')));
    if (sh && !sh.items && !sh.reading) notes.append(h('p', { class: 'notice pfnote plfail' }, h('span', null, 'Çalışma kağıdı ' + (sh.err ? 'hazırlanamadı · ' + sh.err.message.replace(/^Sayfa okunamadı · /, '') : 'hazırlanmadı (durduruldu)')),
      h('button', { class: 'btn small', type: 'button', onclick: e => sheetRetry(e.currentTarget) }, icon(IC.sync), 'Yeniden dene')));
  };
  async function retry(pg, btn) {
    if (pg.reading) return;
    if (btn) { btn.disabled = true; btn.innerHTML = ''; btn.append(h('i', { class: 'spin' }), 'Okunuyor…'); }
    try { await plReadPage(job, pg); } catch (e) { pg.err = e; pg.items = null; }
    if (PF.job !== job || !PF.panel) return;
    head(); show(tab);
  }
  async function sheetRetry(btn) {
    if (!sh || sh.reading) return;
    if (btn) btn.disabled = true;
    const p = plSheetRead(job);
    head(); show(tab);
    await p;
    if (PF.job !== job || !PF.panel) return;
    head(); show(tab);
  }
  const seg = h('div', { class: 'seg plseg', role: 'radiogroup', 'aria-label': 'Görünüm' });
  const addSeg = (k, label) => { const b = h('button', { type: 'button', role: 'radio', onclick: () => show(k) }, label); segBtns[k] = b; seg.append(b); };
  addSeg('preview', 'Önizleme'); addSeg('lines', 'Satırlar'); if (sh) addSeg('sheet', 'Çalışma kağıdı'); addSeg('fixes', 'Düzeltmeler');
  const dest = segRow([['replace', 'Yazının yerine'], ['new', 'Yeni sayfalara'], ...(sh ? [['none', 'Yalnız çalışma kağıdı']] : [])], job.dest,
    v => { job.dest = v; S.pageFix.dest = v; saveSettings(); head(); show(tab === 'fixes' && v === 'none' ? 'preview' : tab); }, 'Düzenlenen yazı nereye');
  PF.panel = h('section', { class: 'uiwin pfwin plwin', role: 'dialog', 'aria-label': 'Sayfayı düzelt' },
    h('div', { class: 'pfhead' }, h('span', { class: 'ico' }, icon(IC.fixText)), h('div', { class: 'tt' }, title, sub),
      h('button', { class: 'ibtn', type: 'button', 'aria-label': 'Kapat', onclick: () => pfClose() }, icon(IC.close))),
    notes,
    h('div', { class: 'plsegw' }, seg),
    body,
    h('div', { class: 'pldest' + (sh ? ' three' : '') }, h('span', null, 'Nereye'), dest),
    h('div', { class: 'pffoot' }, h('button', { class: 'btn small', type: 'button', onclick: () => pfClose() }, 'Vazgeç'), applyBtn));
  PF.panel.addEventListener('pointerdown', e => e.stopPropagation());
  $('#ui').append(PF.panel);
  head(); show(tab);
}
function plRoleSelect(M, val, onChange) {
  const sel = h('select', { class: 'plsel', 'aria-label': 'Görevi' }, ...PL_ROLES.map(([r, lab]) => h('option', { value: r }, lab)));
  sel.value = val;
  const paint = () => { const s = M[sel.value]; sel.style.color = s ? s.color : ''; sel.style.borderColor = s ? s.color + '66' : ''; };
  sel.addEventListener('change', () => { paint(); onChange(sel.value); }); paint();
  return sel;
}
function plTa(value, st, onInput, ph) {
  const ta = h('textarea', { rows: '1', spellcheck: 'false', placeholder: ph || '' }); ta.value = value || '';
  const style = s => { if (!s) return; ta.style.color = s.color; ta.style.fontFamily = FONTS[s.font] || FONTS.sans; ta.style.fontWeight = String(s.wt); };
  const grow = () => { ta.style.height = 'auto'; ta.style.height = Math.min(180, ta.scrollHeight) + 'px'; };
  ta.addEventListener('input', () => { onInput(ta.value); grow(); }); style(st); requestAnimationFrame(grow);
  ta._style = style; return ta;
}
function plLinesList(job, M, retry, rerender) {
  const list = h('div', { class: 'pflist pllist' }), many = job.pages.length > 1;
  const added = job.pages.flatMap(pg => pg.items ? pg.items.filter(it => it.ek && !it.draw) : []);
  if (job.sheet) list.append(h('p', { class: 'notice pfnote' }, job.dest === 'none' ? 'Sayfalar değişmez. Çalışma kağıdı bu satırlardan hazırlandı; satırları değiştirirsen Çalışma kağıdı sekmesinden yeniden hazırlayabilirsin.' : 'Çalışma kağıdı bu satırlardan hazırlandı; satırları değiştirirsen Çalışma kağıdı sekmesinden yeniden hazırlayabilirsin.'));
  if (added.length && job.dest !== 'none') list.append(toggleRow('plShowAdded', 'Yapay zekânın eklediklerini yaz (' + added.length + ' satır)', added.some(it => it.on), v => { added.forEach(it => { it.on = v; }); if (rerender) rerender(); },
    job.mark ? 'Notta kenarda mor çizgiyle işaretlenir' : 'Ayarlar → Sayfayı düzelt’ten kenar işareti açılabilir'));
  for (const pg of job.pages) {
    const no = ed.pvs.indexOf(pg.pv) + 1;
    if (many || !pg.items) list.append(h('div', { class: 'plpg' }, h('b', null, 'Sayfa ' + no), h('small', null, pg.kind === 'pdf' ? 'PDF' : ''),
      !pg.items ? h('button', { class: 'btn small', type: 'button', onclick: e => retry(pg, e.currentTarget) }, icon(IC.sync), 'Yeniden dene') : null));
    if (!pg.items) continue;
    for (const it of pg.items) {
      if (it.draw) {
        const cb = h('input', { type: 'checkbox', class: 'switch sm', 'aria-label': 'Çizim akışa alınsın' }); cb.checked = it.on; cb.addEventListener('change', () => { it.on = cb.checked; });
        list.append(h('div', { class: 'pfrow pldraw' }, h('div', { class: 'pft' }, h('b', null, 'Çizim'), h('small', null, job.dest === 'new' ? 'Açıksa yeni sayfaya, yazının arasındaki yerine kopyalanır' : 'Açıksa yazının arasında yerine taşınır, kapalıysa olduğu yerde kalır')), cb));
        continue;
      }
      const ta = plTa(it.t, M[it.r], v => { it.t = v; it.on = !!(v.trim() || (it.m || '').trim()); cb.checked = it.on; row.classList.toggle('same', !it.on); });
      const mta = it.m ? plTa(it.m, M.meaning, v => { it.m = v; }, 'Anlamı') : null;
      const sel = plRoleSelect(M, it.r, r => { it.r = r; ta._style(M[r]); row.className = 'pfrow plrow ind' + (PL_INDENT[r] || 0) + (it.on ? '' : ' same') + (it.ek ? ' ek' : ''); });
      const cb = h('input', { type: 'checkbox', class: 'switch sm', 'aria-label': 'Satır nota yazılsın' }); cb.checked = it.on; cb.addEventListener('change', () => { it.on = cb.checked; row.classList.toggle('same', !it.on); });
      const tag = it.ek ? h('i', { class: 'pltag' }, icon(IC.spark), 'eklendi') : null;
      const row = h('div', { class: 'pfrow plrow ind' + (PL_INDENT[it.r] || 0) + (it.on ? '' : ' same') + (it.ek ? ' ek' : '') }, h('div', { class: 'pft' }, tag ? h('div', { class: 'plrh' }, sel, tag) : sel, ta, mta), cb);
      list.append(row);
    }
  }
  return list;
}
function plFixesList(job) {
  const list = h('div', { class: 'pflist pllist' }), many = job.pages.length > 1;
  list.append(toggleRow('plShowFixes', 'Düzeltmeleri sonuna yaz', job.showFixes, v => { job.showFixes = v; }, 'Kırmızı kalemle: ✗ yazdığın · ✓ doğrusu · açıklama'));
  for (const pg of job.pages) {
    if (!pg.items || !pg.fixes.length) continue;
    if (many) list.append(h('div', { class: 'plpg' }, h('b', null, 'Sayfa ' + (ed.pvs.indexOf(pg.pv) + 1))));
    for (const f of pg.fixes) {
      const w = plTa(f.wrong, { color: '#c0392b', font: 'kalam', wt: 400 }, v => { f.wrong = v; }, '✗ Yazdığın');
      const r = plTa(f.right, { color: '#1b6e3c', font: 'kalam', wt: 400 }, v => { f.right = v; }, '✓ Doğrusu');
      const n = plTa(f.note, { color: '#8e2a20', font: 'kalam', wt: 300 }, v => { f.note = v; }, 'Açıklama');
      const cb = h('input', { type: 'checkbox', class: 'switch sm', 'aria-label': 'Düzeltme listelensin' }); cb.checked = f.on; cb.addEventListener('change', () => { f.on = cb.checked; row.classList.toggle('same', !f.on); });
      const row = h('div', { class: 'pfrow plfix' + (f.on ? '' : ' same') }, h('div', { class: 'pft' }, w, r, n), cb);
      list.append(row);
    }
  }
  return list;
}
function plSheetList(job, M, retry) {
  const sh = job.sheet, list = h('div', { class: 'pflist pllist' });
  const rb = h('button', { class: 'btn small', type: 'button', disabled: sh.reading ? '' : null, onclick: e => retry(e.currentTarget) }, sh.reading ? h('i', { class: 'spin' }) : icon(IC.sync), sh.reading ? 'Hazırlanıyor…' : sh.items ? 'Yeniden hazırla' : 'Hazırla');
  const nq = sh.items ? sh.items.filter(it => it.r === 'q').length : 0;
  list.append(h('div', { class: 'plpg plsh' }, h('b', null, sh.items ? sh.title : 'Çalışma kağıdı'), h('small', null, nq ? nq + ' soru' : ''), rb));
  if (sh.reading) { list.append(h('p', { class: 'notice' }, 'Yapay zekâ okunan yazılardan alıştırmalar hazırlıyor…')); return list; }
  if (!sh.items) { list.append(h('p', { class: 'notice' }, sh.err ? 'Hazırlanamadı · ' + sh.err.message.replace(/^Sayfa okunamadı · /, '') : 'Henüz hazırlanmadı.')); return list; }
  list.append(toggleRow('plAns', 'Cevap anahtarını ayrı sayfaya yaz', sh.answersOn, v => { sh.answersOn = v; }, sh.answers.length ? 'Çalışma kağıdından sonraki sayfada başlar' : 'Cevap anahtarı gelmedi; açıp yeniden hazırlayabilirsin'));
  const styleOf = r => M[r] || M.plain;
  const row = it => {
    const cb = h('input', { type: 'checkbox', class: 'switch sm', 'aria-label': 'Satır yazılsın' }); cb.checked = it.on;
    let el;
    cb.addEventListener('change', () => { it.on = cb.checked; el.classList.toggle('same', !it.on); });
    if (it.r === 'gap') {
      const n = h('select', { class: 'plsel', 'aria-label': 'Yazma yeri satır sayısı' }, ...[1, 2, 3, 4].map(k => h('option', { value: String(k) }, k + ' satır')));
      n.value = String(it.n || 1); n.addEventListener('change', () => { it.n = Number(n.value); });
      el = h('div', { class: 'pfrow plrow plgap' + (it.on ? '' : ' same') }, h('div', { class: 'pft' }, h('div', { class: 'plrh' }, h('b', null, 'Yazma yeri'), n)), cb);
      return el;
    }
    const ta = plTa(it.t, styleOf(it.r), v => { it.t = v; it.on = !!v.trim(); cb.checked = it.on; el.classList.toggle('same', !it.on); });
    const sel = h('select', { class: 'plsel', 'aria-label': 'Görevi' }, ...PL_SHEET_ROLES.filter(x => x[0] !== 'gap').map(([r, lab]) => h('option', { value: r }, lab)));
    sel.value = it.r;
    const paint = () => { const s = styleOf(sel.value); sel.style.color = s.color; sel.style.borderColor = s.color + '66'; };
    sel.addEventListener('change', () => { it.r = sel.value; ta._style(styleOf(it.r)); el.className = 'pfrow plrow ind' + (PL_INDENT[it.r] || 0) + (it.on ? '' : ' same'); paint(); }); paint();
    el = h('div', { class: 'pfrow plrow ind' + (PL_INDENT[it.r] || 0) + (it.on ? '' : ' same') }, h('div', { class: 'pft' }, sel, ta), cb);
    return el;
  };
  for (const it of sh.items) list.append(row(it));
  if (sh.answers.length) { list.append(h('div', { class: 'plpg' }, h('b', null, 'Cevap anahtarı'), h('small', null, sh.answersOn ? 'ayrı sayfada' : 'yazılmayacak'))); for (const it of sh.answers) list.append(row(it)); }
  return list;
}
