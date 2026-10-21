package com.xiptvplay.app;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.pm.ActivityInfo;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
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
import android.widget.Toast;

import androidx.annotation.Nullable;
import androidx.media3.common.C;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.common.TrackSelectionOverride;
import androidx.media3.common.Tracks;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import androidx.media3.ui.TrackSelectionDialogBuilder;

import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

public class NativePlayerActivity extends Activity {
    private ExoPlayer player;
    private PlayerView playerView;
    private FrameLayout root;
    private LinearLayout topBar;
    private LinearLayout bottomBar;
    private Button fullscreenButton;
    private Button speedButton;
    private Button subtitleButton;
    private Button audioButton;
    private Button nextButton;
    private OrientationEventListener orientationListener;
    private boolean fullscreen = false;
    private boolean changingOrientation = false;
    private float lastVolume = 1f;
    private float lastBrightness = 0.7f;
    private String nextUrl;
    private String nextTitle;
    private String nextNextUrl;
    private String nextNextTitle;
    private final Handler controlsHandler = new Handler(Looper.getMainLooper());
    private boolean controlsVisible = true;
    private final Runnable hideControlsRunnable = () -> setControlsVisible(false);

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        requestWindowFeature(Window.FEATURE_NO_TITLE);
        getWindow().setStatusBarColor(Color.BLACK);
        getWindow().setNavigationBarColor(Color.BLACK);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_LAYOUT_STABLE);
        setRequestedOrientation(ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

        root = new FrameLayout(this);
        root.setBackgroundColor(Color.BLACK);
        playerView = new PlayerView(this);
        playerView.setUseController(true);
        playerView.setControllerAutoShow(true);
        playerView.setShowBuffering(PlayerView.SHOW_BUFFERING_ALWAYS);
        playerView.setKeepContentOnPlayerReset(true);
        root.addView(playerView, new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT
        ));

        buildCustomControls();
        setContentView(root);
        playerView.setOnClickListener(v -> {
            if (controlsVisible) setControlsVisible(false);
            else showControlsTemporarily();
        });
        showControlsTemporarily();

        String url = getIntent().getStringExtra("url");
        if (url == null || url.trim().isEmpty()) {
            Toast.makeText(this, "Video adresi bulunamadı.", Toast.LENGTH_LONG).show();
            finish();
            return;
        }
        nextUrl = getIntent().getStringExtra("nextUrl");
        nextTitle = getIntent().getStringExtra("nextTitle");
        nextNextUrl = getIntent().getStringExtra("nextNextUrl");
        nextNextTitle = getIntent().getStringExtra("nextNextTitle");
        nextButton.setVisibility(nextUrl == null || nextUrl.trim().isEmpty() ? View.GONE : View.VISIBLE);

        player = new ExoPlayer.Builder(this).build();
        // Türkçe izi varsa tercih et; yoksa ExoPlayer varsayılan ses izini seçer.
        player.setTrackSelectionParameters(
            player.getTrackSelectionParameters().buildUpon()
                .setPreferredAudioLanguage("tr")
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
        topBar.setPadding(dp(10), dp(8), dp(10), dp(8));
        topBar.setBackgroundColor(0x99000000);
        FrameLayout.LayoutParams topParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP
        );
        root.addView(topBar, topParams);

        TextView title = new TextView(this);
        title.setText(getIntent().getStringExtra("title") == null ? "XIPTV Play" : getIntent().getStringExtra("title"));
        title.setTextColor(Color.WHITE);
        title.setTextSize(15);
        title.setMaxLines(1);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        topBar.addView(title, new LinearLayout.LayoutParams(0, dp(42), 1));

        fullscreenButton = makeButton("⛶ Tam ekran");
        fullscreenButton.setOnClickListener(v -> setFullscreen(!fullscreen));
        topBar.addView(fullscreenButton);

        bottomBar = new LinearLayout(this);
        bottomBar.setGravity(Gravity.CENTER_VERTICAL);
        bottomBar.setOrientation(LinearLayout.HORIZONTAL);
        bottomBar.setPadding(dp(8), dp(8), dp(8), dp(8));
        bottomBar.setBackgroundColor(0xCC000000);
        FrameLayout.LayoutParams bottomParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM
        );
        HorizontalScrollView controlsScroll = new HorizontalScrollView(this);
        controlsScroll.setHorizontalScrollBarEnabled(false);
        controlsScroll.setFillViewport(true);
        controlsScroll.addView(bottomBar, new HorizontalScrollView.LayoutParams(
            HorizontalScrollView.LayoutParams.WRAP_CONTENT, HorizontalScrollView.LayoutParams.WRAP_CONTENT
        ));
        root.addView(controlsScroll, bottomParams);

        audioButton = makeButton("Ses parçası");
        audioButton.setOnClickListener(v -> showAudioTracks());
        bottomBar.addView(audioButton);

        subtitleButton = makeButton("Altyazı");
        subtitleButton.setOnClickListener(v -> showSubtitleTracks());
        bottomBar.addView(subtitleButton);

        Button volumeButton = makeButton("Ses");
        volumeButton.setOnClickListener(v -> showVolumeDialog());
        bottomBar.addView(volumeButton);

        Button brightnessButton = makeButton("Parlaklık");
        brightnessButton.setOnClickListener(v -> showBrightnessDialog());
        bottomBar.addView(brightnessButton);

        speedButton = makeButton("1x");
        speedButton.setOnClickListener(v -> showSpeedDialog());
        bottomBar.addView(speedButton);

        nextButton = makeButton("Sonraki bölüm ▶");
        nextButton.setOnClickListener(v -> playNextEpisode());
        bottomBar.addView(nextButton);
    }

    private Button makeButton(String label) {
        Button button = new Button(this);
        button.setText(label);
        button.setTextSize(11);
        button.setAllCaps(false);
        button.setTextColor(Color.WHITE);
        button.setBackgroundTintList(android.content.res.ColorStateList.valueOf(0xFF292929));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, dp(42)
        );
        params.setMargins(dp(3), 0, dp(3), 0);
        button.setLayoutParams(params);
        return button;
    }

    private int dp(float value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void setFullscreen(boolean enabled) {
        fullscreen = enabled;
        changingOrientation = true;
        setRequestedOrientation(enabled
            ? ActivityInfo.SCREEN_ORIENTATION_SENSOR_LANDSCAPE
            : ActivityInfo.SCREEN_ORIENTATION_PORTRAIT);

        fullscreenButton.setText(enabled ? "↙ Ekrandan çık" : "⛶ Tam ekran");
        // Portreye dönerken sensörün eski yatay konumu tekrar tam ekranı açmasın.
        int flags = enabled
            ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            : View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
        getWindow().getDecorView().setSystemUiVisibility(flags);
        root.postDelayed(() -> changingOrientation = false, 1800);
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
        if (playerView != null) {
            if (visible) playerView.showController();
            else playerView.hideController();
        }
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
        if (!hasTextTracks) {
            Toast.makeText(this, "Bu yayında seçilebilir altyazı izi bulunamadı.", Toast.LENGTH_SHORT).show();
            return;
        }
        new TrackSelectionDialogBuilder(this, "Altyazı seçimi", player, C.TRACK_TYPE_TEXT)
            .setAllowAdaptiveSelections(false)
            .build()
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
        nextButton.setVisibility(nextUrl == null || nextUrl.trim().isEmpty() ? View.GONE : View.VISIBLE);
        MediaItem next = new MediaItem.Builder()
            .setUri(Uri.parse(urlToPlay))
            .setMediaId(titleToPlay == null ? "Sonraki bölüm" : titleToPlay)
            .build();
        player.setMediaItem(next);
        player.prepare();
        player.play();
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
        super.onStop();
        controlsHandler.removeCallbacks(hideControlsRunnable);
        if (orientationListener != null) orientationListener.disable();
        if (player != null) {
            player.release();
            player = null;
        }
    }
}
