package com.kenarnotu.app;

import android.content.Context;
import android.os.Handler;
import android.os.Looper;
import android.view.textservice.SentenceSuggestionsInfo;
import android.view.textservice.SpellCheckerSession;
import android.view.textservice.SuggestionsInfo;
import android.view.textservice.TextInfo;
import android.view.textservice.TextServicesManager;

import com.google.mlkit.common.model.DownloadConditions;
import com.google.mlkit.common.model.RemoteModelManager;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognition;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModel;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognitionModelIdentifier;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizer;
import com.google.mlkit.vision.digitalink.recognition.DigitalInkRecognizerOptions;
import com.google.mlkit.vision.digitalink.recognition.Ink;
import com.google.mlkit.vision.digitalink.recognition.RecognitionContext;
import com.google.mlkit.vision.digitalink.recognition.WritingArea;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * S Pen ile yazılan Türkçe ve İngilizce el yazısını metne çevirir, dili algılar ve yazım hatalarını düzeltir.
 * (Kullanıcının HandwritingCorrector.kt dosyasının, uygulamanın WebView yapısına uyarlanmış Java sürümü.)
 *
 * Farklar:
 *  - Kalem hareketleri MotionEvent'ten değil, sayfadaki çizgilerden gelir (JS → JSON: [[x,y,t, x,y,t, ...], ...]).
 *  - Her şey ana iş parçacığında, geri çağırmalarla çalışır (ML Kit görevleri ve yazım denetimi oturumları burada sonuç verir).
 *  - Gemini Nano dil bilgisi düzeltmesi derlemeyi riske attığı için çıkarıldı; İngilizce dil bilgisi isteğe bağlı olarak
 *    uygulamanın yapay zekâ bağlantısıyla (Gemini/Claude) web tarafında yapılır.
 *
 * Akış:
 *   1) Çizgiler Ink nesnesine dönüştürülür
 *   2) Aynı yazı tr-TR ve en-US modelleriyle tanınır (cihazda, modeller bir kez indirildikten sonra internetsiz)
 *   3) Her dilin en fazla 3 adayı o dilin yazım denetleyicisinden geçer; en az hatalı dil seçilir
 *   4) Seçilen dilde düzeltilir; diğer dilde geçerli olan kelimelere dokunulmaz ("toplantıda deadline konuştuk")
 */
final class HandwritingCorrector {

    interface Done { void run(JSONObject result); }
    private interface EvalDone { void run(Eval e); }
    private interface SpellDone { void run(Spell s); }

    static final String[] TAGS = {"tr-TR", "en-US"};
    static final String[] CODES = {"tr", "en"};
    static final Locale[] LOCALES = {new Locale("tr", "TR"), Locale.US};
    static final int TR = 0, EN = 1;

    private static final Pattern TURKISH_CHARS = Pattern.compile("[çğıöşüÇĞİÖŞÜ]");

    private final Context ctx;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final DigitalInkRecognitionModel[] models = new DigitalInkRecognitionModel[2];
    private final DigitalInkRecognizer[] recognizers = new DigitalInkRecognizer[2];
    private final boolean[] ready = new boolean[2];
    private final boolean[] downloading = new boolean[2];
    private final boolean[] checked = new boolean[2];
    private String lastError = "";
    private int lastLanguage = TR;

    HandwritingCorrector(Context c) { ctx = c.getApplicationContext(); }

    /* ---------- modeller ---------- */

    private boolean ensureClient(int i) {
        if (recognizers[i] != null) return true;
        try {
            DigitalInkRecognitionModelIdentifier id = DigitalInkRecognitionModelIdentifier.fromLanguageTag(TAGS[i]);
            if (id == null) { lastError = TAGS[i] + " el yazısı modeli bulunamadı"; return false; }
            models[i] = DigitalInkRecognitionModel.builder(id).build();
            recognizers[i] = DigitalInkRecognition.getClient(DigitalInkRecognizerOptions.builder(models[i]).build());
            return true;
        } catch (Exception e) {
            lastError = String.valueOf(e.getMessage());
            return false;
        }
    }

    /** Modellerin indirilip indirilmediğini kontrol eder (ağ gerekmez). */
    void check(final Runnable after) {
        final int[] left = {2};
        for (int k = 0; k < 2; k++) {
            final int i = k;
            if (!ensureClient(i)) { if (--left[0] == 0 && after != null) after.run(); continue; }
            RemoteModelManager.getInstance().isModelDownloaded(models[i])
                    .addOnSuccessListener(b -> { ready[i] = Boolean.TRUE.equals(b); checked[i] = true; if (--left[0] == 0 && after != null) after.run(); })
                    .addOnFailureListener(e -> { checked[i] = true; lastError = String.valueOf(e.getMessage()); if (--left[0] == 0 && after != null) after.run(); });
        }
    }

    /** İki dil modelini indirir (her biri yaklaşık 20 MB, bir kez). */
    void prepare(final Runnable changed) {
        for (int k = 0; k < 2; k++) {
            final int i = k;
            if (ready[i] || downloading[i] || !ensureClient(i)) continue;
            downloading[i] = true;
            if (changed != null) changed.run();
            RemoteModelManager.getInstance().download(models[i], new DownloadConditions.Builder().build())
                    .addOnSuccessListener(v -> { downloading[i] = false; ready[i] = true; if (changed != null) changed.run(); })
                    .addOnFailureListener(e -> { downloading[i] = false; lastError = String.valueOf(e.getMessage()); if (changed != null) changed.run(); });
        }
    }

    JSONObject status() {
        JSONObject o = new JSONObject();
        try {
            for (int i = 0; i < 2; i++) {
                o.put(CODES[i], ready[i] ? "ready" : downloading[i] ? "downloading" : checked[i] ? "missing" : "unknown");
            }
            o.put("error", lastError);
        } catch (Exception ignored) { }
        return o;
    }

    /* ---------- tanıma ---------- */

    private static final class Typo {
        final int start, end; final String suggestion;
        Typo(int s, int e, String sug) { start = s; end = e; suggestion = sug; }
    }
    private static final class Spell {
        final boolean available; final int words; final List<Typo> typos;
        Spell(boolean a, int w, List<Typo> t) { available = a; words = w; typos = t; }
    }
    private static final class Eval {
        final int lang; final String text; final Spell spell; final List<String> alts;
        Eval(int l, String t, Spell s, List<String> a) { lang = l; text = t; spell = s; alts = a; }
    }

    /**
     * İstek: {"id":"…","strokes":[[x,y,t,…],…],"mode":"auto|tr|en","pre":"önceki metin","w":genişlik,"h":yükseklik}
     * Sonuç: {"id","ok","lang","text","corrected","kept":[…],"alts":[…],"spell":true|false} ya da {"id","ok":false,"error"}
     */
    void recognize(final JSONObject req, final Done done) {
        final String id = req.optString("id");
        final Ink ink;
        try {
            ink = buildInk(req.getJSONArray("strokes"));
        } catch (Exception e) { done.run(fail(id, "Çizgiler okunamadı")); return; }
        String mode = req.optString("mode", "auto");
        final List<Integer> langs = new ArrayList<>();
        if ("tr".equals(mode)) langs.add(TR);
        else if ("en".equals(mode)) langs.add(EN);
        else { langs.add(TR); langs.add(EN); }
        final List<Integer> usable = new ArrayList<>();
        for (int l : langs) if (ensureClient(l) && ready[l]) usable.add(l);
        if (usable.isEmpty()) {
            prepare(null);
            done.run(fail(id, "nomodel"));
            return;
        }
        final RecognitionContext rc;
        try {
            float w = (float) Math.max(10, req.optDouble("w", 600)), h = (float) Math.max(10, req.optDouble("h", 120));
            String pre = req.optString("pre", "");
            if (pre.length() > 20) pre = pre.substring(pre.length() - 20);
            rc = RecognitionContext.builder().setPreContext(pre).setWritingArea(new WritingArea(w, h)).build();
        } catch (Exception e) { done.run(fail(id, "Bağlam oluşturulamadı")); return; }

        final List<Eval> evals = new ArrayList<>();
        evalChain(usable, 0, ink, rc, evals, () -> {
            Eval best = null;
            for (Eval e : evals) if (e != null && (best == null || penalty(e) < penalty(best))) best = e;
            if (best == null) { done.run(fail(id, "Yazı tanınamadı")); return; }
            final Eval chosen = best;
            applyCorrections(chosen, (corrected, kept) -> {
                lastLanguage = chosen.lang;
                JSONObject o = new JSONObject();
                try {
                    o.put("id", id); o.put("ok", true);
                    o.put("lang", CODES[chosen.lang]);
                    o.put("text", chosen.text);
                    o.put("corrected", corrected);
                    o.put("kept", new JSONArray(kept));
                    o.put("alts", new JSONArray(chosen.alts));
                    o.put("spell", chosen.spell.available);
                    o.put("typos", chosen.spell.typos.size());
                } catch (Exception ignored) { }
                done.run(o);
            });
        });
    }

    private static Ink buildInk(JSONArray strokes) throws Exception {
        Ink.Builder ib = Ink.builder();
        long t0 = System.currentTimeMillis();
        int added = 0;
        for (int s = 0; s < strokes.length(); s++) {
            JSONArray a = strokes.getJSONArray(s);
            if (a.length() < 3) continue;
            Ink.Stroke.Builder sb = Ink.Stroke.builder();
            for (int i = 0; i + 2 < a.length(); i += 3) {
                long t = a.optLong(i + 2, 0);
                sb.addPoint(Ink.Point.create((float) a.getDouble(i), (float) a.getDouble(i + 1), t > 0 ? t : t0 + added * 10L + i));
            }
            ib.addStroke(sb.build());
            added++;
        }
        if (added == 0) throw new Exception("empty");
        return ib.build();
    }

    private void evalChain(final List<Integer> langs, final int k, final Ink ink, final RecognitionContext rc, final List<Eval> out, final Runnable end) {
        if (k >= langs.size()) { end.run(); return; }
        bestCandidate(langs.get(k), ink, rc, e -> { out.add(e); evalChain(langs, k + 1, ink, rc, out, end); });
    }

    /** Bir dilin en fazla 3 adayını yazım denetiminden geçirip en az hatalı olanı seçer. */
    private void bestCandidate(final int lang, Ink ink, RecognitionContext rc, final EvalDone done) {
        recognizers[lang].recognize(ink, rc)
                .addOnSuccessListener(result -> {
                    final List<String> cands = new ArrayList<>();
                    try {
                        var list = result.getCandidates();
                        for (int i = 0; i < list.size() && cands.size() < 3; i++) {
                            String t = list.get(i).getText();
                            if (t != null && t.trim().length() > 0) cands.add(t.trim());
                        }
                    } catch (Exception ignored) { }
                    if (cands.isEmpty()) { done.run(null); return; }
                    final List<Eval> evs = new ArrayList<>();
                    spellEach(lang, cands, 0, evs, () -> {
                        Eval best = null;
                        for (Eval e : evs) if (best == null || e.spell.typos.size() < best.spell.typos.size()) best = e; // eşitlikte ML Kit sırası korunur
                        done.run(best);
                    });
                })
                .addOnFailureListener(e -> { lastError = String.valueOf(e.getMessage()); done.run(null); });
    }

    private void spellEach(final int lang, final List<String> cands, final int k, final List<Eval> out, final Runnable end) {
        if (k >= cands.size()) { end.run(); return; }
        final String t = cands.get(k);
        spellCheck(t, LOCALES[lang], s -> { out.add(new Eval(lang, t, s, cands)); spellEach(lang, cands, k + 1, out, end); });
    }

    /** Düşük ceza = o dil daha olası. */
    private double penalty(Eval e) {
        double p = e.spell.available && e.spell.words > 0 ? (double) e.spell.typos.size() / e.spell.words : 0.5; // denetleyici yoksa nötr
        if (e.lang == TR && TURKISH_CHARS.matcher(e.text).find()) p -= 0.25;
        if (e.lang == lastLanguage) p -= 0.05;
        return p;
    }

    /* ---------- yazım denetimi (sistemin denetleyicisi; Samsung Klavye'de TR ve EN dil paketleri gerekir) ---------- */

    private void spellCheck(final String text, Locale locale, final SpellDone done) {
        final int words = countWords(text);
        final boolean[] finished = {false};
        final SpellCheckerSession[] holder = {null};
        try {
            TextServicesManager tsm = (TextServicesManager) ctx.getSystemService(Context.TEXT_SERVICES_MANAGER_SERVICE);
            SpellCheckerSession.SpellCheckerSessionListener listener = new SpellCheckerSession.SpellCheckerSessionListener() {
                @Override public void onGetSuggestions(SuggestionsInfo[] results) { }
                @Override public void onGetSentenceSuggestions(SentenceSuggestionsInfo[] results) {
                    if (finished[0]) return;
                    finished[0] = true;
                    List<Typo> typos = new ArrayList<>();
                    if (results != null) for (SentenceSuggestionsInfo si : results) {
                        if (si == null) continue;
                        for (int i = 0; i < si.getSuggestionsCount(); i++) {
                            SuggestionsInfo info = si.getSuggestionsInfoAt(i);
                            if (info == null) continue;
                            if ((info.getSuggestionsAttributes() & SuggestionsInfo.RESULT_ATTR_LOOKS_LIKE_TYPO) == 0) continue;
                            int st = si.getOffsetAt(i), len = si.getLengthAt(i);
                            if (st < 0 || len <= 0 || st + len > text.length()) continue;
                            typos.add(new Typo(st, st + len, info.getSuggestionsCount() > 0 ? info.getSuggestionAt(0) : null));
                        }
                    }
                    close(holder[0]);
                    done.run(new Spell(true, words, typos));
                }
            };
            // false: kullanıcının klavye dili ne olursa olsun istenen dilin (tr ya da en) sözlüğü kullanılır
            holder[0] = tsm == null ? null : tsm.newSpellCheckerSession(null, locale, listener, false);
        } catch (Exception e) { holder[0] = null; }
        if (holder[0] == null) { finished[0] = true; done.run(new Spell(false, words, Collections.<Typo>emptyList())); return; }
        try {
            holder[0].getSentenceSuggestions(new TextInfo[]{new TextInfo(text)}, 3);
        } catch (Exception e) {
            finished[0] = true; close(holder[0]); done.run(new Spell(false, words, Collections.<Typo>emptyList())); return;
        }
        // Bazı denetleyiciler hiç yanıt vermeyebilir: 2,5 sn sonra denetleyicisiz devam et
        main.postDelayed(() -> {
            if (finished[0]) return;
            finished[0] = true; close(holder[0]);
            done.run(new Spell(false, words, Collections.<Typo>emptyList()));
        }, 2500);
    }

    private static void close(SpellCheckerSession s) { try { if (s != null) s.close(); } catch (Exception ignored) { } }

    private static int countWords(String t) {
        int n = 0; for (String w : t.trim().split("\\s+")) if (w.length() > 0) n++; return n;
    }

    private interface Corrected { void run(String corrected, List<String> kept); }

    /** Seçilen dilde düzeltir; diğer dilde geçerli olan kelimelere (dil karıştırma) dokunmaz. */
    private void applyCorrections(final Eval e, final Corrected done) {
        if (!e.spell.available || e.spell.typos.isEmpty()) { done.run(e.text, Collections.<String>emptyList()); return; }
        int other = e.lang == TR ? EN : TR;
        spellCheck(e.text, LOCALES[other], otherCheck -> {
            List<String> kept = new ArrayList<>();
            StringBuilder sb = new StringBuilder(e.text);
            List<Typo> sorted = new ArrayList<>(e.spell.typos);
            Collections.sort(sorted, (a, b) -> b.start - a.start); // sondan başa: indeksler kaymasın
            for (Typo t : sorted) {
                String word = e.text.substring(t.start, t.end);
                boolean validInOther = otherCheck.available;
                if (validInOther) for (Typo o : otherCheck.typos) if (o.start < t.end && t.start < o.end) { validInOther = false; break; }
                if (validInOther) kept.add(word);
                else if (t.suggestion != null && t.suggestion.length() > 0) sb.replace(t.start, t.end, matchCase(word, t.suggestion, LOCALES[e.lang]));
            }
            Collections.reverse(kept);
            done.run(sb.toString(), kept);
        });
    }

    private static String matchCase(String original, String suggestion, Locale loc) {
        if (original.length() > 0 && Character.isUpperCase(original.charAt(0)) && Character.isLowerCase(suggestion.charAt(0)))
            return suggestion.substring(0, 1).toUpperCase(loc) + suggestion.substring(1);
        return suggestion;
    }

    private static JSONObject fail(String id, String msg) {
        JSONObject o = new JSONObject();
        try { o.put("id", id); o.put("ok", false); o.put("error", msg); } catch (Exception ignored) { }
        return o;
    }

    void close() {
        for (DigitalInkRecognizer r : recognizers) { try { if (r != null) r.close(); } catch (Exception ignored) { } }
    }
}
