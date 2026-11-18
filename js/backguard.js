'use strict';
/* =========================================================
   Yazarken kenardaki geri hareketi (3.4)
   1) Android (APK): kalem ekrana yaklaşınca, kalemin hizasındaki ~200 dp'lik kenar şeridi sistemin geri hareketinden
      muaf tutulur (setSystemGestureExclusionRects; Android en fazla bu kadarına izin verir). Avuç kenara değse de geri
      tetiklenmez. Kalem 4 sn kullanılmayınca şerit kalkar.
   2) Uygulama: yine de gelen "geri" (alt çubuktaki geri tuşuna avuç değmesi dahil):
      · kalem son 1,5 sn içinde kullanıldıysa yok sayılır;
      · notu kapatacak geri, kalem son 20 sn içinde kullanıldıysa ikinci kez istenir ("Kapatmak için tekrar geri").
   ========================================================= */
function backGuardOn() { return S.prefs.backGuard !== false; }
let bgLastToast = 0, bgArmed = 0;
function bgToast(msg, ms) { const t = Date.now(); if (t - bgLastToast < 1200) return; bgLastToast = t; toast(msg, ms || 1600); }
/* geri → true: tüketildi (hiçbir şey yapma) */
window.kenarBackGuard = () => {
  if (!backGuardOn() || !ed || !ed.note || edView.hidden) return false;
  const penAgo = Date.now() - lastPenAny();
  if (ed.live || penAgo < 1500) { bgToast('Yazarken gelen geri hareketi yok sayıldı'); return true; }
  // notu kapatacak mı? (açık pencere, menü, seçim yoksa)
  const transient = document.querySelector('.modal-back, .od-back, .pfpick, .pfwin') || (pop && !pop.hidden) || ed.capture || ed.editing || ed.sel || (typeof TS !== 'undefined' && TS.sel) || (typeof dictEl !== 'undefined' && dictEl) || (typeof pgridEl !== 'undefined' && pgridEl) || (typeof splitOpen === 'function' && splitOpen()) || (typeof mdOpen === 'function' && mdOpen());
  if (transient) return false;
  if (penAgo < 20000 && Date.now() - bgArmed > 2500) { bgArmed = Date.now(); bgToast('Notu kapatmak için tekrar geri', 2400); return true; }
  return false;
};
/* eski APK: Android yalnız kenarBack'i çağırır; korumayı onun önüne de koy */
function wrapBack() {
  const b = window.kenarBack; if (!b || b._guarded) return;
  const w = () => { if (!window.__nativeGuard && window.kenarBackGuard()) return true; return b(); };
  w._guarded = true; window.kenarBack = w;
}
wrapBack(); addEventListener('load', wrapBack);
/* kenar şeridi (yeni APK) */
function applyEdgeGuard() { try { if (window.Native && Native.setEdgeGuard) { Native.setEdgeGuard(backGuardOn()); window.__nativeGuard = true; } } catch (e) { } }
applyEdgeGuard();
{
  const sb = setBuild;
  setBuild = function (id, close) {
    const g = sb(id, close);
    if (id === 'pen' && Array.isArray(g)) {
      const hv = g.find(x => x && x.querySelector && ((x.querySelector('h4') || {}).textContent || '') === 'Hareketler');
      const row = toggleRow('sBackG', 'Yazarken geri hareketine karşı koru', backGuardOn(), v => { S.prefs.backGuard = v; saveSettings(); applyEdgeGuard(); }, 'Elin ekranın kenarına ya da alttaki geri tuşuna değince not kapanmaz: kalemin hizasındaki kenar geri hareketinden muaf tutulur (Android 10+, yeni APK), yazarken gelen geri yok sayılır, notu kapatan geri iki kez istenir.');
      const card = hv && hv.querySelector('.scard'); if (card) card.append(row); else g.push(sGroup('Geri hareketi', [row]));
    }
    return g;
  };
}
