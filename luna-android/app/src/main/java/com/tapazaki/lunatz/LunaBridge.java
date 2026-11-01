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
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.InetAddress;
import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import java.util.ArrayList;
import java.util.Locale;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class LunaBridge {
    private final MainActivity activity;
    private final WebView webView;
    private final Handler main = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final SharedPreferences prefs;
    private final File dataDir;
    private TextToSpeech tts;
    private boolean ttsReady = false;
    private SpeechRecognizer recognizer;
    private MediaPlayer player;

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
            emit("onTtsReady", json().put("ready", ttsReady));
        });
        tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
            @Override public void onStart(String utteranceId) { emit("onSpeaking", json().put("speaking", true)); }
            @Override public void onDone(String utteranceId) { emit("onSpeaking", json().put("speaking", false)); }
            @Override public void onError(String utteranceId) { emit("onSpeaking", json().put("speaking", false)); }
        });
    }

    SafeJSONObject json() { return new SafeJSONObject(); }
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
    void emit(String event, JSONObject data) {
        String js = "window.LunaNativeEvents && window.LunaNativeEvents.dispatch('" + event + "', " + data.toString() + ");";
        main.post(() -> webView.evaluateJavascript(js, null));
    }

    @JavascriptInterface public String getAppInfo() {
        JSONObject o = json();
        try {
            o.put("app", "LunaTz Companion");
            o.put("engine", "LunaTz Engine v1.0");
            o.put("package", activity.getPackageName());
            o.put("version", BuildConfig.VERSION_NAME);
            o.put("authors", "Tapazaki & Assistente");
            o.put("youtube", "Tapazaki");
            o.put("sdk", Build.VERSION.SDK_INT);
            o.put("device", Build.MODEL);
            JSONArray abis = new JSONArray();
            for (String a : Build.SUPPORTED_ABIS) abis.put(a);
            o.put("abis", abis);
        } catch (Exception ignored) { }
        return o.toString();
    }
    @JavascriptInterface public String getSettings() { return prefs.getString("settings", "{}"); }
    @JavascriptInterface public void saveSettings(String v) { prefs.edit().putString("settings", v).apply(); }
    @JavascriptInterface public String getHistory() { return prefs.getString("history", "[]"); }
    @JavascriptInterface public void saveHistory(String v) { prefs.edit().putString("history", v).apply(); }
    @JavascriptInterface public void clearHistory() { prefs.edit().remove("history").apply(); }

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
            JSONObject result = json();
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
        JSONObject item = json();
        try {
            item.put("name", name).put("size", size);
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
                    byte[] buf = new byte[8192];
                    int n;
                    while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                    out.close();
                    in.close();
                }
            }
            item.put("path", target.getAbsolutePath()).put("copied", true);
            switch (kind) {
                case "gguf":
                    InputStream gin = new java.io.FileInputStream(target);
                    byte[] magic = new byte[4];
                    int r = gin.read(magic);
                    gin.close();
                    item.put("status", r == 4 && new String(magic, java.nio.charset.StandardCharsets.US_ASCII).equals("GGUF") ? "GGUF válido" : "cabeçalho não reconhecido");
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
            try { item.put("status", "erro: " + e.getMessage()); } catch (Exception ignored) { }
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
                if (!f.exists()) { emit("onSample", json().put("ok", false).put("error", "voz_luna.mp3 não importado")); return; }
                if (player != null) player.release();
                player = new MediaPlayer();
                player.setDataSource(f.getAbsolutePath());
                player.setOnCompletionListener(mp -> emit("onSample", json().put("ok", true).put("playing", false)));
                player.prepare();
                player.start();
                emit("onSample", json().put("ok", true).put("playing", true));
            } catch (Exception e) { emit("onSample", json().put("ok", false).put("error", e.getMessage())); }
        });
    }

    @JavascriptInterface public void speak(String text) {
        main.post(() -> {
            if (!ttsReady) { emit("onSpeechError", json().put("error", "TTS ainda não está pronto")); return; }
            tts.speak(text, TextToSpeech.QUEUE_FLUSH, null, "luna-" + System.currentTimeMillis());
        });
    }
    @JavascriptInterface public void stopSpeaking() { main.post(() -> { tts.stop(); emit("onSpeaking", json().put("speaking", false)); }); }
    @JavascriptInterface public void setVoice(float rate, float pitch) { main.post(() -> { tts.setSpeechRate(rate); tts.setPitch(pitch); }); }

    @JavascriptInterface public void startListening() {
        main.post(() -> {
            if (!activity.hasAudio()) { activity.requestAudio(); return; }
            if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
                emit("onSpeechError", json().put("error", "Reconhecimento de fala indisponível neste aparelho"));
                return;
            }
            if (recognizer != null) recognizer.destroy();
            recognizer = SpeechRecognizer.createSpeechRecognizer(activity);
            recognizer.setRecognitionListener(new RecognitionListener() {
                @Override public void onReadyForSpeech(Bundle params) { emit("onListening", json().put("listening", true)); }
                @Override public void onBeginningOfSpeech() { }
                @Override public void onRmsChanged(float rmsdB) { emit("onMicLevel", json().put("level", rmsdB)); }
                @Override public void onBufferReceived(byte[] buffer) { }
                @Override public void onEndOfSpeech() { emit("onListening", json().put("listening", false)); }
                @Override public void onError(int error) { emit("onSpeechError", json().put("error", "speech recognizer error " + error)); emit("onListening", json().put("listening", false)); }
                @Override public void onResults(Bundle results) {
                    ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    emit("onSpeechResult", json().put("text", matches == null || matches.isEmpty() ? "" : matches.get(0)));
                }
                @Override public void onPartialResults(Bundle partialResults) {
                    ArrayList<String> matches = partialResults.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
                    emit("onSpeechPartial", json().put("text", matches == null || matches.isEmpty() ? "" : matches.get(0)));
                }
                @Override public void onEvent(int eventType, Bundle params) { }
            });
            recognizer.startListening(recognizerIntent());
        });
    }
    private Intent recognizerIntent() {
        Intent i = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        i.putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR");
        i.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true);
        i.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1);
        return i;
    }
    @JavascriptInterface public void stopListening() { main.post(() -> { if (recognizer != null) recognizer.stopListening(); emit("onListening", json().put("listening", false)); }); }

    @JavascriptInterface public void pingBedrock(String host, int port) {
        io.execute(() -> {
            JSONObject result = json();
            DatagramSocket socket = null;
            try {
                result.put("host", host).put("port", port);
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

    @JavascriptInterface public void launchMinecraft() {
        main.post(() -> {
            String[] pkgs = {"com.mojang.minecraftpe", "com.mojang.minecraftpe.mod"};
            for (String p : pkgs) {
                Intent intent = activity.getPackageManager().getLaunchIntentForPackage(p);
                if (intent != null) { activity.startActivity(intent); return; }
            }
            emit("onLog", json().put("level", "warn").put("message", "Minecraft não encontrado pelos pacotes conhecidos"));
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
        try { if (recognizer != null) recognizer.destroy(); if (tts != null) tts.shutdown(); if (player != null) player.release(); io.shutdownNow(); } catch (Exception ignored) { }
    }
}
