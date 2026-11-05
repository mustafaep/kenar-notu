package com.kenarnotu.app;

import android.app.Activity;
import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.ClipboardManager;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.graphics.Color;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.ParcelFileDescriptor;
import android.provider.MediaStore;
import android.view.MotionEvent;
import android.os.Parcelable;
import android.util.Base64;
import android.view.View;
import android.view.Window;
import android.webkit.CookieManager;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import org.json.JSONObject;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileDescriptor;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.Map;

/**
 * Kenar Notu Android kabuğu.
 * Web uygulaması uygulama paketinin içinden (assets/www) https://localhost adresiyle sunulur;
 * böylece IndexedDB, Web Crypto ve Microsoft girişi güvenli bir kaynakta çalışır.
 * S Pen olayları (basınç, eğim, yan tuş, havada imleç) WebView tarafından doğrudan sayfaya iletilir.
 */
public class MainActivity extends Activity {
    static final String HOST = "localhost";
    static final String START_URL = "https://localhost/";
    static final int REQ_FILE = 41;
    static final int REQ_SAVE = 42;
    static final int REQ_OPEN_DOC = 43;
    static final int REQ_SAVE_LINK = 44;
    static final int GRANT_READ = 1, GRANT_WRITE = 2, GRANT_PERSIST = 0x40;
    static final int CHUNK = 3 * 1024 * 1024;           // 3'ün katı: her parça ayrı base64 çözülebilir
    static final long MAX_INCOMING = 400L * 1024 * 1024;

    // View.SYSTEM_UI_FLAG_* değerleri
    static final int UI_LIGHT_STATUS = 0x2000, UI_LIGHT_NAV = 0x10, UI_IMMERSIVE_STICKY = 0x1000,
            UI_FULLSCREEN = 0x4, UI_HIDE_NAV = 0x2, UI_LAYOUT_STABLE = 0x100, UI_LAYOUT_HIDE_NAV = 0x200, UI_LAYOUT_FULLSCREEN = 0x400;

    WebView web;
    ValueCallback<Uri[]> fileCallback;
    final Object lock = new Object();
    ByteArrayOutputStream outBuf;
    String outName, outMime;
    byte[] pendingSave;
    byte[] inBytes;
    String inName;
    String inMeta = "{}";
    byte[] pendingLink;
    boolean barsLight = true, immersive = false, penButton = false;
    HandwritingCorrector corrector;   // el yazısı tanıma + yazım düzeltme (ML Kit, cihazda)
    volatile Speaker speaker;         // sesli okuma (en-GB kadın sesi)
    volatile LocalReader local;
    final HashMap<String, byte[]> fetches = new HashMap<>(); // docFetch ile okunan dosyalar (JS parça parça alır)       // tabletteki gelişmiş el yazısı okuma (Gemma 4 E2B, LiteRT-LM)

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        Window w = getWindow();
        w.addFlags(0x80000000); // FLAG_DRAWS_SYSTEM_BAR_BACKGROUNDS
        w.setStatusBarColor(Color.WHITE);
        w.setNavigationBarColor(Color.WHITE);
        applySystemUi();

        web = new WebView(this);
        web.setBackgroundColor(0xFFECEFF5);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setTextZoom(100);
        s.setMediaPlaybackRequiresUserGesture(true);
        s.setSupportMultipleWindows(false);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setUserAgentString(s.getUserAgentString() + " KenarNotu/" + BuildInfo.VERSION);

        CookieManager cm = CookieManager.getInstance();
        cm.setAcceptCookie(true);
        cm.setAcceptThirdPartyCookies(web, true);

        web.setWebViewClient(new Client());
        web.setWebChromeClient(new Chrome());
        web.addJavascriptInterface(new Bridge(), "KenarNative");
        setContentView(web);

        // S Pen yan tuşu ve silgi ucu: Android'den doğrudan okunur, sayfaya bildirilir
        web.setOnTouchListener(new View.OnTouchListener() {
            @Override
            public boolean onTouch(View v, MotionEvent e) { trackPen(e); return false; }
        });
        web.setOnHoverListener(new View.OnHoverListener() {
            @Override
            public boolean onHover(View v, MotionEvent e) { trackPen(e); return false; }
        });

        web.loadUrl(START_URL);
        handleIntent(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleIntent(intent);
    }

    @Override
    protected void onPause() {
        if (web != null) {
            web.evaluateJavascript("window.kenarFlush && window.kenarFlush()", null);
            web.onPause();
        }
        super.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.onResume();
    }

    @Override
    protected void onDestroy() {
        if (corrector != null) corrector.close();
        if (local != null) local.shutdown();
        if (speaker != null) speaker.shutdown();
        if (web != null) {
            web.destroy();
            web = null;
        }
        super.onDestroy();
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applySystemUi();
    }

    @Override
    public void onBackPressed() {
        if (web == null) { super.onBackPressed(); return; }
        web.evaluateJavascript("(window.kenarBack && window.kenarBack()) ? '1' : '0'", new ValueCallback<String>() {
            @Override
            public void onReceiveValue(String v) {
                if (v == null || !v.contains("1")) finish();
            }
        });
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == REQ_FILE) {
            if (fileCallback != null) {
                Uri[] result = null;
                if (resultCode == RESULT_OK && data != null && data.getData() != null) result = new Uri[]{data.getData()};
                fileCallback.onReceiveValue(result);
                fileCallback = null;
            }
            return;
        }
        if (requestCode == REQ_OPEN_DOC) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                final Uri uri = data.getData();
                final boolean canWrite = takePermission(uri, data.getFlags());
                new Thread(new Runnable() {
                    @Override
                    public void run() { readIncoming(uri, "doc", canWrite); }
                }).start();
            }
            return;
        }
        if (requestCode == REQ_SAVE_LINK) {
            final byte[] bytes = pendingLink;
            pendingLink = null;
            if (resultCode != RESULT_OK || data == null || data.getData() == null || bytes == null) { notifyJs("savelink", false, "cancel"); return; }
            final Uri uri = data.getData();
            takePermission(uri, data.getFlags() | GRANT_READ | GRANT_WRITE);
            new Thread(new Runnable() {
                @Override
                public void run() {
                    try {
                        writeTo(uri, bytes);
                        JSONObject m = docMeta(uri);
                        m.put("size", bytes.length);
                        notifyJsUi("savelink", true, m.toString());
                    } catch (Exception e) {
                        notifyJsUi("savelink", false, errText(e));
                    }
                }
            }).start();
            return;
        }
        if (requestCode == REQ_SAVE) {
            boolean ok = false;
            String msg = "";
            byte[] bytes = pendingSave;
            pendingSave = null;
            if (resultCode == RESULT_OK && data != null && data.getData() != null && bytes != null) {
                try {
                    OutputStream os = getContentResolver().openOutputStream(data.getData());
                    if (os == null) throw new IOException("Dosya yazılamadı");
                    os.write(bytes);
                    os.close();
                    ok = true;
                } catch (Exception e) {
                    msg = String.valueOf(e.getMessage());
                }
            } else {
                msg = "cancel";
            }
            notifyJs("save", ok, msg);
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
    }

    /* ---------------- sistem çubukları ---------------- */
    void applySystemUi() {
        int f = UI_LAYOUT_STABLE;
        if (barsLight) f |= UI_LIGHT_STATUS | UI_LIGHT_NAV;
        if (immersive) f |= UI_IMMERSIVE_STICKY | UI_FULLSCREEN | UI_HIDE_NAV | UI_LAYOUT_HIDE_NAV | UI_LAYOUT_FULLSCREEN;
        getWindow().getDecorView().setSystemUiVisibility(f);
    }

    /* ---------------- içerik sunucusu ve gezinme ---------------- */
    class Client extends WebViewClient {
        @Override
        public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (u == null || !"https".equals(u.getScheme()) || !HOST.equals(u.getHost())) return null;
            String path = u.getPath();
            if (path == null || path.length() == 0 || path.equals("/")) path = "/index.html";
            if (path.contains("..")) return notFound();
            try {
                InputStream in = getAssets().open("www" + path);
                Map<String, String> headers = new HashMap<String, String>();
                headers.put("Cache-Control", "no-cache");
                headers.put("Access-Control-Allow-Origin", "*");
                String mime = mimeFor(path);
                return new WebResourceResponse(mime, mime.startsWith("text/") || mime.contains("javascript") || mime.contains("json") ? "UTF-8" : null, 200, "OK", headers, in);
            } catch (IOException e) {
                return notFound();
            }
        }

        @Override
        public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
            Uri u = request.getUrl();
            if (u == null) return true;
            String scheme = u.getScheme(), host = u.getHost();
            if ("https".equals(scheme) && host != null && (HOST.equals(host) || isAuthHost(host))) return false;
            openExternal(u);
            return true;
        }
    }

    static boolean isAuthHost(String h) {
        h = h.toLowerCase();
        return h.equals("login.microsoftonline.com") || h.endsWith(".microsoftonline.com") || h.equals("login.microsoft.com")
                || h.equals("login.windows.net") || h.equals("live.com") || h.endsWith(".live.com")
                || h.equals("account.microsoft.com") || h.endsWith(".msauth.net") || h.endsWith(".msftauth.net")
                || h.endsWith(".microsoftonline-p.com");
    }

    WebResourceResponse notFound() {
        Map<String, String> headers = new HashMap<String, String>();
        return new WebResourceResponse("text/plain", "UTF-8", 404, "Not Found", headers, new ByteArrayInputStream(new byte[0]));
    }

    static String mimeFor(String path) {
        String p = path.toLowerCase();
        if (p.endsWith(".html") || p.endsWith(".htm")) return "text/html";
        if (p.endsWith(".js") || p.endsWith(".mjs")) return "application/javascript";
        if (p.endsWith(".css")) return "text/css";
        if (p.endsWith(".json")) return "application/json";
        if (p.endsWith(".webmanifest")) return "application/manifest+json";
        if (p.endsWith(".svg")) return "image/svg+xml";
        if (p.endsWith(".png")) return "image/png";
        if (p.endsWith(".jpg") || p.endsWith(".jpeg")) return "image/jpeg";
        if (p.endsWith(".webp")) return "image/webp";
        if (p.endsWith(".woff2")) return "font/woff2";
        if (p.endsWith(".woff")) return "font/woff";
        if (p.endsWith(".ttf")) return "font/ttf";
        if (p.endsWith(".wasm")) return "application/wasm";
        if (p.endsWith(".pdf")) return "application/pdf";
        if (p.endsWith(".txt") || p.endsWith(".md")) return "text/plain";
        return "application/octet-stream";
    }

    void openExternal(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(0x10000000); // FLAG_ACTIVITY_NEW_TASK
            startActivity(i);
        } catch (ActivityNotFoundException e) {
            toast("Bağlantı açılamadı");
        }
    }

    /* ---------------- dosya seçici ---------------- */
    class Chrome extends WebChromeClient {
        @Override
        public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
            if (fileCallback != null) fileCallback.onReceiveValue(null);
            fileCallback = callback;
            ArrayList<String> types = new ArrayList<String>();
            String[] accept = params.getAcceptTypes();
            if (accept != null) for (String a : accept) {
                if (a == null) continue;
                for (String part : a.split(",")) {
                    String t = part.trim();
                    if (t.contains("/") && !types.contains(t)) types.add(t);
                }
            }
            Intent i = new Intent("android.intent.action.OPEN_DOCUMENT");
            i.addCategory("android.intent.category.OPENABLE");
            if (types.size() == 1) i.setType(types.get(0));
            else {
                i.setType("*/*");
                if (types.size() > 1) i.putExtra("android.intent.extra.MIME_TYPES", types.toArray(new String[0]));
            }
            try {
                startActivityForResult(i, REQ_FILE);
            } catch (ActivityNotFoundException e) {
                fileCallback = null;
                callback.onReceiveValue(null);
                toast("Dosya seçici açılamadı");
                return false;
            }
            return true;
        }
    }

    /* ---------------- sayfa ↔ uygulama köprüsü ---------------- */
    @Override
    public void onTrimMemory(int level) {
        super.onTrimMemory(level);
        // bellek daralınca modelin belleğini bırak (dosya kalır; sonraki okumada yeniden yüklenir)
        if (local != null && (level == TRIM_MEMORY_RUNNING_CRITICAL || level >= TRIM_MEMORY_BACKGROUND)) local.release();
    }

    class Bridge {
        @JavascriptInterface
        public String version() { return BuildInfo.VERSION; }

        @JavascriptInterface
        public void begin(String name, String mime) {
            synchronized (lock) {
                outBuf = new ByteArrayOutputStream();
                outName = safeName(name);
                outMime = mime == null || mime.length() == 0 ? "application/octet-stream" : mime;
            }
        }

        @JavascriptInterface
        public void chunk(String b64) {
            byte[] b = Base64.decode(b64, Base64.DEFAULT);
            synchronized (lock) {
                if (outBuf != null) outBuf.write(b, 0, b.length);
            }
        }

        @JavascriptInterface
        public void finish(final String action) {
            final byte[] data;
            final String name, mime;
            synchronized (lock) {
                if (outBuf == null) return;
                data = outBuf.toByteArray();
                name = outName;
                mime = outMime;
                outBuf = null;
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() { deliver(action, name, mime, data); }
            });
        }

        @JavascriptInterface
        public void openUrl(final String url) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { openExternal(Uri.parse(url)); }
            });
        }

        @JavascriptInterface
        public void setBars(final String color, final boolean light) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    try {
                        int c = Color.parseColor(color);
                        getWindow().setStatusBarColor(c);
                        getWindow().setNavigationBarColor(c);
                        if (web != null) web.setBackgroundColor(c);
                    } catch (Exception ignored) { }
                    barsLight = light;
                    applySystemUi();
                }
            });
        }

        @JavascriptInterface
        public void setImmersive(final boolean on) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { immersive = on; applySystemUi(); }
            });
        }

        @JavascriptInterface
        public boolean isImmersive() { return immersive; }

        @JavascriptInterface
        public void copyText(final String text) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    ClipboardManager cb = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                    cb.setPrimaryClip(ClipData.newPlainText("Kenar Notu", text));
                }
            });
        }

        @JavascriptInterface
        public boolean hasPenButton() { return penButton; }

        @JavascriptInterface
        public void openDocument() {
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    Intent i = new Intent("android.intent.action.OPEN_DOCUMENT");
                    i.addCategory("android.intent.category.OPENABLE");
                    i.setType("application/pdf");
                    i.addFlags(GRANT_READ | GRANT_WRITE | GRANT_PERSIST);
                    try {
                        startActivityForResult(i, REQ_OPEN_DOC);
                    } catch (ActivityNotFoundException e) {
                        MainActivity.this.toast("Dosya seçici açılamadı");
                    }
                }
            });
        }

        @JavascriptInterface
        public String docInfo(String uri) {
            return docMeta(Uri.parse(uri)).toString();
        }

        /* ---- OneDrive'daki güncel dosyayı oku: başka cihazda yapılan değişiklikleri üzerine yazmadan birleştirmek için ---- */
        @JavascriptInterface
        public void docFetch(final String uri, final String id) {
            new Thread(() -> {
                JSONObject r = new JSONObject();
                try {
                    r.put("id", id);
                    Uri u = Uri.parse(uri);
                    try { getContentResolver().refresh(u, null, null); } catch (Throwable ignored) { }
                    InputStream in = getContentResolver().openInputStream(u);
                    if (in == null) throw new IOException("Dosya okunamadı");
                    ByteArrayOutputStream bo = new ByteArrayOutputStream();
                    byte[] buf = new byte[1 << 16];
                    int n;
                    long total = 0;
                    try {
                        while ((n = in.read(buf)) > 0) {
                            total += n;
                            if (total > MAX_INCOMING) throw new IOException("Dosya çok büyük");
                            bo.write(buf, 0, n);
                        }
                    } finally { in.close(); }
                    byte[] data = bo.toByteArray();
                    JSONObject m = docMeta(u);
                    synchronized (fetches) { fetches.put(id, data); }
                    r.put("ok", true);
                    r.put("chunks", (data.length + CHUNK - 1) / CHUNK);
                    r.put("size", data.length);
                    r.put("lastModified", m.optLong("lastModified", 0));
                } catch (Throwable e) {
                    try { r.put("ok", false); r.put("error", e.getMessage() != null ? e.getMessage() : e.toString()); } catch (Exception ignored) { }
                }
                js("__docFetched", r.toString());
            }).start();
        }

        @JavascriptInterface
        public String docFetchChunk(String id, int i) {
            byte[] b;
            synchronized (fetches) { b = fetches.get(id); }
            if (b == null) return "";
            int off = i * CHUNK;
            if (off >= b.length) return "";
            return Base64.encodeToString(b, off, Math.min(CHUNK, b.length - off), Base64.NO_WRAP);
        }

        @JavascriptInterface
        public void docFetchDone(String id) {
            synchronized (fetches) { fetches.remove(id); }
        }

        @JavascriptInterface
        public String incomingMeta() {
            synchronized (lock) { return inBytes == null ? "{}" : inMeta; }
        }

        @JavascriptInterface
        public String incomingName() {
            synchronized (lock) { return inBytes == null ? "" : inName; }
        }

        @JavascriptInterface
        public int incomingChunks() {
            synchronized (lock) { return inBytes == null ? 0 : (inBytes.length + CHUNK - 1) / CHUNK; }
        }

        @JavascriptInterface
        public String incomingChunk(int i) {
            synchronized (lock) {
                if (inBytes == null) return "";
                int off = i * CHUNK;
                if (off >= inBytes.length) return "";
                return Base64.encodeToString(inBytes, off, Math.min(CHUNK, inBytes.length - off), Base64.NO_WRAP);
            }
        }

        @JavascriptInterface
        public void incomingDone() {
            synchronized (lock) { inBytes = null; inName = null; inMeta = "{}"; }
        }

        /* ---- el yazısı düzeltme ---- */
        @JavascriptInterface
        public String inkStatus() {
            HandwritingCorrector c = corrector;
            return c == null ? "{\"tr\":\"unknown\",\"en\":\"unknown\"}" : c.status().toString();
        }

        @JavascriptInterface
        public void inkCheck() {
            runOnUiThread(() -> ensureCorrector().check(() -> js("__inkStatus", corrector.status().toString())));
        }

        @JavascriptInterface
        public void inkPrepare() {
            runOnUiThread(() -> ensureCorrector().prepare(() -> js("__inkStatus", corrector.status().toString())));
        }

        @JavascriptInterface
        public void inkRecognize(final String json) {
            runOnUiThread(() -> {
                JSONObject req;
                try { req = new JSONObject(json); } catch (Exception e) { return; }
                final HandwritingCorrector c = ensureCorrector();
                final JSONObject r0 = req;
                Runnable go = () -> c.recognize(r0, r -> {
                    js("__inkResult", r.toString());
                    if (!r.optBoolean("ok") && "nomodel".equals(r.optString("error"))) js("__inkStatus", c.status().toString());
                });
                if ("unknown".equals(c.status().optString("tr"))) c.check(go); else go.run();
            });
        }

        @JavascriptInterface
        public void inkCorrectText(final String json) {
            runOnUiThread(() -> {
                JSONObject req;
                try { req = new JSONObject(json); } catch (Exception e) { return; }
                ensureCorrector().correctText(req, r -> js("__inkResult", r.toString()));
            });
        }

        /* ---- tabletteki gelişmiş okuma (Gemma 4 E2B) ---- */
        @JavascriptInterface
        public String localStatus() { return ensureLocal().status(); }

        @JavascriptInterface
        public void localDownload() { ensureLocal().download(); }

        @JavascriptInterface
        public void localCancel() { ensureLocal().cancel(); }

        @JavascriptInterface
        public void localDelete() { ensureLocal().delete(); }

        @JavascriptInterface
        public void localPrepare() { ensureLocal().prepare(); }

        @JavascriptInterface
        public void localRead(final String json) { ensureLocal().read(json); }

        /* ---- sesli okuma ---- */
        @JavascriptInterface
        public String speak(final String text, final String lang, final float rate, final String voice) {
            final Speaker sp = speaker;
            if (sp == null) {
                runOnUiThread(() -> ensureSpeaker().speak(text, lang, rate, voice));
                return "wait";
            }
            return sp.speak(text, lang, rate, voice);
        }

        @JavascriptInterface
        public void speakStop() {
            Speaker sp = speaker;
            if (sp != null) sp.stop();
        }

        @JavascriptInterface
        public String ttsVoices() {
            Speaker sp = speaker;
            if (sp == null) { runOnUiThread(() -> ensureSpeaker()); return "[]"; }
            return sp.voices().toString();
        }

        @JavascriptInterface
        public String ttsState() {
            Speaker sp = speaker;
            return sp == null ? "none" : sp.isReady() ? "ready" : sp.isFailed() ? "failed" : "init";
        }

        @JavascriptInterface
        public void ttsSettings() {
            runOnUiThread(() -> {
                try { startActivity(new Intent("com.android.settings.TTS_SETTINGS")); }
                catch (Exception e) {
                    try { startActivity(new Intent(android.speech.tts.TextToSpeech.Engine.ACTION_INSTALL_TTS_DATA)); }
                    catch (Exception e2) { MainActivity.this.toast("Metin okuma ayarları açılamadı"); }
                }
            });
        }

        @JavascriptInterface
        public void toast(final String msg) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { MainActivity.this.toast(msg); }
            });
        }
    }

    void deliver(String action, String name, String mime, final byte[] data) {
        if (action.startsWith("write\n")) {
            final String[] parts = action.split("\n");
            final String key = parts.length > 5 && parts[5].length() > 0 ? "write:" + parts[5] : "write";
            new Thread(new Runnable() {
                @Override
                public void run() { writeGuarded(parts, data, key); }
            }).start();
            return;
        }
        if ("gallery".equals(action)) {
            saveToGallery(name, mime, data);
            return;
        }
        if ("savelink".equals(action)) {
            pendingLink = data;
            Intent i = new Intent("android.intent.action.CREATE_DOCUMENT");
            i.addCategory("android.intent.category.OPENABLE");
            i.setType(mime);
            i.putExtra("android.intent.extra.TITLE", name);
            i.addFlags(GRANT_READ | GRANT_WRITE | GRANT_PERSIST);
            try {
                startActivityForResult(i, REQ_SAVE_LINK);
            } catch (ActivityNotFoundException e) {
                pendingLink = null;
                notifyJs("savelink", false, "Kaydetme penceresi açılamadı");
            }
            return;
        }
        try {
            if ("save".equals(action)) {
                pendingSave = data;
                Intent i = new Intent("android.intent.action.CREATE_DOCUMENT");
                i.addCategory("android.intent.category.OPENABLE");
                i.setType(mime);
                i.putExtra("android.intent.extra.TITLE", name);
                try {
                    startActivityForResult(i, REQ_SAVE);
                } catch (ActivityNotFoundException e) {
                    pendingSave = null;
                    notifyJs("save", false, "Kaydetme penceresi açılamadı");
                }
                return;
            }
            File f = writeShared(name, data);
            Uri u = FilesProvider.uriFor(f);
            if ("share".equals(action) || action.startsWith("share:")) {
                Intent s = new Intent(Intent.ACTION_SEND);
                if (action.startsWith("share:")) s.setPackage(action.substring(6));
                s.setType(mime);
                s.putExtra(Intent.EXTRA_STREAM, (Parcelable) u);
                s.putExtra(Intent.EXTRA_SUBJECT, name);
                s.setClipData(ClipData.newUri(getContentResolver(), name, u));
                s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                if (action.startsWith("share:")) startActivity(s); else startActivity(Intent.createChooser(s, "Paylaş"));
                notifyJs("share", true, "");
            } else if ("copy".equals(action)) {
                ClipboardManager cb = (ClipboardManager) getSystemService(CLIPBOARD_SERVICE);
                cb.setPrimaryClip(ClipData.newUri(getContentResolver(), "Kenar Notu", u));
                notifyJs("copy", true, "");
            }
        } catch (Exception e) {
            notifyJs(action, false, String.valueOf(e.getMessage()));
        }
    }

    void trackPen(MotionEvent e) {
        int tool = e.getToolType(0);
        if (tool != MotionEvent.TOOL_TYPE_STYLUS && tool != MotionEvent.TOOL_TYPE_ERASER) return;
        boolean pressed = tool == MotionEvent.TOOL_TYPE_ERASER
                || (e.getButtonState() & (MotionEvent.BUTTON_STYLUS_PRIMARY | MotionEvent.BUTTON_SECONDARY)) != 0;
        if (pressed != penButton) {
            penButton = pressed;
            if (web != null) web.evaluateJavascript("window.__penButton && window.__penButton(" + pressed + ")", null);
        }
    }

    /* ---------------- Galeri (Resimler/Kenar Notu) ---------------- */
    void saveToGallery(String name, String mime, byte[] data) {
        if (Build.VERSION.SDK_INT < 29) {
            deliver("save", name, mime, data);
            return;
        }
        try {
            ContentValues v = new ContentValues();
            v.put(MediaStore.MediaColumns.DISPLAY_NAME, name);
            v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
            v.put(MediaStore.MediaColumns.RELATIVE_PATH, "Pictures/Kenar Notu");
            v.put(MediaStore.MediaColumns.IS_PENDING, 1);
            Uri item = getContentResolver().insert(MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY), v);
            if (item == null) throw new IOException("Galeriye kayıt oluşturulamadı");
            OutputStream os = getContentResolver().openOutputStream(item);
            if (os == null) throw new IOException("Galeri dosyası açılamadı");
            os.write(data);
            os.close();
            ContentValues done = new ContentValues();
            done.put(MediaStore.MediaColumns.IS_PENDING, 0);
            getContentResolver().update(item, done, null, null);
            notifyJs("gallery", true, "");
        } catch (Exception e) {
            notifyJs("gallery", false, errText(e));
        }
    }

    static String errText(Exception e) {
        String m = e.getMessage();
        return e.getClass().getSimpleName() + (m == null ? "" : ": " + m);
    }

    /* ---------------- OneDrive / cihaz dosyasına doğrudan yazma (Storage Access Framework) ---------------- */
    boolean takePermission(Uri uri, int flags) {
        try {
            getContentResolver().takePersistableUriPermission(uri, flags & (GRANT_READ | GRANT_WRITE) | GRANT_READ | GRANT_WRITE);
            return true;
        } catch (Exception e) {
            try { getContentResolver().takePersistableUriPermission(uri, GRANT_READ); } catch (Exception ignored) { }
            return (flags & GRANT_WRITE) != 0;
        }
    }

    JSONObject docMeta(Uri uri) {
        JSONObject o = new JSONObject();
        try {
            o.put("uri", uri.toString());
            o.put("provider", uri.getAuthority() == null ? "" : uri.getAuthority());
            Cursor c;
            try {
                c = getContentResolver().query(uri, new String[]{"_display_name", "_size", "last_modified", "flags"}, null, null, null);
            } catch (Exception e) {
                c = getContentResolver().query(uri, new String[]{"_display_name", "_size"}, null, null, null);
            }
            if (c != null) {
                if (c.moveToFirst()) {
                    int i = c.getColumnIndex("_display_name");
                    if (i >= 0 && !c.isNull(i)) o.put("name", c.getString(i));
                    i = c.getColumnIndex("_size");
                    if (i >= 0 && !c.isNull(i)) o.put("size", c.getLong(i));
                    i = c.getColumnIndex("last_modified");
                    if (i >= 0 && !c.isNull(i)) o.put("lastModified", c.getLong(i));
                    i = c.getColumnIndex("flags");
                    if (i >= 0 && !c.isNull(i)) o.put("supportsWrite", (c.getInt(i) & 0x2) != 0);
                }
                c.close();
            }
        } catch (Exception e) {
            try { o.put("error", String.valueOf(e.getMessage())); } catch (Exception ignored) { }
        }
        return o;
    }

    /*
     * Önemli: akış AÇILAMAZSA başka bir kip denenir; açıldıktan sonra yazma/kapama hata verirse dosyaya ikinci kez
     * YAZILMAZ. OneDrive ilk yazımı yine de yüklüyor olabilir; üst üste ikinci yazım OneDrive'da
     * "Dosya 1.pdf", "Dosya 2.pdf" gibi kopyalar oluşturuyordu.
     */
    void writeTo(Uri uri, byte[] data) throws IOException {
        Exception last = null;
        for (String mode : new String[]{"wt", "rwt", "w"}) {
            OutputStream os;
            try {
                os = getContentResolver().openOutputStream(uri, mode);
            } catch (SecurityException e) {
                throw e;
            } catch (Exception e) {
                last = e;
                continue;
            }
            if (os == null) continue;
            IOException closeErr = null;
            try {
                os.write(data);
                os.flush();
            } finally {
                try { os.close(); } catch (IOException e) { closeErr = e; }
            }
            if (closeErr != null) {
                // Kapatırken hata: veri büyük olasılıkla teslim edildi. Boyut tutuyorsa başarılı say, tekrar yazma.
                long sz = docMeta(uri).optLong("size", -1);
                if (sz != data.length) throw closeErr;
            }
            return;
        }
        // Son çare (yalnızca hiçbir kipte akış açılamadıysa): dosya tanımlayıcısıyla yaz
        ParcelFileDescriptor pfd;
        try {
            pfd = getContentResolver().openFileDescriptor(uri, "rw");
        } catch (SecurityException e) {
            throw e;
        } catch (Exception e) {
            pfd = null;
            last = e;
        }
        if (pfd != null) {
            FileOutputStream fos = new FileOutputStream(pfd.getFileDescriptor());
            try {
                fos.getChannel().truncate(0);
                fos.write(data);
                fos.flush();
                try { fos.getFD().sync(); } catch (Exception ignored) { }
            } finally {
                try { fos.close(); } catch (Exception ignored) { }
                try { pfd.close(); } catch (Exception ignored) { }
            }
            return;
        }
        throw new IOException(last == null ? "Sağlayıcı yazmaya izin vermedi" : errText(last));
    }

    /* Aynı dosyaya iki yazım asla üst üste binmesin (zaman aşımına uğrayan yazım hâlâ sürüyor olabilir) */
    static final HashMap<String, Object> URI_LOCKS = new HashMap<String, Object>();
    static Object lockFor(String uri) {
        synchronized (URI_LOCKS) {
            Object o = URI_LOCKS.get(uri);
            if (o == null) { o = new Object(); URI_LOCKS.put(uri, o); }
            return o;
        }
    }

    /* Sağlayıcı (OneDrive) takılırsa JS'i sonsuza kadar bekletme: 120 sn sonra hata bildir */
    void writeGuarded(final String[] parts, final byte[] data, final String key) {
        final java.util.concurrent.atomic.AtomicBoolean done = new java.util.concurrent.atomic.AtomicBoolean(false);
        Thread w = new Thread(new Runnable() {
            @Override
            public void run() {
                String res = writeDocument(parts, data);
                if (done.compareAndSet(false, true)) notifyJsUi(key, true, res);
            }
        });
        w.start();
        try { w.join(120000); } catch (InterruptedException ignored) { }
        if (done.compareAndSet(false, true)) {
            JSONObject r = new JSONObject();
            try { r.put("status", "timeout"); r.put("error", "OneDrive uygulaması 2 dakika içinde yanıt vermedi"); } catch (Exception ignored) { }
            notifyJsUi(key, true, r.toString());
        }
    }

    /* parts: write, uri, beklenen değişiklik zamanı, beklenen boyut, zorla (1/0), istek no */
    String writeDocument(String[] parts, byte[] data) {
        synchronized (lockFor(parts.length > 1 ? parts[1] : "")) {
            return writeDocumentLocked(parts, data);
        }
    }

    String writeDocumentLocked(String[] parts, byte[] data) {
        JSONObject r = new JSONObject();
        try {
            Uri uri = Uri.parse(parts[1]);
            long expLm = parts.length > 2 ? Long.parseLong(parts[2]) : 0;
            // parts[3]: uygulamanın bu dosyaya yazdığı/okuduğu boyutlar (virgülle). OneDrive yüklemeyi bitirince
            // tarihi değiştirir; boyut bizim yazdıklarımızdan biriyse bu bir çakışma değildir.
            java.util.HashSet<Long> known = new java.util.HashSet<Long>();
            if (parts.length > 3) for (String t : parts[3].split(",")) { try { long v = Long.parseLong(t.trim()); if (v >= 0) known.add(v); } catch (Exception ignored) { } }
            boolean force = parts.length > 4 && "1".equals(parts[4]);
            // Sağlayıcıdan güncel bilgiyi iste (OneDrive kendi önbelleğini tazeleyebilir)
            try { getContentResolver().refresh(uri, null, null); } catch (Throwable ignored) { }
            JSONObject before = docMeta(uri);
            long lm = before.optLong("lastModified", 0);
            long size = before.optLong("size", -1);
            if (!force && expLm > 0 && lm > 0 && lm != expLm && size > 0 && !known.isEmpty() && !known.contains(size)) {
                r.put("status", "conflict");
                r.put("lastModified", lm);
                r.put("size", size);
            } else {
                writeTo(uri, data);
                JSONObject after = docMeta(uri);
                r.put("status", "ok");
                r.put("lastModified", after.optLong("lastModified", 0));
                r.put("before", lm);
                r.put("size", data.length);
            }
        } catch (SecurityException e) {
            try { r.put("status", "denied"); r.put("error", errText(e)); } catch (Exception ignored) { }
        } catch (OutOfMemoryError e) {
            try { r.put("status", "error"); r.put("error", "Bellek yetmedi (dosya çok büyük)"); } catch (Exception ignored) { }
        } catch (Throwable e) {
            try { r.put("status", "error"); r.put("error", String.valueOf(e.getMessage() != null ? e.getMessage() : e.toString())); } catch (Exception ignored) { }
        }
        return r.toString();
    }

    void notifyJsUi(final String action, final boolean ok, final String msg) {
        runOnUiThread(new Runnable() {
            @Override
            public void run() { notifyJs(action, ok, msg); }
        });
    }

    File writeShared(String name, byte[] data) throws IOException {
        File dir = new File(getCacheDir(), "share");
        if (!dir.exists() && !dir.mkdirs()) throw new IOException("Geçici klasör oluşturulamadı");
        File[] old = dir.listFiles();
        long cutoff = System.currentTimeMillis() - 6L * 3600 * 1000;
        if (old != null) for (File o : old) if (o.lastModified() < cutoff) o.delete();
        File f = new File(dir, name);
        FileOutputStream fos = new FileOutputStream(f);
        fos.write(data);
        fos.close();
        return f;
    }

    HandwritingCorrector ensureCorrector() {
        if (corrector == null) corrector = new HandwritingCorrector(this);
        return corrector;
    }

    LocalReader ensureLocal() {
        LocalReader l = local;
        if (l == null) {
            synchronized (this) {
                if (local == null) {
                    local = new LocalReader(this, new LocalReader.Sink() {
                        @Override public void status(String json) { js("__localStatus", json); }
                        @Override public void result(String json) { js("__localResult", json); }
                    });
                    local.resume();
                }
                l = local;
            }
        }
        return l;
    }

    Speaker ensureSpeaker() {
        if (speaker == null) speaker = new Speaker(this, () -> js("__ttsReady", ""));
        return speaker;
    }

    /** Sayfadaki window.<fn>(arg) işlevini çağırır (ana iş parçacığında). */
    void js(final String fn, final String arg) {
        runOnUiThread(() -> {
            if (web != null) web.evaluateJavascript("window." + fn + " && window." + fn + "(" + JSONObject.quote(arg) + ")", null);
        });
    }

    void notifyJs(String action, boolean ok, String msg) {
        if (web == null) return;
        web.evaluateJavascript("window.__kenarNativeDone && window.__kenarNativeDone(" + JSONObject.quote(action) + "," + ok + "," + JSONObject.quote(msg == null ? "" : msg) + ")", null);
    }

    void toast(String msg) {
        Toast.makeText(this, msg, Toast.LENGTH_LONG).show();
    }

    static String safeName(String n) {
        if (n == null) n = "Kenar Notu";
        n = n.replaceAll("[\\\\/:*?\"<>|\\x00-\\x1f]+", "-").trim();
        if (n.length() == 0) n = "Kenar Notu";
        if (n.length() > 120) n = n.substring(0, 120);
        return n;
    }

    /* ---------------- "Birlikte aç" / "Paylaş" ile gelen PDF ---------------- */
    void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        Uri uri = null;
        if (Intent.ACTION_VIEW.equals(action)) uri = intent.getData();
        else if (Intent.ACTION_SEND.equals(action)) {
            Parcelable p = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            if (p instanceof Uri) uri = (Uri) p;
        }
        if (uri == null) return;
        setIntent(new Intent(this, MainActivity.class));
        final Uri target = uri;
        new Thread(new Runnable() {
            @Override
            public void run() { readIncoming(target, "import", false); }
        }).start();
    }

    void readIncoming(Uri uri, String kind, boolean canWrite) {
        String name = null;
        try {
            Cursor c = getContentResolver().query(uri, new String[]{"_display_name"}, null, null, null);
            if (c != null) {
                if (c.moveToFirst()) name = c.getString(0);
                c.close();
            }
        } catch (Exception ignored) { }
        if (name == null) name = uri.getLastPathSegment();
        if (name == null || name.length() == 0) name = "Belge.pdf";
        try {
            InputStream in = getContentResolver().openInputStream(uri);
            if (in == null) throw new IOException("Dosya okunamadı");
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[1 << 16];
            int n;
            long total = 0;
            while ((n = in.read(buf)) > 0) {
                total += n;
                if (total > MAX_INCOMING) throw new IOException("Dosya çok büyük");
                bo.write(buf, 0, n);
            }
            in.close();
            JSONObject meta = "doc".equals(kind) ? docMeta(uri) : new JSONObject();
            meta.put("kind", kind);
            meta.put("canWrite", canWrite);
            if (!meta.has("size")) meta.put("size", total);
            synchronized (lock) {
                inBytes = bo.toByteArray();
                inName = name;
                inMeta = meta.toString();
            }
            runOnUiThread(new Runnable() {
                @Override
                public void run() {
                    if (web != null) web.evaluateJavascript("window.kenarIncoming && window.kenarIncoming()", null);
                }
            });
        } catch (final Exception e) {
            runOnUiThread(new Runnable() {
                @Override
                public void run() { toast("PDF açılamadı: " + e.getMessage()); }
            });
        }
    }
}
