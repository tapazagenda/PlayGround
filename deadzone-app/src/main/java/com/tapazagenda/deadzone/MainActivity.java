package com.tapazagenda.deadzone;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.res.AssetManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.ConsoleMessage;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.util.HashMap;
import java.util.Map;

/**
 * DEADZONE — casca Android (WebView) do jogo, em tela cheia.
 *
 * O jogo (HTML/CSS/JS/WebGL) fica em src/main/assets/deadzone e é servido como
 * se estivesse em https://appassets.androidplatform.net/assets/deadzone/.
 *
 * Servir por esse "host virtual" é essencial: módulos ES (import/export) NÃO
 * carregam de file:// em WebView moderno por causa da origem opaca, e o
 * localStorage não persiste. Aqui toda requisição para esse host é respondida
 * localmente pelo AssetManager, então o jogo roda exatamente como no navegador
 * — mesma origem para js/css/assets, save/settings funcionando e som liberado.
 *
 * Sem androidx e sem nenhuma permissão: compila em Java puro e não pede nada
 * ao usuário. Nada de rede: os arquivos vêm do próprio APK.
 */
public class MainActivity extends Activity {

    private static final String HOST = "appassets.androidplatform.net";
    private static final String URL = "https://" + HOST + "/assets/deadzone/index.html";
    private static final int BG = 0xFF050908;

    private WebView webView;
    private AssetManager assets;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().setBackgroundDrawable(
                new android.graphics.drawable.ColorDrawable(BG));

        applyImmersive();

        assets = getAssets();

        webView = new WebView(this);
        webView.setBackgroundColor(BG);
        setContentView(webView);

        // O jogo desenha atrás das barras do sistema: nada de padding.
        webView.setOnApplyWindowInsetsListener((v, insets) -> {
            v.setPadding(0, 0, 0, 0);
            return insets;
        });

        if (BuildConfig.DEBUG) {
            WebView.setWebContentsDebuggingEnabled(true);
        }

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // localStorage: save/settings
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(false);           // tudo vem do AssetManager
        s.setAllowContentAccess(false);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setJavaScriptCanOpenWindowsAutomatically(false);
        s.setTextZoom(100);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                String host = request.getUrl().getHost();
                if (host != null && host.equalsIgnoreCase(HOST)) {
                    WebResourceResponse r = serveAsset(request.getUrl().getPath());
                    if (r != null) return r;
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(
                    WebView view, WebResourceRequest request) {
                // Tudo dentro do app; nunca abre navegador externo.
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onConsoleMessage(ConsoleMessage msg) {
                android.util.Log.d("DEADZONE", msg.message() + " @"
                        + msg.sourceId() + ":" + msg.lineNumber());
                return true;
            }
        });

        webView.loadUrl(URL);
    }

    /**
     * Lê o arquivo do APK e devolve com o MIME certo.
     * Caminho esperado: /assets/deadzone/<resto>.
     */
    private WebResourceResponse serveAsset(String path) {
        if (path == null) return null;
        int q = path.indexOf('?');
        if (q >= 0) path = path.substring(0, q);
        final String prefix = "/assets/deadzone/";
        String rel;
        if (path.startsWith(prefix)) {
            rel = path.substring(prefix.length());
        } else if (path.equals("/assets/deadzone")) {
            rel = "index.html";
        } else {
            return null;
        }
        if (rel.isEmpty() || rel.endsWith("/")) rel = rel + "index.html";

        try {
            InputStream in = assets.open("deadzone/" + rel);
            Map<String, String> headers = new HashMap<>();
            headers.put("Cache-Control", "no-cache");
            WebResourceResponse res = new WebResourceResponse(
                    mimeOf(rel), "utf-8", 200, "OK", headers, in);
            return res;
        } catch (IOException e) {
            // 404 explícito: melhor que deixar o WebView tentar a rede.
            return new WebResourceResponse("text/plain", "utf-8", 404, "Not Found",
                    new HashMap<String, String>(),
                    new ByteArrayInputStream(new byte[0]));
        }
    }

    private static String mimeOf(String name) {
        String n = name.toLowerCase();
        int dot = n.lastIndexOf('.');
        String ext = dot >= 0 ? n.substring(dot) : "";
        switch (ext) {
            case ".html": return "text/html";
            case ".js":
            case ".mjs": return "text/javascript";
            case ".css": return "text/css";
            case ".json": return "application/json";
            case ".webmanifest": return "application/manifest+json";
            case ".svg": return "image/svg+xml";
            case ".png": return "image/png";
            case ".jpg":
            case ".jpeg": return "image/jpeg";
            case ".webp": return "image/webp";
            case ".woff2": return "font/woff2";
            case ".woff": return "font/woff";
            case ".ttf": return "font/ttf";
            case ".ico": return "image/x-icon";
            case ".md": return "text/markdown";
            default: return "application/octet-stream";
        }
    }

    /** Esconde status bar e barra de navegação; swipe revela temporariamente. */
    private void applyImmersive() {
        Window w = getWindow();
        View decor = w.getDecorView();

        if (Build.VERSION.SDK_INT >= 30) {
            w.setDecorFitsSystemWindows(false);
            android.view.WindowInsetsController c = decor.getWindowInsetsController();
            if (c != null) {
                c.hide(android.view.WindowInsets.Type.systemBars());
                c.setSystemBarsBehavior(
                        android.view.WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE);
            }
        } else {
            w.setDecorFitsSystemWindows(false);
            decor.setSystemUiVisibility(
                    View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                            | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                            | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                            | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                            | View.SYSTEM_UI_FLAG_FULLSCREEN);
            if (Build.VERSION.SDK_INT >= 21) {
                w.setStatusBarColor(0x00000000);
                w.setNavigationBarColor(0x00000000);
            }
        }

        if (Build.VERSION.SDK_INT >= 28) {
            WindowManager.LayoutParams lp = w.getAttributes();
            lp.layoutInDisplayCutoutMode =
                    WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
            w.setAttributes(lp);
        }
    }

    @Override
    public void onWindowFocusChanged(boolean hasFocus) {
        super.onWindowFocusChanged(hasFocus);
        if (hasFocus) applyImmersive();
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) {
            webView.onPause();
            webView.pauseTimers();
            // Coloca o jogo em pausa lógica (abre o menu de pausa).
            webView.evaluateJavascript(
                    "window.__game && window.__game.state === 'playing' && window.__game.pause();",
                    null);
        }
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) {
            webView.resumeTimers();
            webView.onResume();
        }
        applyImmersive();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }

    @Override
    public void onBackPressed() {
        // Voltar não mata a partida por acidente: só pausa.
        if (webView != null) {
            webView.evaluateJavascript(
                    "window.__game && window.__game.state === 'playing' && window.__game.pause();",
                    null);
        }
    }
}
