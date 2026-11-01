package com.tapazaki.lunatz;

import android.app.Activity;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.ActivityInfo;
import android.database.Cursor;
import android.media.MediaPlayer;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.provider.DocumentsContract;
import android.provider.Settings;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;
import android.util.Log;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;
import org.java_websocket.WebSocket;
import org.java_websocket.handshake.ClientHandshake;
import org.java_websocket.server.WebSocketServer;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class LunaBridge {
    private final MainActivity activity;
    private final WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newCachedThreadPool();
    private final ExecutorService llm = Executors.newSingleThreadExecutor();
    private final SharedPreferences prefs;
    private final File dataDir;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private SpeechRecognizer recognizer;
    private MediaPlayer player;
    private volatile long modelHandle = 0;
    private final AtomicBoolean generating = new AtomicBoolean(false);
    private volatile LunaWsServer wsServer;
    private volatile boolean bridgeRunning = false;

    LunaBridge(MainActivity activity, WebView webView) {
        this.activity = activity;
        this.webView = webView;
        this.prefs = activity.getSharedPreferences("lunatz", Activity.MODE_PRIVATE);
        this.dataDir = new File(activity.getFilesDir(), "luna_data");
        if (!dataDir.exists()) dataDir.mkdirs();
        tts = new TextToSpeech(activity, status -> {
            ttsReady = status == TextToSpeech.SUCCESS;
            if (ttsReady) {
                tts.setLanguage(Locale.forLanguageTag("pt-BR"));
                tts.setSpeechRate(1.0f);
                tts.setPitch(1.08f);
            }
            emit("onTtsReady", obj("ready", ttsReady));
        });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String id) { emit("onSpeaking", obj("speaking", true)); }
            @Override public void onDone(String id) { emit("onSpeaking", obj("speaking", false)); }
            @Override public void onError(String id) { emit("onSpeaking", obj("speaking", false)); }
        });
    }

    static final class SafeJSONObject extends JSONObject {
        @Override public SafeJSONObject put(String name, Object value) {
            try { super.put(name, value); return this; } catch (org.json.JSONException e) { throw new RuntimeException(e); }
        }
        @Override public SafeJSONObject put(String name, boolean value) {
            try { super.put(name, value); return this; } catch (org.json.JSONException e) { throw new RuntimeException(e); }
        }
        @Override public SafeJSONObject put(String name, double value) {
            try { super.put(name, value); return this; } catch (org.json.JSONException e) { throw new RuntimeException(e); }
        }
        @Override public SafeJSONObject put(String name, int value) {
            try { super.put(name, value); return this; } catch (org.json.JSONException e) { throw new RuntimeException(e); }
        }
        @Override public SafeJSONObject put(String name, long value) {
            try { super.put(name, value); return this; } catch (org.json.JSONException e) { throw new RuntimeException(e); }
        }
    }
    static SafeJSONObject obj(Object... kv) {
        SafeJSONObject o = new SafeJSONObject();
        for (int i = 0; i + 1 < kv.length; i += 2) o.put(String.valueOf(kv[i]), kv[i + 1]);
        return o;
    }
    SafeJSONObject json() { return new SafeJSONObject(); }
    void emit(String event, JSONObject data) {
        String js = "window.LunaNativeEvents && window.LunaNativeEvents.dispatch('" + event + "', " + data.toString() + ");";
        main.post(() -> webView.evaluateJavascript(js, null));
    }

    @JavascriptInterface public String getAppInfo() {
        SafeJSONObject o = obj(
            "app", "LunaTz Companion", "engine", "LunaTz Engine v1.1", "package", activity.getPackageName(),
            "version", BuildConfig.VERSION_NAME, "authors", "Tapazaki & Assistente", "youtube", "Tapazaki",
            "sdk", Build.VERSION.SDK_INT, "device", Build.MODEL, "llmNative", LlamaEngine.available(),
            "modelLoaded", modelHandle != 0, "bridgeRunning", bridgeRunning);
        JSONArray abis = new JSONArray();
        for (String a : Build.SUPPORTED_ABIS) abis.put(a);
        o.put("abis", abis);
        return o.toString();
    }
    @JavascriptInterface public String getSettings() { return prefs.getString("settings", "{}"); }
    @JavascriptInterface public void saveSettings(String v) { prefs.edit().putString("settings", v).apply(); }
    @JavascriptInterface public String getHistory() { return prefs.getString("history", "[]"); }
    @JavascriptInterface public void saveHistory(String v) { prefs.edit().putString("history", v).apply(); }
    @JavascriptInterface public void clearHistory() { prefs.edit().remove("history").apply(); }
    @JavascriptInterface public String getMemory() { return prefs.getString("memory", "[]"); }
    @JavascriptInterface public void saveMemory(String v) { prefs.edit().putString("memory", v).apply(); }

    @JavascriptInterface public void pickLunaFolder() { main.post(activity::pickFolder); }
    @JavascriptInterface public void openStorageSettings() {
        main.post(() -> {
            try {
                Intent intent = Build.VERSION.SDK_INT >= 30
                    ? new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:" + activity.getPackageName()))
                    : new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:" + activity.getPackageName()));
                activity.startActivity(intent);
            } catch (Exception ignored) { }
        });
    }

    @JavascriptInterface public void importFolder(String uriString) {
        io.execute(() -> {
            SafeJSONObject result = obj();
            try {
                Uri tree = Uri.parse(uriString);
                JSONArray files = new JSONArray();
                String treeDocId = DocumentsContract.getTreeDocumentId(tree);
                Uri childrenUri = DocumentsContract.buildChildDocumentsUriUsingTree(tree, treeDocId);
                Cursor c = activity.getContentResolver().query(childrenUri, new String[]{
                    DocumentsContract.Document.COLUMN_DOCUMENT_ID,
                    DocumentsContract.Document.COLUMN_DISPLAY_NAME,
                    DocumentsContract.Document.COLUMN_SIZE
                }, null, null, null);
                if (c != null) {
                    while (c.moveToNext()) {
                        String docId = c.getString(0);
                        String name = c.getString(1);
                        long size = c.getLong(2);
                        Uri childUri = DocumentsContract.buildDocumentUriUsingTree(tree, docId);
                        files.put(inspectAndCopy(name, size, childUri));
                    }
                    c.close();
                }
                prefs.edit().putString("folder_uri", uriString).putString("files_manifest", files.toString()).apply();
                result.put("ok", true).put("files", files).put("path", "/sdcard/DADOS DE LUNA");
            } catch (Exception e) {
                result.put("ok", false).put("error", e.getMessage() == null ? "Falha ao ler pasta" : e.getMessage());
            }
            emit("onFolderPicked", result);
        });
    }

    private JSONObject inspectAndCopy(String name, long size, Uri uri) {
        SafeJSONObject item = obj("name", name, "size", size);
        try {
            String lower = name.toLowerCase(Locale.ROOT);
            String kind;
            if (lower.endsWith(".gguf")) kind = "gguf";
            else if (lower.endsWith(".pth")) kind = "voice";
            else if (lower.endsWith(".json")) kind = "brain";
            else if (lower.endsWith(".png")) kind = "skin";
            else if (lower.endsWith(".mp3")) kind = "sample";
            else kind = "other";
            item.put("kind", kind);
            if (kind.equals("other")) return item.put("status", "ignorado");
            File target = new File(dataDir, name);
            if (!target.exists() || target.length() != size) {
                InputStream in = activity.getContentResolver().openInputStream(uri);
                if (in != null) {
                    FileOutputStream out = new FileOutputStream(target);
                    byte[] buf = new byte[1 << 16];
                    int n; long done = 0;
                    while ((n = in.read(buf)) > 0) {
                        out.write(buf, 0, n); done += n;
                        if (size > 0 && done % (8 << 20) < buf.length) {
                            final int pct = (int) (done * 100 / size);
                            emit("onImportProgress", obj("name", name, "percent", pct));
                        }
                    }
                    out.close(); in.close();
                }
            }
            item.put("path", target.getAbsolutePath()).put("copied", true);
            switch (kind) {
                case "gguf":
                    if (LlamaEngine.available()) {
                        String meta = LlamaEngine.nativeMeta(target.getAbsolutePath());
                        JSONObject m = new JSONObject(meta);
                        item.put("status", m.optBoolean("ok") ? "GGUF válido · " + m.optString("arch", "?") : "cabeçalho não reconhecido");
                        item.put("meta", m);
                    } else {
                        InputStream gin = new java.io.FileInputStream(target);
                        byte[] magic = new byte[4]; int r = gin.read(magic); gin.close();
                        item.put("status", r == 4 && new String(magic, java.nio.charset.StandardCharsets.US_ASCII).equals("GGUF") ? "GGUF válido" : "cabeçalho não reconhecido");
                    }
                    break;
                case "brain":
                    byte[] all = new byte[(int) target.length()];
                    InputStream bin = new java.io.FileInputStream(target);
                    int off = 0; while (off < all.length) { int n = bin.read(all, off, all.length - off); if (n < 0) break; off += n; }
                    bin.close();
                    JSONObject brain = new JSONObject(new String(all, java.nio.charset.StandardCharsets.UTF_8));
                    item.put("status", "JSON válido").put("keys", brain.length());
                    break;
                case "skin": item.put("status", "PNG importado"); break;
                case "voice": item.put("status", "PTH importado (arquitetura pendente)"); break;
                case "sample": item.put("status", "MP3 importado"); break;
            }
        } catch (Exception e) {
            item.put("status", "erro: " + e.getMessage());
        }
        return item;
    }

    @JavascriptInterface public String getFilesManifest() { return prefs.getString("files_manifest", "[]"); }
    @JavascriptInterface public String readBrain() {
        try {
            File f = new File(dataDir, "LunaTz_Brain.json");
            if (!f.exists()) return "{}";
            byte[] all = new byte[(int) f.length()];
            InputStream in = new java.io.FileInputStream(f);
            int off = 0; while (off < all.length) { int n = in.read(all, off, all.length - off); if (n < 0) break; off += n; }
            in.close();
            return new String(all, java.nio.charset.StandardCharsets.UTF_8);
        } catch (Exception e) { return "{}"; }
    }
    @JavascriptInterface public void playReferenceSample() {
        main.post(() -> {
            try {
                File f = new File(dataDir, "voz_luna.mp3");
                if (!f.exists()) { emit("onSample", obj("ok", false, "error", "voz_luna.mp3 não importado")); return; }
                if (player != null) player.release();
                player = new MediaPlayer();
                player.setDataSource(f.getAbsolutePath());
                player.setOnCompletionListener(mp -> emit("onSample", obj("ok", true, "playing", false)));
                player.prepare(); player.start();
                emit("onSample", obj("ok", true, "playing", true));
            } catch (Exception e) { emit("onSample", obj("ok", false, "error", e.getMessage())); }
        });
    }

    @JavascriptInterface public void loadModel(int nCtx, int nThreads, int nBatch) {
        if (!LlamaEngine.available()) { emit("onModelError", obj("error", "Motor nativo indisponível neste APK")); return; }
        if (modelHandle != 0) { emit("onModelLoaded", modelInfo()); return; }
        File f = new File(dataDir, "LunaTz.gguf");
        if (!f.exists()) { emit("onModelError", obj("error", "Importe LunaTz.gguf na aba Arquivos")); return; }
        emit("onModelLoading", obj("path", f.getAbsolutePath()));
        llm.execute(() -> {
            try {
                long h = LlamaEngine.nativeLoad(f.getAbsolutePath(), nCtx, nThreads, nBatch);
                if (h == 0) { emit("onModelError", obj("error", "Não foi possível carregar o modelo. Verifique RAM/arquitetura.")); return; }
                modelHandle = h;
                emit("onModelLoaded", modelInfo());
            } catch (Throwable t) { emit("onModelError", obj("error", String.valueOf(t.getMessage()))); }
        });
    }
    private SafeJSONObject modelInfo() {
        SafeJSONObject o = obj("loaded", modelHandle != 0);
        try { o.put("info", new JSONObject(LlamaEngine.nativeInfo(modelHandle))); } catch (Exception ignored) { }
        return o;
    }
    @JavascriptInterface public void unloadModel() {
        llm.execute(() -> {
            long h = modelHandle; modelHandle = 0;
            if (h != 0) LlamaEngine.nativeUnload(h);
            emit("onModelUnloaded", obj("ok", true));
        });
    }
    @JavascriptInterface public String getModelStatus() { return modelInfo().toString(); }
    @JavascriptInterface public void stopChat() {
        long h = modelHandle;
        if (h != 0) LlamaEngine.nativeStop(h);
        generating.set(false);
    }
    @JavascriptInterface public void chat(String messagesJson, String optsJson) {
        long h = modelHandle;
        if (h == 0) { emit("onChatError", obj("error", "Modelo não carregado")); return; }
        if (!generating.compareAndSet(false, true)) { emit("onChatError", obj("error", "Já estou respondendo")); return; }
        llm.execute(() -> {
            try {
                JSONArray arr = new JSONArray(messagesJson);
                JSONObject opts = new JSONObject(optsJson);
                String[] roles = new String[arr.length()];
                String[] contents = new String[arr.length()];
                for (int i = 0; i < arr.length(); i++) {
                    JSONObject m = arr.getJSONObject(i);
                    roles[i] = m.optString("role", "user");
                    contents[i] = m.optString("content", "");
                }
                int max = opts.optInt("maxTokens", 220);
                float temp = (float) opts.optDouble("temp", 0.8);
                float topP = (float) opts.optDouble("topP", 0.9);
                LlamaEngine.nativeGenerate(h, roles, contents, max, temp, topP, new LlamaEngine.Callback() {
                    @Override public void onToken(String token) { emit("onToken", obj("token", token)); }
                    @Override public void onDone(int tokens, long millis) { generating.set(false); emit("onChatDone", obj("tokens", tokens, "millis", millis)); }
                    @Override public void onError(String error) { generating.set(false); emit("onChatError", obj("error", error)); }
                });
            } catch (Exception e) {
                generating.set(false);
                emit("onChatError", obj("error", String.valueOf(e.getMessage())));
            }
        });
    }

    @JavascriptInterface public void speak(String text) {
        main.post(() -> {
            if (!ttsReady) { emit("onSpeechError", obj("error", "TTS ainda não está pronto")); return; }
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "luna-" + System.currentTimeMillis());
        });
    }
    @JavascriptInterface public void stopSpeaking() { main.post(() -> { tts.stop(); emit("onSpeaking", obj("speaking", false)); }); }
    @JavascriptInterface public void setVoice(float rate, float pitch) { main.post(() -> { tts.setSpeechRate(rate); tts.setPitch(pitch); }); }

    @JavascriptInterface public void startListening() {
        main.post(() -> {
            if (!activity.hasAudio()) { activity.requestAudio(); return; }
            if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
                emit("onSpeechError", obj("error", "Reconhecimento de fala indisponível neste aparelho")); return;
            }
            if (recognizer != null) recognizer.destroy();
            recognizer = SpeechRecognizer.createSpeechRecognizer(activity);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { emit("onListening", obj("listening", true)); }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float rmsdB) { emit("onMicLevel", obj("level", rmsdB)); }
                @Override public void onBufferReceived(byte[] buffer) { }
                @Override public void onEndOfSpeech() { emit("onListening", obj("listening", false)); }
                @Override public void onError(int error) { emit("onSpeechError", obj("error", "speech recognizer error " + error)); emit("onListening", obj("listening", false)); }
                @Override public void onResults(Bundle results) {
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    emit("onSpeechResult", obj("text", matches == null || matches.isEmpty() ? "" : matches.get(0)));
                }
                @Override public void onPartialResults(Bundle partialResults) {
                    ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    emit("onSpeechPartial", obj("text", matches == null || matches.isEmpty() ? "" : matches.get(0)));
                }
                @Override public void onEvent(int eventType, Bundle params) { }
            });
            Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
            i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
            i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
            i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
            recognizer.startListening(i);
        });
    }
    @JavascriptInterface public void stopListening() { main.post(() -> { if (recognizer != null) recognizer.stopListening(); emit("onListening", obj("listening", false)); }); }

    @JavascriptInterface public void pingBedrock(String host, int port) {
        io.execute(() -> {
            SafeJSONObject result = obj("host", host, "port", port);
            DatagramSocket socket = null;
            try {
                InetAddress address = InetAddress.getByName(host);
                socket = new DatagramSocket();
                socket.setSoTimeout(2200);
                long guid = UUID.randomUUID().getMostSignificantBits();
                int[] magicInts = {0x00,0xff,0xff,0x00,0xfe,0xfe,0xfe,0xfe,0xfd,0xfd,0xfd,0xfd,0x12,0x34,0x56,0x78};
                byte[] magic = new byte[magicInts.length];
                for (int i = 0; i < magicInts.length; i++) magic[i] = (byte) magicInts[i];
                ByteBuffer buf = ByteBuffer.allocate(33).order(ByteOrder.BIG_ENDIAN);
                buf.put((byte) 0x01).putLong(System.currentTimeMillis()).put(magic).putLong(guid);
                DatagramPacket packet = new DatagramPacket(buf.array(), buf.array().length, address, port);
                long start = System.nanoTime();
                socket.send(packet);
                DatagramPacket resp = new DatagramPacket(new byte[2048], 2048);
                socket.receive(resp);
                long ms = (System.nanoTime() - start) / 1_000_000;
                byte[] data = resp.getData();
                if (resp.getLength() > 35 && data[0] == (byte) 0x1c) {
                    int len = ((data[33] & 0xff) << 8) | (data[34] & 0xff);
                    String motd = new String(data, 35, Math.min(len, resp.getLength() - 35), java.nio.charset.StandardCharsets.UTF_8);
                    result.put("ok", true).put("latencyMs", ms).put("motd", motd);
                } else result.put("ok", false).put("error", "Resposta não é um pong Bedrock esperado");
            } catch (Exception e) {
                result.put("ok", false).put("error", e.getMessage() == null ? "sem resposta" : e.getMessage());
            } finally { if (socket != null) socket.close(); }
            emit("onBedrockPing", result);
        });
    }

    @JavascriptInterface public void startBridge(int port) {
        io.execute(() -> {
            try {
                if (wsServer != null) { wsServer.stop(); wsServer = null; }
                wsServer = new LunaWsServer(new InetSocketAddress("0.0.0.0", port));
                wsServer.start();
                bridgeRunning = true;
                activity.startBridgeService();
                emit("onBridgeStatus", obj("running", true, "port", port, "ips", localIps()));
            } catch (Exception e) {
                bridgeRunning = false;
                emit("onBridgeStatus", obj("running", false, "error", String.valueOf(e.getMessage())));
            }
        });
    }
    @JavascriptInterface public void stopBridge() {
        io.execute(() -> {
            try { if (wsServer != null) wsServer.stop(); } catch (Exception ignored) { }
            wsServer = null; bridgeRunning = false;
            activity.stopBridgeService();
            emit("onBridgeStatus", obj("running", false));
        });
    }
    @JavascriptInterface public String getBridgeStatus() {
        return obj("running", bridgeRunning, "clients", wsServer == null ? 0 : wsServer.getConnections().size(), "ips", localIps()).toString();
    }
    private JSONArray localIps() {
        JSONArray a = new JSONArray();
        try {
            for (NetworkInterface ni : Collections.list(NetworkInterface.getNetworkInterfaces())) {
                if (!ni.isUp() || ni.isLoopback()) continue;
                for (InetAddress addr : Collections.list(ni.getInetAddresses())) {
                    if (addr instanceof java.net.Inet4Address) a.put(addr.getHostAddress());
                }
            }
        } catch (Exception ignored) { }
        a.put("127.0.0.1");
        return a;
    }
    @JavascriptInterface public void sendCommand(String commandLine) {
        LunaWsServer s = wsServer;
        if (s == null || s.getConnections().isEmpty()) { emit("onCommandResult", obj("ok", false, "error", "Minecraft não conectado")); return; }
        String id = UUID.randomUUID().toString();
        SafeJSONObject msg = obj(
            "header", obj("version", 1, "requestId", id, "messagePurpose", "commandRequest", "messageType", "commandRequest"),
            "body", obj("version", 1, "origin", obj("type", "player"), "commandLine", commandLine));
        for (WebSocket ws : s.getConnections()) ws.send(msg.toString());
        emit("onCommandResult", obj("ok", true, "requestId", id, "command", commandLine));
    }

    private class LunaWsServer extends WebSocketServer {
        LunaWsServer(InetSocketAddress address) { super(address); setReuseAddr(true); }
        @Override public void onOpen(WebSocket conn, ClientHandshake handshake) {
            emit("onMinecraftEvent", obj("event", "connect", "address", String.valueOf(conn.getRemoteSocketAddress())));
            String[] events = {"PlayerMessage", "PlayerTransform", "BlockBroken", "BlockPlaced", "PlayerDied", "MobKilled", "ItemCrafted", "ItemUsed"};
            for (String e : events) {
                SafeJSONObject sub = obj(
                    "header", obj("version", 1, "requestId", UUID.randomUUID().toString(), "messagePurpose", "subscribe", "messageType", "commandRequest"),
                    "body", obj("eventName", e));
                conn.send(sub.toString());
            }
        }
        @Override public void onClose(WebSocket conn, int code, String reason, boolean remote) {
            emit("onMinecraftEvent", obj("event", "disconnect", "reason", reason == null ? "" : reason));
        }
        @Override public void onMessage(WebSocket conn, String message) {
            try {
                JSONObject m = new JSONObject(message);
                JSONObject header = m.optJSONObject("header");
                JSONObject body = m.optJSONObject("body");
                String purpose = header == null ? "" : header.optString("messagePurpose");
                if ("event".equals(purpose) && body != null) {
                    emit("onMinecraftEvent", obj("event", body.optString("eventName", "event"), "properties", body.optJSONObject("properties"), "raw", body.toString()));
                } else {
                    emit("onMinecraftEvent", obj("event", "response", "raw", message));
                }
            } catch (Exception e) {
                emit("onMinecraftEvent", obj("event", "raw", "raw", message));
            }
        }
        @Override public void onError(WebSocket conn, Exception ex) {
            emit("onLog", obj("level", "warn", "message", "WS: " + ex.getMessage()));
        }
        @Override public void onStart() {
            emit("onLog", obj("level", "info", "message", "Ponte WebSocket iniciada"));
        }
    }

    @JavascriptInterface public void launchMinecraft() {
        main.post(() -> {
            String[] pkgs = {"com.mojang.minecraftpe", "com.mojang.minecraftpe.mod"};
            for (String p : pkgs) {
                Intent intent = activity.getPackageManager().getLaunchIntentForPackage(p);
                if (intent != null) { activity.startActivity(intent); return; }
            }
            emit("onLog", obj("level", "warn", "message", "Minecraft não encontrado pelos pacotes conhecidos"));
        });
    }
    @JavascriptInterface public void setOrientation(String mode) {
        main.post(() -> {
            if ("portrait".equals(mode)) activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);
            else if ("landscape".equals(mode)) activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE);
            else activity.setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR);
        });
    }
    @JavascriptInterface public void keepScreenOn(boolean on) {
        main.post(() -> {
            if (on) activity.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            else activity.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        });
    }
    @JavascriptInterface public void log(String message) { Log.i("LunaTz", message); }
    void destroy() {
        try {
            if (recognizer != null) recognizer.destroy();
            if (tts != null) tts.shutdown();
            if (player != null) player.release();
            if (wsServer != null) wsServer.stop();
            long h = modelHandle; modelHandle = 0; if (h != 0) LlamaEngine.nativeUnload(h);
            io.shutdownNow(); llm.shutdownNow();
        } catch (Exception ignored) { }
    }
}
