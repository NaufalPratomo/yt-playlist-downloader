package com.naufalpratomo.musicgit;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.os.Handler;
import android.os.Looper;
import android.provider.Settings;
import android.util.Log;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.annotation.NonNull;
import androidx.appcompat.app.AppCompatActivity;
import androidx.core.app.ActivityCompat;
import androidx.core.content.ContextCompat;

import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;

import java.io.PrintWriter;
import java.io.StringWriter;
import java.net.HttpURLConnection;
import java.net.URL;

public class MainActivity extends AppCompatActivity {
    private static final String TAG = "MusicGitActivity";
    private WebView webView;
    private static final int PERMISSION_REQ_CODE = 101;
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private boolean serverReady = false;
    private String pythonError = null;

    private static final String SERVER_URL = "http://127.0.0.1:8585/";
    private static final int MAX_POLL_ATTEMPTS = 60;   // 60 seconds max wait
    private static final int POLL_INTERVAL_MS = 1000;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // 1. Request storage permissions
        checkAndRequestPermissions();

        // 2. Setup WebView
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
        settings.setCacheMode(WebSettings.LOAD_NO_CACHE);

        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                // Suppress: we handle connectivity via polling, not via WebView error callbacks
                if (request.isForMainFrame()) {
                    Log.w(TAG, "WebView main frame error (suppressed, polling handles this)");
                }
            }
        });

        // 3. Show loading splash
        showSplash("Memulai MusicGit Engine...", "Menginisialisasi Python runtime");

        // 4. Start Python backend in a background thread (directly, no Service)
        new Thread(this::startPythonBackend, "MusicGit-PythonInit").start();
    }

    /**
     * Starts Chaquopy Python and calls android_server.start_server().
     * Runs on a background thread. On error, captures the traceback and
     * pushes it to the WebView so the user/developer can see it.
     */
    private void startPythonBackend() {
        try {
            Log.i(TAG, "Initializing Chaquopy Python...");
            if (!Python.isStarted()) {
                Python.start(new AndroidPlatform(this));
            }
            Python py = Python.getInstance();
            Log.i(TAG, "Python initialized. Loading android_server module...");

            // This call blocks — it runs the uvicorn event loop.
            // If there's an import error or crash, we'll catch it.
            py.getModule("android_server").callAttr("start_server");

            // If we reach here, the server has stopped (shouldn't normally happen)
            Log.w(TAG, "android_server.start_server() returned unexpectedly");
        } catch (Throwable t) {
            StringWriter sw = new StringWriter();
            t.printStackTrace(new PrintWriter(sw));
            String errorDetail = sw.toString();
            Log.e(TAG, "Python backend failed:\n" + errorDetail);

            pythonError = errorDetail;
            mainHandler.post(() -> showErrorPage(errorDetail));
        }
    }

    /**
     * After Python thread starts, begin polling the server URL.
     * This runs on the main thread and uses a background check.
     */
    private void startPolling() {
        new Thread(() -> {
            for (int attempt = 1; attempt <= MAX_POLL_ATTEMPTS; attempt++) {
                if (serverReady) return;

                // Check for Python crash before wasting time
                if (pythonError != null) {
                    mainHandler.post(() -> showErrorPage(pythonError));
                    return;
                }

                final int att = attempt;
                mainHandler.post(() -> showSplash(
                        "Memulai MusicGit Engine...",
                        "Menunggu server siap... (" + att + "s)"
                ));

                try {
                    HttpURLConnection conn = (HttpURLConnection) new URL(SERVER_URL).openConnection();
                    conn.setConnectTimeout(800);
                    conn.setReadTimeout(800);
                    conn.setRequestMethod("GET");
                    int code = conn.getResponseCode();
                    conn.disconnect();

                    if (code >= 200 && code < 500) {
                        serverReady = true;
                        Log.i(TAG, "Server ready after " + att + " seconds!");
                        mainHandler.post(() -> webView.loadUrl(SERVER_URL));
                        return;
                    }
                } catch (Exception ignored) {
                    // Server not ready yet
                }

                try { Thread.sleep(POLL_INTERVAL_MS); } catch (InterruptedException e) { return; }
            }

            // All attempts exhausted
            if (!serverReady) {
                String msg = pythonError != null ? pythonError : "Server tidak merespons setelah " + MAX_POLL_ATTEMPTS + " detik.";
                mainHandler.post(() -> showErrorPage(msg));
            }
        }, "MusicGit-ServerPoll").start();
    }

    private void showSplash(String title, String subtitle) {
        String html = "<!DOCTYPE html><html><head>"
                + "<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1.0,maximum-scale=1.0,user-scalable=no'>"
                + "<style>"
                + "* { box-sizing: border-box; margin: 0; padding: 0; }"
                + "body { background: #0a0e17; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;"
                + "  display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; overflow: hidden; text-align: center; }"
                + ".splash-container { display: flex; flex-direction: column; align-items: center; justify-content: center; animation: fadeIn 0.5s ease-out; }"
                + "h1.title { font-size: 2rem; font-weight: 700; letter-spacing: -0.03em; color: #ffffff; margin-bottom: 8px; }"
                + "p.subtitle { font-size: 0.92rem; font-weight: 400; color: #94a3b8; letter-spacing: 0.02em; }"
                + ".dots::after { content: ''; animation: dots 1.5s steps(4, end) infinite; }"
                + ".loader-bar { width: 130px; height: 3px; background: rgba(255, 255, 255, 0.08); border-radius: 3px; margin-top: 22px; overflow: hidden; position: relative; }"
                + ".loader-progress { position: absolute; height: 100%; width: 45%; background: #38bdf8; border-radius: 3px; animation: loadingAnim 1.4s ease-in-out infinite; }"
                + "@keyframes fadeIn { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }"
                + "@keyframes loadingAnim { 0% { left: -45%; } 100% { left: 100%; } }"
                + "@keyframes dots { 0%, 20% { content: ''; } 40% { content: '.'; } 60% { content: '..'; } 80%, 100% { content: '...'; } }"
                + "</style></head><body>"
                + "<div class='splash-container'>"
                + "  <h1 class='title'>MusicGit</h1>"
                + "  <p class='subtitle'>Starting<span class='dots'></span></p>"
                + "  <div class='loader-bar'><div class='loader-progress'></div></div>"
                + "</div>"
                + "</body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);

        // Start polling after first splash render
        if (!serverReady && pythonError == null) {
            mainHandler.postDelayed(this::startPolling, 500);
        }
    }

    private void showErrorPage(String errorDetail) {
        String html = "<!DOCTYPE html><html><head>"
                + "<meta charset='utf-8'><meta name='viewport' content='width=device-width,initial-scale=1.0'>"
                + "<style>"
                + "body{background:#0a0e17;color:#f8fafc;font-family:-apple-system,sans-serif;padding:20px;margin:0;}"
                + "h1{color:#ff6b6b;font-size:1.3em;margin-bottom:8px;}"
                + "h2{color:#ffa94d;font-size:1em;margin-top:20px;}"
                + "pre{background:#1a2634;color:#69db7c;padding:14px;border-radius:8px;overflow-x:auto;"
                + "white-space:pre-wrap;word-break:break-all;font-size:0.78em;border:1px solid #2c3e50;max-height:60vh;overflow-y:auto;}"
                + ".btn{display:inline-block;background:#2563eb;color:#fff;border:none;padding:10px 20px;"
                + "border-radius:8px;font-size:0.9rem;font-weight:600;margin-top:16px;text-decoration:none;}"
                + "</style></head><body>"
                + "<h1>\u26a0\ufe0f MusicGit Engine Error</h1>"
                + "<p style='color:#94a3b8'>Python backend gagal dijalankan. Detail error di bawah ini:</p>"
                + "<pre>" + escapeHtml(errorDetail) + "</pre>"
                + "<h2>Info Sistem:</h2>"
                + "<pre>Android SDK: " + Build.VERSION.SDK_INT + "\n"
                + "Device: " + Build.MANUFACTURER + " " + Build.MODEL + "\n"
                + "ABI: " + String.join(", ", Build.SUPPORTED_ABIS) + "</pre>"
                + "<a class='btn' href='" + SERVER_URL + "'>Coba Lagi</a>"
                + "</body></html>";
        webView.loadDataWithBaseURL(null, html, "text/html", "utf-8", null);
    }

    private String escapeHtml(String text) {
        if (text == null) return "";
        return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
                .replace("\"", "&quot;").replace("'", "&#39;");
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
            moveTaskToBack(true);
        }
    }
}
