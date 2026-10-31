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
import android.graphics.drawable.GradientDrawable;
import android.graphics.drawable.RippleDrawable;
import android.content.res.ColorStateList;
import android.os.SystemClock;
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
        savePlaybackPosition();
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
    private LinearLayout actionButtons;
    private Button fullscreenButton;
    private Button closeButton;
    private String currentUrl;
    private String progressPreferenceKey;
    private Button playPauseButton;
    private PlayerControlIcon playIcon, pauseIcon;
    private boolean displayedPause = false;
    private boolean scrubbing = false;
    private boolean controlDialogOpen = false;
    private int controlDialogCount = 0;
    private boolean resumePlayWhenReady = true;
    private long resumePositionMs = 0L;
    private androidx.media3.common.TrackSelectionParameters resumeTracks;
    private float resumeSpeed = 1f, resumeVolume = 1f;
    private long lastCheckpointMs = 0L;
    private long lastPositionSecond = -1L, lastDurationSecond = -1L;
    private Button speedButton;
    private Button subtitleButton;
    private Button audioButton;
    private Button nextButton;
    private TextView positionText;
    private TextView durationText;
    private DefaultTimeBar timeBar;
    private final Runnable progressUpdater = new Runnable() {
        @Override public void run() {
            if (player == null) return;
            if (controlsVisible && !isInPictureInPictureMode() && !scrubbing) updateProgressLabels();
            savePlaybackPosition(false);
            controlsHandler.postDelayed(this, PlayerUiPolicy.tickDelay(controlsVisible, player.getPlayWhenReady(), isInPictureInPictureMode()));
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
    private static final String PIP_CLOSE_ACTION = "com.xiptvplay.app.PIP_CLOSE_PLAYER";
    private BroadcastReceiver pipActionReceiver;
    private JSONArray offlineEpisodeQueue;
    private int offlineEpisodeIndex = 0;
    private final Handler controlsHandler = new Handler(Looper.getMainLooper());
    private boolean controlsVisible = true;
    private final Runnable hideControlsRunnable = () -> { if (!scrubbing && !controlDialogOpen) setControlsVisible(false); };
    private final Runnable orientationResetRunnable = () -> changingOrientation = false;

    @Override
    protected void onCreate(@Nullable Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        activeInstance = this;
        pipActionReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if (intent == null) return;
                if (PIP_CLOSE_ACTION.equals(intent.getAction())) {
                    closePlayerAndFinish();
                    return;
                }
                if (player == null) return;
                if (PIP_PAUSE_ACTION.equals(intent.getAction())) {
                    togglePlayback();
                } else if (PIP_NEXT_ACTION.equals(intent.getAction())) {
                    playNextEpisode();
                    updatePipActions();
                }
            }
        };
        IntentFilter pipFilter = new IntentFilter();
        pipFilter.addAction(PIP_PAUSE_ACTION);
        pipFilter.addAction(PIP_NEXT_ACTION);
        pipFilter.addAction(PIP_CLOSE_ACTION);
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
        root.setOnClickListener(v -> showControlsTemporarily());
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
        restartProgressUpdates();
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
        videoContainer.addOnLayoutChangeListener((view,left,top,right,bottom,oldLeft,oldTop,oldRight,oldBottom) -> {
            if (right-left != oldRight-oldLeft) applyVideoBounds();
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
        updateNextButtonVisibility();

        resumePositionMs = getSharedPreferences("playback_progress", MODE_PRIVATE).getLong(progressPreferenceKey, 0L);
        initializePlayer();

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

    private void initializePlayer() {
        if (player != null || currentUrl == null || isFinishing()) return;
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
        if(resumeTracks!=null)player.setTrackSelectionParameters(resumeTracks);
        player.setPlaybackSpeed(resumeSpeed);player.setVolume(resumeVolume);
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
                updatePlayPauseButton();
            }

            @Override public void onPlayWhenReadyChanged(boolean ready, int reason) {
                updatePlayPauseButton();
                if (!ready) savePlaybackPosition();
                restartProgressUpdates();
            }

            @Override
            public void onPlaybackStateChanged(int playbackState) {
                if (player == null) return;
                updatePlayPauseButton();
                if (playbackState == Player.STATE_ENDED && nextUrl != null && !nextUrl.isEmpty()) {
                    playNextEpisode();
                }
            }
        });

        String title = currentEpisodeTitleView == null ? getIntent().getStringExtra("title") : currentEpisodeTitleView.getText().toString();
        MediaItem item = new MediaItem.Builder()
            .setUri(Uri.parse(currentUrl))
            .setMediaId(title == null ? "XIPTV Play" : title)
            .build();
        player.setMediaItem(item);
        if (resumePositionMs > 0L) player.seekTo(resumePositionMs);
        player.prepare();
        player.setPlayWhenReady(resumePlayWhenReady);
        lastPositionSecond = -1; lastDurationSecond = -1;
        updatePlayPauseButton();
        restartProgressUpdates();

    }

    private void buildCustomControls() {
        topBar = new LinearLayout(this);
        topBar.setGravity(Gravity.CENTER_VERTICAL);
        topBar.setOrientation(LinearLayout.HORIZONTAL);
        topBar.setPadding(dp(12), dp(6), dp(12), dp(6));
        topBar.setBackground(new GradientDrawable(GradientDrawable.Orientation.TOP_BOTTOM,new int[]{0xD9000000,0x00000000}));
        FrameLayout.LayoutParams topParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.TOP
        );
        videoContainer.addView(topBar, topParams);

        currentEpisodeTitleView = new TextView(this);
        TextView title = currentEpisodeTitleView;
        title.setText(getIntent().getStringExtra("title") == null ? "XIPTV Play" : getIntent().getStringExtra("title"));
        title.setTextColor(Color.WHITE);
        title.setTextSize(13);
        title.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        title.setMaxLines(2);
        title.setEllipsize(android.text.TextUtils.TruncateAt.END);
        title.setPadding(0, 0, dp(8), 0);
        topBar.addView(title, new LinearLayout.LayoutParams(0, dp(48), 1));

        closeButton = makeIconButton("close", "Videoyu kapat", false);
        closeButton.setTextSize(18);
        closeButton.setContentDescription("Videoyu kapat");
        closeButton.setMinWidth(dp(44));
        closeButton.setMinimumWidth(dp(44));
        closeButton.setPadding(0, 0, 0, 0);
        closeButton.setLayoutParams(new LinearLayout.LayoutParams(dp(48), dp(48)));
        closeButton.setElevation(0);
        closeButton.setOnClickListener(v -> closePlayerAndFinish());
        topBar.addView(closeButton);

        bottomBar = new LinearLayout(this);
        bottomBar.setGravity(Gravity.CENTER_VERTICAL);
        bottomBar.setOrientation(LinearLayout.VERTICAL);
        bottomBar.setPadding(dp(8), dp(6), dp(8), dp(8));
        bottomBar.setBackground(new GradientDrawable(GradientDrawable.Orientation.BOTTOM_TOP,new int[]{0xEC000000,0x00000000}));
        FrameLayout.LayoutParams bottomParams = new FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.WRAP_CONTENT, Gravity.BOTTOM
        );
        videoContainer.addView(bottomBar, bottomParams);

        fullscreenButton = makeIconButton("fullscreen", "Tam ekran / küçük ekran", false);
        fullscreenButton.setTextSize(19);
        fullscreenButton.setContentDescription("Tam ekran / küçük ekran");
        fullscreenButton.setMinWidth(0);
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
        timeBar.setContentDescription("Oynatma konumu");
        timeBar.setPlayedColor(0xFF00DCEA);timeBar.setScrubberColor(Color.WHITE);
        timeBar.setBufferedColor(0x99FFFFFF);timeBar.setUnplayedColor(0x55FFFFFF);
        timelineRow.addView(timeBar, new LinearLayout.LayoutParams(0, dp(28), 1));

        durationText = new TextView(this);
        durationText.setText("--:--");
        durationText.setTextColor(Color.WHITE);
        durationText.setTextSize(11);
        durationText.setGravity(Gravity.END | Gravity.CENTER_VERTICAL);
        timelineRow.addView(durationText, new LinearLayout.LayoutParams(dp(48), -2));

        timeBar.addListener(new androidx.media3.ui.TimeBar.OnScrubListener() {
            @Override public void onScrubStart(androidx.media3.ui.TimeBar bar, long position) { scrubbing=true; controlsHandler.removeCallbacks(hideControlsRunnable); }
            @Override public void onScrubMove(androidx.media3.ui.TimeBar bar, long position) {
                positionText.setText(formatTime(position));
            }
            @Override public void onScrubStop(androidx.media3.ui.TimeBar bar, long position, boolean canceled) {
                scrubbing=false;lastPositionSecond=-1;
                if (player != null && !canceled) { player.seekTo(position); savePlaybackPosition(); }
                updateProgressLabels();
                showControlsTemporarily();
            }
        });

        actionButtons = new LinearLayout(this);
        actionButtons.setGravity(Gravity.CENTER);
        actionButtons.setOrientation(LinearLayout.HORIZONTAL);
        HorizontalScrollView actionsScroll = new HorizontalScrollView(this);
        actionsScroll.setHorizontalScrollBarEnabled(false);actionsScroll.setFillViewport(true);
        actionButtons.setMinimumWidth(dp(8 * 52));
        actionsScroll.addView(actionButtons,new FrameLayout.LayoutParams(-1,dp(48)));
        bottomBar.addView(actionsScroll,new LinearLayout.LayoutParams(-1,dp(48)));

        audioButton = makeIconButton("audio", "Ses parçası", false);
        audioButton.setContentDescription("Ses parçası");
        audioButton.setOnClickListener(v -> showAudioTracks());
        addCompactButton(actionButtons, audioButton);

        subtitleButton = makeButton("CC");
        subtitleButton.setContentDescription("Altyazı");
        subtitleButton.setOnClickListener(v -> showSubtitleTracks());
        addCompactButton(actionButtons, subtitleButton);

        Button volumeButton = makeIconButton("volume", "Ses seviyesi", false);
        volumeButton.setContentDescription("Ses seviyesi");
        volumeButton.setOnClickListener(v -> showVolumeDialog());
        addCompactButton(actionButtons, volumeButton);

        Button brightnessButton = makeIconButton("brightness", "Parlaklık", false);
        brightnessButton.setContentDescription("Parlaklık");
        brightnessButton.setOnClickListener(v -> showBrightnessDialog());
        addCompactButton(actionButtons, brightnessButton);

        playIcon = new PlayerControlIcon("play",0xFF002E34);
        pauseIcon = new PlayerControlIcon("pause",0xFF002E34);
        playIcon.setBounds(0,0,dp(24),dp(24));pauseIcon.setBounds(0,0,dp(24),dp(24));
        playPauseButton = makeIconButton("play", "Oynat", true);
        playPauseButton.setOnClickListener(v -> togglePlayback());
        addCompactButton(actionButtons, playPauseButton);

        speedButton = makeButton("1×");
        speedButton.setContentDescription("Oynatma hızı");
        speedButton.setOnClickListener(v -> showSpeedDialog());
        addCompactButton(actionButtons, speedButton);

        nextButton = makeIconButton("next", "Sonraki bölüm", false);
        nextButton.setContentDescription("Sonraki bölüm");
        nextButton.setOnClickListener(v -> playNextEpisode());
        addCompactButton(actionButtons, nextButton);
        addCompactButton(actionButtons, fullscreenButton);
    }

    private Button makeButton(String label) {return styleButton(new Button(this), label);}
    private Button styleButton(Button button,String label) {
        button.setText(label);
        button.setTextSize(14);
        button.setTypeface(Typeface.create("sans-serif-medium", Typeface.NORMAL));
        button.setAllCaps(false);
        button.setSingleLine(true);
        button.setMinWidth(dp(48));
        button.setMinimumWidth(dp(48));
        button.setPadding(dp(4), 0, dp(4), 0);
        button.setTextColor(Color.WHITE);
        button.setBackgroundTintList(null);
        button.setStateListAnimator(null);
        GradientDrawable background=new GradientDrawable();background.setColor(0xCC202024);background.setCornerRadius(dp(24));
        background.setStroke(dp(1),0x26FFFFFF);
        button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x33FFFFFF),background,null));
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.WRAP_CONTENT, dp(48)
        );
        params.setMargins(dp(2), 0, dp(2), 0);
        button.setLayoutParams(params);
        return button;
    }

    private Button makeIconButton(String icon,String description,boolean primary) {
        Button button=styleButton(new PlayerIconButton(this),"");button.setContentDescription(description);
        button.setMinWidth(dp(48));button.setMinimumWidth(dp(48));
        PlayerControlIcon drawable=new PlayerControlIcon(icon,primary?0xFF002E34:Color.WHITE);
        drawable.setBounds(0,0,dp(24),dp(24));button.setCompoundDrawables(drawable,null,null,null);
        button.setGravity(Gravity.CENTER);button.setPadding(dp(12),0,dp(12),0);
        if(primary){GradientDrawable shape=new GradientDrawable();shape.setColor(0xFF00DCEA);shape.setCornerRadius(dp(24));button.setBackground(new RippleDrawable(ColorStateList.valueOf(0x55000000),shape,null));}
        return button;
    }

    private void updatePlayPauseButton() {
        if(playPauseButton==null||player==null)return;
        boolean pause=player.getPlayWhenReady()&&player.getPlaybackState()!=Player.STATE_ENDED;
        if(pause!=displayedPause || playPauseButton.getCompoundDrawables()[0] != (pause?pauseIcon:playIcon)) {
            displayedPause=pause;playPauseButton.setCompoundDrawables(pause?pauseIcon:playIcon,null,null,null);
            playPauseButton.setContentDescription(pause?"Duraklat":"Oynat");
        }
    }

    private void togglePlayback() {
        if(player==null)return;
        if(player.getPlayWhenReady())player.pause();else{if(player.getPlaybackState()==Player.STATE_ENDED)player.seekTo(0);player.play();}
        updatePlayPauseButton();updatePipActions();showControlsTemporarily();
    }

    private void restartProgressUpdates() {
        controlsHandler.removeCallbacks(progressUpdater);
        if(player!=null)controlsHandler.post(progressUpdater);
    }

    private void addCompactButton(LinearLayout row, Button button) {
        LinearLayout.LayoutParams params = new LinearLayout.LayoutParams(0, dp(48), 1f);
        params.setMargins(dp(2), 0, dp(2), 0);
        row.addView(button, params);
    }

    private int dp(float value) {
        return (int) (value * getResources().getDisplayMetrics().density + 0.5f);
    }

    private void savePlaybackPosition() {savePlaybackPosition(true);}
    private void savePlaybackPosition(boolean force) {
        if (player == null || progressPreferenceKey == null) return;
        long now=SystemClock.elapsedRealtime();
        if(!PlayerUiPolicy.shouldCheckpoint(now,lastCheckpointMs,force))return;
        lastCheckpointMs=now;
        long position = Math.max(0L, player.getCurrentPosition());
        long duration = Math.max(0L, player.getDuration());
        getSharedPreferences("playback_progress", MODE_PRIVATE).edit()
            .putLong(progressPreferenceKey, position).apply();
        Intent historyData = new Intent();
        historyData.putExtra("positionMs", position);
        historyData.putExtra("durationMs", duration);
        setResult(Activity.RESULT_OK, historyData);
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
        boolean playing = player.getPlayWhenReady();
        Intent toggle = new Intent(PIP_PAUSE_ACTION).setPackage(getPackageName());
        PendingIntent togglePending = PendingIntent.getBroadcast(this, 451, toggle,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        RemoteAction playPause = new RemoteAction(
            Icon.createWithResource(this, playing ? android.R.drawable.ic_media_pause : android.R.drawable.ic_media_play),
            playing ? "Duraklat" : "Oynat",
            playing ? "Videoyu duraklat" : "Videoyu oynat",
            togglePending);
        // Samsung / Android PiP kontrolleri sistem tarafindan cizilir.
        // Bu X eylemi sistem kontrol paneli acildiginda gorunur ve gercek
        // oynatici oturumunu durdurur (yalniz pencereyi gizlemez).
        Intent close = new Intent(PIP_CLOSE_ACTION).setPackage(getPackageName());
        PendingIntent closePending = PendingIntent.getBroadcast(this, 453, close,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        RemoteAction closeAction = new RemoteAction(
            Icon.createWithResource(this, android.R.drawable.ic_menu_close_clear_cancel),
            "Kapat", "Videoyu ve sesi tamamen kapat", closePending);
        if (nextUrl == null || nextUrl.isEmpty()) {
            return Arrays.asList(playPause, closeAction);
        }
        Intent next = new Intent(PIP_NEXT_ACTION).setPackage(getPackageName());
        PendingIntent nextPending = PendingIntent.getBroadcast(this, 452, next,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        RemoteAction nextAction = new RemoteAction(
            Icon.createWithResource(this, android.R.drawable.ic_media_next),
            "Sonraki bölüm", "Sıradaki dizi bölümünü oynat", nextPending);
        return Arrays.asList(playPause, nextAction, closeAction);
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
            setControlsVisible(false);
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

        fullscreenButton.setContentDescription(enabled ? "Küçük ekrana dön" : "Tam ekran");
        // Tam ekranda video tüm ekranı kaplar; çıkışta aynı ExoPlayer dikey ekranda 16:9 kart olur.
        int flags = enabled
            ? View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY | View.SYSTEM_UI_FLAG_FULLSCREEN
                | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
            : View.SYSTEM_UI_FLAG_LAYOUT_STABLE;
        getWindow().getDecorView().setSystemUiVisibility(flags);
        applyVideoBounds();
        controlsHandler.removeCallbacks(orientationResetRunnable);
        controlsHandler.postDelayed(orientationResetRunnable,700);
        showControlsTemporarily();
    }

    private void applyVideoBounds() {
        if(root==null || videoContainer==null)return;
        int width=fullscreen?-1:root.getWidth();if(width==0)width=getResources().getDisplayMetrics().widthPixels;
        int height=fullscreen?-1:Math.round(width*9f/16f);
        android.view.ViewGroup.LayoutParams old=videoContainer.getLayoutParams();
        if(old.width!=width||old.height!=height)videoContainer.setLayoutParams(new FrameLayout.LayoutParams(width,height,Gravity.CENTER));
    }

    private void showControlsTemporarily() {
        setControlsVisible(true);
        controlsHandler.removeCallbacks(hideControlsRunnable);
        if(!controlDialogOpen && !scrubbing)controlsHandler.postDelayed(hideControlsRunnable, 3500);
    }

    private void setControlsVisible(boolean visible) {
        if(isInPictureInPictureMode())visible=false;
        controlsVisible=visible;
        for(View bar:new View[]{topBar,bottomBar}) {
            if(bar==null)continue;
            bar.animate().cancel();bar.setAlpha(visible?1f:0f);
            // INVISIBLE ölçüyü korur; gizlenirken video SurfaceView yeniden boyutlanmaz.
            bar.setVisibility(visible?View.VISIBLE:View.INVISIBLE);
        }
        if(visible&&!scrubbing)updateProgressLabels();
        restartProgressUpdates();
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
        if(lastPositionSecond!=position/1000){positionText.setText(formatTime(position));lastPositionSecond=position/1000;}
        if(lastDurationSecond!=duration/1000){durationText.setText(duration>0?formatTime(duration):"--:--");lastDurationSecond=duration/1000;}
    }

    private void showControlDialog(android.app.Dialog dialog) {
        controlDialogCount++;controlDialogOpen=true;controlsHandler.removeCallbacks(hideControlsRunnable);
        dialog.setOnDismissListener(ignored->{controlDialogCount=Math.max(0,controlDialogCount-1);controlDialogOpen=controlDialogCount>0;showControlsTemporarily();});
        dialog.show();
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
        showControlDialog(new AlertDialog.Builder(this)
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
                        showControlDialog(new TrackSelectionDialogBuilder(this, "Altyazı seçimi", player, C.TRACK_TYPE_TEXT)
                            .setAllowAdaptiveSelections(false)
                            .setShowDisableOption(true)
                            .build());
                    } else {
                        Toast.makeText(this, "Bu yayında seçilebilir altyazı izi bulunamadı.", Toast.LENGTH_SHORT).show();
                    }
                })
            .setNegativeButton("Vazgeç", null)
            .create());
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
        showControlDialog(new TrackSelectionDialogBuilder(this, "Ses parçası seçimi", player, C.TRACK_TYPE_AUDIO)
            .setAllowAdaptiveSelections(false)
            .build());
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
        showControlDialog(new AlertDialog.Builder(this).setTitle("Ses seviyesi").setView(layout)
            .setPositiveButton("Sessiz", (d, w) -> player.setVolume(0f))
            .setNegativeButton("Kapat", null).setNeutralButton("Sesi aç", (d, w) -> player.setVolume(lastVolume)).create());
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
        showControlDialog(new AlertDialog.Builder(this).setTitle("Ekran parlaklığı").setView(layout)
            .setPositiveButton("Tamam", null).setNegativeButton("Kapat", null).create());
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
        showControlDialog(new AlertDialog.Builder(this).setTitle("Oynatma hızı")
            .setSingleChoiceItems(labels, -1, (dialog, which) -> {
                player.setPlaybackSpeed(speeds[which]);
                speedButton.setText(labels[which]);
                dialog.dismiss();
            }).setNegativeButton("Kapat", null).create());
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

    private void updateNextButtonVisibility() {
        boolean available=nextUrl!=null&&!nextUrl.trim().isEmpty();
        if(nextButton!=null)nextButton.setVisibility(available?View.VISIBLE:View.GONE);
        if(actionButtons!=null)actionButtons.setMinimumWidth(dp((available?8:7)*52));
    }

    private void playNextEpisode() {
        if (player == null || nextUrl == null || nextUrl.trim().isEmpty()) {
            Toast.makeText(this, "Sonraki bölüm bilgisi bulunamadı.", Toast.LENGTH_SHORT).show();
            return;
        }
        savePlaybackPosition();
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
        updateNextButtonVisibility();
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
        if(player==null)initializePlayer();
        if (orientationListener != null && orientationListener.canDetectOrientation()) orientationListener.enable();
        showControlsTemporarily();
    }

    @Override
    protected void onStop() {
        savePlaybackPosition();
        // PiP'ye geciste Activity durabilir: pencere yasarken oynaticiyi
        // kapatmak mini pencerenin tamamen kaybolmasina yol aciyordu.
        if (!isInPictureInPictureMode()) {
            if(player!=null){resumePositionMs=player.getCurrentPosition();resumePlayWhenReady=player.getPlayWhenReady();resumeTracks=player.getTrackSelectionParameters();resumeSpeed=player.getPlaybackParameters().speed;resumeVolume=player.getVolume();}
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

        controlsHandler.removeCallbacksAndMessages(null);
        if(orientationListener!=null)orientationListener.disable();
        releasePlayer();
        if (activeInstance == this) activeInstance = null;
        super.onDestroy();
    }
}
