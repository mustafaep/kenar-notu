/* Kenar Notu · çevrimdışı çalışma için hizmet çalışanı */
const VERSION = 'kenar-notu-v3.1.0';
const CORE = [
  './',
  'index.html',
  'config.js',
  'manifest.webmanifest',
  'css/app.css',
  'css/fonts.css',
  'vendor/pdf-lib.min.js',
  'vendor/msal-browser.min.js',
  'vendor/pdfjs/pdf.min.js',
  'vendor/pdfjs/pdf.worker.min.js',
  'js/util.js',
  'js/ink.js',
  'js/covers.js',
  'js/pdfio.js',
  'js/onedrive.js',
  'js/library.js',
  'js/editor.js',
  'js/pages.js',
  'js/sticky.js',
  'js/capture.js',
  'js/textsel.js',
  'js/ai.js',
  'js/hand.js',
  'js/pagefix.js',
  'js/pagelayout.js',
  'js/flow.js',
  'js/usage.js',
  'js/settings.js',
  'js/speak.js',
  'js/split.js',
  'js/native.js',
  'js/main.js',
  'js/fwin.js',
  'js/mdparse.js',
  'js/canvas.js',
  'js/md.js',
  'js/notebook.js',
  'js/edgeui.js',
  'fonts/kalam-latin-300-normal.woff2',
  'fonts/kalam-latin-ext-300-normal.woff2',
  'fonts/kalam-latin-400-normal.woff2',
  'fonts/kalam-latin-ext-400-normal.woff2',
  'fonts/kalam-latin-700-normal.woff2',
  'fonts/kalam-latin-ext-700-normal.woff2',
  'fonts/caveat-latin-400-normal.woff2',
  'fonts/caveat-latin-700-normal.woff2',
  'fonts/caveat-latin-ext-400-normal.woff2',
  'fonts/caveat-latin-ext-700-normal.woff2',
  'fonts/literata-latin-600-normal.woff2',
  'fonts/literata-latin-700-normal.woff2',
  'fonts/literata-latin-ext-600-normal.woff2',
  'fonts/literata-latin-ext-700-normal.woff2',
  'fonts/onest-latin-400-normal.woff2',
  'fonts/onest-latin-500-normal.woff2',
  'fonts/onest-latin-600-normal.woff2',
  'fonts/onest-latin-ext-400-normal.woff2',
  'fonts/onest-latin-ext-500-normal.woff2',
  'fonts/onest-latin-ext-600-normal.woff2',
  'icons/icon.svg',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/maskable-512.png',
  'icons/favicon-32.png'
];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const req = e.request; if (req.method !== 'GET') return;
  const url = new URL(req.url); if (url.origin !== self.location.origin) return;
  if (req.mode === 'navigate') {
    // Sayfa: önce ağ (güncellemeler gelsin), olmazsa önbellek
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(VERSION).then(c => c.put('index.html', cp)); return r; }).catch(() => caches.match('index.html')));
    return;
  }
  // Uygulama dosyaları: önce önbellek; PDF yazı tipleri ve karakter haritaları ilk kullanımda önbelleğe alınır
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fetch(req).then(r => {
    if (r.ok && /\/vendor\/(pdfjs\/(cmaps|standard_fonts)|qpdf)\//.test(url.pathname)) { const cp = r.clone(); caches.open(VERSION).then(c => c.put(req, cp)); }
    return r;
  })));
});
