package com.xiptvplay.app;

import android.app.Activity;
import android.app.PictureInPictureParams;
import android.app.RemoteAction;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.IntentFilter;
import android.graphics.drawable.Icon;
import java.util.Arrays;
import android.app.AlertDialog;
import android.content.Intent;
import android.content.pm.ActivityInfo;
import android.content.res.Configuration;
import android.graphics.Color;
import android.graphics.Typeface;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.util.Rational;
import android.view.Gravity;
import android.view.OrientationEventListener;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.HorizontalScrollView;
import android.widget.LinearLayout;
import android.widget.SeekBar;
import android.widget.TextView;
import androidx.media3.ui.DefaultTimeBar;
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.exoplayer.DefaultLoadControl;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.TrackSelectionDialogBuilder;

import java.io.File;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import org.json.JSONArray;
import org.json.JSONObject;

public class NativePlayerActivity extends Activity {
    private static volatile NativePlayerActivity activeInstance;

    public static void closeActivePlayer() {
        NativePlayerActivity activity = activeInstance;
        if (activity != null) {
            activity.runOnUiThread(activity::closePlayerAndFinish);
        }
    }

    private void closePlayerAndFinish() {
        releasePlayer();
        if (!isFinishing()) {
            finishAndRemoveTask();
        }
    }

    private ExoPlayer player;
    private PlayerView playerView;
    private FrameLayout root;
    private FrameLayout videoContainer;
    private LinearLayout topBar;
    private TextView currentEpisodeTitleView;
    private LinearLayout bottomBar;
    private Button fullscreenButton;
    private Button closeButton;
    private String currentUrl;
    private String progressPreferenceKey;
    private Button speedButton;
    private Button subtitleButton;
    private Button audioButton;
    private Button nextButton;
    private TextView positionText;
    private TextView durationText;
    private DefaultTimeBar timeBar;
    private final Runnable progressUpdater = new Runnable() {
        @Override public void run() {
            updateProgressLabels();
            savePlaybackPosition();
            if (player != null) controlsHandler.postDelayed(this, 1000);
        }
    };
    private OrientationEventListener orientationListener;
    private boolean fullscreen = false;
    private boolean changingOrientation = false;
    private float lastVolume = 1f;
    private float lastBrightness = 0.7f;
    private String nextUrl;
    private String nextTitle;
    private String nextNextUrl;
    private String nextNextTitle;
    private static final String PIP_PAUSE_ACTION = "com.xiptvplay.app.PIP_TOGGLE_PAUSE";
    private static final String PIP_NEXT_ACTION = "com.xiptvplay.app.PIP_NEXT_EPISODE";
    private BroadcastReceiver pipActionReceiver;
    private JSONArray offlineEpisodeQueue;
    private int offlineEpisodeIndex = 0;
    private final Handler controlsHandler = new Handler(Looper.getMainLooper());
    private boolean controlsVisible = true;
    private final Runnable hideControlsRunnable = () -> setControlsVisible(false);

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        activeInstance = this;
        pipActionReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (intent == null || player == null) return;
                if (PIP_PAUSE_ACTION.equals(intent.getAction())) {
                    if (player.isPlaying()) player.pause(); else player.play();
                    updatePipActions();
                } else if (PIP_NEXT_ACTION.equals(intent.getAction())) {
                    playNextEpisode();
                    updatePipActions();
                }
            }
        };
        IntentFilter pipFilter = new IntentFilter();
        pipFilter.addAction(PIP_PAUSE_ACTION);
        pipFilter.addAction(PIP_NEXT_ACTION);
        if (android.os.Build.VERSION.SDK_INT >= 33) {
            registerReceiver(pipActionReceiver, pipFilter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(pipActionReceiver, pipFilter);
        }
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        videoContainer = new FrameLayout(this);
        FrameLayout.LayoutParams videoParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER
        );
        root.addView(videoContainer, videoParams);
        // İlk açılışta da dikey küçük oynatıcı boyutunu uygula; yön değişimini beklemesin.
        root.setFitsSystemWindows(true);

        playerView = new PlayerView(this);
        // Uygulamanin kendi oynatici kontrolleri kullaniliyor.
        // Media3/ExoPlayer varsayilan kontrol katmanini tamamen devre disi birak.
        playerView.setUseController(false);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        playerView.setKeepContentOnPlayerReset(true);
        videoContainer.addView(playerView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT
        ));

        buildCustomControls();
        setContentView(root);
        root.post(() -> {
            if (!fullscreen && root != null && videoContainer != null) {
                int initialWidth = root.getWidth();
                if (initialWidth <= 0) initialWidth = getResources().getDisplayMetrics().widthPixels;
                videoContainer.setLayoutParams(new FrameLayout.LayoutParams(
                    initialWidth, Math.round(initialWidth * 9f / 16f), Gravity.CENTER
                ));
            }
        });
        controlsHandler.post(progressUpdater);
        playerView.setOnClickListener(v -> {
            if (controlsVisible) setControlsVisible(false);
            else showControlsTemporarily();
        });
        // Görüntünün boş alanına dokunmak da kontrolleri tekrar açabilsin.
        videoContainer.setOnClickListener(v -> {
            if (!controlsVisible) showControlsTemporarily();
            else {
                controlsHandler.removeCallbacks(hideControlsRunnable);
                controlsHandler.postDelayed(hideControlsRunnable, 3500);
            }
        });
        showControlsTemporarily();

        String url = getIntent().getStringExtra("url");
        if (url == null || url.trim().isEmpty()) {
            Toast.makeText(this, "Video adresi bulunamadı.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        boolean isLocalFile = getIntent().getBooleanExtra("isLocalFile", false);
        if (isLocalFile) {
            Uri localUri = Uri.parse(url);
            if (!"file".equalsIgnoreCase(localUri.getScheme()) || localUri.getPath() == null) {
                Toast.makeText(this, "Çevrimdışı dosya adresi geçersiz.", Toast.LENGTH_LONG).show();
                finish();
                return;
            }
            File localFile = new File(localUri.getPath());
            if (!localFile.isFile() || !localFile.canRead() || localFile.length() <= 0L) {
                Toast.makeText(this, "İndirilen video dosyası telefonda bulunamadı veya okunamıyor.", Toast.LENGTH_LONG).show();
                finish();
                return;
            }
            // Canonical file URI ensures Media3 receives a local file URI, never an HTTP stream.
            url = Uri.fromFile(localFile).toString();
        }
        currentUrl = url;
        progressPreferenceKey = "native_player_position_" + Integer.toHexString(url.hashCode());
        nextUrl = getIntent().getStringExtra("nextUrl");
        nextTitle = getIntent().getStringExtra("nextTitle");
        nextNextUrl = getIntent().getStringExtra("nextNextUrl");
        nextNextTitle = getIntent().getStringExtra("nextNextTitle");
        String offlineQueueData = getIntent().getStringExtra("offlineEpisodeQueue");
        if (offlineQueueData != null) {
            try {
                offlineEpisodeQueue = new JSONArray(offlineQueueData);
                setOfflineNextFromQueue();
            } catch (Exception ignored) { offlineEpisodeQueue = null; }
        }
        nextButton.setVisibility(nextUrl == null || nextUrl.trim().isEmpty() ? View.GONE : View.VISIBLE);

        int bufferSeconds = Math.max(3, Math.min(45, getIntent().getIntExtra("bufferSeconds", 15)));
        int minBufferMs = bufferSeconds * 1000;
        int maxBufferMs = Math.min(90000, Math.max(minBufferMs * 2, 15000));
        DefaultLoadControl loadControl = new DefaultLoadControl.Builder()
            .setBufferDurationsMs(minBufferMs, maxBufferMs, Math.min(1500, minBufferMs), Math.min(3000, minBufferMs))
            .build();
        player = new ExoPlayer.Builder(this).setLoadControl(loadControl).build();
        // Türkçe izi varsa tercih et; yoksa ExoPlayer varsayılan ses izini seçer.
        player.setTrackSelectionParameters(
            player.getTrackSelectionParameters().buildUpon()
                .setPreferredAudioLanguage("tr")
                // Altyazilar yeni bir video basladiginda her zaman kapali.
                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                .build()
        );
        playerView.setPlayer(player);
        player.addListener(new Player.Listener() {
            @Override
            public void onPlayerError(PlaybackException error) {
                Toast.makeText(NativePlayerActivity.this,
                    "Oynatma hatası: " + error.getErrorCodeName(), Toast.LENGTH_LONG).show();
            }

            @Override
            public void onTracksChanged(Tracks tracks) {
                updateSubtitleButton(tracks);
                updateAudioButton(tracks);
            }

            @Override
            public void onIsPlayingChanged(boolean isPlaying) {
                updatePipActions();
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (playbackState == Player.STATE_ENDED && nextUrl != null && !nextUrl.isEmpty()) {
                    playNextEpisode();
                }
            }
        });

        String title = getIntent().getStringExtra("title");
        MediaItem item = new MediaItem.Builder()
            .setUri(Uri.parse(url))
            .setMediaId(title == null ? "XIPTV Play" : title)
            .build();
        player.setMediaItem(item);
        long savedPosition = getSharedPreferences("playback_progress", MODE_PRIVATE)
            .getLong(progressPreferenceKey, 0L);
        if (savedPosition > 0L) player.seekTo(savedPosition);
        player.prepare();
        player.play();

        orientationListener = new OrientationEventListener(this) {
            @Override
            public void onOrientationChanged(int orientation) {
                if (orientation == ORIENTATION_UNKNOWN || changingOrientation) return;
                if ((orientation >= 60 && orientation <= 120) || (orientation >= 240 && orientation <= 300)) {
                    if (!fullscreen) setFullscreen(true);
                } else if ((orientation <= 25 || orientation >= 335) && fullscreen) {
                    setFullscreen(false);
                }
            }
        };
        if (orientationListener.canDetectOrientation()) orientationListener.enable();
    }

    private void buildCustomControls() {
        topBar = new LinearLayout(this);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        int statusBarHeight = 0;
        int statusBarResource = getResources().getIdentifier("status_bar_height", "dimen", "android");
        if (statusBarResource > 0) statusBarHeight = getResources().getDimensionPixelSize(statusBarResource);
        topBar.setPadding(dp(10), dp(8) + statusBarHeight, dp(10), dp(8));
        topBar.setBackgroundColor(0x99000000);
        FrameLayout.LayoutParams topParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP
        );
        videoContainer.addView(topBar, topParams);

        currentEpisodeTitleView = new TextView(this);
        TextView title = currentEpisodeTitleView;
        title.setText(getIntent().getStringExtra("title") == null ? "XIPTV Play" : getIntent().getStringExtra("title"));
        title.setTextColor(Color.WHITE);
        title.setTextSize(15);
        title.setTypeface(Typeface.create("sans-serif-condensed", Typeface.BOLD));
        title.setMaxLines(1);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setPadding(0, 0, dp(8), 0);
        topBar.addView(title, new LinearLayout.LayoutParams(0, dp(42), 1));

        closeButton = makeButton("✕");
        closeButton.setTextSize(18);
        closeButton.setContentDescription("Videoyu kapat");
        closeButton.setMinWidth(dp(44));
        closeButton.setMinimumWidth(dp(44));
        closeButton.setPadding(0, 0, 0, 0);
        closeButton.setLayoutParams(new LinearLayout.LayoutParams(dp(44), dp(42)));
        closeButton.setElevation(dp(6));
        closeButton.setOnClickListener(v -> closePlayerAndFinish());
        topBar.addView(closeButton);

        bottomBar = new LinearLayout(this);
        bottomBar.setGravity(Gravity.CENTER_VERTICAL);
        bottomBar.setOrientation(LinearLayout.VERTICAL);
        bottomBar.setPadding(dp(8), dp(6), dp(8), dp(6));
        bottomBar.setBackgroundColor(0xCC000000);
        FrameLayout.LayoutParams bottomParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM
        );
        videoContainer.addView(bottomBar, bottomParams);

        fullscreenButton = makeButton("⛶");
        fullscreenButton.setTextSize(19);
        fullscreenButton.setContentDescription("Tam ekran / küçük ekran");
        fullscreenButton.setMinWidth(0);
        fullscreenButton.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xCC111827));
        fullscreenButton.setOnClickListener(v -> setFullscreen(!fullscreen));

        LinearLayout timelineRow = new LinearLayout(this);
        timelineRow.setGravity(Gravity.CENTER_VERTICAL);
        timelineRow.setOrientation(LinearLayout.HORIZONTAL);
        bottomBar.addView(timelineRow, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, dp(32)
        ));
        positionText = new TextView(this);
        positionText.setText("00:00");
        positionText.setTextColor(Color.WHITE);
        positionText.setTextSize(11);
        timelineRow.addView(positionText, new LinearLayout.LayoutParams(dp(48), -2));

        timeBar = new DefaultTimeBar(this, null);
        timeBar.setFocusable(true);
        timelineRow.addView(timeBar, new LinearLayout.LayoutParams(0, dp(28), 1));

        durationText = new TextView(this);
        durationText.setText("--:--");
        durationText.setTextColor(Color.WHITE);
        durationText.setTextSize(11);
        durationText.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        timelineRow.addView(durationText, new LinearLayout.LayoutParams(dp(48), -2));

        timeBar.addListener(new androidx.media3.ui.TimeBar.OnScrubListener() {
            @Override public void onScrubStart(androidx.media3.ui.TimeBar bar, long position) {}
            @Override public void onScrubMove(androidx.media3.ui.TimeBar bar, long position) {
                positionText.setText(formatTime(position));
            }
            @Override public void onScrubStop(androidx.media3.ui.TimeBar bar, long position, boolean canceled) {
                if (player != null && !canceled) player.seekTo(position);
                updateProgressLabels();
                showControlsTemporarily();
            }
        });

        LinearLayout actionButtons = new LinearLayout(this);
        actionButtons.setGravity(Gravity.CENTER);
        actionButtons.setOrientation(LinearLayout.HORIZONTAL);
        bottomBar.addView(actionButtons, new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT
        ));

        audioButton = makeButton("♫");
        audioButton.setContentDescription("Ses parçası");
        audioButton.setOnClickListener(v -> showAudioTracks());
        addCompactButton(actionButtons, audioButton);

        subtitleButton = makeButton("CC");
        subtitleButton.setContentDescription("Altyazı");
        subtitleButton.setOnClickListener(v -> showSubtitleTracks());
        addCompactButton(actionButtons, subtitleButton);

        Button volumeButton = makeButton("🔊");
        volumeButton.setContentDescription("Ses seviyesi");
        volumeButton.setOnClickListener(v -> showVolumeDialog());
        addCompactButton(actionButtons, volumeButton);

        Button brightnessButton = makeButton("☼");
        brightnessButton.setContentDescription("Parlaklık");
        brightnessButton.setOnClickListener(v -> showBrightnessDialog());
        addCompactButton(actionButtons, brightnessButton);

        speedButton = makeButton("1×");
        speedButton.setContentDescription("Oynatma hızı");
        speedButton.setOnClickListener(v -> showSpeedDialog());
        addCompactButton(actionButtons, speedButton);

        nextButton = makeButton("▶|");
        nextButton.setContentDescription("Sonraki bölüm");
        nextButton.setOnClickListener(v -> playNextEpisode());
        addCompactButton(actionButtons, nextButton);
        addCompactButton(actionButtons, fullscreenButton);
    }

    private Button makeButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(14);
        button.setTypeface(Typeface.create("sans-serif-condensed", Typeface.BOLD));
        button.setAllCaps(false);
        button.setSingleLine(true);
        button.setMinWidth(0);
        button.setMinimumWidth(0);
        button.setPadding(dp(4), 0, dp(4), 0);
        button.setTextColor(Color.WHITE);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xFF202938));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, dp(38)
        );
        params.setMargins(dp(2), 0, dp(2), 0);
        button.setLayoutParams(params);
        return button;
    }

    private void addCompactButton(LinearLayout row, Button button) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(38), 1f);
        params.setMargins(dp(2), 0, dp(2), 0);
        row.addView(button, params);
    }

    private int dp(float value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void savePlaybackPosition() {
        if (player == null || progressPreferenceKey == null) return;
        long position = Math.max(0L, player.getCurrentPosition());
        getSharedPreferences("playback_progress", MODE_PRIVATE).edit()
            .putLong(progressPreferenceKey, position).apply();
    }

    @Override
    protected void onPause() {
        savePlaybackPosition();
        super.onPause();
    }

    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O
                && player != null && player.isPlaying()) {
            try {
                PictureInPictureParams params = new PictureInPictureParams.Builder()
                    .setAspectRatio(new Rational(16, 9))
                    .setActions(buildPipActions())
                    .build();
                enterPictureInPictureMode(params);
            } catch (Exception ignored) {
                // PiP cihaz tarafından desteklenmiyorsa normal arka plan davranışı sürer.
            }
        }
    }

    private java.util.List<RemoteAction> buildPipActions() {
        if (android.os.Build.VERSION.SDK_INT < 26 || player == null) return java.util.Collections.emptyList();
        boolean playing = player.isPlaying();
        Intent toggle = new Intent(PIP_PAUSE_ACTION).setPackage(getPackageName());
        PendingIntent togglePending = PendingIntent.getBroadcast(this, 451, toggle,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        RemoteAction playPause = new RemoteAction(
            Icon.createWithResource(this, playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play),
            playing ? "Duraklat" : "Oynat",
            playing ? "Videoyu duraklat" : "Videoyu oynat",
            togglePending);
        if (nextUrl == null || nextUrl.isEmpty()) return java.util.Collections.singletonList(playPause);
        Intent next = new Intent(PIP_NEXT_ACTION).setPackage(getPackageName());
        PendingIntent nextPending = PendingIntent.getBroadcast(this, 452, next,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        RemoteAction nextAction = new RemoteAction(
            Icon.createWithResource(this, android.R.drawable.ic_media_next),
            "Sonraki bölüm", "Sıradaki dizi bölümünü oynat", nextPending);
        return Arrays.asList(playPause, nextAction);
    }

    private void updatePipActions() {
        if (android.os.Build.VERSION.SDK_INT < 26 || player == null) return;
        if (!isInPictureInPictureMode()) return;
        try {
            setPictureInPictureParams(new PictureInPictureParams.Builder()
                .setAspectRatio(new Rational(16, 9))
                .setActions(buildPipActions())
                .build());
        } catch (Exception ignored) {}
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        if (isInPictureInPictureMode) {
            if (topBar != null) topBar.setVisibility(View.GONE);
            if (bottomBar != null) bottomBar.setVisibility(View.GONE);
        } else {
            showControlsTemporarily();
        }
    }

    @Override
    public void onBackPressed() {
        if (fullscreen) {
            setFullscreen(false);
        } else {
            super.onBackPressed();
        }
    }

    private void setFullscreen(boolean enabled) {
        fullscreen = enabled;
        changingOrientation = true;
        setRequestedOrientation(enabled
            ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

        fullscreenButton.setText(enabled ? "⛶" : "⛶");
        fullscreenButton.setContentDescription(enabled ? "Küçük ekrana dön" : "Tam ekran");
        // Tam ekranda video tüm ekranı kaplar; çıkışta aynı ExoPlayer dikey ekranda 16:9 kart olur.
        int flags = enabled
            ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            : View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
        getWindow().getDecorView().setSystemUiVisibility(flags);
        FrameLayout.LayoutParams videoParams;
        if (enabled) {
            videoParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT, Gravity.CENTER
            );
        } else {
            int width = root.getWidth();
            if (width <= 0) width = getResources().getDisplayMetrics().widthPixels;
            int height = Math.round(width * 9f / 16f);
            videoParams = new FrameLayout.LayoutParams(width, height, Gravity.CENTER);
        }
        videoContainer.animate().cancel();
        videoContainer.setAlpha(0.92f);
        videoContainer.setScaleX(enabled ? 0.985f : 0.97f);
        videoContainer.setScaleY(enabled ? 0.985f : 0.97f);
        videoContainer.setLayoutParams(videoParams);
        videoContainer.animate().alpha(1f).scaleX(1f).scaleY(1f).setDuration(180).start();
        // Ekran yönü değişince root genişliği yeni ölçüsüne oturduktan sonra kart boyutunu tekrar hesapla.
        root.postDelayed(() -> {
            if (!fullscreen && root != null && videoContainer != null) {
                int portraitWidth = root.getWidth();
                if (portraitWidth <= 0) portraitWidth = getResources().getDisplayMetrics().widthPixels;
                videoContainer.setLayoutParams(new FrameLayout.LayoutParams(
                    portraitWidth, Math.round(portraitWidth * 9f / 16f), Gravity.CENTER
                ));
            }
            changingOrientation = false;
        }, 700);
        showControlsTemporarily();
    }

    private void showControlsTemporarily() {
        setControlsVisible(true);
        controlsHandler.removeCallbacks(hideControlsRunnable);
        controlsHandler.postDelayed(hideControlsRunnable, 3500);
    }

    private void setControlsVisible(boolean visible) {
        controlsVisible = visible;
        if (topBar != null) topBar.setVisibility(visible ? View.VISIBLE : View.GONE);
        if (bottomBar != null) bottomBar.setVisibility(visible ? View.VISIBLE : View.GONE);
        // PlayerView'in yerlesik kontrol katmani kapali kalmali.
        // Sadece custom topBar/bottomBar gorunurlugunu degistir.
    }

    private String formatTime(long timeMs) {
        if (timeMs < 0 || timeMs == C.TIME_UNSET) return "--:--";
        long totalSeconds = timeMs / 1000;
        long seconds = totalSeconds % 60;
        long minutes = (totalSeconds / 60) % 60;
        long hours = totalSeconds / 3600;
        return hours > 0
            ? String.format(Locale.getDefault(), "%d:%02d:%02d", hours, minutes, seconds)
            : String.format(Locale.getDefault(), "%02d:%02d", totalSeconds / 60, seconds);
    }

    private void updateProgressLabels() {
        if (player == null || timeBar == null) return;
        long duration = player.getDuration();
        if (duration == C.TIME_UNSET || duration < 0) duration = 0;
        long position = Math.max(0, player.getCurrentPosition());
        long buffered = Math.max(position, player.getBufferedPosition());
        timeBar.setDuration(duration);
        timeBar.setPosition(position);
        timeBar.setBufferedPosition(Math.min(buffered, duration));
        positionText.setText(formatTime(position));
        durationText.setText(duration > 0 ? formatTime(duration) : "--:--");
    }

    private void showSubtitleTracks() {
        if (player == null) return;
        boolean hasTextTracks = false;
        for (Tracks.Group group : player.getCurrentTracks().getGroups()) {
            if (group.getType() == C.TRACK_TYPE_TEXT && group.length > 0) {
                hasTextTracks = true;
                break;
            }
        }
        final boolean subtitleAvailable = hasTextTracks;
        final String[] choices = { "Kapalı", "Altyazı seç" };
        new AlertDialog.Builder(this)
            .setTitle("Altyazı")
            .setSingleChoiceItems(choices,
                player.getTrackSelectionParameters().disabledTrackTypes.contains(C.TRACK_TYPE_TEXT) ? 0 : 1,
                (dialog, which) -> {
                    dialog.dismiss();
                    if (which == 0) {
                        player.setTrackSelectionParameters(
                            player.getTrackSelectionParameters().buildUpon()
                                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, true)
                                .build());
                        if (subtitleButton != null) subtitleButton.setContentDescription("Altyazı: Kapalı");
                    } else if (subtitleAvailable) {
                        player.setTrackSelectionParameters(
                            player.getTrackSelectionParameters().buildUpon()
                                .setTrackTypeDisabled(C.TRACK_TYPE_TEXT, false)
                                .build());
                        new TrackSelectionDialogBuilder(this, "Altyazı seçimi", player, C.TRACK_TYPE_TEXT)
                            .setAllowAdaptiveSelections(false)
                            .setShowDisableOption(true)
                            .build()
                            .show();
                    } else {
                        Toast.makeText(this, "Bu yayında seçilebilir altyazı izi bulunamadı.", Toast.LENGTH_SHORT).show();
                    }
                })
            .setNegativeButton("Vazgeç", null)
            .show();
    }

    private void showAudioTracks() {
        if (player == null) return;
        boolean hasAudioTracks = false;
        for (Tracks.Group group : player.getCurrentTracks().getGroups()) {
            if (group.getType() == C.TRACK_TYPE_AUDIO && group.length > 0) {
                hasAudioTracks = true;
                break;
            }
        }
        if (!hasAudioTracks) {
            Toast.makeText(this, "Bu yayında seçilebilir ses parçası bulunamadı.", Toast.LENGTH_SHORT).show();
            return;
        }
        new TrackSelectionDialogBuilder(this, "Ses parçası seçimi", player, C.TRACK_TYPE_AUDIO)
            .setAllowAdaptiveSelections(false)
            .build()
            .show();
    }

    private void updateAudioButton(Tracks tracks) {
        boolean available = false;
        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() == C.TRACK_TYPE_AUDIO && group.length > 0) {
                available = true;
                break;
            }
        }
        if (audioButton != null) audioButton.setAlpha(available ? 1f : 0.65f);
    }

    private void updateSubtitleButton(Tracks tracks) {
        boolean available = false;
        for (Tracks.Group group : tracks.getGroups()) {
            if (group.getType() == C.TRACK_TYPE_TEXT && group.length > 0) {
                available = true;
                break;
            }
        }
        if (subtitleButton != null) subtitleButton.setAlpha(available ? 1f : 0.65f);
    }

    private void showVolumeDialog() {
        if (player == null) return;
        SeekBar seek = new SeekBar(this);
        seek.setMax(100);
        seek.setProgress(Math.round(player.getVolume() * 100));
        LinearLayout layout = dialogLayout("Ses seviyesi");
        layout.addView(seek);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar bar, int value, boolean fromUser) {
                if (fromUser) {
                    player.setVolume(value / 100f);
                    if (value > 0) lastVolume = value / 100f;
                }
            }
            public void onStartTrackingTouch(SeekBar bar) {}
            public void onStopTrackingTouch(SeekBar bar) {}
        });
        new AlertDialog.Builder(this).setTitle("Ses seviyesi").setView(layout)
            .setPositiveButton("Sessiz", (d, w) -> player.setVolume(0f))
            .setNegativeButton("Kapat", null).setNeutralButton("Sesi aç", (d, w) -> player.setVolume(lastVolume)).show();
    }

    private void showBrightnessDialog() {
        SeekBar seek = new SeekBar(this);
        seek.setMax(100);
        seek.setProgress(Math.round(lastBrightness * 100));
        LinearLayout layout = dialogLayout("Ekran parlaklığı");
        layout.addView(seek);
        seek.setOnSeekBarChangeListener(new SeekBar.OnSeekBarChangeListener() {
            public void onProgressChanged(SeekBar bar, int value, boolean fromUser) {
                if (!fromUser) return;
                lastBrightness = Math.max(0.05f, value / 100f);
                WindowManager.LayoutParams params = getWindow().getAttributes();
                params.screenBrightness = lastBrightness;
                getWindow().setAttributes(params);
            }
            public void onStartTrackingTouch(SeekBar bar) {}
            public void onStopTrackingTouch(SeekBar bar) {}
        });
        new AlertDialog.Builder(this).setTitle("Ekran parlaklığı").setView(layout)
            .setPositiveButton("Tamam", null).setNegativeButton("Kapat", null).show();
    }

    private LinearLayout dialogLayout(String label) {
        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setPadding(dp(20), dp(12), dp(20), dp(8));
        TextView text = new TextView(this);
        text.setText(label);
        text.setTextColor(Color.WHITE);
        layout.addView(text);
        return layout;
    }

    private void showSpeedDialog() {
        if (player == null) return;
        final float[] speeds = {0.25f, 0.5f, 0.75f, 1f, 1.25f, 1.5f, 2f, 3f, 4f, 6f, 8f, 10f, 12f, 16f};
        String[] labels = new String[speeds.length];
        for (int i = 0; i < speeds.length; i++) labels[i] = String.format(Locale.getDefault(), "%.2gx", speeds[i]).replace(".00x", "x").replace(".50x", ".5x").replace(".25x", ".25x").replace(".75x", ".75x");
        new AlertDialog.Builder(this).setTitle("Oynatma hızı")
            .setSingleChoiceItems(labels, -1, (dialog, which) -> {
                player.setPlaybackSpeed(speeds[which]);
                speedButton.setText(labels[which]);
                dialog.dismiss();
            }).setNegativeButton("Kapat", null).show();
    }

    private void setOfflineNextFromQueue() {
        if (offlineEpisodeQueue == null) return;
        JSONObject first = offlineEpisodeQueue.optJSONObject(offlineEpisodeIndex);
        JSONObject second = offlineEpisodeQueue.optJSONObject(offlineEpisodeIndex + 1);
        nextUrl = first == null ? null : first.optString("uri", null);
        nextTitle = first == null ? null : first.optString("title", null);
        nextNextUrl = second == null ? null : second.optString("uri", null);
        nextNextTitle = second == null ? null : second.optString("title", null);
    }

    private void playNextEpisode() {
        if (player == null || nextUrl == null || nextUrl.trim().isEmpty()) {
            Toast.makeText(this, "Sonraki bölüm bilgisi bulunamadı.", Toast.LENGTH_SHORT).show();
            return;
        }
        String urlToPlay = nextUrl;
        String titleToPlay = nextTitle;
        nextUrl = nextNextUrl;
        nextTitle = nextNextTitle;
        nextNextUrl = null;
        nextNextTitle = null;
        if (offlineEpisodeQueue != null) {
            offlineEpisodeIndex++;
            setOfflineNextFromQueue();
        }
        nextButton.setVisibility(nextUrl == null || nextUrl.trim().isEmpty() ? View.GONE : View.VISIBLE);
        updatePipActions();
        MediaItem next = new MediaItem.Builder()
            .setUri(Uri.parse(urlToPlay))
            .setMediaId(titleToPlay == null ? "Sonraki bölüm" : titleToPlay)
            .build();
        currentUrl = urlToPlay;
        progressPreferenceKey = "native_player_position_" + Integer.toHexString(urlToPlay.hashCode());
        player.setMediaItem(next);
        player.prepare();
        player.play();
        if (currentEpisodeTitleView != null) {
            currentEpisodeTitleView.setText(titleToPlay == null || titleToPlay.isEmpty() ? "Sonraki bölüm" : titleToPlay);
        }
        if (titleToPlay != null && !titleToPlay.isEmpty()) {
            Toast.makeText(this, "Oynatılıyor: " + titleToPlay, Toast.LENGTH_SHORT).show();
        }
        showControlsTemporarily();
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (player != null) player.play();
    }

    @Override
    protected void onStop() {
        savePlaybackPosition();
        // PiP'ye geciste Activity durabilir: pencere yasarken oynaticiyi
        // kapatmak mini pencerenin tamamen kaybolmasina yol aciyordu.
        if (!isInPictureInPictureMode()) {
            releasePlayer();
            controlsHandler.removeCallbacks(hideControlsRunnable);
            controlsHandler.removeCallbacks(progressUpdater);
            if (orientationListener != null) orientationListener.disable();
        }
        super.onStop();
    }

    private void releasePlayer() {
        ExoPlayer oldPlayer = player;
        player = null;
        if (playerView != null) {
            try {
                playerView.setPlayer(null);
            } catch (Exception ignored) {
            }
        }
        if (oldPlayer != null) {
            try {
                oldPlayer.setVolume(0f);
                oldPlayer.pause();
                oldPlayer.stop();
                oldPlayer.clearMediaItems();
            } catch (Exception ignored) {
            }
            try {
                oldPlayer.release();
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    protected void onDestroy() {
        if (pipActionReceiver != null) {
            try { unregisterReceiver(pipActionReceiver); } catch (Exception ignored) {}
            pipActionReceiver = null;
        }

        releasePlayer();
        if (activeInstance == this) activeInstance = null;
        super.onDestroy();
    }
}