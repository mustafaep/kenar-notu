package com.kenarnotu.app;

import android.app.DownloadManager;
import android.content.Context;
import android.content.SharedPreferences;
import android.database.Cursor;
import android.net.Uri;
import android.os.Handler;
import android.os.Looper;
import android.os.StatFs;
import android.util.Base64;

import com.google.ai.edge.litertlm.Backend;
import com.google.ai.edge.litertlm.Content;
import com.google.ai.edge.litertlm.Contents;
import com.google.ai.edge.litertlm.Conversation;
import com.google.ai.edge.litertlm.ConversationConfig;
import com.google.ai.edge.litertlm.Engine;
import com.google.ai.edge.litertlm.EngineConfig;
import com.google.ai.edge.litertlm.ExperimentalFlags;
import com.google.ai.edge.litertlm.Message;
import com.google.ai.edge.litertlm.MessageCallback;
import com.google.ai.edge.litertlm.SamplerConfig;

import org.json.JSONObject;

import java.io.File;
import java.util.Collections;
import java.util.concurrent.CancellationException;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Tabletteki gelişmiş el yazısı okuma: Gemma 4 E2B (Google, Apache 2.0), LiteRT-LM ile cihazda çalışır.
 *
 *  - Model bir kez Hugging Face'ten indirilir (≈2,6 GB; sistemin indirme yöneticisiyle, yalnızca Wi-Fi'da,
 *    uygulamanın kendi klasörüne: Android/data/com.kenarnotu.app/files/models). Sonra internet gerekmez.
 *  - Motor ilk okumada (ya da düzenleyici açılınca) arka planda yüklenir; önce grafik işlemcisi (GPU), olmazsa işlemci (CPU).
 *  - İstekler tek bir arka plan iş parçacığında sırayla işlenir; her okuma kendi konuşmasında yapılır (geçmiş tutulmaz).
 *
 * JS köprüsü (MainActivity.Bridge): localStatus / localDownload / localCancel / localDelete / localPrepare / localRead
 * Sonuçlar: window.__localStatus(json) ve window.__localResult(json)
 */
final class LocalReader {

    interface Sink { void status(String json); void result(String json); }

    static final String MODEL_NAME = "Gemma 4 E2B";
    static final String MODEL_FILE = "gemma-4-E2B-it.litertlm";
    static final String MODEL_URL = "https://huggingface.co/litert-community/gemma-4-E2B-it-litert-lm/resolve/main/" + MODEL_FILE;
    static final long MODEL_BYTES = 2583L * 1000 * 1000;     // ≈2,58 GB (ilerleme için tahmin)
    static final long MODEL_MIN_BYTES = 2000L * 1000 * 1000; // tam inmiş dosya bundan büyük olmalı
    private static final String PREFS = "localReader", K_DL = "dlId", K_GPU_TRY = "gpuTrying", K_GPU_BAD = "gpuBad";

    private final Context ctx;
    private final Sink sink;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService exec = Executors.newSingleThreadExecutor();
    private volatile Engine engine;
    private volatile String backend = "";
    private volatile boolean loading;
    private volatile String error = "";
    private volatile long loadMs;
    private volatile Integer visMax;   // motorun görüntü başına kabul ettiği en çok görsel token (bu model dosyasında 280)
    private boolean polling;

    LocalReader(Context c, Sink s) {
        ctx = c.getApplicationContext();
        sink = s;
        // önceki açılışta GPU denenirken uygulama kapandıysa (yerel çökme) bu cihazda GPU bir daha denenmez
        SharedPreferences p = prefs();
        if (p.getBoolean(K_GPU_TRY, false)) p.edit().putBoolean(K_GPU_TRY, false).putBoolean(K_GPU_BAD, true).apply();
    }

    private SharedPreferences prefs() { return ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE); }

    private File dir() {
        File d = ctx.getExternalFilesDir("models");
        if (d != null && !d.exists()) d.mkdirs();
        return d;
    }
    private File modelFile() { File d = dir(); return d == null ? null : new File(d, MODEL_FILE); }
    private File partFile() { File d = dir(); return d == null ? null : new File(d, MODEL_FILE + ".part"); }
    private boolean modelReady() { File f = modelFile(); return f != null && f.isFile() && f.length() >= MODEL_MIN_BYTES; }

    /* ---------- durum ---------- */

    /** {state: missing|downloading|waiting|ready|loading|loaded|error, done, total, reason, backend, loadMs, error, free, name} */
    String status() {
        JSONObject o = new JSONObject();
        try {
            o.put("name", MODEL_NAME);
            o.put("total", MODEL_BYTES);
            File d = dir();
            if (d != null) { try { o.put("free", new StatFs(d.getAbsolutePath()).getAvailableBytes()); } catch (Exception ignored) { } }
            long id = prefs().getLong(K_DL, -1);
            String state;
            if (engine != null) state = "loaded";
            else if (loading) state = "loading";
            else if (modelReady()) state = "ready";
            else if (id >= 0) {
                long[] q = query(id);
                if (q == null) state = "missing";
                else {
                    o.put("done", Math.max(0, q[1]));
                    if (q[2] > 0) o.put("total", q[2]);
                    int st = (int) q[0];
                    if (st == DownloadManager.STATUS_PAUSED || st == DownloadManager.STATUS_PENDING) {
                        state = "waiting";
                        o.put("reason", pauseReason((int) q[3]));
                    } else if (st == DownloadManager.STATUS_FAILED) {
                        state = "error";
                    } else state = "downloading";
                }
            } else state = "missing";
            if (error.length() > 0 && !"loaded".equals(state)) { o.put("error", error); if ("missing".equals(state)) state = "error"; }
            o.put("state", state);
            o.put("backend", backend);
            o.put("loadMs", loadMs);
            if (visMax != null) o.put("visMax", visMax);
        } catch (Exception ignored) { }
        return o.toString();
    }

    private void push() { final String s = status(); main.post(() -> sink.status(s)); }

    /** {status, bytesSoFar, totalBytes, reason} ya da null */
    private long[] query(long id) {
        DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
        if (dm == null) return null;
        Cursor c = null;
        try {
            c = dm.query(new DownloadManager.Query().setFilterById(id));
            if (c == null || !c.moveToFirst()) return null;
            return new long[]{
                    c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_STATUS)),
                    c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_BYTES_DOWNLOADED_SO_FAR)),
                    c.getLong(c.getColumnIndexOrThrow(DownloadManager.COLUMN_TOTAL_SIZE_BYTES)),
                    c.getInt(c.getColumnIndexOrThrow(DownloadManager.COLUMN_REASON))};
        } catch (Exception e) {
            return null;
        } finally {
            if (c != null) c.close();
        }
    }

    private static String pauseReason(int r) {
        switch (r) {
            case DownloadManager.PAUSED_QUEUED_FOR_WIFI: return "Wi-Fi bekleniyor";
            case DownloadManager.PAUSED_WAITING_FOR_NETWORK: return "İnternet bağlantısı bekleniyor";
            case DownloadManager.PAUSED_WAITING_TO_RETRY: return "Bağlantı koptu, yeniden denenecek";
            default: return "Sırada bekliyor";
        }
    }

    private static String failReason(int r) {
        if (r == 401 || r == 403) return "Hugging Face indirmeye izin vermedi (" + r + ")";
        if (r == 404) return "Model dosyası Hugging Face'te bulunamadı (404)";
        if (r >= 400 && r < 600) return "Sunucu hatası (" + r + ")";
        switch (r) {
            case DownloadManager.ERROR_INSUFFICIENT_SPACE: return "Tablette yeterli boş yer yok (yaklaşık 2,6 GB gerekir)";
            case DownloadManager.ERROR_DEVICE_NOT_FOUND: return "Depolama alanı bulunamadı";
            case DownloadManager.ERROR_FILE_ERROR: return "Dosya yazılamadı";
            case DownloadManager.ERROR_HTTP_DATA_ERROR: return "Bağlantı hatası, yeniden deneyin";
            case DownloadManager.ERROR_TOO_MANY_REDIRECTS: return "Çok fazla yönlendirme";
            default: return "İndirme başarısız (" + r + ")";
        }
    }

    /* ---------- indirme ---------- */

    void download() {
        main.post(() -> {
            try {
                if (modelReady()) { push(); return; }
                DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm == null) throw new Exception("İndirme yöneticisi yok");
                long id = prefs().getLong(K_DL, -1);
                if (id >= 0) {
                    long[] q = query(id);
                    if (q != null && q[0] != DownloadManager.STATUS_FAILED && q[0] != DownloadManager.STATUS_SUCCESSFUL) { poll(); return; }
                    if (q != null) dm.remove(id);
                }
                File part = partFile();
                if (part == null) throw new Exception("Depolama alanı bulunamadı");
                if (part.exists()) part.delete();
                DownloadManager.Request r = new DownloadManager.Request(Uri.parse(MODEL_URL))
                        .setTitle("Kenar Notu · el yazısı modeli")
                        .setDescription(MODEL_NAME + " (yaklaşık 2,6 GB)")
                        .setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE)
                        .setAllowedOverMetered(false)
                        .setAllowedOverRoaming(false)
                        .setDestinationInExternalFilesDir(ctx, "models", MODEL_FILE + ".part");
                id = dm.enqueue(r);
                prefs().edit().putLong(K_DL, id).apply();
                error = "";
                poll();
            } catch (Exception e) {
                error = "İndirme başlatılamadı: " + e.getMessage();
                push();
            }
        });
    }

    /** İndirme sürerken her saniye durumu bildirir; bitince dosyayı yerine koyar. */
    private void poll() {
        push();
        if (polling) return;
        polling = true;
        main.postDelayed(new Runnable() {
            @Override public void run() {
                long id = prefs().getLong(K_DL, -1);
                long[] q = id >= 0 ? query(id) : null;
                if (q == null) { polling = false; prefs().edit().remove(K_DL).apply(); push(); return; }
                int st = (int) q[0];
                if (st == DownloadManager.STATUS_SUCCESSFUL) {
                    polling = false;
                    File part = partFile(), f = modelFile();
                    prefs().edit().remove(K_DL).apply();
                    if (part != null && f != null && part.length() >= MODEL_MIN_BYTES) {
                        if (f.exists()) f.delete();
                        if (!part.renameTo(f)) error = "İndirilen dosya yerine konamadı";
                    } else error = "İndirilen dosya eksik görünüyor; yeniden indirin";
                    push();
                    return;
                }
                if (st == DownloadManager.STATUS_FAILED) {
                    polling = false;
                    error = failReason((int) q[3]);
                    DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
                    if (dm != null) dm.remove(id); // yarım dosyayı da siler
                    prefs().edit().remove(K_DL).apply();
                    push();
                    return;
                }
                push();
                main.postDelayed(this, 1000);
            }
        }, 1000);
    }

    /** Uygulama açılınca: önceki oturumdan süren bir indirme varsa izlemeye devam et. */
    void resume() {
        main.post(() -> { if (prefs().getLong(K_DL, -1) >= 0) poll(); });
    }

    void cancel() {
        main.post(() -> {
            long id = prefs().getLong(K_DL, -1);
            DownloadManager dm = (DownloadManager) ctx.getSystemService(Context.DOWNLOAD_SERVICE);
            if (id >= 0 && dm != null) dm.remove(id);
            prefs().edit().remove(K_DL).apply();
            File part = partFile();
            if (part != null && part.exists()) part.delete();
            error = "";
            push();
        });
    }

    void delete() {
        exec.submit(() -> {
            closeEngine();
            File f = modelFile(), part = partFile();
            if (f != null && f.exists()) f.delete();
            if (part != null && part.exists()) part.delete();
            error = "";
            push();
        });
    }

    /* ---------- motor ---------- */

    /** Düzenleyici açılınca: model varsa arka planda yükle (ilk düzeltme beklemesin). */
    void prepare() {
        if (engine != null || loading || !modelReady()) { push(); return; }
        exec.submit(() -> { try { ensureEngine(); } catch (Throwable ignored) { } });
    }

    private Engine ensureEngine() throws Exception {
        Engine e0 = engine;
        if (e0 != null) return e0;
        if (!modelReady()) throw new Exception("nomodel");
        loading = true;
        push();
        long t0 = System.currentTimeMillis();
        File cache = new File(ctx.getCacheDir(), "litertlm");
        if (!cache.exists()) cache.mkdirs();
        boolean gpuBad = prefs().getBoolean(K_GPU_BAD, false);
        String[][] plans = gpuBad ? new String[][]{{"CPU", "CPU"}} : new String[][]{{"GPU", "GPU"}, {"GPU", "CPU"}, {"CPU", "CPU"}};
        Throwable last = null;
        try {
            for (String[] plan : plans) {
                // Görsel token üst sınırı: bu model dosyası görüntü başına en çok 280 kabul ediyor (1120 istenince
                // "Requested target capacity exceeds maximum available signature length (280)" hatası). Önce 280 denenir;
                // hata başka bir sınır bildirirse onunla, olmazsa sınır belirtmeden yeniden denenir.
                Integer budget = 280;
                for (int attempt = 0; attempt < 3; attempt++) {
                    Engine e = null;
                    boolean gpu = "GPU".equals(plan[0]) || "GPU".equals(plan[1]);
                    try {
                        if (gpu) prefs().edit().putBoolean(K_GPU_TRY, true).commit();
                        ExperimentalFlags.INSTANCE.setVisualTokenBudget(budget);
                        e = new Engine(new EngineConfig(modelFile().getAbsolutePath(), backendOf(plan[0]), backendOf(plan[1]), null, 4096, 1, cache.getAbsolutePath()));
                        e.initialize();
                        engine = e;
                        visMax = budget;
                        backend = plan[0].equals(plan[1]) ? plan[0] : plan[0] + "+" + plan[1];
                        loadMs = System.currentTimeMillis() - t0;
                        error = "";
                        return e;
                    } catch (Throwable t) {
                        last = t;
                        try { if (e != null && e.isInitialized()) e.close(); } catch (Throwable ignored) { }
                        Integer lim = signatureLimit(t);
                        if (lim != null && !lim.equals(budget)) { budget = lim; continue; }
                        if (budget != null && msg(t).toLowerCase().contains("signature")) { budget = null; continue; }
                        break;
                    } finally {
                        if (gpu) prefs().edit().putBoolean(K_GPU_TRY, false).commit();
                    }
                }
            }
            error = "Model yüklenemedi: " + msg(last);
            throw new Exception(error);
        } finally {
            loading = false;
            push();
        }
    }

    /** "... maximum available signature length (280)" → 280 */
    private static Integer signatureLimit(Throwable t) {
        java.util.regex.Matcher m = java.util.regex.Pattern.compile("signature length \\((\\d+)\\)").matcher(msg(t));
        if (!m.find()) return null;
        try { int v = Integer.parseInt(m.group(1)); return v > 0 ? v : null; } catch (Exception ex) { return null; }
    }

    private static Backend backendOf(String name) { return "GPU".equals(name) ? new Backend.GPU() : new Backend.CPU(); }

    private void closeEngine() {
        Engine e = engine;
        engine = null;
        visMax = null;
        backend = "";
        if (e != null) { try { e.close(); } catch (Throwable ignored) { } }
    }

    /** Bellek azalınca ya da uygulama kapanırken motoru bırakır (model dosyası kalır). */
    void release() {
        exec.submit(() -> { closeEngine(); push(); });
    }

    void shutdown() {
        exec.submit(this::closeEngine);
        exec.shutdown();
    }

    private static String msg(Throwable t) {
        if (t == null) return "bilinmeyen hata";
        String m = t.getMessage();
        return m == null || m.length() == 0 ? t.getClass().getSimpleName() : (m.length() > 200 ? m.substring(0, 200) : m);
    }

    /* ---------- okuma ---------- */

    /**
     * İstek: {"id","png": base64, "system", "prompt", "budget": 560|1120, "maxChars"}
     * Sonuç: {"id","ok":true,"text","ms","loadMs","backend"} ya da {"id","ok":false,"error"}
     */
    void read(final String json) {
        exec.submit(() -> {
            String id = "";
            JSONObject out = new JSONObject();
            Conversation conv = null;
            try {
                JSONObject req = new JSONObject(json);
                id = req.optString("id");
                out.put("id", id);
                boolean wasLoaded = engine != null;
                Engine e = ensureEngine();
                byte[] png = Base64.decode(req.getString("png"), Base64.DEFAULT);
                // okuma başına görsel bütçe motorun sınırını aşamaz
                Integer vm = visMax;
                ExperimentalFlags.INSTANCE.setVisualTokenBudget(vm == null ? null : Integer.valueOf(Math.min(Math.max(70, req.optInt("budget", vm)), vm)));
                // greedy (topK 1, sıcaklık 0): okuma için en tutarlı sonuç
                ConversationConfig cc = new ConversationConfig(Contents.Companion.of(req.optString("system", "")), Collections.<Message>emptyList(), Collections.emptyList(), new SamplerConfig(1, 1.0, 0.0, 0));
                conv = e.createConversation(cc);
                final Conversation cv = conv;
                final StringBuilder sb = new StringBuilder();
                final CountDownLatch done = new CountDownLatch(1);
                final Throwable[] err = {null};
                final int maxChars = Math.max(40, req.optInt("maxChars", 1500));
                final boolean[] cut = {false};
                long t0 = System.currentTimeMillis();
                conv.sendMessageAsync(Contents.Companion.of(new Content.ImageBytes(png), new Content.Text(req.optString("prompt", ""))), new MessageCallback() {
                    @Override public void onMessage(Message m) {
                        synchronized (sb) { sb.append(m.toString()); if (sb.length() > maxChars && !cut[0]) { cut[0] = true; try { cv.cancelProcess(); } catch (Throwable ignored) { } } }
                    }
                    @Override public void onDone() { done.countDown(); }
                    @Override public void onError(Throwable t) { err[0] = t; done.countDown(); }
                });
                if (!done.await(90, TimeUnit.SECONDS)) {
                    try { conv.cancelProcess(); } catch (Throwable ignored) { }
                    done.await(5, TimeUnit.SECONDS);
                    throw new Exception("Zaman aşımı");
                }
                if (err[0] != null && !(cut[0] && err[0] instanceof CancellationException)) throw new Exception(msg(err[0]));
                String text;
                synchronized (sb) { text = sb.toString(); }
                out.put("ok", true);
                out.put("text", text);
                out.put("cut", cut[0]);
                out.put("ms", System.currentTimeMillis() - t0);
                out.put("loadMs", wasLoaded ? 0 : loadMs);
                out.put("backend", backend);
            } catch (Throwable t) {
                try {
                    out.put("id", id);
                    out.put("ok", false);
                    out.put("error", "nomodel".equals(t.getMessage()) ? "nomodel" : msg(t));
                } catch (Exception ignored) { }
            } finally {
                if (conv != null) { try { conv.close(); } catch (Throwable ignored) { } }
            }
            final String s = out.toString();
            main.post(() -> sink.result(s));
        });
    }
}
