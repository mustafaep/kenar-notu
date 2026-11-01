package com.kenarnotu.app;

import android.content.Context;
import android.speech.tts.TextToSpeech;
import android.speech.tts.Voice;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Locale;
import java.util.Set;

/**
 * Sesli okuma (Android TextToSpeech). Varsayılan: İngiliz İngilizcesi (en-GB) kadın sesi.
 * Ses adları motora göre değişir; kadın sesi şu ipuçlarıyla tahmin edilir:
 *   - ses özelliklerinde "female" geçmesi,
 *   - Google ses motoru: en-gb-x-gba / gbc / gbg (kadın), gbd / rjs (erkek),
 *   - Samsung ses motoru: adında "SMTf" (kadın) / "SMTm" (erkek).
 * Kullanıcı Ayarlar'dan belirli bir sesi seçebilir.
 */
final class Speaker implements TextToSpeech.OnInitListener {

    interface Ready { void run(); }

    private final TextToSpeech tts;
    private final Ready onReady;
    private volatile boolean ready = false, failed = false;
    private String pendingText, pendingLang, pendingVoice;
    private float pendingRate = 1f;
    private int seq = 0;

    Speaker(Context c, Ready onReady) {
        this.onReady = onReady;
        tts = new TextToSpeech(c.getApplicationContext(), this);
    }

    @Override
    public void onInit(int status) {
        ready = status == TextToSpeech.SUCCESS;
        failed = !ready;
        if (ready && pendingText != null) {
            String t = pendingText; pendingText = null;
            speak(t, pendingLang, pendingRate, pendingVoice);
        }
        if (onReady != null) onReady.run();
    }

    boolean isReady() { return ready; }
    boolean isFailed() { return failed; }

    static boolean looksFemale(Voice v) {
        String n = v.getName().toLowerCase(Locale.ROOT);
        Set<String> f = v.getFeatures();
        if (f != null) for (String s : f) {
            String x = s.toLowerCase(Locale.ROOT);
            if (x.contains("female")) return true;
            if (x.contains("male")) return false;
        }
        if (n.contains("female") || n.contains("smtf") || n.contains("-x-gba") || n.contains("-x-gbc") || n.contains("-x-gbg") || n.contains("-x-tpf") || n.contains("-x-sfg") || n.contains("-x-iob") || n.contains("-x-tpc")) return true;
        return false;
    }

    static boolean looksMale(Voice v) {
        String n = v.getName().toLowerCase(Locale.ROOT);
        return n.contains("smtm") || n.contains("-x-gbd") || n.contains("-x-rjs") || n.contains("-x-iom") || n.contains("-x-tpd") || n.contains("-x-iol") || (n.contains("male") && !n.contains("female"));
    }

    private static boolean installed(Voice v) {
        Set<String> f = v.getFeatures();
        return f == null || !f.contains(TextToSpeech.Engine.KEY_FEATURE_NOT_INSTALLED);
    }

    /** İngilizce ve Türkçe sesler: [{name, lang, female, male, local, installed, quality}] */
    JSONArray voices() {
        JSONArray a = new JSONArray();
        if (!ready) return a;
        try {
            Set<Voice> vs = tts.getVoices();
            if (vs == null) return a;
            for (Voice v : vs) {
                String lang = v.getLocale().getLanguage();
                if (!"en".equals(lang) && !"tr".equals(lang)) continue;
                JSONObject o = new JSONObject();
                o.put("name", v.getName());
                o.put("lang", v.getLocale().toLanguageTag());
                o.put("female", looksFemale(v));
                o.put("male", looksMale(v));
                o.put("local", !v.isNetworkConnectionRequired());
                o.put("installed", installed(v));
                o.put("quality", v.getQuality());
                a.put(o);
            }
        } catch (Exception ignored) { }
        return a;
    }

    /** Dil için en uygun sesi seçer: istenen ad > kadın + cihazda + yüksek kalite. */
    private Voice pick(Locale want, String preferred) {
        Set<Voice> vs;
        try { vs = tts.getVoices(); } catch (Exception e) { vs = null; }
        if (vs == null) return null;
        Voice best = null; int bestScore = Integer.MIN_VALUE;
        for (Voice v : vs) {
            Locale l = v.getLocale();
            if (preferred != null && preferred.length() > 0 && v.getName().equals(preferred) && installed(v)) return v;
            if (!l.getLanguage().equals(want.getLanguage())) continue;
            if (!installed(v)) continue;
            int sc = 0;
            if (want.getCountry().length() > 0 && want.getCountry().equals(l.getCountry())) sc += 100;
            if (looksFemale(v)) sc += 50; else if (looksMale(v)) sc -= 30;
            if (!v.isNetworkConnectionRequired()) sc += 20;
            sc += v.getQuality() / 50;
            if (sc > bestScore) { bestScore = sc; best = v; }
        }
        return best;
    }

    /** @return "ok", "nolang" (o dil için ses yok) ya da "wait" (motor hazırlanıyor) */
    String speak(String text, String lang, float rate, String voiceName) {
        if (text == null || text.trim().length() == 0) return "ok";
        if (!ready) {
            pendingText = text; pendingLang = lang; pendingRate = rate; pendingVoice = voiceName;
            return failed ? "noengine" : "wait";
        }
        Locale want = lang == null || lang.length() == 0 ? Locale.UK : Locale.forLanguageTag(lang);
        String result = "ok";
        try {
            Voice v = pick(want, voiceName);
            if (v != null) tts.setVoice(v);
            else {
                int r = tts.setLanguage(want);
                if (r == TextToSpeech.LANG_MISSING_DATA || r == TextToSpeech.LANG_NOT_SUPPORTED) {
                    result = "nolang";
                    if (!"en".equals(want.getLanguage())) tts.setLanguage(Locale.UK);
                }
            }
            tts.setSpeechRate(Math.max(.3f, Math.min(2f, rate)));
            tts.setPitch(1f);
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "kn" + (++seq));
        } catch (Exception e) {
            result = "error";
        }
        return result;
    }

    void stop() { try { if (ready) tts.stop(); } catch (Exception ignored) { } }

    void shutdown() { try { tts.stop(); tts.shutdown(); } catch (Exception ignored) { } }
}
