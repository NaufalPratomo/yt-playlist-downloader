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
                + "body { background: #070a11; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;"
                + "  display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; overflow: hidden; text-align: center;"
                + "  background: radial-gradient(circle at 50% 38%, rgba(2, 132, 199, 0.18) 0%, rgba(7, 10, 17, 0.95) 75%), #070a11; }"
                + ".splash-wrap { display: flex; flex-direction: column; align-items: center; justify-content: center; width: 100%; padding: 24px; animation: fadeIn 0.8s ease-out; }"
                + ".logo-box { position: relative; width: 96px; height: 96px; margin-bottom: 24px; display: flex; align-items: center; justify-content: center; }"
                + ".logo-halo { position: absolute; inset: -12px; border-radius: 28px; background: linear-gradient(135deg, rgba(56, 189, 248, 0.4), rgba(16, 185, 129, 0.3));"
                + "  filter: blur(16px); animation: haloPulse 3s ease-in-out infinite; }"
                + ".logo-card { position: relative; width: 88px; height: 88px; border-radius: 24px; background: linear-gradient(145deg, #111827, #0b1120);"
                + "  border: 1.5px solid rgba(56, 189, 248, 0.35); box-shadow: 0 16px 36px rgba(0, 0, 0, 0.6), inset 0 1px 1px rgba(255, 255, 255, 0.15);"
                + "  display: flex; align-items: center; justify-content: center; animation: logoFloat 3.5s ease-in-out infinite; }"
                + ".logo-icon { width: 50px; height: 50px; filter: drop-shadow(0 4px 12px rgba(56, 189, 248, 0.5)); }"
                + ".brand-name { font-size: 1.75rem; font-weight: 800; letter-spacing: -0.03em; margin-bottom: 4px;"
                + "  background: linear-gradient(135deg, #ffffff 30%, #38bdf8 70%, #34d399 100%); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }"
                + ".brand-tagline { color: #94a3b8; font-size: 0.82rem; font-weight: 500; letter-spacing: 0.05em; text-transform: uppercase; margin-bottom: 28px; opacity: 0.85; }"
                + ".eq-container { display: flex; align-items: flex-end; justify-content: center; gap: 5px; height: 24px; margin-bottom: 24px; }"
                + ".eq-bar { width: 4px; border-radius: 4px; background: linear-gradient(to top, #0284c7, #38bdf8); animation: eqBounce 1.2s ease-in-out infinite; }"
                + ".eq-bar:nth-child(1) { height: 8px; animation-delay: 0.1s; }"
                + ".eq-bar:nth-child(2) { height: 18px; animation-delay: 0.3s; background: linear-gradient(to top, #0284c7, #34d399); }"
                + ".eq-bar:nth-child(3) { height: 24px; animation-delay: 0.15s; background: linear-gradient(to top, #10b981, #38bdf8); }"
                + ".eq-bar:nth-child(4) { height: 14px; animation-delay: 0.4s; background: linear-gradient(to top, #0284c7, #38bdf8); }"
                + ".eq-bar:nth-child(5) { height: 10px; animation-delay: 0.25s; }"
                + ".status-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(15, 23, 42, 0.75); border: 1px solid rgba(56, 189, 248, 0.2);"
                + "  padding: 6px 14px; border-radius: 20px; font-size: 0.8rem; color: #cbd5e1; backdrop-filter: blur(8px); margin-bottom: 16px; }"
                + ".pulse-dot { width: 8px; height: 8px; border-radius: 50%; background: #34d399; box-shadow: 0 0 8px #34d399; animation: dotBlink 1.4s infinite; }"
                + ".progress-track { width: 180px; height: 4px; border-radius: 4px; background: rgba(255, 255, 255, 0.08); overflow: hidden; position: relative; }"
                + ".progress-thumb { position: absolute; height: 100%; width: 50%; border-radius: 4px; background: linear-gradient(90deg, transparent, #38bdf8, #34d399, transparent);"
                + "  animation: progressSlide 1.5s cubic-bezier(0.4, 0, 0.2, 1) infinite; }"
                + ".ver-tag { position: fixed; bottom: 16px; color: #475569; font-size: 0.72rem; letter-spacing: 0.04em; }"
                + "@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }"
                + "@keyframes haloPulse { 0%, 100% { transform: scale(0.95); opacity: 0.4; } 50% { transform: scale(1.15); opacity: 0.8; } }"
                + "@keyframes logoFloat { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-6px); } }"
                + "@keyframes eqBounce { 0%, 100% { height: 6px; transform: scaleY(0.4); } 50% { height: 22px; transform: scaleY(1); } }"
                + "@keyframes dotBlink { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.4; transform: scale(0.75); } }"
                + "@keyframes progressSlide { 0% { left: -60%; } 100% { left: 110%; } }"
                + "</style></head><body>"
                + "<div class='splash-wrap'>"
                + "  <div class='logo-box'>"
                + "    <div class='logo-halo'></div>"
                + "    <div class='logo-card'>"
                + "      <svg class='logo-icon' viewBox='0 0 24 24' fill='none' stroke='url(#logoGrad)' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'>"
                + "        <defs><linearGradient id='logoGrad' x1='0%' y1='0%' x2='100%' y2='100%'><stop offset='0%' stop-color='#38bdf8'/><stop offset='100%' stop-color='#34d399'/></linearGradient></defs>"
                + "        <path d='M9 18V5l12-2v13'></path>"
                + "        <circle cx='6' cy='18' r='3' fill='url(#logoGrad)'></circle>"
                + "        <circle cx='18' cy='16' r='3' fill='url(#logoGrad)'></circle>"
                + "        <circle cx='6' cy='9' r='1.5' fill='#38bdf8'></circle>"
                + "        <line x1='6' y1='10.5' x2='6' y2='15' stroke='#38bdf8' stroke-width='1.5' stroke-dasharray='2 2'></line>"
                + "      </svg>"
                + "    </div>"
                + "  </div>"
                + "  <h1 class='brand-name'>MusicGit</h1>"
                + "  <div class='brand-tagline'>Music Player & Git Sync</div>"
                + "  <div class='eq-container'>"
                + "    <div class='eq-bar'></div><div class='eq-bar'></div><div class='eq-bar'></div><div class='eq-bar'></div><div class='eq-bar'></div>"
                + "  </div>"
                + "  <div class='status-badge'>"
                + "    <div class='pulse-dot'></div>"
                + "    <span>" + escapeHtml(title) + "</span>"
                + "  </div>"
                + "  <div class='progress-track'><div class='progress-thumb'></div></div>"
                + "</div>"
                + "<div class='ver-tag'>MusicGit v2.0 • Android Edition</div>"
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
