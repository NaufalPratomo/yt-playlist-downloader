package com.naufalpratomo.musicgit;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.Settings;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

public class MainActivity extends AppCompatActivity {
    private WebView webView;
    private static final int PERMISSION_REQ_CODE = 101;
    private boolean isServerReady = false;
    private int retryCount = 0;
    private static final int MAX_RETRIES = 30;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Request Storage Permissions
        checkAndRequestPermissions();

        // 2. Start Background Python FastAPI Service
        Intent serviceIntent = new Intent(this, MusicGitBackgroundService.class);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }

        // 3. Setup Native WebView
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(true);
        settings.setAllowContentAccess(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, int errorCode, String description, String failingUrl) {
                handleConnectionFailure(view, failingUrl);
            }

            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    handleConnectionFailure(view, request.getUrl().toString());
                }
            }

            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.contains("127.0.0.1:8585")) {
                    isServerReady = true;
                    retryCount = 0;
                }
            }
        });

        // 4. Show initial splash / connecting screen and start polling
        showLoadingScreen();
        webView.postDelayed(this::attemptLoadServer, 800);
    }

    private void showLoadingScreen() {
        String loadingHtml = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                + "<style>"
                + "body{background:#0a0e17;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;}"
                + ".spinner{width:46px;height:46px;border:3px solid rgba(255,255,255,0.1);border-top:3px solid #38bdf8;border-radius:50%;animation:spin 0.9s cubic-bezier(0.4, 0, 0.2, 1) infinite;margin-bottom:20px;}"
                + "h2{font-size:1.15rem;font-weight:700;margin:0 0 8px 0;letter-spacing:-0.02em;color:#f1f5f9;}"
                + "p{color:#94a3b8;font-size:0.82rem;margin:0;}"
                + "@keyframes spin{0%{transform:rotate(0deg);}100%{transform:rotate(360deg);}}"
                + "</style></head><body>"
                + "<div class='spinner'></div>"
                + "<h2>Memulai MusicGit Engine...</h2>"
                + "<p>Menyiapkan server lokal &amp; library musik</p>"
                + "</body></html>";
        webView.loadDataWithBaseURL(null, loadingHtml, "text/html", "utf-8", null);
    }

    private void attemptLoadServer() {
        if (!isServerReady && retryCount < MAX_RETRIES) {
            retryCount++;
            webView.loadUrl("http://127.0.0.1:8585/");
        }
    }

    private void handleConnectionFailure(WebView view, String failingUrl) {
        if (isServerReady) return;

        if (retryCount < MAX_RETRIES) {
            view.postDelayed(this::attemptLoadServer, 1000);
        } else {
            String errorHtml = "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width, initial-scale=1.0'>"
                    + "<style>"
                    + "body{background:#0a0e17;color:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,sans-serif;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;margin:0;padding:24px;box-sizing:border-box;text-align:center;}"
                    + "h2{color:#f87171;font-size:1.2rem;margin-bottom:8px;}"
                    + "p{color:#94a3b8;font-size:0.85rem;margin-bottom:20px;line-height:1.4;}"
                    + "button{background:#2563eb;color:#ffffff;border:none;padding:10px 20px;border-radius:8px;font-size:0.9rem;font-weight:600;cursor:pointer;}"
                    + "</style></head><body>"
                    + "<h2>Gagal Menghubungkan ke Server Lokal</h2>"
                    + "<p>Layanan background Python tidak merespons. Pastikan izin penyimpanan telah diberikan.</p>"
                    + "<button onclick='window.location.reload()'>Coba Lagi</button>"
                    + "</body></html>";
            view.loadDataWithBaseURL(null, errorHtml, "text/html", "utf-8", null);
        }
    }

    private void checkAndRequestPermissions() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            if (!Environment.isExternalStorageManager()) {
                try {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_APP_ALL_FILES_ACCESS_PERMISSION);
                    intent.addCategory("android.intent.category.DEFAULT");
                    intent.setData(Uri.parse(String.format("package:%s", getApplicationContext().getPackageName())));
                    startActivity(intent);
                } catch (Exception e) {
                    Intent intent = new Intent(Settings.ACTION_MANAGE_ALL_FILES_ACCESS_PERMISSION);
                    startActivity(intent);
                }
            }
        } else {
            String[] perms = {
                    Manifest.permission.READ_EXTERNAL_STORAGE,
                    Manifest.permission.WRITE_EXTERNAL_STORAGE
            };
            if (ContextCompat.checkSelfPermission(this, Manifest.permission.WRITE_EXTERNAL_STORAGE) != PackageManager.PERMISSION_GRANTED) {
                ActivityCompat.requestPermissions(this, perms, PERMISSION_REQ_CODE);
            }
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            // Move app to background instead of killing process so music continues playing
            moveTaskToBack(true);
        }
    }
}
