'use strict';
/* =========================================================
   Tuval (Obsidian "Canvas" ile aynı biçim: JSON Canvas 1.0)
   Kartlar (metin, dosya, bağlantı, grup) ve oklar. Kayan bir pencerede, okunan belgenin üzerinde açılır.
   Belgeye bağlı kartlar: { kn: { line, quote } } (md) ya da { kn: { page } } (PDF); belge kendisi bir "dosya" kartıdır,
   bağlı kartlar ona "4. satır" etiketli bir okla bağlanır (Obsidian'da da böyle görünür). Belge DEĞİŞTİRİLMEZ.
   ========================================================= */
Object.assign(IC, {
  canvas: '<rect x="3" y="4" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/><path d="M10 7h3a2 2 0 012 2v5"/>',
  palette: '<path d="M12 3a9 9 0 100 18c1.1 0 1.6-.8 1.6-1.6 0-.5-.2-.8-.4-1.1-.3-.3-.4-.6-.4-1 0-.9.7-1.6 1.6-1.6H16a5 5 0 005-5c0-4.1-4-7.7-9-7.7z"/><circle cx="7.5" cy="11" r="1"/><circle cx="10" cy="7" r="1"/><circle cx="14.5" cy="7" r="1"/>',
  md: '<path d="M14 3H7a2 2 0 00-2 2v14a2 2 0 002 2h10a2 2 0 002-2V8z"/><path d="M14 3v5h5"/><path d="M8 17v-5l2 2 2-2v5M15 12v5M13.5 15.5l1.5 1.5 1.5-1.5"/>',
  vault: '<path d="M4 6a2 2 0 012-2h12a2 2 0 012 2v12a2 2 0 01-2 2H6a2 2 0 01-2-2z"/><circle cx="12" cy="12" r="3.2"/><path d="M12 8.8V7M12 17v-1.8M15.2 12H17M7 12h1.8"/>'
});
/* uygulama içi metin sorusu (Android'de tarayıcının soru penceresi güvenilir değil) */
function askText(title, value = '', placeholder = '') {
  return new Promise(res => {
    const inp = h('input', { type: 'text', value, placeholder, 'aria-label': title, style: { width: '100%' } });
    let done = false;
    const close = modal({ title, body: h('div', { class: 'field' }, inp), actions: [{ label: 'Vazgeç', onClick: () => { done = true; res(null); } }, { label: 'Tamam', kind: 'primary', onClick: () => { done = true; res(inp.value); } }], onClose: () => { if (!done) res(null); } });
    inp.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); done = true; res(inp.value); close(); } });
  });
}
window.askText = askText;
const CV_COLORS = { 1: '#e03e3e', 2: '#e8833a', 3: '#e0b000', 4: '#2f9e44', 5: '#1098ad', 6: '#7048e8' };
const cvColor = c => !c ? null : CV_COLORS[c] || (/^#[0-9a-f]{3,8}$/i.test(c) ? c : null);
const cvUid = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), b => b.toString(16).padStart(2, '0')).join('');
function cvEmpty() { return { nodes: [], edges: [] }; }
function cvNormalize(d) {
  d = d && typeof d === 'object' ? d : {};
  const nodes = Array.isArray(d.nodes) ? d.nodes.filter(n => n && n.id && n.type).map(n => ({ ...n, x: +n.x || 0, y: +n.y || 0, width: Math.max(40, +n.width || 250), height: Math.max(30, +n.height || 60) })) : [];
  const ids = new Set(nodes.map(n => n.id));
  const edges = Array.isArray(d.edges) ? d.edges.filter(e => e && e.id && ids.has(e.fromNode) && ids.has(e.toNode)) : [];
  return { ...d, nodes, edges };
}
const cvSer = d => JSON.stringify({ nodes: d.nodes, edges: d.edges, ...Object.fromEntries(Object.entries(d).filter(([k]) => k !== 'nodes' && k !== 'edges')) }, null, '\t');
const cvSig = o => JSON.stringify(Object.keys(o).sort().reduce((a, k) => (a[k] = o[k], a), {}));
/* üç yönlü birleştirme (kimliğe göre): yalnız bir yerde değişen alınır, iki yerde değişende bu cihazınki kalır ve öbürü kopya olur */
function cvMerge(base, local, remote) {
  base = cvNormalize(base || cvEmpty()); local = cvNormalize(local); remote = cvNormalize(remote);
  const st = { added: 0, changed: 0, removed: 0, both: 0 };
  const one = (key) => {
    const B = new Map(base[key].map(x => [x.id, cvSig(x)])), L = new Map(local[key].map(x => [x.id, x])), R = new Map(remote[key].map(x => [x.id, x])), out = [];
    for (const id of new Set([...L.keys(), ...R.keys()])) {
      const l = L.get(id), r = R.get(id), b = B.get(id);
      if (l && r) {
        const ls = cvSig(l), rs = cvSig(r);
        if (ls === rs || rs === b) out.push(l);
        else if (ls === b) { out.push(r); st.changed++; }
        else {
          out.push(l);
          // iki yerde birden değişmiş: yalnız konum/boyut farkıysa bu cihazınki yeter; metin farklıysa öbürü de kalsın
          if (key === 'nodes' && (l.text || '') !== (r.text || '')) { out.push({ ...r, id: cvUid(), x: r.x + 30, y: r.y + 30, text: (r.text || '') + '\n\n*(diğer cihaz)*' }); st.both++; }
        }
      } else if (l) { if (b && cvSig(l) === b) st.removed++; else out.push(l); }
      else if (r) { if (b && cvSig(r) === b) continue; out.push(r); st.added++; }
    }
    return out;
  };
  const nodes = one('nodes'); const ids = new Set(nodes.map(n => n.id));
  const edges = one('edges').filter(e => ids.has(e.fromNode) && ids.has(e.toNode));
  return { data: { ...remote, ...local, nodes, edges }, stats: st };
}

/* ---------------- renkler ---------------- */
/* Obsidian'ın 1–6 hazır renkleri aynı anlamda kalır (Obsidian'da da aynı renkte görünür); ötekiler #hex olarak yazılır */
const CV_SWATCHES = [['', 'Renksiz'], ['1', 'Kırmızı'], ['2', 'Turuncu'], ['3', 'Sarı'], ['4', 'Yeşil'], ['5', 'Camgöbeği'], ['6', 'Mor'], ['#3b6fe0', 'Mavi'], ['#d6336c', 'Pembe'], ['#7c8594', 'Gri']];
function cvRgb(c) {
  const hx = cvColor(c); if (!hx) return null;
  let m = hx.slice(1); if (m.length === 3 || m.length === 4) m = m.slice(0, 3).split('').map(x => x + x).join('');
  const n = parseInt(m.slice(0, 6), 16); return isNaN(n) ? null : [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
}
window.cvRgb = cvRgb;
/* renk değişkeni öğeye setProperty ile yazılır (style nesnesiyle "--" değişkenleri atanamıyor; eski renk düğmeleri bu yüzden beyaz görünüyordu) */
function cvPaint(el, c) { const rgb = cvRgb(c); if (rgb) { el.style.setProperty('--cr', rgb); el.classList.remove('nocol'); } else { el.style.removeProperty('--cr'); el.classList.add('nocol'); } return el; }

/* ---------------- görünüm ---------------- */
/* ctx: { host, key, title, getData(), setData(d, why), view, saveView(v), docNode(): {file, subpath}, isDoc(n), goto(kn), anchorLabel(kn), fileLabel(n), onClose, buttons } */
function openCanvas(ctx) {
  const C = { data: cvNormalize(ctx.getData()), view: ctx.view || null, sel: null, selEdge: null, undo: [], redo: [], editing: null, swOpen: false };
  const pref = (k, d) => (S.prefs[k] == null ? d : S.prefs[k]);
  const view = h('div', { class: 'cvs-view bg-' + pref('cvBg', 'dots'), tabindex: '0' });
  const world = h('div', { class: 'cvs-world' });
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg'); svg.setAttribute('class', 'cvs-edges');
  const eLayer = document.createElementNS(NS, 'g');
  const tmp = document.createElementNS(NS, 'path'); tmp.setAttribute('class', 'cvs-tmp');
  svg.append(eLayer, tmp);
  const gx = h('i', { class: 'cvs-guide gx', hidden: true }), gy = h('i', { class: 'cvs-guide gy', hidden: true });
  world.append(svg, gx, gy); view.append(world);
  const ctxbar = h('div', { class: 'cvs-ctx', role: 'toolbar', 'aria-label': 'Seçili öğe', hidden: true });
  view.append(ctxbar);
  const empty = h('div', { class: 'cvs-empty' },
    h('span', { class: 'ce-ic' }, icon(IC.canvas)), h('b', null, 'Boş tuval'),
    h('p', null, 'Kart eklemek için boş yere iki kez dokun. Kartın kenarındaki noktadan sürükleyip başka karta bırakınca ok çizilir.'),
    h('button', { class: 'btn small primary', type: 'button', onclick: e => { e.stopPropagation(); addCardAtCenter(); } }, icon(IC.plus), 'Kart ekle'));
  view.append(empty);
  const btn = (ic, label, fn, cls = '') => { const b = h('button', { class: 'ibtn ' + cls, type: 'button', 'aria-label': label, title: label }, icon(ic)); b.addEventListener('click', e => { e.stopPropagation(); fn(b); }); return b; };
  const undoB = btn(IC.undo, 'Geri al', () => undo()), redoB = btn(IC.redo, 'Yinele', () => redo());
  const zLbl = h('button', { class: 'cvs-zl', type: 'button', title: 'Tümünü göster', 'aria-label': 'Yakınlık; dokun: tümünü göster', onclick: e => { e.stopPropagation(); fit(); } }, '100%');
  const GROUP_IC = '<rect x="3" y="5" width="18" height="15" rx="2.5" stroke-dasharray="3 2.5"/><path d="M3 9h7"/>';
  const tools = h('div', { class: 'cvs-tools' },
    h('button', { class: 'btn small primary', type: 'button', onclick: e => { e.stopPropagation(); addCardAtCenter(); } }, icon(IC.plus), 'Kart'),
    btn(GROUP_IC, 'Grup (seçili kartın çevresine)', () => addGroup()),
    h('span', { class: 'sp' }), undoB, redoB, h('span', { class: 'vsep' }),
    btn(IC.minus, 'Uzaklaştır', () => zoomBy(1 / 1.25)), zLbl, btn(IC.plus, 'Yakınlaştır', () => zoomBy(1.25)),
    btn(IC.more, 'Tuval seçenekleri', b => optMenu(b)));
  const body = h('div', { class: 'cvs' }, tools, view);
  const win = makeFwin(ctx.host, { key: ctx.key || 'canvas', cls: 'cvwin', title: ctx.title || 'Tuval', icon: IC.canvas, body, onClose: () => close(), minW: 320, minH: 260, buttons: ctx.buttons || [] });
  win.onResize = () => { vr = null; if (!C.view) fit(); else placeCtx(); };

  /* ---------- görünüm dönüşümü ---------- */
  let vr = null; // görünüm kutusu (hareket boyunca önbellekte; her olayda ölçmek takılmaya yol açıyordu)
  const VR = () => vr || (vr = view.getBoundingClientRect());
  const V = () => C.view || (C.view = { x: 40, y: 40, z: 1 });
  function applyView() {
    const v = V(), g = 24 * v.z;
    world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`;
    view.style.setProperty('--z', v.z); view.style.setProperty('--iz', clamp(1 / v.z, .75, 2.6));
    view.style.backgroundPosition = `${v.x}px ${v.y}px`; view.style.backgroundSize = `${g}px ${g}px`;
    zLbl.textContent = Math.round(v.z * 100) + '%';
    placeCtx();
  }
  const toWorld = (cx, cy) => { const r = VR(), v = V(); return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z }; };
  function fitTo(x0, y0, x1, y1, pad = 40, zmax = 1.2) {
    vr = null; const r = VR(); if (!r.width) return false;
    const z = clamp(Math.min((r.width - pad * 2) / Math.max(1, x1 - x0), (r.height - pad * 2) / Math.max(1, y1 - y0)), .15, zmax);
    C.view = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z }; applyView(); saveView(); return true;
  }
  function fit() {
    const ns = C.data.nodes; vr = null; const r = VR(); if (!r.width) return;
    if (!ns.length) { C.view = { x: r.width / 2 - 130, y: 70, z: 1 }; applyView(); return; }
    fitTo(Math.min(...ns.map(n => n.x)), Math.min(...ns.map(n => n.y)), Math.max(...ns.map(n => n.x + n.width)), Math.max(...ns.map(n => n.y + n.height)));
  }
  function zoomAt(cx, cy, f) { const r = VR(), v = V(), px = cx - r.left, py = cy - r.top, z = clamp(v.z * f, .15, 3); C.view = { z, x: px - (px - v.x) * z / v.z, y: py - (py - v.y) * z / v.z }; applyView(); saveView(); }
  function zoomBy(f) { vr = null; const r = VR(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); }
  let svT = 0; function saveView() { clearTimeout(svT); svT = setTimeout(() => { if (ctx.saveView) ctx.saveView(C.view); }, 400); }

  /* ---------- çizim ---------- */
  const nodeEls = new Map(), edgeEls = new Map();
  const nodeOf = id => C.data.nodes.find(n => n.id === id);
  let orderKey = '';
  function render() {
    empty.hidden = !!C.data.nodes.length;
    const order = [...C.data.nodes].sort((a, b) => (a.type === 'group' ? 0 : 1) - (b.type === 'group' ? 0 : 1));
    const ok = order.map(n => n.id).join(',');
    for (const n of order) {
      let el = nodeEls.get(n.id);
      if (!el) { el = h('div', { class: 'cvs-node', 'data-id': n.id }); nodeEls.set(n.id, el); }
      drawNode(el, n);
    }
    if (ok !== orderKey) { orderKey = ok; for (const n of order) world.insertBefore(nodeEls.get(n.id), gx); } // gruplar altta
    const ids = new Set(order.map(n => n.id));
    for (const [id, el] of nodeEls) if (!ids.has(id)) { el.remove(); nodeEls.delete(id); }
    drawEdges();
    undoB.disabled = !C.undo.length; redoB.disabled = !C.redo.length;
    buildCtx();
  }
  function drawNode(el, n) {
    const rgb = cvRgb(n.color), sel = C.sel === n.id;
    el.className = 'cvs-node t-' + n.type + (sel ? ' sel' : '') + (rgb ? ' col' : '') + (n.kn ? ' anc' : '') + (C.editing === n.id ? ' editing' : '');
    Object.assign(el.style, { left: n.x + 'px', top: n.y + 'px', width: n.width + 'px', height: n.height + 'px' });
    if (rgb) el.style.setProperty('--cr', rgb); else el.style.removeProperty('--cr');
    if (C.editing === n.id) return;
    // içerik yalnız metni/türü değişince yeniden kurulur (konum değişince değil)
    const key = [n.type, n.text, n.file, n.subpath, n.url, n.label, n.kn && JSON.stringify(n.kn), sel].join('\u0001');
    if (el._k === key) return; el._k = key;
    el.innerHTML = '';
    if (n.type === 'group') el.append(h('div', { class: 'cvs-glabel' }, n.label || 'Grup'));
    else if (n.type === 'file') {
      const lbl = ctx.fileLabel ? ctx.fileLabel(n) : null, name = (n.file || '').split('/').pop();
      el.append(h('div', { class: 'cvs-file' }, h('span', { class: 'cf-ic' }, icon(/\.pdf$/i.test(name) ? IC.notes : IC.md || IC.notes)),
        h('div', { class: 'cf-t' }, h('b', null, name.replace(/\.(md|pdf)$/i, '')), h('small', null, [n.subpath ? n.subpath.replace(/^#\^?/, '') : '', lbl || ''].filter(Boolean).join(' · ') || (/\.pdf$/i.test(name) ? 'PDF belge' : 'Not')))));
      if (ctx.goto && ctx.isDoc && ctx.isDoc(n)) el.append(h('button', { class: 'cvs-anc', type: 'button', onclick: e => { e.stopPropagation(); ctx.goto({ subpath: n.subpath }); } }, icon(IC.chevR), 'Belgeye git'));
    } else if (n.type === 'link') el.append(h('div', { class: 'cvs-nb' }, h('a', { href: n.url, target: '_blank', rel: 'noopener noreferrer' }, n.url)));
    else {
      el.append(h('div', { class: 'cvs-nb mdc', html: n.text ? MD.parse(n.text).html : '<p class="cvs-ph">Yazmak için dokun</p>' }));
      if (n.kn && ctx.goto) el.append(h('button', { class: 'cvs-anc', type: 'button', title: 'Belgede göster', onclick: e => { e.stopPropagation(); ctx.goto(n.kn); } }, icon(IC.link), ctx.anchorLabel ? ctx.anchorLabel(n.kn) : 'Belgede'));
    }
    if (sel) {
      for (const s of ['top', 'right', 'bottom', 'left']) el.append(h('i', { class: 'cvs-dot d-' + s, 'data-side': s, title: 'Sürükleyip başka karta bırak: ok' }));
      el.append(h('i', { class: 'cvs-rs', title: 'Boyutlandır' }));
    }
  }
  const sidePt = (n, s) => s === 'top' ? [n.x + n.width / 2, n.y] : s === 'bottom' ? [n.x + n.width / 2, n.y + n.height] : s === 'left' ? [n.x, n.y + n.height / 2] : [n.x + n.width, n.y + n.height / 2];
  const sideN = s => s === 'top' ? [0, -1] : s === 'bottom' ? [0, 1] : s === 'left' ? [-1, 0] : [1, 0];
  function autoSide(a, b) { const ax = a.x + a.width / 2, ay = a.y + a.height / 2, bx = b.x + b.width / 2, by = b.y + b.height / 2, dx = bx - ax, dy = by - ay; return Math.abs(dx) * a.height > Math.abs(dy) * a.width ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top'); }
  function edgeGeom(e, A, B) {
    const a = A || nodeOf(e.fromNode), b = B || nodeOf(e.toNode); if (!a || !b) return null;
    const fs = e.fromSide || autoSide(a, b), ts = e.toSide || autoSide(b, a);
    const p0 = sidePt(a, fs), p3 = sidePt(b, ts), d = Math.max(40, Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) * .35);
    const n0 = sideN(fs), n3 = sideN(ts);
    return { p0, p1: [p0[0] + n0[0] * d, p0[1] + n0[1] * d], p2: [p3[0] + n3[0] * d, p3[1] + n3[1] * d], p3 };
  }
  const bez = (g, t) => { const u = 1 - t; return [0, 1].map(k => u * u * u * g.p0[k] + 3 * u * u * t * g.p1[k] + 3 * u * t * t * g.p2[k] + t * t * t * g.p3[k]); };
  function arrowHead(tip, from) { const dx = tip[0] - from[0], dy = tip[1] - from[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, s = 11; return `M${tip[0]},${tip[1]} L${tip[0] - ux * s - uy * s * .5},${tip[1] - uy * s + ux * s * .5} L${tip[0] - ux * s * .72},${tip[1] - uy * s * .72} L${tip[0] - ux * s + uy * s * .5},${tip[1] - uy * s - ux * s * .5} Z`; }
  const mk = (tag, cls) => { const x = document.createElementNS(NS, tag); if (cls) x.setAttribute('class', cls); return x; };
  function edgeEl(e) {
    let E = edgeEls.get(e.id);
    if (!E) {
      E = { g: mk('g', 'cvs-eg'), hit: mk('path', 'cvs-ehit'), p: mk('path', 'cvs-e'), a1: mk('path', 'cvs-ah'), a2: mk('path', 'cvs-ah'), lb: null };
      E.hit.dataset.eid = e.id; E.g.append(E.hit, E.p, E.a1, E.a2); eLayer.append(E.g); edgeEls.set(e.id, E);
    }
    return E;
  }
  function placeEdge(e, E) {
    const g = edgeGeom(e); if (!g) { E.g.style.display = 'none'; return; }
    E.g.style.display = '';
    const d = `M${g.p0} C${g.p1} ${g.p2} ${g.p3}`;
    E.hit.setAttribute('d', d); E.p.setAttribute('d', d);
    if (e.toEnd !== 'none') { E.a1.setAttribute('d', arrowHead(g.p3, g.p2)); E.a1.style.display = ''; } else E.a1.style.display = 'none';
    if (e.fromEnd === 'arrow') { E.a2.setAttribute('d', arrowHead(g.p0, g.p1)); E.a2.style.display = ''; } else E.a2.style.display = 'none';
    if (E.lb) { const m = bez(g, .5); E.lb.style.left = m[0] + 'px'; E.lb.style.top = m[1] + 'px'; }
  }
  function drawEdges() {
    const seen = new Set();
    for (const e of C.data.edges) {
      seen.add(e.id); const E = edgeEl(e), rgb = cvRgb(e.color), sel = C.selEdge === e.id;
      const col = rgb ? `rgb(${rgb})` : '';
      E.g.setAttribute('class', 'cvs-eg' + (sel ? ' sel' : '') + (rgb ? ' col' : ''));
      E.p.style.stroke = col; E.a1.style.fill = col; E.a2.style.fill = col;
      if (e.label) {
        if (!E.lb) { E.lb = h('div', { class: 'cvs-elabel' }); world.insertBefore(E.lb, gx); }
        E.lb.textContent = e.label; E.lb.classList.toggle('sel', sel); cvPaint(E.lb, e.color); E.lb.classList.toggle('col', !!rgb);
      } else if (E.lb) { E.lb.remove(); E.lb = null; }
      placeEdge(e, E);
    }
    for (const [id, E] of edgeEls) if (!seen.has(id)) { E.g.remove(); if (E.lb) E.lb.remove(); edgeEls.delete(id); }
  }
  /* sürüklerken yalnız taşınan kartlara bağlı oklar yeniden hesaplanır */
  function updateEdgesFor(ids) { for (const e of C.data.edges) if (ids.has(e.fromNode) || ids.has(e.toNode)) { const E = edgeEls.get(e.id); if (E) placeEdge(e, E); } }

  /* ---------- seçim çubuğu (seçili kartın üstünde) ---------- */
  function buildCtx() {
    ctxbar.innerHTML = '';
    const n = C.sel && nodeOf(C.sel), e = !n && C.selEdge && C.data.edges.find(x => x.id === C.selEdge);
    const it = n || e;
    if (!it || C.editing) { ctxbar.hidden = true; return; }
    ctxbar.hidden = false;
    const cur = it.color || '';
    const dotB = cvPaint(h('button', { class: 'cx-col', type: 'button', 'aria-label': 'Renk', title: 'Renk', 'aria-expanded': String(C.swOpen) }, h('i')), cur);
    dotB.addEventListener('click', ev => { ev.stopPropagation(); C.swOpen = !C.swOpen; buildCtx(); });
    if (C.swOpen) {
      ctxbar.append(h('div', { class: 'cx-sw' }, ...CV_SWATCHES.map(([c, nm]) => {
        const b = cvPaint(h('button', { class: 'cvs-sw' + (cur === c ? ' on' : '') + (c ? '' : ' none'), type: 'button', 'aria-label': nm, title: nm, 'aria-pressed': cur === c ? 'true' : 'false' }), c);
        b.addEventListener('click', ev => { ev.stopPropagation(); setColor(it, c); });
        return b;
      }), btn(IC.close, 'Kapat', () => { C.swOpen = false; buildCtx(); }, 'cx-x')));
      placeCtx(); return;
    }
    const items = [dotB];
    if (n) {
      if (n.type === 'text') items.push(btn(IC.text, 'Metni düzenle', () => editNode(n.id)));
      if (n.type === 'group') items.push(btn(IC.text, 'Grup adı', () => editNode(n.id)));
      if (n.type === 'text' && window.handPad) items.push(btn(IC.hand, 'Kalemle yaz', () => penWrite()));
      if (n.type === 'text') items.push(btn('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 00-2-2H6a2 2 0 00-2 2v8a2 2 0 002 2h2"/>', 'Kopyala', () => duplicate(n)));
    } else {
      items.push(btn(IC.text, 'Ok etiketi', () => editEdgeLabel(e.id)));
      items.push(h('button', { class: 'cx-t', type: 'button', title: 'İki yönlü ok', 'aria-pressed': e.fromEnd === 'arrow' ? 'true' : 'false', onclick: ev => { ev.stopPropagation(); const s = snap(); if (e.fromEnd === 'arrow') delete e.fromEnd; else e.fromEnd = 'arrow'; commit('ends', s); } }, '⟷'));
      items.push(h('button', { class: 'cx-t', type: 'button', title: 'Yönü çevir', onclick: ev => { ev.stopPropagation(); const s = snap(); [e.fromNode, e.toNode] = [e.toNode, e.fromNode]; [e.fromSide, e.toSide] = [e.toSide, e.fromSide]; if (!e.fromSide) delete e.fromSide; if (!e.toSide) delete e.toSide; commit('flip', s); } }, '⇄'));
    }
    items.push(h('span', { class: 'cx-sep' }), btn(IC.trash, 'Sil', () => delSel(), 'cx-del'));
    ctxbar.append(...items);
    placeCtx();
  }
  function placeCtx() {
    if (ctxbar.hidden) return;
    const v = V(), r = VR(); let x0, y0, x1, y1;
    const n = C.sel && nodeOf(C.sel);
    if (n) { x0 = n.x; y0 = n.y; x1 = n.x + n.width; y1 = n.y + n.height; if (n.type === 'group') y0 -= 30; }
    else { const e = C.selEdge && C.data.edges.find(x => x.id === C.selEdge), g = e && edgeGeom(e); if (!g) { ctxbar.hidden = true; return; } const m = bez(g, .5); x0 = x1 = m[0]; y0 = y1 = m[1]; y0 -= 14; y1 += 14; }
    const sx0 = x0 * v.z + v.x, sx1 = x1 * v.z + v.x, sy0 = y0 * v.z + v.y, sy1 = y1 * v.z + v.y;
    const bw = ctxbar.offsetWidth || 220, bh = ctxbar.offsetHeight || 48, W = r.width, H = r.height;
    let top = sy0 - bh - 16; if (top < 6) top = sy1 + 22 < H - bh - 6 ? sy1 + 22 : Math.max(6, Math.min(H - bh - 6, sy0 + 6));
    const left = clamp((sx0 + sx1) / 2 - bw / 2, 6, Math.max(6, W - bw - 6));
    ctxbar.style.transform = `translate(${Math.round(left)}px,${Math.round(top)}px)`;
    ctxbar.classList.toggle('off', sx1 < 0 || sx0 > W || sy1 < 0 || sy0 > H);
  }

  /* ---------- değişiklik ---------- */
  let saveT = 0;
  function commit(why, snapshot) {
    if (snapshot) { C.undo.push(snapshot); if (C.undo.length > 80) C.undo.shift(); C.redo.length = 0; }
    render();
    busy(); clearTimeout(saveT); saveT = setTimeout(() => ctx.setData(C.data, why), why === 'move' || why === 'resize' ? 700 : 350);
  }
  /* kasaya yazma, tuvalle uğraşırken bekletilir (Android'de klasöre yazmak kısa bir an ekranı durdurabilir) */
  const busy = () => { window.cvBusyUntil = Date.now() + 1800; };
  const snap = () => JSON.stringify(C.data);
  function undo() { if (!C.undo.length) return; C.redo.push(snap()); C.data = JSON.parse(C.undo.pop()); C.sel = C.selEdge = null; commit('undo'); }
  function redo() { if (!C.redo.length) return; C.undo.push(snap()); C.data = JSON.parse(C.redo.pop()); C.sel = C.selEdge = null; commit('redo'); }
  function select(id, edge) { const was = C.sel || C.selEdge; C.sel = edge ? null : id; C.selEdge = edge ? id : null; if ((C.sel || C.selEdge) !== was) C.swOpen = false; render(); }
  const lastColor = () => pref('cvLast', '');
  function addCard(x, y, text = '', extra = {}) {
    const s = snap(); const n = { id: cvUid(), type: 'text', text, x: Math.round(x), y: Math.round(y), width: 260, height: 120, ...extra };
    if (n.color == null && lastColor()) n.color = lastColor(); if (!n.color) delete n.color;
    C.data.nodes.push(n); C.sel = n.id; C.selEdge = null; commit('add', s); return n;
  }
  function addCardAtCenter() { vr = null; const r = VR(), w = toWorld(r.left + r.width / 2, r.top + r.height / 2); const n = addCard(w.x - 130, w.y - 60); editNode(n.id); }
  function addGroup() {
    const s = snap(), n = C.sel && nodeOf(C.sel); let g;
    if (n && n.type !== 'group') g = { id: cvUid(), type: 'group', label: 'Grup', x: n.x - 40, y: n.y - 50, width: n.width + 80, height: n.height + 90 };
    else { vr = null; const r = VR(), w = toWorld(r.left + r.width / 2, r.top + r.height / 2); g = { id: cvUid(), type: 'group', label: 'Grup', x: Math.round(w.x - 260), y: Math.round(w.y - 160), width: 520, height: 320 }; }
    C.data.nodes.push(g); C.sel = g.id; C.selEdge = null; commit('group', s); editNode(g.id);
  }
  function duplicate(n) {
    const s = snap(); const c = JSON.parse(JSON.stringify(n)); c.id = cvUid(); c.x += 30; c.y += 30; delete c.kn;
    C.data.nodes.push(c); C.sel = c.id; commit('dup', s);
  }
  function setColor(it, c) {
    const s = snap(); if (c) it.color = c; else delete it.color; C.swOpen = false;
    if (C.sel) { S.prefs.cvLast = c; saveSettings(); }
    commit('color', s);
  }
  function delSel() {
    const s = snap();
    if (C.sel) { const id = C.sel; C.data.nodes = C.data.nodes.filter(n => n.id !== id); C.data.edges = C.data.edges.filter(e => e.fromNode !== id && e.toNode !== id); C.sel = null; commit('del', s); }
    else if (C.selEdge) { const id = C.selEdge; C.data.edges = C.data.edges.filter(e => e.id !== id); C.selEdge = null; commit('del', s); }
  }
  function optMenu(anchor) {
    openPop(anchor, () => h('div', { class: 'cvs-pop' },
      h('small', { class: 'segcap' }, 'Arka plan'),
      segRow([['dots', 'Noktalar'], ['grid', 'Kareler'], ['plain', 'Düz']], pref('cvBg', 'dots'), v => { S.prefs.cvBg = v; saveSettings(); view.classList.remove('bg-dots', 'bg-grid', 'bg-plain'); view.classList.add('bg-' + v); }, 'Arka plan'),
      toggleRow('cvGuides', 'Hizalama kılavuzları', pref('cvGuides', true), v => { S.prefs.cvGuides = v; saveSettings(); }, 'Kart taşırken öbür kartların kenarına ve ortasına yapışır'),
      h('div', { class: 'row' }, h('button', { class: 'btn small', type: 'button', onclick: () => { closePop(); fit(); } }, icon(IC.expand), 'Tümünü göster'),
        window.handPad ? h('button', { class: 'btn small', type: 'button', onclick: () => { closePop(); C.sel = null; penWrite(); } }, icon(IC.hand), 'Kalemle yeni kart') : null)));
  }
  function editNode(id) {
    const n = nodeOf(id); if (!n) return;
    if (n.type === 'group') { askText('Grup adı', n.label || '').then(v => { if (v != null) { const s = snap(); n.label = v; commit('label', s); } }); return; }
    if (n.type !== 'text') return;
    C.editing = id; C.swOpen = false; const el = nodeEls.get(id); el._k = null; el.innerHTML = ''; el.classList.add('editing'); ctxbar.hidden = true;
    const before = n.text || '';
    const ta = h('textarea', { class: 'cvs-ta', 'aria-label': 'Kart metni', spellcheck: 'true', placeholder: 'Yaz… (Markdown: **kalın**, - liste, > alıntı)' }); ta.value = before;
    el.append(ta);
    ta.addEventListener('pointerdown', e => e.stopPropagation());
    ta.addEventListener('keydown', e => { if (e.key === 'Escape') ta.blur(); e.stopPropagation(); });
    const done = () => {
      if (C.editing !== id) return; C.editing = null; el.classList.remove('editing');
      const v = ta.value;
      if (v !== before) { const s = JSON.stringify({ ...C.data, nodes: C.data.nodes.map(x => x.id === id ? { ...x, text: before } : x) }); n.text = v; autoHeight(n); commit('text', s); }
      else render();
    };
    ta.addEventListener('blur', done);
    C.finishEdit = () => ta.blur();
    setTimeout(() => { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }, 30);
  }
  function autoHeight(n) {
    // metne göre yüksekliği büyüt (küçültmez)
    const probe = h('div', { class: 'cvs-node t-text cvs-probe', style: { width: n.width + 'px' } }, h('div', { class: 'cvs-nb mdc', html: MD.parse(n.text || '').html }));
    world.append(probe); const hh = Math.ceil(probe.firstChild.scrollHeight + 4); probe.remove();
    if (hh > n.height) n.height = Math.min(hh, 900);
  }
  async function editEdgeLabel(eid) { const e = C.data.edges.find(x => x.id === eid); if (!e) return; const v = await askText('Ok etiketi', e.label || '', 'ör. neden, sonuç, örnek'); if (v == null) return; const s = snap(); if (v.trim()) e.label = v.trim(); else delete e.label; commit('label', s); }
  function penWrite() {
    // S Pen ile yaz: el yazısı metne çevrilip seçili karta (yoksa yeni karta) eklenir
    let target = C.sel && C.data.nodes.find(n => n.id === C.sel && n.type === 'text');
    const back = h('div', { class: 'modal-back cvs-penback' });
    const pad = handPad(text => {
      if (!text) return;
      const s = snap();
      if (!target) { vr = null; const r = VR(), w = toWorld(r.left + r.width / 2, r.top + r.height / 2); target = { id: cvUid(), type: 'text', text: '', x: Math.round(w.x - 130), y: Math.round(w.y - 60), width: 260, height: 120 }; if (lastColor()) target.color = lastColor(); C.data.nodes.push(target); C.sel = target.id; }
      target.text = (target.text ? target.text.replace(/\s+$/, '') + ' ' : '') + text; autoHeight(target); commit('pen', s);
    });
    const box = h('div', { class: 'modal cvs-penbox' }, h('h3', null, 'Kalemle yaz'), h('p', { class: 'muted' }, target ? 'Yazdığın, seçili kartın sonuna eklenir.' : 'Yazdığın yeni bir karta yazılır.'), pad.el,
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => back.remove() }, 'Bitti')));
    back.append(box); back.addEventListener('pointerdown', e => { if (e.target === back) back.remove(); });
    document.body.append(back); pad.el.hidden = false; requestAnimationFrame(() => pad.fit());
    back._close = () => back.remove();
  }

  /* ---------- hizalama kılavuzları ---------- */
  function snapMove(n, x, y, skip) {
    if (!pref('cvGuides', true)) { gx.hidden = gy.hidden = true; return [x, y]; }
    const thr = 7 / V().z, xs = [x, x + n.width / 2, x + n.width], ys = [y, y + n.height / 2, y + n.height];
    let bx = null, by = null;
    for (const o of C.data.nodes) {
      if (skip.has(o.id) || o.type === 'group') continue;
      const ox = [o.x, o.x + o.width / 2, o.x + o.width], oy = [o.y, o.y + o.height / 2, o.y + o.height];
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        const dx = ox[j] - xs[i]; if (Math.abs(dx) < thr && (!bx || Math.abs(dx) < Math.abs(bx.d))) bx = { d: dx, at: ox[j], o };
        const dy = oy[j] - ys[i]; if (Math.abs(dy) < thr && (!by || Math.abs(dy) < Math.abs(by.d))) by = { d: dy, at: oy[j], o };
      }
    }
    if (bx) { x += bx.d; const y0 = Math.min(y, bx.o.y) - 20, y1 = Math.max(y + n.height, bx.o.y + bx.o.height) + 20; Object.assign(gx.style, { left: bx.at + 'px', top: y0 + 'px', height: (y1 - y0) + 'px' }); }
    if (by) { y += by.d; const x0 = Math.min(x, by.o.x) - 20, x1 = Math.max(x + n.width, by.o.x + by.o.width) + 20; Object.assign(gy.style, { top: by.at + 'px', left: x0 + 'px', width: (x1 - x0) + 'px' }); }
    gx.hidden = !bx; gy.hidden = !by;
    return [x, y];
  }

  /* ---------- dokunma / fare / kalem ---------- */
  /* Hareket kare başına bir kez işlenir (requestAnimationFrame); kenara yaklaşınca tuval kendiliğinden kayar. */
  const pts = new Map(); let gest = null, lastTap = { t: 0, x: 0, y: 0 }, raf = 0;
  const sched = () => { if (!raf) raf = requestAnimationFrame(tick); };
  function edgePan(cx, cy) {
    const r = VR(), m = 44, sp = 16; let ax = 0, ay = 0;
    if (cx < r.left + m) ax = (r.left + m - cx) / m; else if (cx > r.right - m) ax = -(cx - (r.right - m)) / m;
    if (cy < r.top + m) ay = (r.top + m - cy) / m; else if (cy > r.bottom - m) ay = -(cy - (r.bottom - m)) / m;
    return [clamp(ax, -1, 1) * sp, clamp(ay, -1, 1) * sp];
  }
  function tick() {
    raf = 0; const g = gest; if (!g) return;
    if (g.kind === 'pinch') {
      if (pts.size < 2) return;
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = VR(), z = clamp(g.v0.z * d / Math.max(1, g.d0), .15, 3), px = g.c0.x - r.left, py = g.c0.y - r.top;
      C.view = { z, x: px - (px - g.v0.x) * z / g.v0.z + (c.x - g.c0.x), y: py - (py - g.v0.y) * z / g.v0.z + (c.y - g.c0.y) }; applyView(); return;
    }
    if (g.kind === 'pan') { C.view = { ...g.v0, x: g.v0.x + g.cx - g.sx, y: g.v0.y + g.cy - g.sy }; applyView(); return; }
    let again = false;
    if (g.moved && (g.kind === 'move' || g.kind === 'connect' || g.kind === 'resize')) {
      const [ax, ay] = edgePan(g.cx, g.cy);
      if (ax || ay) { const v = V(); C.view = { ...v, x: v.x + ax, y: v.y + ay }; applyView(); again = true; }
    }
    const w = toWorld(g.cx, g.cy);
    if (g.kind === 'move') {
      let nx = g.x0 + w.x - g.sx, ny = g.y0 + w.y - g.sy;
      [nx, ny] = snapMove(g.n, nx, ny, g.ids);
      const dx = Math.round(nx - g.x0), dy = Math.round(ny - g.y0);
      for (const k of g.kids) { k.k.x = k.x + dx; k.k.y = k.y + dy; const el = nodeEls.get(k.k.id); if (el) { el.style.left = k.k.x + 'px'; el.style.top = k.k.y + 'px'; } }
      updateEdgesFor(g.ids);
    } else if (g.kind === 'resize') {
      g.n.width = Math.max(120, Math.round(g.w0 + w.x - g.sx)); g.n.height = Math.max(g.n.type === 'group' ? 80 : 50, Math.round(g.h0 + w.y - g.sy));
      const el = nodeEls.get(g.n.id); el.style.width = g.n.width + 'px'; el.style.height = g.n.height + 'px'; updateEdgesFor(g.ids);
    } else if (g.kind === 'connect') {
      const a = nodeOf(g.from), p0 = sidePt(a, g.side), n0 = sideN(g.side), d = Math.max(40, Math.hypot(w.x - p0[0], w.y - p0[1]) * .35);
      tmp.setAttribute('d', `M${p0} C${p0[0] + n0[0] * d},${p0[1] + n0[1] * d} ${w.x},${w.y} ${w.x},${w.y}`);
      const under = nodeAt(g.cx, g.cy, g.from);
      if (under !== g.over) { if (g.over) g.over.classList.remove('drop'); g.over = under; if (under) under.classList.add('drop'); }
    }
    if (again) sched();
  }
  function nodeAt(cx, cy, not) { return document.elementsFromPoint(cx, cy).map(x => x.closest && x.closest('.cvs-node')).find(x => x && x.dataset.id !== not && world.contains(x) && !x.classList.contains('t-group')) || null; }
  view.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    if (e.target.closest('.cvs-ctx, .cvs-empty button')) return;
    if (C.editing && !e.target.closest('.cvs-ta')) { if (C.finishEdit) C.finishEdit(); }
    view.focus({ preventScroll: true });
    vr = null; VR();
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { view.setPointerCapture(e.pointerId); } catch (er) { }
    if (pts.size === 2) {
      if (gest && gest.kind === 'move' && gest.moved) return; // kart taşınırken ikinci parmak yok sayılır
      const [a, b] = [...pts.values()]; gest = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), v0: { ...V() }, c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
      view.classList.add('gest'); return;
    }
    if (pts.size > 2) return;
    const t = e.target;
    if (t.closest('.cvs-anc, a, .cvs-ta')) { pts.delete(e.pointerId); return; }
    const dot = t.closest('.cvs-dot'), rs = t.closest('.cvs-rs'), nodeEl = t.closest('.cvs-node'), eid = t.dataset && t.dataset.eid;
    const w = toWorld(e.clientX, e.clientY), base = { cx: e.clientX, cy: e.clientY, sxp: e.clientX, syp: e.clientY, moved: false };
    if (dot && nodeEl) { gest = { ...base, kind: 'connect', from: nodeEl.dataset.id, side: dot.dataset.side, moved: true }; view.classList.add('gest'); ctxbar.classList.add('away'); return; }
    if (rs && nodeEl) { const n = nodeOf(nodeEl.dataset.id); gest = { ...base, kind: 'resize', n, ids: new Set([n.id]), w0: n.width, h0: n.height, sx: w.x, sy: w.y, s: snap(), moved: true }; view.classList.add('gest'); ctxbar.classList.add('away'); return; }
    if (nodeEl) {
      const n = nodeOf(nodeEl.dataset.id); if (!n) return;
      // grup taşınınca içindeki kartlar da taşınır
      const kids = n.type === 'group' ? C.data.nodes.filter(k => k !== n && k.x >= n.x && k.y >= n.y && k.x + k.width <= n.x + n.width && k.y + k.height <= n.y + n.height) : [];
      const all = [n, ...kids];
      gest = { ...base, kind: 'move', n, kids: all.map(k => ({ k, x: k.x, y: k.y })), ids: new Set(all.map(k => k.id)), x0: n.x, y0: n.y, sx: w.x, sy: w.y, s: snap(), wasSel: C.sel === n.id };
      if (C.sel !== n.id) select(n.id);
      return;
    }
    if (eid) { select(eid, true); gest = null; return; }
    gest = { ...base, kind: 'pan', sx: e.clientX, sy: e.clientY, v0: { ...V() } };
  });
  view.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gest; if (!g) return;
    if (g.kind !== 'pinch') { g.cx = e.clientX; g.cy = e.clientY; }
    if (!g.moved) {
      if (Math.hypot(e.clientX - g.sxp, e.clientY - g.syp) < (e.pointerType === 'mouse' ? 3 : 6)) return;
      g.moved = true; view.classList.add('gest'); ctxbar.classList.add('away');
      if (g.kind === 'move') nodeEls.get(g.n.id)?.classList.add('lift');
    }
    sched();
  });
  const end = e => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    const g = gest; if (pts.size) { if (g && g.kind === 'pinch') gest = null; return; }
    gest = null; cancelAnimationFrame(raf); raf = 0;
    view.classList.remove('gest'); ctxbar.classList.remove('away'); gx.hidden = gy.hidden = true;
    if (!g) return;
    if (g.kind === 'pinch') { saveView(); return; }
    if (g.kind === 'pan') {
      if (g.moved) { tick0(g); saveView(); return; }
      const now = Date.now(), dbl = now - lastTap.t < 380 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
      lastTap = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
      if (dbl) { const w = toWorld(e.clientX, e.clientY); const n = addCard(w.x - 130, w.y - 30); editNode(n.id); }
      else if (C.sel || C.selEdge) select(null);
      return;
    }
    if (g.kind === 'move') {
      const el = nodeEls.get(g.n.id); if (el) el.classList.remove('lift');
      if (g.moved) { tick0(g); commit('move', g.s); }
      else {
        const now = Date.now(), dbl = now - lastTap.t < 380 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
        lastTap = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
        if (dbl || (g.wasSel && g.n.type === 'text')) editNode(g.n.id);
      }
      return;
    }
    if (g.kind === 'resize') { tick0(g); commit('resize', g.s); return; }
    if (g.kind === 'connect') {
      tmp.setAttribute('d', ''); if (g.over) g.over.classList.remove('drop');
      const under = nodeAt(e.clientX, e.clientY, g.from);
      const s = snap(); const a = nodeOf(g.from);
      let to = under ? nodeOf(under.dataset.id) : null;
      const w = toWorld(e.clientX, e.clientY);
      if (!to) {
        // boş yere bırakıldı: orada yeni kart açılır ve bağlanır (Obsidian gibi)
        const p0 = sidePt(a, g.side); if (Math.hypot(w.x - p0[0], w.y - p0[1]) < 30) { render(); return; }
        to = { id: cvUid(), type: 'text', text: '', x: Math.round(w.x - 130), y: Math.round(w.y - 40), width: 260, height: 100 }; if (lastColor()) to.color = lastColor(); C.data.nodes.push(to);
      }
      C.data.edges.push({ id: cvUid(), fromNode: a.id, fromSide: g.side, toNode: to.id, toSide: autoSide(to, a) });
      C.sel = to.id; commit('connect', s);
      if (!under) editNode(to.id);
    }
  };
  // bırakmadan önceki son konum işlenir (rAF beklemeden)
  function tick0(g) { gest = g; tick(); gest = null; cancelAnimationFrame(raf); raf = 0; gx.hidden = gy.hidden = true; }
  view.addEventListener('pointerup', end); view.addEventListener('pointercancel', end);
  view.addEventListener('lostpointercapture', e => { if (pts.has(e.pointerId)) end(e); });
  view.addEventListener('wheel', e => { e.preventDefault(); vr = null; if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY / 300)); else { const v = V(); C.view = { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }; applyView(); saveView(); } }, { passive: false });
  view.addEventListener('contextmenu', e => e.preventDefault());
  view.addEventListener('keydown', e => {
    if (C.editing) return;
    const mod = e.ctrlKey || e.metaKey;
    if ((e.key === 'Delete' || e.key === 'Backspace') && (C.sel || C.selEdge)) { e.preventDefault(); delSel(); }
    else if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); redo(); }
    else if (mod && e.key.toLowerCase() === 'd' && C.sel) { e.preventDefault(); const n = nodeOf(C.sel); if (n && n.type === 'text') duplicate(n); }
    else if (e.key === 'Enter' && C.sel) { e.preventDefault(); editNode(C.sel); }
    else if (e.key === 'Escape' && (C.sel || C.selEdge)) { e.preventDefault(); select(null); }
  });

  function close() { if (C.finishEdit && C.editing) C.finishEdit(); clearTimeout(saveT); cancelAnimationFrame(raf); ctx.setData(C.data, 'close'); win.close(); if (ctx.onClose) ctx.onClose(); }
  const api = {
    win, get data() { return C.data; },
    setData(d) { C.data = cvNormalize(d); if (C.sel && !C.data.nodes.some(n => n.id === C.sel)) C.sel = null; if (C.selEdge && !C.data.edges.some(x => x.id === C.selEdge)) C.selEdge = null; nodeEls.forEach(el => el._k = null); render(); },
    focusNode(id) {
      const n = nodeOf(id); if (!n) return;
      vr = null; const r = VR(), v = V(); C.view = { z: v.z, x: r.width / 2 - (n.x + n.width / 2) * v.z, y: r.height / 2 - (n.y + n.height / 2) * v.z }; applyView();
      select(id); const el = nodeEls.get(id); if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    },
    /* belgeye bağlı kart: belge kartının sağına dizilir, ona "4. satır" etiketli okla bağlanır */
    addAnchored(kn, quote, label) {
      const s = snap(); const doc = ensureDoc();
      const mine = C.data.edges.filter(e => e.toNode === doc.id).map(e => nodeOf(e.fromNode)).filter(Boolean);
      const y = mine.length ? Math.max(...mine.map(n => n.y + n.height)) + 30 : doc.y;
      const text = quote ? '> ' + quote.replace(/\s+/g, ' ').slice(0, 280) + '\n\n' : '';
      const n = { id: cvUid(), type: 'text', text, x: doc.x + doc.width + 120, y, width: 300, height: quote ? 150 : 110, kn };
      if (lastColor()) n.color = lastColor();
      C.data.nodes.push(n);
      C.data.edges.push({ id: cvUid(), fromNode: n.id, fromSide: 'left', toNode: doc.id, toSide: 'right', label });
      C.sel = n.id; commit('anchor', s);
      // belge kartı ile yeni kart birlikte görünsün
      fitTo(Math.min(doc.x, n.x), Math.min(doc.y, n.y), Math.max(doc.x + doc.width, n.x + n.width), Math.max(doc.y + doc.height, n.y + n.height), 40, 1);
      editNode(n.id);
      return n;
    },
    show() { win.show(); }, close, refresh() { nodeEls.forEach(el => el._k = null); render(); }
  };
  function ensureDoc() {
    let d = C.data.nodes.find(n => n.type === 'file' && ctx.isDoc && ctx.isDoc(n));
    if (d) return d;
    const info = ctx.docNode();
    const ns = C.data.nodes; const x = ns.length ? Math.min(...ns.map(n => n.x)) - 420 : 0, y = ns.length ? Math.min(...ns.map(n => n.y)) : 0;
    d = { id: cvUid(), type: 'file', file: info.file, x: Math.round(x), y: Math.round(y), width: 320, height: 96 }; if (info.subpath) d.subpath = info.subpath;
    C.data.nodes.push(d); return d;
  }
  render();
  requestAnimationFrame(() => { if (!C.view) fit(); else applyView(); });
  return api;
}
window.openCanvas = openCanvas; window.cvMerge = cvMerge; window.cvSer = cvSer; window.cvNormalize = cvNormalize; window.cvEmpty = cvEmpty;
