package com.tapazaki.lunatz;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.provider.DocumentsContract;
import android.webkit.PermissionRequest;
import android.webkit.WebChromeClient;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends Activity {
    private static final int REQ_FOLDER = 1001;
    private static final int REQ_AUDIO = 1002;
    private static final int REQ_NOTIF = 1003;
    private WebView webView;
    private LunaBridge bridge;
    private PermissionRequest webPermission;

    @SuppressLint({"SetJavaScriptEnabled", "AddJavascriptInterface"})
    @Override protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);
        WebSettings s = webView.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        webView.setWebChromeClient(new WebChromeClient() {
            @Override public void onPermissionRequest(PermissionRequest request) {
                webPermission = request;
                if (hasAudio()) grantWeb(); else requestAudio();
            }
        });
        webView.setWebViewClient(new WebViewClient());
        bridge = new LunaBridge(this, webView);
        webView.addJavascriptInterface(bridge, "LunaNative");
        webView.loadUrl("file:///android_asset/ui/index.html");
        if (Build.VERSION.SDK_INT >= 33 && ContextCompat.checkSelfPermission(this, Manifest.permission.POST_NOTIFICATIONS) != PackageManager.PERMISSION_GRANTED) {
            ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.POST_NOTIFICATIONS}, REQ_NOTIF);
        }
    }

    public boolean hasAudio() {
        return ContextCompat.checkSelfPermission(this, Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED;
    }
    public void requestAudio() {
        ActivityCompat.requestPermissions(this, new String[]{Manifest.permission.RECORD_AUDIO}, REQ_AUDIO);
    }
    private void grantWeb() {
        if (webPermission != null) {
            webPermission.grant(webPermission.getResources());
            webPermission = null;
        }
    }
    public void pickFolder() {
        Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
        i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_GRANT_PERSISTABLE_URI_PERMISSION);
        try {
            Uri initial = DocumentsContract.buildDocumentUri("com.android.externalstorage.documents", "primary:DADOS DE LUNA");
            i.putExtra(DocumentsContract.EXTRA_INITIAL_URI, initial);
        } catch (Exception ignored) { }
        startActivityForResult(i, REQ_FOLDER);
    }
    public void startBridgeService() {
        runOnUiThread(() -> {
            Intent i = new Intent(this, LunaBridgeService.class);
            if (Build.VERSION.SDK_INT >= 26) startForegroundService(i); else startService(i);
        });
    }
    public void stopBridgeService() {
        runOnUiThread(() -> stopService(new Intent(this, LunaBridgeService.class)));
    }

    @Override public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        boolean granted = grantResults.length > 0 && grantResults[0] == PackageManager.PERMISSION_GRANTED;
        if (requestCode == REQ_AUDIO) {
            bridge.emit("onAudioPermission", LunaBridge.obj("granted", granted));
            if (granted) grantWeb();
        }
    }
    @Override protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode == REQ_FOLDER && resultCode == RESULT_OK && data != null && data.getData() != null) {
            Uri tree = data.getData();
            try {
                getContentResolver().takePersistableUriPermission(tree, Intent.FLAG_GRANT_READ_URI_PERMISSION);
            } catch (Exception ignored) { }
            bridge.importFolder(tree.toString());
        }
    }
    @Override public void onBackPressed() {
        webView.evaluateJavascript("window.LunaUI && window.LunaUI.back();", value -> {
            if (!"true".equals(value)) super.onBackPressed();
        });
    }
    @Override protected void onDestroy() {
        if (bridge != null) bridge.destroy();
        if (webView != null) webView.destroy();
        super.onDestroy();
    }
}
