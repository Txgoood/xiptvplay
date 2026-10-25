package com.xiptvplay.app;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import android.content.Context;
import java.util.Locale;
import java.util.concurrent.ConcurrentHashMap;
import androidx.core.app.ServiceCompat;
import android.content.pm.ServiceInfo;

public class DownloadForegroundService extends Service {
    public static final String ACTION_START = "com.xiptvplay.app.DOWNLOAD_START";
    public static final String ACTION_STOP = "com.xiptvplay.app.DOWNLOAD_STOP";
    private static final int NOTIFICATION_ID = 7319;
    private PowerManager.WakeLock wakeLock;
    private static final long NOTIFICATION_INTERVAL_MS = 950L;
    private static final String CHANNEL_ID = "xiptv_downloads";
    private static final String GROUP_KEY = "com.xiptvplay.app.DOWNLOAD_GROUP";
    private static final ConcurrentHashMap<String, ProgressState> progressStates = new ConcurrentHashMap<>();

    private static class ProgressState {
        long bytes;
        long lastShownBytes;
        long lastShownTime;
        int percent;
        double speedBytesPerSecond;
    }

    // GAS yaklaşımı: Bildirimler 950 ms aralıkla, artan bayt/yüzde ile tek merkezden güncellenir.
    // JavaScript yalnızca uygulama içi ilerlemeyi günceller.
    public static void updateDownloadProgress(Context context, String id, String title, long currentBytes, long totalBytes, boolean finished) {
        ProgressState state = progressStates.computeIfAbsent(id, key -> new ProgressState());
        synchronized (state) {
            if (currentBytes < state.bytes) return;
            state.bytes = currentBytes;
            int progress = totalBytes > 0 ? (int) Math.min(100L, (currentBytes * 100L) / totalBytes) : 0;
            state.percent = Math.max(state.percent, progress);
            long now = android.os.SystemClock.elapsedRealtime();
            if (!finished && state.lastShownTime != 0 && now - state.lastShownTime < NOTIFICATION_INTERVAL_MS) return;
            if (state.lastShownTime > 0 && now > state.lastShownTime) {
                double instant = (currentBytes - state.lastShownBytes) * 1000.0 / (now - state.lastShownTime);
                state.speedBytesPerSecond = state.speedBytesPerSecond == 0 ? instant
                    : 0.35 * state.speedBytesPerSecond + 0.65 * instant;
            }
            state.lastShownBytes = currentBytes;
            state.lastShownTime = now;
            if (finished && totalBytes > 0) state.percent = 100;
            double mbPerSecond = state.speedBytesPerSecond / 1_000_000.0;
            String detail = totalBytes > 0 ? state.percent + "% • " : String.format(Locale.getDefault(), "%.1f MB • ", currentBytes / 1_000_000.0);
            detail += String.format(Locale.getDefault(), "%.1f MB/sn", mbPerSecond);
            if (totalBytes > currentBytes && state.speedBytesPerSecond > 0) {
                long sec = (long) ((totalBytes - currentBytes) / state.speedBytesPerSecond);
                detail += String.format(Locale.getDefault(), " • %d dk %d sn", sec / 60, sec % 60);
            }
            try {
                NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.stat_sys_download)
                    .setContentTitle(title)
                    .setContentText(detail)
                    .setProgress(100, state.percent, totalBytes <= 0)
                    .setGroup(GROUP_KEY)
                    .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                    .setOnlyAlertOnce(true)
                    .setOngoing(!finished)
                    .setPriority(NotificationCompat.PRIORITY_LOW);
                if (NotificationManagerCompat.from(context).areNotificationsEnabled()) {
                    NotificationManagerCompat.from(context).notify(id.hashCode() & 0x7fffffff, builder.build());
                }
            } catch (Exception ignored) {
                // Bildirim hatası ağ indirmesini etkilememeli.
            }
        }
    }

    public static void clearDownloadProgress(String id) {
        progressStates.remove(id);
    }


    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            releaseWakeLock();
            stopForeground(STOP_FOREGROUND_DETACH); // Grup ozeti tamamlanan dosyalar icin gorunur kalir
            stopSelf();
            return START_NOT_STICKY;
        }
        String title = intent == null ? "XIPTV Play" : intent.getStringExtra("title");
        if (title == null || title.trim().isEmpty()) title = "XIPTV Play";
        acquireWakeLock();
        Notification notification = new NotificationCompat.Builder(this, "xiptv_downloads")
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("İndirme arka planda sürüyor")
            .setContentText(title + " indiriliyor")
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setGroup("com.xiptvplay.app.DOWNLOAD_GROUP")
            .setGroupSummary(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .build();
        if (Build.VERSION.SDK_INT >= 29) {
            ServiceCompat.startForeground(this, NOTIFICATION_ID, notification, ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
        } else {
            startForeground(NOTIFICATION_ID, notification);
        }
        return START_NOT_STICKY;
    }

    private void acquireWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) return;
            PowerManager powerManager = (PowerManager) getSystemService(POWER_SERVICE);
            if (powerManager != null) {
                wakeLock = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "XIPTVPlay:DownloadQueue");
                wakeLock.setReferenceCounted(false);
                wakeLock.acquire(6 * 60 * 60 * 1000L); // En fazla 6 saat; stop/destroy durumunda daha erken bırakılır.
            }
        } catch (Exception ignored) {}
    }

    private void releaseWakeLock() {
        try { if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(); } catch (Exception ignored) {}
        wakeLock = null;
    }

    @Override public void onDestroy() {
        releaseWakeLock();
        super.onDestroy();
    }

    @Override public IBinder onBind(Intent intent) { return null; }
}
