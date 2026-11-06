'use strict';
/* =========================================================
   Markdown → HTML (Obsidian'a yakın). Her blok kaynak satırını taşır (data-l = ilk satır, 0'dan),
   böylece okuyucuda "4. satır" gibi bağlantılar ve kenar işaretleri yapılabilir.
   Ham HTML işlenmez (metin olarak gösterilir); yalnız güvenli bağlantı ve görsel adresleri kullanılır.
   Desteklenen: başlıklar (#, ===/---), paragraflar (tek satır sonu = satır kırma, Obsidian gibi), **kalın**, *eğik*,
   ~~üstü çizili~~, ==vurgu==, `kod`, kod blokları, > alıntı, > [!note] not kutuları, listeler (iç içe, - [ ] görev),
   tablolar, ---, bağlantılar, görseller, [[wiki|bağlantılar]], ![[gömmeler]], #etiketler, dipnotlar, $matematik$ (metin olarak),
   %% yorumlar %% ve <!-- yorumlar --> (gizlenir), YAML ön bilgisi (gizlenir).
   ========================================================= */
const MD = (() => {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = s => String(s).replace(/[&<>"']/g, c => ESC[c]);
  const unesc = s => String(s).replace(/&(amp|lt|gt|quot|#39);/g, (m, k) => ({ amp: '&', lt: '<', gt: '>', quot: '"', '#39': "'" })[k]);
  function safeUrl(u) {
    u = unesc(u).trim().replace(/^<|>$/g, '');
    if (/^(https?:|mailto:|tel:)/i.test(u)) return u;
    if (/^data:image\/(png|jpe?g|gif|webp);base64,/i.test(u)) return u;
    if (/^[a-z][\w+.-]*:/i.test(u)) return null;           // javascript: vb.
    return u;                                              // göreli (kasadaki dosya)
  }
  const slug = t => t.toLowerCase().replace(/<[^>]+>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-').slice(0, 80) || 'b';
  const CALLOUT = { note: 'Not', info: 'Bilgi', tip: 'İpucu', hint: 'İpucu', important: 'Önemli', warning: 'Uyarı', caution: 'Dikkat', attention: 'Dikkat', danger: 'Tehlike', error: 'Hata', bug: 'Hata', example: 'Örnek', quote: 'Alıntı', cite: 'Alıntı', abstract: 'Özet', summary: 'Özet', tldr: 'Özet', todo: 'Yapılacak', success: 'Tamam', check: 'Tamam', done: 'Tamam', question: 'Soru', help: 'Soru', faq: 'Soru', failure: 'Başarısız', fail: 'Başarısız', missing: 'Eksik' };

  /* ---------------- satır içi ---------------- */
  function inline(src, ctx) {
    const keep = [];
    const put = html => { keep.push(html); return '\u0000' + (keep.length - 1) + '\u0000'; };
    let s = String(src);
    // kod
    s = s.replace(/(`+)([\s\S]*?[^`])\1(?!`)/g, (m, t, c) => put('<code>' + esc(c.trim() ? c.replace(/^ (.*) $/, '$1') : c) + '</code>'));
    // yorumlar
    s = s.replace(/%%[\s\S]*?%%/g, '').replace(/<!--[\s\S]*?-->/g, '');
    // matematik (metin olarak gösterilir)
    s = s.replace(/(^|[^\\$])\$([^\s$](?:[^$]*[^\s$])?)\$(?!\d)/g, (m, a, c) => a + put('<span class="math">' + esc(c) + '</span>'));
    // kaçışlar
    s = s.replace(/\\([\\`*_{}\[\]()#+\-.!|~=<>$%])/g, (m, c) => put(esc(c)));
    s = esc(s);
    // gömme ![[x]] ve wiki bağlantısı [[x|y]]
    s = s.replace(/!\[\[([^\]\n]+?)\]\]/g, (m, t) => { const [f, al] = unesc(t).split('|'); return put('<span class="embed" data-embed="' + esc(f.trim()) + '">' + esc(al ? al.trim() : f.trim()) + '</span>'); });
    s = s.replace(/\[\[([^\]\n]+?)\]\]/g, (m, t) => { const [f, al] = unesc(t).split('|'); const shown = al ? al.trim() : f.replace(/#\^?/, ' › ').trim(); return put('<a class="wl" href="#" data-wl="' + esc(f.trim()) + '">' + esc(shown) + '</a>'); });
    // görsel ve bağlantı
    s = s.replace(/!\[([^\]\n]*)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, alt, u) => {
      const url = safeUrl(u); if (!url) return put(esc(unesc(alt)));
      if (/^(https?:|data:)/i.test(url)) return put('<img loading="lazy" alt="' + esc(unesc(alt)) + '" src="' + esc(url) + '">');
      return put('<span class="embed" data-embed="' + esc(decodeURIComponent(url)) + '">' + esc(unesc(alt) || url) + '</span>');
    });
    s = s.replace(/\[([^\]\n]+)\]\(([^)\s]+)(?:\s+&quot;[^&]*&quot;)?\)/g, (m, t, u) => {
      const url = safeUrl(u); if (!url) return t;
      if (/^(https?:|mailto:|tel:)/i.test(url)) return put('<a href="' + esc(url) + '" target="_blank" rel="noopener noreferrer">') + t + put('</a>');
      return put('<a class="wl" href="#" data-wl="' + esc(decodeURIComponent(url).replace(/\.md(#|$)/i, '$1')) + '">') + t + put('</a>');
    });
    s = s.replace(/&lt;(https?:\/\/[^\s&]+)&gt;/g, (m, u) => put('<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>'));
    s = s.replace(/(^|[\s(])(https?:\/\/[^\s<\u0000]+[^\s<.,;:!?)\u0000])/g, (m, a, u) => a + put('<a href="' + u + '" target="_blank" rel="noopener noreferrer">' + u + '</a>'));
    // dipnot göndermesi
    s = s.replace(/\[\^([^\]\s]+)\]/g, (m, k) => put('<sup class="fn"><a href="#fn-' + esc(k) + '" data-fn="' + esc(k) + '">' + esc(k) + '</a></sup>'));
    // vurgular
    s = s.replace(/\*\*\*(?=\S)([\s\S]*?\S)\*\*\*/g, '<b><i>$1</i></b>')
      .replace(/\*\*(?=\S)([\s\S]*?\S)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^\p{L}\p{N}_])__(?=\S)([\s\S]*?\S)__(?![\p{L}\p{N}_])/gu, '$1<b>$2</b>')
      .replace(/(^|[^*])\*(?=[^\s*])([^*\n]*?[^\s*])\*(?!\*)/g, '$1<i>$2</i>')
      .replace(/(^|[^\p{L}\p{N}_])_(?=\S)([^_\n]*?\S)_(?![\p{L}\p{N}_])/gu, '$1<i>$2</i>')
      .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '<s>$1</s>')
      .replace(/==(?=\S)([\s\S]*?\S)==/g, '<mark>$1</mark>');
    // etiketler
    s = s.replace(/(^|\s)#([\p{L}_][\p{L}\p{N}_/-]*)/gu, '$1<span class="tag">#$2</span>');
    return s.replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]).replace(/\u0000(\d+)\u0000/g, (m, i) => keep[+i]);
  }

  /* ---------------- bloklar ---------------- */
  const reFence = /^(\s{0,3})(`{3,}|~{3,})\s*([^`\s]*)[^`]*$/;
  const reHead = /^\s{0,3}(#{1,6})(?:\s+(.*?))?\s*#*\s*$/;
  const reHr = /^\s{0,3}([-*_])(?:\s*\1){2,}\s*$/;
  const reQuote = /^\s{0,3}>/;
  const reItem = /^(\s*)([-*+]|\d{1,9}[.)])(\s+|$)(.*)$/;
  const reTableSep = /^\s*\|?\s*:?-{1,}:?\s*(\|\s*:?-{1,}:?\s*)*\|?\s*$/;
  const reFnDef = /^\[\^([^\]\s]+)\]:\s?(.*)$/;
  const indentOf = l => { let n = 0; for (const c of l) { if (c === ' ') n++; else if (c === '\t') n += 4 - (n % 4); else break; } return n; };
  const stripIndent = (l, n) => { let i = 0, k = 0; while (k < n && i < l.length && (l[i] === ' ' || l[i] === '\t')) { k += l[i] === '\t' ? 4 - (k % 4) : 1; i++; } return l.slice(i); };
  const splitRow = l => { let t = l.trim(); if (t.startsWith('|')) t = t.slice(1); if (t.endsWith('|') && !t.endsWith('\\|')) t = t.slice(0, -1); const out = []; let cur = '', inCode = false; for (let i = 0; i < t.length; i++) { const c = t[i]; if (c === '`') inCode = !inCode; if (c === '\\' && t[i + 1] === '|') { cur += '|'; i++; continue; } if (c === '|' && !inCode) { out.push(cur.trim()); cur = ''; } else cur += c; } out.push(cur.trim()); return out; };

  function parse(text) {
    const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
    const heads = [], fns = [], ids = new Map();
    let props = null;
    let start = 0;
    if (lines[0] === '---') { const e = lines.indexOf('---', 1); const e2 = e < 0 ? lines.indexOf('...', 1) : e; if (e2 > 0) { props = lines.slice(1, e2).join('\n'); start = e2 + 1; } }
    const uniq = base => { const n = ids.get(base) || 0; ids.set(base, n + 1); return n ? base + '-' + n : base; };
    const html = blocks(lines, start, lines.length, 0, true);
    let foot = '';
    if (fns.length) foot = '<section class="fns" data-l="' + fns[0].l + '"><hr>' + '<ol>' + fns.map(f => '<li id="fn-' + esc(f.k) + '" data-l="' + f.l + '">' + inline(f.t) + '</li>').join('') + '</ol></section>';
    return { html: html + foot, heads, props, lines: lines.length };

    function blocks(L, a, b, off, top) {
      let out = '', i = a;
      const isStart = (l, prevPara) => reFence.test(l) || reHead.test(l) || reQuote.test(l) || (reHr.test(l) && !(prevPara && /^\s*-+\s*$/.test(l))) || /^\s*\$\$/.test(l) || (reItem.test(l) && !(prevPara && /^\s*\d/.test(l) && !/^\s*1[.)]/.test(l)) && reItem.exec(l)[4] !== '');
      while (i < b) {
        const l = L[i], ln = i + off;
        if (!l.trim()) { i++; continue; }
        // yorum blokları
        if (/^\s*%%/.test(l)) { let j = i; if (!/%%[\s\S]*%%/.test(l.trim().slice(2))) { j++; while (j < b && !/%%/.test(L[j])) j++; } i = j + 1; continue; }
        if (/^\s*<!--/.test(l)) { let j = i; while (j < b && !/-->/.test(L[j])) j++; i = j + 1; continue; }
        let m;
        if ((m = reFence.exec(l))) {
          const fence = m[2], lang = m[3] || ''; let j = i + 1; const body = [];
          while (j < b && !(L[j].trim().startsWith(fence[0].repeat(fence.length)) && /^[`~]+\s*$/.test(L[j].trim()))) { body.push(stripIndent(L[j], m[1].length)); j++; }
          out += '<pre data-l="' + ln + '" data-le="' + (Math.min(j, b - 1) + off) + '"' + (lang ? ' data-lang="' + esc(lang) + '"' : '') + '><code>' + esc(body.join('\n')) + '</code></pre>';
          i = j + 1; continue;
        }
        if (/^\s*\$\$/.test(l)) {
          let j = i, body = l.replace(/^\s*\$\$/, '');
          if (/\$\$\s*$/.test(body)) body = body.replace(/\$\$\s*$/, ''); else { j++; const acc = [body]; while (j < b && !/\$\$/.test(L[j])) { acc.push(L[j]); j++; } if (j < b) acc.push(L[j].replace(/\$\$.*$/, '')); body = acc.join('\n'); }
          out += '<pre class="math" data-l="' + ln + '" data-le="' + (j + off) + '">' + esc(body.trim()) + '</pre>'; i = j + 1; continue;
        }
        if ((m = reHead.exec(l))) {
          const lv = m[1].length, t = m[2] || '', id = uniq(slug(t));
          heads.push({ lv, text: t.replace(/[*_`=~]/g, ''), id, l: ln });
          out += '<h' + lv + ' id="h-' + esc(id) + '" data-l="' + ln + '">' + inline(t) + '</h' + lv + '>'; i++; continue;
        }
        if (reHr.test(l)) { out += '<hr data-l="' + ln + '">'; i++; continue; }
        if (reQuote.test(l)) {
          let j = i; const inner = [];
          while (j < b && L[j].trim() && reQuote.test(L[j])) { inner.push(L[j].replace(/^\s{0,3}> ?/, '')); j++; }
          const cm = /^\[!([\w-]+)\]([+-]?)\s*(.*)$/.exec(inner[0] || '');
          if (cm) {
            const type = cm[1].toLowerCase(), title = cm[3] || CALLOUT[type] || (type[0].toUpperCase() + type.slice(1));
            const body = blocks(inner, 1, inner.length, ln, false);
            out += '<div class="callout c-' + esc(type) + (cm[2] === '-' ? ' folded' : '') + '" data-l="' + ln + '" data-le="' + (j - 1 + off) + '"' + (cm[2] ? ' data-fold="1"' : '') + '><div class="ct">' + inline(title) + '</div>' + (body ? '<div class="cb">' + body + '</div>' : '') + '</div>';
          } else out += '<blockquote data-l="' + ln + '" data-le="' + (j - 1 + off) + '">' + blocks(inner, 0, inner.length, ln, false) + '</blockquote>';
          i = j; continue;
        }
        if (l.includes('|') && i + 1 < b && reTableSep.test(L[i + 1]) && L[i + 1].includes('-')) {
          const head = splitRow(l), al = splitRow(L[i + 1]).map(c => /^:-+:$/.test(c) ? 'center' : /-:$/.test(c) ? 'right' : /^:-/.test(c) ? 'left' : '');
          let j = i + 2; const rows = [];
          while (j < b && L[j].trim() && L[j].includes('|')) { rows.push({ c: splitRow(L[j]), l: j + off }); j++; }
          const td = (tag, c, k) => '<' + tag + (al[k] ? ' style="text-align:' + al[k] + '"' : '') + '>' + inline(c || '') + '</' + tag + '>';
          out += '<div class="tablew" data-l="' + ln + '" data-le="' + (j - 1 + off) + '"><table><thead><tr>' + head.map((c, k) => td('th', c, k)).join('') + '</tr></thead><tbody>' +
            rows.map(r => '<tr data-l="' + r.l + '">' + head.map((x, k) => td('td', r.c[k], k)).join('') + '</tr>').join('') + '</tbody></table></div>';
          i = j; continue;
        }
        if (top && (m = reFnDef.exec(l))) {
          let j = i + 1; const acc = [m[2]]; while (j < b && L[j].trim() && indentOf(L[j]) >= 2) { acc.push(L[j].trim()); j++; }
          fns.push({ k: m[1], t: acc.join(' '), l: ln }); i = j; continue;
        }
        if ((m = reItem.exec(l)) && (m[4] !== '' || i + 1 < b)) { const r = list(L, i, b, off); out += r.html; i = r.end; continue; }
        // paragraf
        let j = i; const acc = [];
        while (j < b && L[j].trim()) {
          if (j > i && isStart(L[j], true)) break;
          if (j > i && /^\s{0,3}=+\s*$/.test(L[j])) { const t = acc.join(' ').trim(), id = uniq(slug(t)); heads.push({ lv: 1, text: t, id, l: ln }); out += '<h1 id="h-' + esc(id) + '" data-l="' + ln + '">' + inline(t) + '</h1>'; acc.length = 0; j++; break; }
          if (j > i && /^\s{0,3}-+\s*$/.test(L[j])) { const t = acc.join(' ').trim(), id = uniq(slug(t)); heads.push({ lv: 2, text: t, id, l: ln }); out += '<h2 id="h-' + esc(id) + '" data-l="' + ln + '">' + inline(t) + '</h2>'; acc.length = 0; j++; break; }
          acc.push(L[j]); j++;
        }
        if (acc.length) {
          const body = acc.map((x, k) => { const hard = /( {2,}|\\)$/.test(x); x = x.replace(/^\s+/, '').replace(/( {2,}|\\)$/, ''); return inline(x) + (k < acc.length - 1 ? (hard ? '<br>' : '<br>') : ''); }).join('\n');
          out += '<p data-l="' + ln + '" data-le="' + (j - 1 + off) + '">' + body + '</p>';
        }
        i = Math.max(j, i + 1);
      }
      return out;
    }
    function list(L, a, b, off) {
      const m0 = reItem.exec(L[a]), base = indentOf(L[a]), ordered = /\d/.test(m0[2]);
      const items = []; let i = a, cur = null, blankRun = 0, loose = false;
      while (i < b) {
        const l = L[i];
        if (!l.trim()) { blankRun++; if (cur) cur.lines.push(''); i++; continue; }
        const m = reItem.exec(l), ind = indentOf(l);
        if (m && ind <= base + 1 && ind >= base - 1 && (/\d/.test(m[2]) === ordered)) {
          if (blankRun && cur) loose = true;
          const contentCol = ind + m[2].length + (m[3] ? Math.min(m[3].length, 4) : 1);
          cur = { l: i + off, start: ordered ? parseInt(m[2], 10) : null, col: contentCol, lines: [m[4]] }; items.push(cur); blankRun = 0; i++; continue;
        }
        if (cur && ind >= Math.min(cur.col, base + 2)) { cur.lines.push(stripIndent(l, Math.min(cur.col, ind))); blankRun = 0; i++; continue; }
        if (cur && !blankRun && !m && !reHead.test(l) && !reFence.test(l) && !reQuote.test(l) && !reHr.test(l)) { cur.lines.push(l.trim()); i++; continue; }  // tembel devam
        break;
      }
      while (items.length && items[items.length - 1].lines.length && items[items.length - 1].lines[items[items.length - 1].lines.length - 1] === '') items[items.length - 1].lines.pop();
      let end = i; while (end > a && !L[end - 1].trim()) end--;
      const tag = ordered ? 'ol' : 'ul';
      const start = ordered && items[0].start !== 1 ? ' start="' + items[0].start + '"' : '';
      const lis = items.map(it => {
        let first = it.lines[0] || '', task = '';
        const tm = /^\[([ xX\-/])\]\s+/.exec(first);
        if (tm) { task = tm[1] === ' ' ? 'todo' : 'done'; first = first.slice(tm[0].length); it.lines[0] = first; }
        let inner = blocks(it.lines, 0, it.lines.length, it.l, false);
        if (!loose) inner = inner.replace(/^<p data-l="\d+" data-le="\d+">([\s\S]*?)<\/p>/, '<span class="li-t">$1</span>');
        return '<li data-l="' + it.l + '"' + (task ? ' class="task ' + task + '"' : '') + '>' + (task ? '<span class="chk" aria-hidden="true"></span>' : '') + inner + '</li>';
      }).join('');
      return { html: '<' + tag + start + ' data-l="' + (a + off) + '" data-le="' + (end - 1 + off) + '"' + (loose ? ' class="loose"' : '') + '>' + lis + '</' + tag + '>', end: i };
    }
  }
  /* satırın düz metni (alıntı ve arama için) */
  function plainLine(l) { return String(l || '').replace(/^\s{0,3}(#{1,6}\s+|>\s?|[-*+]\s+(\[.\]\s+)?|\d+[.)]\s+)/, '').replace(/!?\[\[([^\]|]+)\|?([^\]]*)\]\]/g, (m, a, b) => b || a).replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`=~]{1,3}/g, '').trim(); }
  return { parse, inline, esc, plainLine, slug };
})();
window.MD = MD;
