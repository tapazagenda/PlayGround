package com.tapazagenda.studiotz;

import android.app.Activity;
import android.app.DownloadManager;
import android.content.Context;
import android.net.Uri;
import android.os.Bundle;
import android.os.Environment;
import android.view.KeyEvent;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

/**
 * Studio Tz — casco nativo Android.
 *
 * Carrega o estúdio de animação (web, 100% offline) embutido em
 * assets/studio-tz/ dentro de um WebView e oferece a ponte
 * StudioBridge para salvar o vídeo renderizado no celular.
 */
public class MainActivity extends Activity {

    private WebView webView;

    /** Ponte JS -> Android: salva o vídeo renderizado pelo Studio Tz. */
    public class StudioBridge {
        @JavascriptInterface
        public void download(String url, String filename) {
            try {
                DownloadManager.Request request = new DownloadManager.Request(Uri.parse(url))
                        .setDestinationUri(Uri.parse(
                                "file://" + Environment.getExternalStorageDirectory()
                                        + "/Download/" + filename))
                        .setNotificationVisibility(
                                DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                        .setTitle("Studio Tz — " + filename)
                        .setMimeType("video/webm");
                DownloadManager dm = (DownloadManager) getSystemService(Context.DOWNLOAD_SERVICE);
                if (dm != null) dm.enqueue(request);
            } catch (Exception ignored) {
                // se falhar, a página ainda oferece o link de download manual
            }
        }
    }

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // mantém a tela acesa durante preview/render
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        webView = new WebView(this);
        setContentView(webView);

        webView.setBackgroundColor(0xFF0B0B12);

        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setDatabaseEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        // o app roda inteiro de file:///android_asset (offline)
        s.setAllowFileAccessFromFileURLs(true);
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);
        s.setCacheMode(WebSettings.LOAD_DEFAULT);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        s.setUseWideViewPort(true);
        s.setLoadWithOverviewMode(true);
        s.setTextZoom(100);

        webView.addJavascriptInterface(new StudioBridge(), "StudioBridge");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, String url) {
                // mantém tudo dentro do app
                return false;
            }
        });

        webView.loadUrl("file:///android_asset/studio-tz/index.html");
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_BACK) {
            // navegação interna do app; volta fecha o estúdio
            finish();
            return true;
        }
        return super.onKeyDown(keyCode, event);
    }

    @Override
    protected void onPause() {
        super.onPause();
        if (webView != null) webView.onPause();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (webView != null) webView.onResume();
    }

    @Override
    protected void onDestroy() {
        if (webView != null) {
            webView.loadUrl("about:blank");
            webView.destroy();
        }
        super.onDestroy();
    }
}
