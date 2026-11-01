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

        // Diller AYNI ANDA tanınır (önceden sırayla)
        final Eval[] evals = new Eval[2];
        final int[] left = {usable.size()};
        final Runnable all = () -> finish(id, evals, done);
        for (final int l : usable) {
            bestCandidate(l, ink, rc, e -> { evals[l] = e; if (--left[0] == 0) all.run(); });
        }
    }

    /** En olası dili seçer, o dilde düzeltir ve sonucu hazırlar. */
    private void finish(final String id, final Eval[] evals, final Done done) {
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
    }

    /**
     * Yalnızca metin (el yazısı yok): ayrı düşmüş parçalar birleştirilince yazım düzeltmesi için.
     * İstek: {"id","text","mode":"auto|tr|en"} — sonuç biçimi recognize ile aynı.
     */
    void correctText(final JSONObject req, final Done done) {
        final String id = req.optString("id");
        final String text = req.optString("text", "").trim();
        if (text.length() == 0) { done.run(fail(id, "Metin boş")); return; }
        String mode = req.optString("mode", "auto");
        final List<Integer> langs = new ArrayList<>();
        if ("tr".equals(mode)) langs.add(TR);
        else if ("en".equals(mode)) langs.add(EN);
        else { langs.add(TR); langs.add(EN); }
        final Eval[] evals = new Eval[2];
        final int[] left = {langs.size()};
        for (final int l : langs) {
            lanes[l].submit(Collections.singletonList(text), sp -> {
                evals[l] = new Eval(l, text, sp.get(0), Collections.singletonList(text));
                if (--left[0] == 0) finish(id, evals, done);
            });
        }
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
                    // tüm adaylar TEK istekte denetlenir
                    lanes[lang].submit(cands, spells -> {
                        Eval best = null;
                        for (int i = 0; i < cands.size(); i++) {
                            Eval e = new Eval(lang, cands.get(i), spells.get(i), cands);
                            if (best == null || e.spell.typos.size() < best.spell.typos.size()) best = e; // eşitlikte ML Kit sırası korunur
                            if (e.spell.available && e.spell.typos.isEmpty()) break;
                        }
                        done.run(best);
                    });
                })
                .addOnFailureListener(e -> { lastError = String.valueOf(e.getMessage()); done.run(null); });
    }

    /** Düşük ceza = o dil daha olası. */
    private double penalty(Eval e) {
        double p = e.spell.available && e.spell.words > 0 ? (double) e.spell.typos.size() / e.spell.words : 0.5; // denetleyici yoksa nötr
        if (e.lang == TR && TURKISH_CHARS.matcher(e.text).find()) p -= 0.25;
        if (e.lang == lastLanguage) p -= 0.05;
        return p;
    }

    /* ---------- yazım denetimi (sistemin denetleyicisi; Samsung Klavye'de TR ve EN dil paketleri gerekir) ----------
       Her dil için tek bir oturum açık tutulur (her denetimde yeniden bağlanmak yavaştı). İstekler sıraya girer,
       aynı anda biri işlenir. Denetleyici 1,5 sn içinde yanıt vermezse birkaç dakika boyunca beklenmez. */
    private interface SpellsDone { void run(List<Spell> spells); }

    private final class SpellLane {
        final int lang;
        SpellCheckerSession session;
        final java.util.ArrayDeque<Object[]> queue = new java.util.ArrayDeque<>();
        Object[] cur;            // {List<String> texts, SpellsDone cb, Runnable timeout}
        long brokenUntil = 0;
        final SpellCheckerSession.SpellCheckerSessionListener listener = new SpellCheckerSession.SpellCheckerSessionListener() {
            @Override public void onGetSuggestions(SuggestionsInfo[] results) { }
            @Override public void onGetSentenceSuggestions(SentenceSuggestionsInfo[] results) {
                Object[] j = cur; if (j == null) return;
                cur = null; main.removeCallbacks((Runnable) j[2]);
                deliver(j, parse(texts(j), results));
                next();
            }
        };
        SpellLane(int lang) { this.lang = lang; }
        @SuppressWarnings("unchecked") List<String> texts(Object[] j) { return (List<String>) j[0]; }
        void deliver(Object[] j, List<Spell> r) { try { ((SpellsDone) j[1]).run(r); } catch (Exception ignored) { } }
        void submit(List<String> texts, SpellsDone cb) { queue.add(new Object[]{new ArrayList<>(texts), cb, null}); if (cur == null) next(); }
        void closeSession() { HandwritingCorrector.close(session); session = null; }
        void next() {
            while (cur == null && !queue.isEmpty()) {
                final Object[] j = queue.poll();
                if (System.currentTimeMillis() < brokenUntil) { deliver(j, unavailable(texts(j))); continue; }
                if (session == null) {
                    try {
                        TextServicesManager tsm = (TextServicesManager) ctx.getSystemService(Context.TEXT_SERVICES_MANAGER_SERVICE);
                        // false: kullanıcının klavye dili ne olursa olsun istenen dilin (tr ya da en) sözlüğü kullanılır
                        session = tsm == null ? null : tsm.newSpellCheckerSession(null, LOCALES[lang], listener, false);
                    } catch (Exception e) { session = null; }
                }
                if (session == null) { brokenUntil = System.currentTimeMillis() + 10 * 60000L; deliver(j, unavailable(texts(j))); continue; }
                List<String> t = texts(j);
                TextInfo[] tis = new TextInfo[t.size()];
                for (int i = 0; i < tis.length; i++) tis[i] = new TextInfo(t.get(i));
                cur = j;
                j[2] = (Runnable) () -> {
                    if (cur != j) return;
                    cur = null; closeSession(); brokenUntil = System.currentTimeMillis() + 3 * 60000L;
                    deliver(j, unavailable(texts(j)));
                    next();
                };
                try {
                    session.getSentenceSuggestions(tis, 3);
                } catch (Exception e) {
                    cur = null; closeSession(); deliver(j, unavailable(t)); continue;
                }
                main.postDelayed((Runnable) j[2], 1500);
            }
        }
    }

    private final SpellLane[] lanes = {new SpellLane(TR), new SpellLane(EN)};

    private static List<Spell> unavailable(List<String> texts) {
        List<Spell> r = new ArrayList<>();
        for (String t : texts) r.add(new Spell(false, countWords(t), Collections.<Typo>emptyList()));
        return r;
    }

    private static List<Spell> parse(List<String> texts, SentenceSuggestionsInfo[] results) {
        List<Spell> out = new ArrayList<>();
        for (int k = 0; k < texts.size(); k++) {
            String text = texts.get(k);
            SentenceSuggestionsInfo si = results != null && k < results.length ? results[k] : null;
            List<Typo> typos = new ArrayList<>();
            if (si != null) for (int i = 0; i < si.getSuggestionsCount(); i++) {
                SuggestionsInfo info = si.getSuggestionsInfoAt(i);
                if (info == null) continue;
                if ((info.getSuggestionsAttributes() & SuggestionsInfo.RESULT_ATTR_LOOKS_LIKE_TYPO) == 0) continue;
                int st = si.getOffsetAt(i), len = si.getLengthAt(i);
                if (st < 0 || len <= 0 || st + len > text.length()) continue;
                typos.add(new Typo(st, st + len, info.getSuggestionsCount() > 0 ? info.getSuggestionAt(0) : null));
            }
            out.add(new Spell(si != null || results != null, countWords(text), typos));
        }
        return out;
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
        lanes[other].submit(Collections.singletonList(e.text), list -> {
            Spell otherCheck = list.get(0);
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
        for (SpellLane l : lanes) l.closeSession();
    }
}
