package com.naufalpratomo.musicgit;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;
import android.support.v4.media.MediaMetadataCompat;
import android.support.v4.media.session.MediaSessionCompat;
import android.support.v4.media.session.PlaybackStateCompat;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.media.app.NotificationCompat.MediaStyle;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MusicGitBackgroundService extends Service {
    private static final String TAG = "MusicGitMediaService";
    public static final String CHANNEL_ID = "musicgit_media_channel";
    public static final int NOTIFICATION_ID = 8585;

    public static final String ACTION_PLAY = "com.naufalpratomo.musicgit.ACTION_PLAY";
    public static final String ACTION_PAUSE = "com.naufalpratomo.musicgit.ACTION_PAUSE";
    public static final String ACTION_NEXT = "com.naufalpratomo.musicgit.ACTION_NEXT";
    public static final String ACTION_PREV = "com.naufalpratomo.musicgit.ACTION_PREV";
    public static final String ACTION_STOP = "com.naufalpratomo.musicgit.ACTION_STOP";
    public static final String ACTION_UPDATE_PLAYBACK = "com.naufalpratomo.musicgit.ACTION_UPDATE_PLAYBACK";

    public static final String EXTRA_TITLE = "extra_title";
    public static final String EXTRA_ARTIST = "extra_artist";
    public static final String EXTRA_ALBUM = "extra_album";
    public static final String EXTRA_COVER_URL = "extra_cover_url";
    public static final String EXTRA_DURATION = "extra_duration";
    public static final String EXTRA_POSITION = "extra_position";
    public static final String EXTRA_IS_PLAYING = "extra_is_playing";

    public interface MediaActionListener {
        void onPlay();
        void onPause();
        void onNext();
        void onPrev();
        void onSeekTo(long positionMs);
    }

    private static MediaActionListener mediaActionListener;
    public static void setMediaActionListener(MediaActionListener listener) {
        mediaActionListener = listener;
    }

    private MediaSessionCompat mediaSession;
    private final ExecutorService imageExecutor = Executors.newSingleThreadExecutor();

    private String currentTitle = "MusicGit";
    private String currentArtist = "Unknown Artist";
    private String currentAlbum = "MusicGit";
    private String currentCoverUrl = "";
    private long currentDuration = 0;
    private long currentPosition = 0;
    private boolean isPlaying = false;
    private Bitmap currentCoverBitmap = null;

    @Override
    public void onCreate() {
        super.onCreate();
        createNotificationChannel();
        initMediaSession();
        startForeground(NOTIFICATION_ID, buildNotification());
    }

    private void initMediaSession() {
        mediaSession = new MediaSessionCompat(this, "MusicGitMediaSession");
        mediaSession.setFlags(
                MediaSessionCompat.FLAG_HANDLES_MEDIA_BUTTONS |
                MediaSessionCompat.FLAG_HANDLES_TRANSPORT_CONTROLS
        );

        mediaSession.setCallback(new MediaSessionCompat.Callback() {
            @Override
            public void onPlay() {
                if (mediaActionListener != null) mediaActionListener.onPlay();
            }

            @Override
            public void onPause() {
                if (mediaActionListener != null) mediaActionListener.onPause();
            }

            @Override
            public void onSkipToNext() {
                if (mediaActionListener != null) mediaActionListener.onNext();
            }

            @Override
            public void onSkipToPrevious() {
                if (mediaActionListener != null) mediaActionListener.onPrev();
            }

            @Override
            public void onSeekTo(long pos) {
                if (mediaActionListener != null) mediaActionListener.onSeekTo(pos);
            }

            @Override
            public void onStop() {
                if (mediaActionListener != null) mediaActionListener.onPause();
                stopForeground(true);
                stopSelf();
            }
        });

        mediaSession.setActive(true);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(
                    CHANNEL_ID,
                    "MusicGit Media Controls",
                    NotificationManager.IMPORTANCE_LOW
            );
            channel.setDescription("Pengontrol pemutaran musik di panel notifikasi dan layar kunci.");
            channel.setShowBadge(false);
            channel.setSound(null, null);

            NotificationManager manager = getSystemService(NotificationManager.class);
            if (manager != null) {
                manager.createNotificationChannel(channel);
            }
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) return START_STICKY;

        String action = intent.getAction();
        if (action == null) return START_STICKY;

        switch (action) {
            case ACTION_PLAY:
                if (mediaActionListener != null) mediaActionListener.onPlay();
                break;

            case ACTION_PAUSE:
                if (mediaActionListener != null) mediaActionListener.onPause();
                break;

            case ACTION_NEXT:
                if (mediaActionListener != null) mediaActionListener.onNext();
                break;

            case ACTION_PREV:
                if (mediaActionListener != null) mediaActionListener.onPrev();
                break;

            case ACTION_STOP:
                if (mediaActionListener != null) mediaActionListener.onPause();
                stopForeground(true);
                stopSelf();
                return START_NOT_STICKY;

            case ACTION_UPDATE_PLAYBACK:
                handleUpdatePlayback(intent);
                break;
        }

        return START_STICKY;
    }

    private void handleUpdatePlayback(Intent intent) {
        String title = intent.getStringExtra(EXTRA_TITLE);
        String artist = intent.getStringExtra(EXTRA_ARTIST);
        String album = intent.getStringExtra(EXTRA_ALBUM);
        String coverUrl = intent.getStringExtra(EXTRA_COVER_URL);
        long duration = intent.getLongExtra(EXTRA_DURATION, 0);
        long position = intent.getLongExtra(EXTRA_POSITION, 0);
        boolean playing = intent.getBooleanExtra(EXTRA_IS_PLAYING, false);

        if (title != null) currentTitle = title;
        if (artist != null) currentArtist = artist;
        if (album != null) currentAlbum = album;
        currentDuration = duration;
        currentPosition = position;
        isPlaying = playing;

        boolean coverChanged = coverUrl != null && !coverUrl.equals(currentCoverUrl);
        if (coverChanged) {
            currentCoverUrl = coverUrl;
            loadCoverBitmapAsync(coverUrl);
        } else {
            updateMediaSessionAndNotification();
        }
    }

    private void loadCoverBitmapAsync(final String coverUrl) {
        if (coverUrl == null || coverUrl.isEmpty()) {
            currentCoverBitmap = null;
            updateMediaSessionAndNotification();
            return;
        }

        imageExecutor.execute(() -> {
            Bitmap bmp = null;
            try {
                URL url = new URL(coverUrl);
                HttpURLConnection connection = (HttpURLConnection) url.openConnection();
                connection.setDoInput(true);
                connection.setConnectTimeout(3000);
                connection.setReadTimeout(3000);
                connection.connect();
                InputStream input = connection.getInputStream();
                bmp = BitmapFactory.decodeStream(input);
                input.close();
                connection.disconnect();

                if (bmp != null) {
                    // Downscale if unusually large to conserve Android memory
                    int maxDim = 512;
                    if (bmp.getWidth() > maxDim || bmp.getHeight() > maxDim) {
                        float ratio = Math.min((float) maxDim / bmp.getWidth(), (float) maxDim / bmp.getHeight());
                        int w = Math.round(ratio * bmp.getWidth());
                        int h = Math.round(ratio * bmp.getHeight());
                        bmp = Bitmap.createScaledBitmap(bmp, w, h, true);
                    }
                }
            } catch (Exception e) {
                Log.w(TAG, "Failed to load cover image: " + e.getMessage());
            }

            // Only apply if URL is still current
            if (coverUrl.equals(currentCoverUrl)) {
                currentCoverBitmap = bmp;
                updateMediaSessionAndNotification();
            }
        });
    }

    private void updateMediaSessionAndNotification() {
        if (mediaSession == null) return;

        // 1. Update PlaybackStateCompat
        long actions = PlaybackStateCompat.ACTION_PLAY
                | PlaybackStateCompat.ACTION_PAUSE
                | PlaybackStateCompat.ACTION_PLAY_PAUSE
                | PlaybackStateCompat.ACTION_SKIP_TO_NEXT
                | PlaybackStateCompat.ACTION_SKIP_TO_PREVIOUS
                | PlaybackStateCompat.ACTION_SEEK_TO
                | PlaybackStateCompat.ACTION_STOP;

        PlaybackStateCompat.Builder stateBuilder = new PlaybackStateCompat.Builder()
                .setActions(actions)
                .setState(
                        isPlaying ? PlaybackStateCompat.STATE_PLAYING : PlaybackStateCompat.STATE_PAUSED,
                        currentPosition,
                        isPlaying ? 1.0f : 0.0f
                );
        mediaSession.setPlaybackState(stateBuilder.build());

        // 2. Update MediaMetadataCompat
        MediaMetadataCompat.Builder metaBuilder = new MediaMetadataCompat.Builder()
                .putString(MediaMetadataCompat.METADATA_KEY_TITLE, currentTitle)
                .putString(MediaMetadataCompat.METADATA_KEY_ARTIST, currentArtist)
                .putString(MediaMetadataCompat.METADATA_KEY_ALBUM, currentAlbum)
                .putLong(MediaMetadataCompat.METADATA_KEY_DURATION, currentDuration);

        if (currentCoverBitmap != null) {
            metaBuilder.putBitmap(MediaMetadataCompat.METADATA_KEY_ALBUM_ART, currentCoverBitmap);
        }
        mediaSession.setMetadata(metaBuilder.build());

        // 3. Post updated Notification
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(NOTIFICATION_ID, buildNotification());
        }
    }

    private PendingIntent createActionPendingIntent(String action, int requestCode) {
        Intent intent = new Intent(this, MusicGitBackgroundService.class);
        intent.setAction(action);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getService(this, requestCode, intent, flags);
    }

    private Notification buildNotification() {
        Intent contentIntent = new Intent(this, MainActivity.class);
        contentIntent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int contentFlags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            contentFlags |= PendingIntent.FLAG_IMMUTABLE;
        }
        PendingIntent pendingContentIntent = PendingIntent.getActivity(this, 0, contentIntent, contentFlags);

        PendingIntent pPrev = createActionPendingIntent(ACTION_PREV, 101);
        PendingIntent pPlayPause = createActionPendingIntent(isPlaying ? ACTION_PAUSE : ACTION_PLAY, 102);
        PendingIntent pNext = createActionPendingIntent(ACTION_NEXT, 103);
        PendingIntent pStop = createActionPendingIntent(ACTION_STOP, 104);

        int playPauseIcon = isPlaying ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play;
        String playPauseTitle = isPlaying ? "Pause" : "Play";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(playPauseIcon)
                .setContentTitle(currentTitle)
                .setContentText(currentArtist + (currentAlbum.isEmpty() || currentAlbum.equals(currentTitle) ? "" : " • " + currentAlbum))
                .setContentIntent(pendingContentIntent)
                .setDeleteIntent(pStop)
                .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setOnlyAlertOnce(true)
                .setOngoing(isPlaying)
                .addAction(android.R.drawable.ic_media_previous, "Previous", pPrev)
                .addAction(playPauseIcon, playPauseTitle, pPlayPause)
                .addAction(android.R.drawable.ic_media_next, "Next", pNext);

        if (currentCoverBitmap != null) {
            builder.setLargeIcon(currentCoverBitmap);
        }

        if (mediaSession != null) {
            builder.setStyle(new MediaStyle()
                    .setMediaSession(mediaSession.getSessionToken())
                    .setShowActionsInCompactView(0, 1, 2)
                    .setShowCancelButton(true)
                    .setCancelButtonIntent(pStop));
        }

        return builder.build();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        if (mediaSession != null) {
            mediaSession.setActive(false);
            mediaSession.release();
        }
        imageExecutor.shutdown();
        Log.i(TAG, "MusicGit Media Background Service Stopped.");
    }
}
