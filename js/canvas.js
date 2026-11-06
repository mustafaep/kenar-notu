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
const CV_COLORS = { 1: '#e03e3e', 2: '#e8833a', 3: '#d4a200', 4: '#2f9e44', 5: '#1098ad', 6: '#7048e8' };
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

/* ---------------- görünüm ---------------- */
/* ctx: { host, key, title, getData(), setData(d, why), docNode(): {file, label}, goto(kn), anchorLabel(kn), onClose } */
function openCanvas(ctx) {
  const C = { data: cvNormalize(ctx.getData()), view: ctx.view || null, sel: null, selEdge: null, undo: [], redo: [], editing: null };
  const view = h('div', { class: 'cvs-view', tabindex: '0' });
  const world = h('div', { class: 'cvs-world' });
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); svg.setAttribute('class', 'cvs-edges');
  const tmp = document.createElementNS('http://www.w3.org/2000/svg', 'path'); tmp.setAttribute('class', 'cvs-tmp');
  world.append(svg); view.append(world);
  const hint = h('div', { class: 'cvs-hint' }, 'Boş yere iki kez dokunun ya da + ile kart ekleyin. Kartın kenarındaki noktadan sürükleyip başka karta bırakınca ok çizilir.');
  const btn = (ic, label, fn, cls = '') => { const b = h('button', { class: 'ibtn ' + cls, type: 'button', 'aria-label': label, title: label }, icon(ic)); b.addEventListener('click', e => { e.stopPropagation(); fn(b); }); return b; };
  const undoB = btn(IC.undo, 'Geri al', () => undo()), redoB = btn(IC.redo, 'Yinele', () => redo());
  const colorB = btn(IC.palette, 'Renk', b => colorMenu(b));
  const delB = btn(IC.trash, 'Sil', () => delSel());
  const editB = btn(IC.text, 'Metni düzenle', () => { if (C.sel) editNode(C.sel); else if (C.selEdge) editEdgeLabel(C.selEdge); });
  const penB = window.handPad ? btn(IC.hand, 'Kalemle yaz', () => penWrite()) : null;
  const tools = h('div', { class: 'cvs-tools' },
    h('button', { class: 'btn small primary', type: 'button', onclick: () => addCardAtCenter() }, icon(IC.plus), 'Kart'),
    penB, editB, colorB, delB, h('span', { class: 'sp' }), undoB, redoB,
    btn(IC.minus, 'Uzaklaştır', () => zoomBy(1 / 1.25)), btn(IC.plus, 'Yakınlaştır', () => zoomBy(1.25)), btn(IC.expand, 'Tümünü göster', () => fit()));
  const body = h('div', { class: 'cvs' }, tools, view, hint);
  const win = makeFwin(ctx.host, { key: ctx.key || 'canvas', cls: 'cvwin', title: ctx.title || 'Tuval', icon: IC.canvas, body, onClose: () => close(), minW: 320, minH: 260, buttons: ctx.buttons || [] });
  win.onResize = () => { if (!C.view) fit(); };
  const V = () => C.view || (C.view = { x: 40, y: 40, z: 1 });
  const applyView = () => { const v = V(); world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})`; view.style.setProperty('--z', v.z); view.style.backgroundPosition = `${v.x}px ${v.y}px`; view.style.backgroundSize = `${24 * v.z}px ${24 * v.z}px`; };
  const toWorld = (cx, cy) => { const r = view.getBoundingClientRect(), v = V(); return { x: (cx - r.left - v.x) / v.z, y: (cy - r.top - v.y) / v.z }; };
  function fit() {
    const ns = C.data.nodes, r = view.getBoundingClientRect(); if (!r.width) return;
    if (!ns.length) { C.view = { x: r.width / 2 - 125, y: 60, z: 1 }; applyView(); return; }
    const x0 = Math.min(...ns.map(n => n.x)), y0 = Math.min(...ns.map(n => n.y)), x1 = Math.max(...ns.map(n => n.x + n.width)), y1 = Math.max(...ns.map(n => n.y + n.height));
    const z = clamp(Math.min((r.width - 40) / Math.max(1, x1 - x0), (r.height - 40) / Math.max(1, y1 - y0)), .2, 1.4);
    C.view = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z }; applyView(); saveView();
  }
  function zoomAt(cx, cy, f) { const r = view.getBoundingClientRect(), v = V(), px = cx - r.left, py = cy - r.top, z = clamp(v.z * f, .15, 3); C.view = { z, x: px - (px - v.x) * z / v.z, y: py - (py - v.y) * z / v.z }; applyView(); saveView(); }
  function zoomBy(f) { const r = view.getBoundingClientRect(); zoomAt(r.left + r.width / 2, r.top + r.height / 2, f); }
  let svT = 0; function saveView() { clearTimeout(svT); svT = setTimeout(() => { if (ctx.saveView) ctx.saveView(C.view); }, 400); }

  /* ---------- çizim ---------- */
  const nodeEls = new Map(), labelEls = new Map();
  function render() {
    hint.hidden = !!C.data.nodes.length;
    const seen = new Set();
    const order = [...C.data.nodes].sort((a, b) => (a.type === 'group' ? 0 : 1) - (b.type === 'group' ? 0 : 1));
    for (const n of order) {
      seen.add(n.id);
      let el = nodeEls.get(n.id);
      if (!el) { el = h('div', { class: 'cvs-node', 'data-id': n.id }); nodeEls.set(n.id, el); }
      world.append(el);   // sıra: gruplar altta
      drawNode(el, n);
    }
    for (const [id, el] of nodeEls) if (!seen.has(id)) { el.remove(); nodeEls.delete(id); }
    drawEdges();
    undoB.disabled = !C.undo.length; redoB.disabled = !C.redo.length;
    const any = C.sel || C.selEdge; delB.disabled = !any; colorB.disabled = !any; editB.disabled = !any;
  }
  function drawNode(el, n) {
    const col = cvColor(n.color);
    el.className = 'cvs-node t-' + n.type + (C.sel === n.id ? ' sel' : '') + (col ? ' col' : '') + (n.kn ? ' anc' : '');
    Object.assign(el.style, { left: n.x + 'px', top: n.y + 'px', width: n.width + 'px', height: n.height + 'px' });
    el.style.setProperty('--c', col || 'var(--line)');
    if (C.editing === n.id) return;
    const key = cvSig(n) + '|' + (C.sel === n.id);
    if (el._k === key) return; el._k = key;
    el.innerHTML = '';
    if (n.type === 'group') el.append(h('div', { class: 'cvs-glabel' }, n.label || 'Grup'));
    else if (n.type === 'file') {
      const lbl = ctx.fileLabel ? ctx.fileLabel(n) : null;
      el.append(h('div', { class: 'cvs-file' }, icon(IC.notes), h('b', null, (n.file || '').split('/').pop().replace(/\.md$/i, '')), n.subpath ? h('small', null, n.subpath.replace(/^#\^?/, '')) : null, lbl ? h('small', null, lbl) : null));
      if (ctx.goto && ctx.isDoc && ctx.isDoc(n)) el.append(h('button', { class: 'cvs-anc', type: 'button', onclick: e => { e.stopPropagation(); ctx.goto({ subpath: n.subpath }); } }, icon(IC.chevR), 'Belgeye git'));
    } else if (n.type === 'link') el.append(h('div', { class: 'cvs-nb' }, h('a', { href: n.url, target: '_blank', rel: 'noopener noreferrer' }, n.url)));
    else {
      const nb = h('div', { class: 'cvs-nb mdc', html: MD.parse(n.text || '').html });
      el.append(nb);
      if (n.kn && ctx.goto) el.append(h('button', { class: 'cvs-anc', type: 'button', title: 'Belgede göster', onclick: e => { e.stopPropagation(); ctx.goto(n.kn); } }, icon(IC.link), ctx.anchorLabel ? ctx.anchorLabel(n.kn) : 'Belgede'));
    }
    if (C.sel === n.id) {
      for (const s of ['top', 'right', 'bottom', 'left']) { const d = h('i', { class: 'cvs-dot d-' + s, 'data-side': s, title: 'Sürükleyip başka karta bırakın' }); el.append(d); }
      el.append(h('i', { class: 'cvs-rs', title: 'Boyutlandır' }));
    }
  }
  const sidePt = (n, s) => s === 'top' ? [n.x + n.width / 2, n.y] : s === 'bottom' ? [n.x + n.width / 2, n.y + n.height] : s === 'left' ? [n.x, n.y + n.height / 2] : [n.x + n.width, n.y + n.height / 2];
  const sideN = s => s === 'top' ? [0, -1] : s === 'bottom' ? [0, 1] : s === 'left' ? [-1, 0] : [1, 0];
  function autoSide(a, b) { const ax = a.x + a.width / 2, ay = a.y + a.height / 2, bx = b.x + b.width / 2, by = b.y + b.height / 2, dx = bx - ax, dy = by - ay; return Math.abs(dx) * a.height > Math.abs(dy) * a.width ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top'); }
  function edgeGeom(e) {
    const a = C.data.nodes.find(n => n.id === e.fromNode), b = C.data.nodes.find(n => n.id === e.toNode); if (!a || !b) return null;
    const fs = e.fromSide || autoSide(a, b), ts = e.toSide || autoSide(b, a);
    const p0 = sidePt(a, fs), p3 = sidePt(b, ts), d = Math.max(40, Math.hypot(p3[0] - p0[0], p3[1] - p0[1]) * .35);
    const n0 = sideN(fs), n3 = sideN(ts), p1 = [p0[0] + n0[0] * d, p0[1] + n0[1] * d], p2 = [p3[0] + n3[0] * d, p3[1] + n3[1] * d];
    return { p0, p1, p2, p3 };
  }
  const bez = (g, t) => { const u = 1 - t; return [0, 1].map(k => u * u * u * g.p0[k] + 3 * u * u * t * g.p1[k] + 3 * u * t * t * g.p2[k] + t * t * t * g.p3[k]); };
  function arrowHead(tip, from, w) { const dx = tip[0] - from[0], dy = tip[1] - from[1], L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L, s = 9 * w; return `M${tip[0]},${tip[1]} L${tip[0] - ux * s - uy * s * .55},${tip[1] - uy * s + ux * s * .55} L${tip[0] - ux * s + uy * s * .55},${tip[1] - uy * s - ux * s * .55} Z`; }
  function drawEdges() {
    svg.innerHTML = ''; const seen = new Set();
    for (const e of C.data.edges) {
      const g = edgeGeom(e); if (!g) continue; seen.add(e.id);
      const col = cvColor(e.color) || 'var(--muted)', sel = C.selEdge === e.id;
      const dpath = `M${g.p0} C${g.p1} ${g.p2} ${g.p3}`;
      const hit = document.createElementNS(svg.namespaceURI, 'path'); hit.setAttribute('d', dpath); hit.setAttribute('class', 'cvs-ehit'); hit.dataset.eid = e.id;
      const p = document.createElementNS(svg.namespaceURI, 'path'); p.setAttribute('d', dpath); p.setAttribute('class', 'cvs-e' + (sel ? ' sel' : '')); p.style.stroke = col;
      svg.append(hit, p);
      const ends = [[e.toEnd !== 'none', g.p3, g.p2], [e.fromEnd === 'arrow', g.p0, g.p1]];
      for (const [on, tip, from] of ends) if (on) { const a = document.createElementNS(svg.namespaceURI, 'path'); a.setAttribute('d', arrowHead(tip, from, 1)); a.setAttribute('class', 'cvs-ah'); a.style.fill = col; svg.append(a); }
      let lb = labelEls.get(e.id);
      if (e.label) {
        if (!lb) { lb = h('div', { class: 'cvs-elabel' }); lb.dataset.eid = e.id; labelEls.set(e.id, lb); }
        world.append(lb); lb.textContent = e.label; const m = bez(g, .5); lb.style.left = m[0] + 'px'; lb.style.top = m[1] + 'px'; lb.classList.toggle('sel', sel);
      } else if (lb) { lb.remove(); labelEls.delete(e.id); }
    }
    for (const [id, lb] of labelEls) if (!seen.has(id)) { lb.remove(); labelEls.delete(id); }
    svg.append(tmp);
  }

  /* ---------- değişiklik ---------- */
  let saveT = 0;
  function commit(why, snapshot) {
    if (snapshot) { C.undo.push(snapshot); if (C.undo.length > 80) C.undo.shift(); C.redo.length = 0; }
    render();
    clearTimeout(saveT); saveT = setTimeout(() => ctx.setData(C.data, why), 350);
  }
  const snap = () => JSON.stringify(C.data);
  function undo() { if (!C.undo.length) return; C.redo.push(snap()); C.data = JSON.parse(C.undo.pop()); C.sel = C.selEdge = null; commit('undo'); }
  function redo() { if (!C.redo.length) return; C.undo.push(snap()); C.data = JSON.parse(C.redo.pop()); C.sel = C.selEdge = null; commit('redo'); }
  function select(id, edge) { C.sel = edge ? null : id; C.selEdge = edge ? id : null; render(); }
  function addCard(x, y, text = '', extra = {}) {
    const s = snap(); const n = { id: cvUid(), type: 'text', text, x: Math.round(x), y: Math.round(y), width: 260, height: 120, ...extra };
    C.data.nodes.push(n); C.sel = n.id; C.selEdge = null; commit('add', s); return n;
  }
  function addCardAtCenter() { const r = view.getBoundingClientRect(), w = toWorld(r.left + r.width / 2, r.top + r.height / 2); const n = addCard(w.x - 130, w.y - 60); editNode(n.id); }
  function delSel() {
    const s = snap();
    if (C.sel) { const id = C.sel; C.data.nodes = C.data.nodes.filter(n => n.id !== id); C.data.edges = C.data.edges.filter(e => e.fromNode !== id && e.toNode !== id); C.sel = null; commit('del', s); }
    else if (C.selEdge) { const id = C.selEdge; C.data.edges = C.data.edges.filter(e => e.id !== id); C.selEdge = null; commit('del', s); }
  }
  function colorMenu(anchor) {
    const it = C.sel ? C.data.nodes.find(n => n.id === C.sel) : C.data.edges.find(e => e.id === C.selEdge); if (!it) return;
    const sw = h('div', { class: 'cvs-colors' }, ...[['', 'Renksiz'], ['1', 'Kırmızı'], ['2', 'Turuncu'], ['3', 'Sarı'], ['4', 'Yeşil'], ['5', 'Camgöbeği'], ['6', 'Mor']].map(([c, nm]) =>
      h('button', { class: 'cvs-sw' + ((it.color || '') === c ? ' on' : ''), type: 'button', 'aria-label': nm, title: nm, style: { '--c': cvColor(c) || 'transparent' }, onclick: () => { const s = snap(); if (c) it.color = c; else delete it.color; closePop(); commit('color', s); } })));
    const extra = C.selEdge ? h('div', { class: 'cvs-emenu' },
      h('button', { class: 'btn small', type: 'button', onclick: () => { closePop(); editEdgeLabel(C.selEdge); } }, icon(IC.text), 'Etiket'),
      h('button', { class: 'btn small', type: 'button', onclick: () => { const s = snap(); const t = it.fromEnd === 'arrow'; it.fromEnd = t ? 'none' : 'arrow'; if (it.fromEnd === 'none') delete it.fromEnd; closePop(); commit('ends', s); } }, '⟷ İki yönlü'),
      h('button', { class: 'btn small', type: 'button', onclick: () => { const s = snap(); [it.fromNode, it.toNode] = [it.toNode, it.fromNode]; [it.fromSide, it.toSide] = [it.toSide, it.fromSide]; if (!it.fromSide) delete it.fromSide; if (!it.toSide) delete it.toSide; closePop(); commit('flip', s); } }, '⇄ Yönü çevir')) : null;
    openPop(anchor, () => h('div', { class: 'cvs-pop' }, sw, extra));
  }
  function editNode(id) {
    const n = C.data.nodes.find(x => x.id === id); if (!n) return;
    if (n.type === 'group') { askText('Grup adı', n.label || '').then(v => { if (v != null) { const s = snap(); n.label = v; commit('label', s); } }); return; }
    if (n.type !== 'text') return;
    C.editing = id; const el = nodeEls.get(id); el._k = null; el.innerHTML = '';
    const before = n.text || '';
    const ta = h('textarea', { class: 'cvs-ta', 'aria-label': 'Kart metni', spellcheck: 'true' }); ta.value = before;
    el.append(ta); el.classList.add('editing');
    ta.addEventListener('pointerdown', e => e.stopPropagation());
    ta.addEventListener('keydown', e => { if (e.key === 'Escape') { ta.blur(); } e.stopPropagation(); });
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
    world.append(probe); const hh = Math.ceil(probe.firstChild.scrollHeight + 2); probe.remove();
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
      if (!target) { const r = view.getBoundingClientRect(), w = toWorld(r.left + r.width / 2, r.top + r.height / 2); target = { id: cvUid(), type: 'text', text: '', x: Math.round(w.x - 130), y: Math.round(w.y - 60), width: 260, height: 120 }; C.data.nodes.push(target); C.sel = target.id; }
      target.text = (target.text ? target.text.replace(/\s+$/, '') + ' ' : '') + text; autoHeight(target); commit('pen', s);
    });
    const box = h('div', { class: 'modal cvs-penbox' }, h('h3', null, 'Kalemle yaz'), h('p', { class: 'muted' }, target ? 'Yazdığın, seçili kartın sonuna eklenir.' : 'Yazdığın yeni bir karta yazılır.'), pad.el,
      h('div', { class: 'row' }, h('button', { class: 'btn primary', type: 'button', onclick: () => back.remove() }, 'Bitti')));
    back.append(box); back.addEventListener('pointerdown', e => { if (e.target === back) back.remove(); });
    document.body.append(back); pad.el.hidden = false; requestAnimationFrame(() => pad.fit());
    back._close = () => back.remove();
  }

  /* ---------- dokunma / fare ---------- */
  const pts = new Map(); let gest = null, lastTap = { t: 0, x: 0, y: 0 };
  view.addEventListener('pointerdown', e => {
    if (e.button > 0) return;
    if (C.editing && !e.target.closest('.cvs-ta')) { if (C.finishEdit) C.finishEdit(); }
    view.focus({ preventScroll: true });
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    try { view.setPointerCapture(e.pointerId); } catch (er) { }
    if (pts.size === 2) { const [a, b] = [...pts.values()]; gest = { kind: 'pinch', d0: Math.hypot(a.x - b.x, a.y - b.y), v0: { ...V() }, c0: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } }; return; }
    const t = e.target;
    if (t.closest('.cvs-anc, a, .cvs-ta')) { pts.delete(e.pointerId); return; }
    const dot = t.closest('.cvs-dot'), rs = t.closest('.cvs-rs'), nodeEl = t.closest('.cvs-node'), eid = t.dataset && t.dataset.eid;
    const w = toWorld(e.clientX, e.clientY);
    if (dot && nodeEl) { gest = { kind: 'connect', from: nodeEl.dataset.id, side: dot.dataset.side }; return; }
    if (rs && nodeEl) { const n = C.data.nodes.find(x => x.id === nodeEl.dataset.id); gest = { kind: 'resize', n, w0: n.width, h0: n.height, sx: w.x, sy: w.y, s: snap() }; return; }
    if (nodeEl) {
      const n = C.data.nodes.find(x => x.id === nodeEl.dataset.id); if (!n) return;
      // grup taşınınca içindeki kartlar da taşınır
      const kids = n.type === 'group' ? C.data.nodes.filter(k => k !== n && k.x >= n.x && k.y >= n.y && k.x + k.width <= n.x + n.width && k.y + k.height <= n.y + n.height) : [];
      gest = { kind: 'move', n, kids: [n, ...kids].map(k => ({ k, x: k.x, y: k.y })), sx: w.x, sy: w.y, moved: false, s: snap(), wasSel: C.sel === n.id, cx: e.clientX, cy: e.clientY };
      if (C.sel !== n.id) select(n.id);
      return;
    }
    if (eid) { select(eid, true); gest = null; return; }
    gest = { kind: 'pan', sx: e.clientX, sy: e.clientY, v0: { ...V() }, moved: false };
  });
  view.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (!gest) return;
    if (gest.kind === 'pinch' && pts.size >= 2) {
      const [a, b] = [...pts.values()], d = Math.hypot(a.x - b.x, a.y - b.y), c = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
      const r = view.getBoundingClientRect(), z = clamp(gest.v0.z * d / Math.max(1, gest.d0), .15, 3), px = gest.c0.x - r.left, py = gest.c0.y - r.top;
      C.view = { z, x: px - (px - gest.v0.x) * z / gest.v0.z + (c.x - gest.c0.x), y: py - (py - gest.v0.y) * z / gest.v0.z + (c.y - gest.c0.y) }; applyView(); return;
    }
    if (gest.kind === 'pan') { const dx = e.clientX - gest.sx, dy = e.clientY - gest.sy; if (Math.abs(dx) + Math.abs(dy) > 4) gest.moved = true; C.view = { ...gest.v0, x: gest.v0.x + dx, y: gest.v0.y + dy }; applyView(); return; }
    const w = toWorld(e.clientX, e.clientY);
    if (gest.kind === 'move') {
      if (!gest.moved && Math.hypot(e.clientX - gest.cx, e.clientY - gest.cy) < 5) return;
      gest.moved = true; const dx = w.x - gest.sx, dy = w.y - gest.sy;
      for (const k of gest.kids) { k.k.x = Math.round(k.x + dx); k.k.y = Math.round(k.y + dy); const el = nodeEls.get(k.k.id); if (el) { el.style.left = k.k.x + 'px'; el.style.top = k.k.y + 'px'; } }
      drawEdges(); return;
    }
    if (gest.kind === 'resize') { gest.n.width = Math.max(120, Math.round(gest.w0 + w.x - gest.sx)); gest.n.height = Math.max(50, Math.round(gest.h0 + w.y - gest.sy)); const el = nodeEls.get(gest.n.id); el.style.width = gest.n.width + 'px'; el.style.height = gest.n.height + 'px'; drawEdges(); return; }
    if (gest.kind === 'connect') {
      const a = C.data.nodes.find(n => n.id === gest.from), p0 = sidePt(a, gest.side), n0 = sideN(gest.side), d = Math.max(40, Math.hypot(w.x - p0[0], w.y - p0[1]) * .35);
      tmp.setAttribute('d', `M${p0} C${p0[0] + n0[0] * d},${p0[1] + n0[1] * d} ${w.x},${w.y} ${w.x},${w.y}`);
    }
  });
  const end = e => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    const g = gest; if (pts.size) { if (g && g.kind === 'pinch') gest = null; return; }
    gest = null; if (!g) return;
    if (g.kind === 'pinch') { saveView(); return; }
    if (g.kind === 'pan') {
      saveView();
      if (!g.moved) {
        const now = Date.now(), dbl = now - lastTap.t < 380 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
        lastTap = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
        if (dbl) { const w = toWorld(e.clientX, e.clientY); const n = addCard(w.x - 130, w.y - 30); editNode(n.id); }
        else if (C.sel || C.selEdge) select(null);
      }
      return;
    }
    if (g.kind === 'move') {
      if (g.moved) commit('move', g.s);
      else {
        const now = Date.now(), dbl = now - lastTap.t < 380 && Math.hypot(e.clientX - lastTap.x, e.clientY - lastTap.y) < 30;
        lastTap = { t: dbl ? 0 : now, x: e.clientX, y: e.clientY };
        if (dbl || (g.wasSel && g.n.type === 'text')) editNode(g.n.id);
      }
      return;
    }
    if (g.kind === 'resize') { commit('resize', g.s); return; }
    if (g.kind === 'connect') {
      tmp.setAttribute('d', '');
      const under = document.elementsFromPoint(e.clientX, e.clientY).map(x => x.closest && x.closest('.cvs-node')).find(x => x && x.dataset.id !== g.from && world.contains(x));
      const s = snap(); const a = C.data.nodes.find(n => n.id === g.from);
      let to = under ? C.data.nodes.find(n => n.id === under.dataset.id) : null;
      const w = toWorld(e.clientX, e.clientY);
      if (!to) {
        // boş yere bırakıldı: orada yeni kart açılır ve bağlanır (Obsidian gibi)
        if (Math.hypot(w.x - sidePt(a, g.side)[0], w.y - sidePt(a, g.side)[1]) < 30) return;
        to = { id: cvUid(), type: 'text', text: '', x: Math.round(w.x - 130), y: Math.round(w.y - 40), width: 260, height: 100 }; C.data.nodes.push(to);
      }
      const ts = autoSide(to, a);
      C.data.edges.push({ id: cvUid(), fromNode: a.id, fromSide: g.side, toNode: to.id, toSide: ts });
      C.sel = to.id; commit('connect', s);
      if (!under) editNode(to.id);
    }
  };
  view.addEventListener('pointerup', end); view.addEventListener('pointercancel', end);
  view.addEventListener('wheel', e => { e.preventDefault(); if (e.ctrlKey || e.metaKey) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY / 300)); else { const v = V(); C.view = { ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }; applyView(); saveView(); } }, { passive: false });
  view.addEventListener('keydown', e => {
    if (C.editing) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && (C.sel || C.selEdge)) { e.preventDefault(); delSel(); }
    else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? redo() : undo(); }
    else if (e.key === 'Enter' && C.sel) { e.preventDefault(); editNode(C.sel); }
  });

  function close() { if (C.finishEdit && C.editing) C.finishEdit(); clearTimeout(saveT); ctx.setData(C.data, 'close'); win.close(); if (ctx.onClose) ctx.onClose(); }
  const api = {
    win, get data() { return C.data; },
    setData(d) { C.data = cvNormalize(d); if (C.sel && !C.data.nodes.some(n => n.id === C.sel)) C.sel = null; nodeEls.forEach(el => el._k = null); render(); },
    focusNode(id) {
      const n = C.data.nodes.find(x => x.id === id); if (!n) return;
      const r = view.getBoundingClientRect(), v = V(); C.view = { z: v.z, x: r.width / 2 - (n.x + n.width / 2) * v.z, y: r.height / 2 - (n.y + n.height / 2) * v.z }; applyView();
      select(id); const el = nodeEls.get(id); if (el) { el.classList.remove('flash'); void el.offsetWidth; el.classList.add('flash'); }
    },
    /* belgeye bağlı kart: belge kartının sağına dizilir, ona "4. satır" etiketli okla bağlanır */
    addAnchored(kn, quote, label) {
      const s = snap(); const doc = ensureDoc();
      const mine = C.data.edges.filter(e => e.toNode === doc.id).map(e => C.data.nodes.find(n => n.id === e.fromNode)).filter(Boolean);
      const y = mine.length ? Math.max(...mine.map(n => n.y + n.height)) + 30 : doc.y;
      const text = quote ? '> ' + quote.replace(/\s+/g, ' ').slice(0, 280) + '\n\n' : '';
      const n = { id: cvUid(), type: 'text', text, x: doc.x + doc.width + 120, y, width: 300, height: quote ? 150 : 110, kn };
      C.data.nodes.push(n);
      C.data.edges.push({ id: cvUid(), fromNode: n.id, fromSide: 'left', toNode: doc.id, toSide: 'right', label });
      C.sel = n.id; commit('anchor', s);
      // belge kartı ile yeni kart birlikte görünsün
      const r = view.getBoundingClientRect(), x0 = Math.min(doc.x, n.x), y0 = Math.min(doc.y, n.y), x1 = Math.max(doc.x + doc.width, n.x + n.width), y1 = Math.max(doc.y + doc.height, n.y + n.height);
      const z = clamp(Math.min((r.width - 60) / (x1 - x0), (r.height - 80) / (y1 - y0)), .3, 1);
      C.view = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: (r.height - (y1 - y0) * z) / 2 - y0 * z }; applyView(); saveView();
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
    d = { id: cvUid(), type: 'file', file: info.file, x: Math.round(x), y: Math.round(y), width: 320, height: 90 }; if (info.subpath) d.subpath = info.subpath;
    C.data.nodes.push(d); return d;
  }
  render();
  requestAnimationFrame(() => { if (!C.view) fit(); else applyView(); });
  return api;
}
window.openCanvas = openCanvas; window.cvMerge = cvMerge; window.cvSer = cvSer; window.cvNormalize = cvNormalize; window.cvEmpty = cvEmpty;
