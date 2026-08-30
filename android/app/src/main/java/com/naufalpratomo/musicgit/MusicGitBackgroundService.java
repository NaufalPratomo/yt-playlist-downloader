package com.naufalpratomo.musicgit;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

import com.chaquo.python.Python;
import com.chaquo.python.android.AndroidPlatform;

public class MusicGitBackgroundService extends Service {
    private static final String TAG = "MusicGitService";
    private static final String CHANNEL_ID = "musicgit_service_channel";
    private static final int NOTIFICATION_ID = 8585;
    private Thread serverThread;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        startForeground(NOTIFICATION_ID, buildNotification());
        startPythonBackend();
    }

    private void startPythonBackend() {
        serverThread = new Thread(() -> {
            try {
                if (!Python.isStarted()) {
                    Python.start(new AndroidPlatform(this));
                }
                Python py = Python.getInstance();
                Log.i(TAG, "Starting MusicGit Python FastAPI Server on 127.0.0.1:8585...");
                
                // Execute Python uvicorn runner
                py.getModule("android_server").callAttr("start_server");
            } catch (Exception e) {
                Log.e(TAG, "Failed to run Python FastAPI server: " + e.getMessage(), e);
            }
        });
        serverThread.setName("MusicGit-PythonServer");
        serverThread.start();
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "MusicGit Background Engine",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Menjaga pemutaran musik dan proses download tetap berjalan di latar belakang.");
            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    private Notification buildNotification() {
        Intent notificationIntent = new Intent(this, MainActivity.class);
        PendingIntent pendingIntent = PendingIntent.getActivity(
                this, 0, notificationIntent,
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.M ? PendingIntent.FLAG_IMMUTABLE : 0
        );

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setContentTitle("MusicGit is Running")
                .setContentText("Background engine & music player active")
                .setSmallIcon(android.R.drawable.ic_media_play)
                .setContentIntent(pendingIntent)
                .setOngoing(true)
                .build();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        return START_STICKY;
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (serverThread != null && serverThread.isAlive()) {
            serverThread.interrupt();
        }
        Log.i(TAG, "MusicGit Background Service Stopped.");
    }
}
