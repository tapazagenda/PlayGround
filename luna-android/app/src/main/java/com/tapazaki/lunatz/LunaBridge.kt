package com.tapazaki.lunatz

import android.app.Activity
import android.content.Intent
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.webkit.JavascriptInterface
import android.webkit.WebView
import androidx.activity.result.ActivityResultLauncher
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors

class LunaBridge(
    private val activity: MainActivity,
    private val webView: WebView,
    private val folderPicker: ActivityResultLauncher<Uri?>,
    private val audioPermission: ActivityResultLauncher<String>
) {
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newSingleThreadExecutor()
    private val prefs = activity.getSharedPreferences("lunatz", Activity.MODE_PRIVATE)
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var recognizer: SpeechRecognizer? = null
    private var player: MediaPlayer? = null
    private val dataDir = File(activity.filesDir, "luna_data").apply { mkdirs() }

    init {
        tts = TextToSpeech(activity) { status ->
            ttsReady = status == TextToSpeech.SUCCESS
            if (ttsReady) {
                tts?.language = Locale("pt", "BR")
                tts?.setSpeechRate(1.0f)
                tts?.setPitch(1.08f)
            }
            emit("onTtsReady", JSONObject().put("ready", ttsReady))
        }
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(utteranceId: String?) { emit("onSpeaking", JSONObject().put("speaking", true)) }
            override fun onDone(utteranceId: String?) { emit("onSpeaking", JSONObject().put("speaking", false)) }
            override fun onError(utteranceId: String?) { emit("onSpeaking", JSONObject().put("speaking", false)) }
        })
    }

    fun emit(event: String, data: JSONObject) {
        val js = "window.LunaNativeEvents && window.LunaNativeEvents.dispatch('${event}', ${data});"
        main.post { webView.evaluateJavascript(js, null) }
    }

    @JavascriptInterface fun getAppInfo(): String = JSONObject()
        .put("app", "LunaTz Companion")
        .put("engine", "LunaTz Engine v1.0")
        .put("package", activity.packageName)
        .put("version", BuildConfig.VERSION_NAME)
        .put("authors", "Tapazaki & Assistente")
        .put("youtube", "Tapazaki")
        .put("sdk", Build.VERSION.SDK_INT)
        .put("device", Build.MODEL)
        .put("abis", JSONArray(Build.SUPPORTED_ABIS)).toString()

    @JavascriptInterface fun getSettings(): String = prefs.getString("settings", "{}") ?: "{}"
    @JavascriptInterface fun saveSettings(json: String) { prefs.edit().putString("settings", json).apply() }
    @JavascriptInterface fun getHistory(): String = prefs.getString("history", "[]") ?: "[]"
    @JavascriptInterface fun saveHistory(json: String) { prefs.edit().putString("history", json).apply() }
    @JavascriptInterface fun clearHistory() { prefs.edit().remove("history").apply() }

    @JavascriptInterface fun pickLunaFolder() { main.post { activity.pickFolder() } }
    @JavascriptInterface fun openStorageSettings() {
        main.post {
            try {
                val intent = if (Build.VERSION.SDK_INT >= 30) Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION, Uri.parse("package:${activity.packageName}"))
                else Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS, Uri.parse("package:${activity.packageName}"))
                activity.startActivity(intent)
            } catch (_: Exception) { }
        }
    }

    @JavascriptInterface fun importFolder(uriString: String) {
        io.execute {
            val result = JSONObject()
            try {
                val tree = Uri.parse(uriString)
                val files = JSONArray()
                val resolver = activity.contentResolver
                val treeDocId = android.provider.DocumentsContract.getTreeDocumentId(tree)
                val childrenUri = android.provider.DocumentsContract.buildChildDocumentsUriUsingTree(tree, treeDocId)
                val children = resolver.query(childrenUri, arrayOf(android.provider.DocumentsContract.Document.COLUMN_DOCUMENT_ID, android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME, android.provider.DocumentsContract.Document.COLUMN_SIZE), null, null, null)
                children?.use { c ->
                    val idCol = c.getColumnIndexOrThrow(android.provider.DocumentsContract.Document.COLUMN_DOCUMENT_ID)
                    val nameCol = c.getColumnIndexOrThrow(android.provider.DocumentsContract.Document.COLUMN_DISPLAY_NAME)
                    val sizeCol = c.getColumnIndexOrThrow(android.provider.DocumentsContract.Document.COLUMN_SIZE)
                    while (c.moveToNext()) {
                        val name = c.getString(nameCol) ?: continue
                        val size = c.getLong(sizeCol)
                        val docId = c.getString(idCol)
                        val childUri = android.provider.DocumentsContract.buildDocumentUriUsingTree(tree, docId)
                        val item = inspectAndCopy(name, size, childUri)
                        files.put(item)
                    }
                }
                prefs.edit().putString("folder_uri", uriString).putString("files_manifest", files.toString()).apply()
                result.put("ok", true).put("files", files).put("path", "/sdcard/DADOS DE LUNA")
            } catch (e: Exception) {
                result.put("ok", false).put("error", e.message ?: "Falha ao ler pasta")
            }
            emit("onFolderPicked", result)
        }
    }

    private fun inspectAndCopy(name: String, size: Long, uri: Uri): JSONObject {
        val item = JSONObject().put("name", name).put("size", size)
        val lower = name.lowercase(Locale.ROOT)
        val expected = when {
            lower.endsWith(".gguf") -> "gguf"
            lower == "luna_voice.pth" || lower.endsWith(".pth") -> "voice"
            lower == "lunatz_brain.json" || lower.endsWith(".json") -> "brain"
            lower == "luna_skin.png" || lower.endsWith(".png") -> "skin"
            lower == "voz_luna.mp3" || lower.endsWith(".mp3") -> "sample"
            else -> "other"
        }
        item.put("kind", expected)
        if (expected == "other") return item.put("status", "ignorado")
        try {
            val target = File(dataDir, name)
            if (!target.exists() || target.length() != size) {
                activity.contentResolver.openInputStream(uri)?.use { input ->
                    target.outputStream().use { output -> input.copyTo(output, DEFAULT_BUFFER_SIZE) }
                }
            }
            item.put("path", target.absolutePath).put("copied", true)
            when (expected) {
                "gguf" -> {
                    val magic = target.inputStream().use { s -> val b = ByteArray(4); s.read(b); String(b, Charsets.US_ASCII) }
                    item.put("status", if (magic == "GGUF") "GGUF válido" else "cabeçalho não reconhecido")
                }
                "brain" -> {
                    val json = JSONObject(target.readText())
                    item.put("status", "JSON válido").put("keys", json.length())
                }
                "skin" -> item.put("status", "PNG importado")
                "voice" -> item.put("status", "PTH importado (arquitetura pendente)")
                "sample" -> item.put("status", "MP3 importado")
            }
        } catch (e: Exception) { item.put("status", "erro: ${e.message}") }
        return item
    }

    @JavascriptInterface fun getFilesManifest(): String = prefs.getString("files_manifest", "[]") ?: "[]"
    @JavascriptInterface fun readBrain(): String {
        val f = File(dataDir, "LunaTz_Brain.json")
        return if (f.exists()) f.readText() else "{}"
    }
    @JavascriptInterface fun playReferenceSample() {
        main.post {
            try {
                val f = File(dataDir, "voz_luna.mp3")
                if (!f.exists()) { emit("onSample", JSONObject().put("ok", false).put("error", "voz_luna.mp3 não importado")); return@post }
                player?.release()
                player = MediaPlayer().apply {
                    setDataSource(f.absolutePath)
                    setOnCompletionListener { emit("onSample", JSONObject().put("ok", true).put("playing", false)) }
                    prepare(); start()
                }
                emit("onSample", JSONObject().put("ok", true).put("playing", true))
            } catch (e: Exception) { emit("onSample", JSONObject().put("ok", false).put("error", e.message)) }
        }
    }

    @JavascriptInterface fun speak(text: String) {
        main.post {
            if (!ttsReady) { emit("onSpeechError", JSONObject().put("error", "TTS ainda não está pronto")); return@post }
            tts?.speak(text, TextToSpeech.QUEUE_FLUSH, null, "luna-" + System.currentTimeMillis())
        }
    }
    @JavascriptInterface fun stopSpeaking() { main.post { tts?.stop(); emit("onSpeaking", JSONObject().put("speaking", false)) } }
    @JavascriptInterface fun setVoice(rate: Float, pitch: Float) { main.post { tts?.setSpeechRate(rate); tts?.setPitch(pitch) } }

    @JavascriptInterface fun startListening() {
        main.post {
            if (!activity.hasAudio()) { activity.requestAudio(); return@post }
            if (!SpeechRecognizer.isRecognitionAvailable(activity)) {
                emit("onSpeechError", JSONObject().put("error", "Reconhecimento de fala indisponível neste aparelho"))
                return@post
            }
            recognizer?.destroy()
            recognizer = SpeechRecognizer.createSpeechRecognizer(activity).apply {
                setRecognitionListener(object : RecognitionListener {
                    override fun onReadyForSpeech(params: Bundle?) { emit("onListening", JSONObject().put("listening", true)) }
                    override fun onBeginningOfSpeech() {}
                    override fun onRmsChanged(rmsdB: Float) { emit("onMicLevel", JSONObject().put("level", rmsdB)) }
                    override fun onBufferReceived(buffer: ByteArray?) {}
                    override fun onEndOfSpeech() { emit("onListening", JSONObject().put("listening", false)) }
                    override fun onError(error: Int) { emit("onSpeechError", JSONObject().put("error", "speech recognizer error $error")); emit("onListening", JSONObject().put("listening", false)) }
                    override fun onResults(results: Bundle?) {
                        val matches = results?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        emit("onSpeechResult", JSONObject().put("text", matches?.firstOrNull() ?: ""))
                    }
                    override fun onPartialResults(partialResults: Bundle?) {
                        val matches = partialResults?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)
                        emit("onSpeechPartial", JSONObject().put("text", matches?.firstOrNull() ?: ""))
                    }
                    override fun onEvent(eventType: Int, params: Bundle?) {}
                })
                listen(createIntent())
            }
        }
    }
    private fun createIntent(): Intent = Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH).apply {
        putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
        putExtra(RecognizerIntent.EXTRA_LANGUAGE, "pt-BR")
        putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, true)
        putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
    }
    @JavascriptInterface fun stopListening() { main.post { recognizer?.stopListening(); emit("onListening", JSONObject().put("listening", false)) } }

    @JavascriptInterface fun pingBedrock(host: String, port: Int) {
        io.execute {
            val result = JSONObject().put("host", host).put("port", port)
            var socket: DatagramSocket? = null
            try {
                val address = InetAddress.getByName(host)
                socket = DatagramSocket()
                socket.soTimeout = 2200
                val guid = UUID.randomUUID().mostSignificantBits
                val magic = byteArrayOf(0x00,0xff,0xff,0x00,0xfe,0xfe,0xfe,0xfe,0xfd,0xfd,0xfd,0xfd,0x12,0x34,0x56,0x78)
                val buf = ByteBuffer.allocate(33).order(ByteOrder.BIG_ENDIAN)
                buf.put(0x01.toByte()).putLong(System.currentTimeMillis()).put(magic).putLong(guid)
                val packet = DatagramPacket(buf.array(), buf.array().size, address, port)
                val start = System.nanoTime()
                socket.send(packet)
                val resp = DatagramPacket(ByteArray(2048), 2048)
                socket.receive(resp)
                val ms = (System.nanoTime() - start) / 1_000_000
                val data = resp.data
                if (resp.length > 35 && data[0] == 0x1c.toByte()) {
                    val len = ((data[33].toInt() and 0xff) shl 8) or (data[34].toInt() and 0xff)
                    val motd = String(data, 35, minOf(len, resp.length - 35), Charsets.UTF_8)
                    result.put("ok", true).put("latencyMs", ms).put("motd", motd)
                } else result.put("ok", false).put("error", "Resposta não é um pong Bedrock esperado")
            } catch (e: Exception) { result.put("ok", false).put("error", e.message ?: "sem resposta") }
            finally { socket?.close() }
            emit("onBedrockPing", result)
        }
    }

    @JavascriptInterface fun launchMinecraft() {
        main.post {
            val pkgs = listOf("com.mojang.minecraftpe", "com.mojang.minecraftpe.mod")
            for (p in pkgs) {
                val intent = activity.packageManager.getLaunchIntentForPackage(p)
                if (intent != null) { activity.startActivity(intent); return@post }
            }
            emit("onLog", JSONObject().put("level", "warn").put("message", "Minecraft não encontrado pelos pacotes conhecidos"))
        }
    }

    @JavascriptInterface fun setOrientation(mode: String) {
        main.post {
            activity.requestedOrientation = when (mode) {
                "portrait" -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_PORTRAIT
                "landscape" -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_LANDSCAPE
                else -> android.content.pm.ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR
            }
        }
    }
    @JavascriptInterface fun keepScreenOn(on: Boolean) { main.post { if (on) activity.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) else activity.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) } }
    @JavascriptInterface fun log(message: String) { android.util.Log.i("LunaTz", message) }
    fun destroy() { try { recognizer?.destroy(); tts?.shutdown(); player?.release(); io.shutdownNow() } catch (_: Exception) {} }
}
