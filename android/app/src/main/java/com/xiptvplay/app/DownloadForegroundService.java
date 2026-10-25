package com.xiptvplay.app;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Binder;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Android Foreground Service for download operations and notification management.
 * 
 * Solves:
 * 1. Background killing: Keeps downloads alive when app is backgrounded.
 * 2. Notification rate-limiting: Throttles NotificationManager updates to ~1s to prevent
 *    Android SystemServer IPC queue lag.
 * 3. Monotonic progress: Prevents out-of-order or stale percentage values from clobbering newer values.
 * 4. Grouping: Automatically groups multiple simultaneous/season episode downloads under a single
 *    expandable summary notification.
 * 5. Single source of truth: All download notification updates are handled here, avoiding competing updaters.
 */
public class DownloadForegroundService extends Service {
    public static final String CHANNEL_ID = "xiptvplay_download_channel";
    public static final String GROUP_KEY = "com.xiptvplay.DOWNLOAD_GROUP";
    public static final int SUMMARY_NOTIFICATION_ID = 9001;

    public static final String ACTION_START = "com.xiptvplay.app.ACTION_START_DOWNLOAD";
    public static final String ACTION_CANCEL = "com.xiptvplay.app.ACTION_CANCEL_DOWNLOAD";

    private final IBinder binder = new LocalBinder();
    private static final ConcurrentHashMap<String, DownloadState> activeDownloads = new ConcurrentHashMap<>();
    private static volatile DownloadForegroundService runningInstance = null;

    public static class DownloadState {
        public final String id;
        public final String title;
        public long totalBytes = 0;
        public long currentBytes = 0;
        public int lastReportedPercent = 0;
        public long lastReportedBytes = 0;
        public long lastNotificationTime = 0;
        public long lastNotificationBytes = 0;
        public double smoothedSpeedMBs = 0.0;
        public boolean completed = false;
        public boolean failed = false;
        public String errorMessage = null;

        public DownloadState(String id, String title) {
            this.id = id;
            this.title = title == null || title.trim().isEmpty() ? "Medya İndiriliyor" : title;
        }
    }

    public class LocalBinder extends Binder {
        public DownloadForegroundService getService() {
            return DownloadForegroundService.this;
        }
    }

    @Override
    public IBinder onBind(Intent intent) {
        return binder;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        runningInstance = this;
        createNotificationChannel();
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        createNotificationChannel();
        if (intent != null && ACTION_CANCEL.equals(intent.getAction())) {
            String cancelId = intent.getStringExtra("id");
            if (cancelId != null) {
                cancelDownload(cancelId);
            }
        }
        // Promote to foreground immediately to avoid Android 8+ ANR
        startAsForegroundService();
        return START_NOT_STICKY;
    }

    @Override
    public void onDestroy() {
        runningInstance = null;
        super.onDestroy();
    }

    public static void start(Context context, String id, String title) {
        DownloadState state = activeDownloads.get(id);
        if (state == null) {
            state = new DownloadState(id, title);
            activeDownloads.put(id, state);
        }
        Intent intent = new Intent(context, DownloadForegroundService.class);
        intent.setAction(ACTION_START);
        intent.putExtra("id", id);
        intent.putExtra("title", title);
        try {
            ContextCompat.startForegroundService(context, intent);
        } catch (Exception ignored) {
            // Context might be restricted in some states
        }
    }

    public static void updateProgress(Context context, String id, long currentBytes, long totalBytes) {
        DownloadState state = activeDownloads.get(id);
        if (state == null) {
            state = new DownloadState(id, "Medya");
            activeDownloads.put(id, state);
        }
        state.totalBytes = totalBytes;

        // Monotonic check: prevent older byte counts from clobbering newer values
        if (currentBytes < state.lastReportedBytes && state.lastReportedBytes > 0) {
            return;
        }
        state.currentBytes = currentBytes;
        state.lastReportedBytes = currentBytes;

        int percent = totalBytes > 0 ? (int) Math.min(100, Math.max(0, (currentBytes * 100) / totalBytes)) : 0;
        // Monotonic percent check
        if (percent < state.lastReportedPercent) {
            percent = state.lastReportedPercent;
        }
        state.lastReportedPercent = percent;

        long now = System.currentTimeMillis();
        long elapsed = now - state.lastNotificationTime;
        boolean isFirst = (state.lastNotificationTime == 0);
        boolean isDone = (currentBytes >= totalBytes && totalBytes > 0);

        // RATE-LIMIT / THROTTLING RULE:
        // Android NotificationManager throttles calls faster than ~1 per second.
        // Update notification at most once every 950ms, unless it's start (0%) or done (100%).
        if (!isFirst && !isDone && elapsed < 950) {
            return;
        }

        // Calculate real-time speed
        long bytesDelta = currentBytes - state.lastNotificationBytes;
        double secDelta = elapsed / 1000.0;
        double instantSpeed = (secDelta > 0 && bytesDelta > 0) ? ((bytesDelta / (1024.0 * 1024.0)) / secDelta) : 0.0;
        state.smoothedSpeedMBs = state.smoothedSpeedMBs == 0.0
                ? instantSpeed
                : (state.smoothedSpeedMBs * 0.70) + (instantSpeed * 0.30);

        state.lastNotificationTime = now;
        state.lastNotificationBytes = currentBytes;

        DownloadForegroundService svc = runningInstance;
        if (svc != null) {
            svc.postNotificationForState(state);
            svc.updateGroupSummary();
        }
    }

    public static void complete(Context context, String id, boolean success, String errorMessage) {
        DownloadState state = activeDownloads.get(id);
        if (state != null) {
            state.completed = success;
            state.failed = !success;
            state.errorMessage = errorMessage;
            if (success) {
                state.lastReportedPercent = 100;
            }
        }
        DownloadForegroundService svc = runningInstance;
        if (svc != null) {
            if (state != null) {
                svc.postNotificationForState(state);
            }
            svc.updateGroupSummary();
            svc.checkAllDoneAndStop();
        }
    }

    public static void cancel(String id) {
        DownloadState state = activeDownloads.remove(id);
        DownloadForegroundService svc = runningInstance;
        if (svc != null) {
            NotificationManagerCompat.from(svc).cancel(getNotificationId(id));
            svc.updateGroupSummary();
            svc.checkAllDoneAndStop();
        }
    }

    private void startAsForegroundService() {
        NotificationCompat.Builder summary = buildGroupSummaryNotification();
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                startForeground(SUMMARY_NOTIFICATION_ID, summary.build(), ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            } else {
                startForeground(SUMMARY_NOTIFICATION_ID, summary.build());
            }
        } catch (Exception e) {
            // Fallback for older or restricted environments
            try {
                startForeground(SUMMARY_NOTIFICATION_ID, summary.build());
            } catch (Exception ignored) {}
        }
    }

    private void postNotificationForState(DownloadState state) {
        NotificationManagerCompat nm = NotificationManagerCompat.from(this);
        int notifId = getNotificationId(state.id);

        if (state.completed) {
            NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.stat_sys_download_done)
                    .setContentTitle(state.title)
                    .setContentText("İndirme tamamlandı")
                    .setProgress(0, 0, false)
                    .setGroup(GROUP_KEY)
                    .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY)
                    .setAutoCancel(true)
                    .setOngoing(false)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setContentIntent(createOpenAppIntent());
            nm.notify(notifId, b.build());
            return;
        }

        if (state.failed) {
            String msg = state.errorMessage != null ? state.errorMessage : "İndirme başarısız oldu";
            NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.stat_notify_error)
                    .setContentTitle(state.title)
                    .setContentText(msg)
                    .setGroup(GROUP_KEY)
                    .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY)
                    .setAutoCancel(true)
                    .setOngoing(false)
                    .setPriority(NotificationCompat.PRIORITY_LOW)
                    .setContentIntent(createOpenAppIntent());
            nm.notify(notifId, b.build());
            return;
        }

        // Active download notification
        String speedStr = String.format(Locale.US, "%.1f MB/s", state.smoothedSpeedMBs);
        String etaStr = formatEtaSeconds(calculateEtaSeconds(state));
        String contentText = state.lastReportedPercent + "% • " + speedStr + (etaStr.isEmpty() ? "" : " • " + etaStr);

        NotificationCompat.Builder b = new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(state.title)
                .setContentText(contentText)
                .setProgress(100, state.lastReportedPercent, state.totalBytes <= 0)
                .setGroup(GROUP_KEY)
                .setGroupAlertBehavior(NotificationCompat.GROUP_ALERT_SUMMARY)
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(createOpenAppIntent());

        nm.notify(notifId, b.build());
    }

    private void updateGroupSummary() {
        NotificationManagerCompat nm = NotificationManagerCompat.from(this);
        int activeCount = 0;
        for (DownloadState s : activeDownloads.values()) {
            if (!s.completed && !s.failed) activeCount++;
        }
        if (activeCount == 0) {
            nm.cancel(SUMMARY_NOTIFICATION_ID);
            return;
        }
        NotificationCompat.Builder summary = buildGroupSummaryNotification();
        nm.notify(SUMMARY_NOTIFICATION_ID, summary.build());
    }

    private NotificationCompat.Builder buildGroupSummaryNotification() {
        int activeCount = 0;
        NotificationCompat.InboxStyle inboxStyle = new NotificationCompat.InboxStyle();
        inboxStyle.setBigContentTitle("XIPTV Play İndirmeler");

        for (DownloadState s : activeDownloads.values()) {
            if (!s.completed && !s.failed) {
                activeCount++;
                inboxStyle.addLine(s.title + ": %" + s.lastReportedPercent);
            }
        }

        String summaryText = activeCount > 0 ? activeCount + " indirme devam ediyor" : "İndirmeler tamamlandı";
        inboxStyle.setSummaryText(summaryText);

        return new NotificationCompat.Builder(this, CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle("XIPTV Play İndirmeler")
                .setContentText(summaryText)
                .setStyle(inboxStyle)
                .setGroup(GROUP_KEY)
                .setGroupSummary(true)
                .setOnlyAlertOnce(true)
                .setOngoing(activeCount > 0)
                .setPriority(NotificationCompat.PRIORITY_LOW)
                .setContentIntent(createOpenAppIntent());
    }

    private void checkAllDoneAndStop() {
        int activeCount = 0;
        for (DownloadState s : activeDownloads.values()) {
            if (!s.completed && !s.failed) activeCount++;
        }
        if (activeCount == 0) {
            try {
                stopForeground(false);
            } catch (Exception ignored) {}
            stopSelf();
        }
    }

    private PendingIntent createOpenAppIntent() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int flags = PendingIntent.FLAG_UPDATE_CURRENT;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            flags |= PendingIntent.FLAG_IMMUTABLE;
        }
        return PendingIntent.getActivity(this, 0, intent, flags);
    }

    private void createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationManager nm = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) {
                NotificationChannel channel = nm.getNotificationChannel(CHANNEL_ID);
                if (channel == null) {
                    channel = new NotificationChannel(
                            CHANNEL_ID,
                            "İndirmeler",
                            NotificationManager.IMPORTANCE_LOW
                    );
                    channel.setDescription("XIPTV Play indirme ilerleme bildirimleri");
                    channel.setShowBadge(false);
                    channel.enableVibration(false);
                    channel.setSound(null, null);
                    nm.createNotificationChannel(channel);
                }
            }
        }
    }

    private static int getNotificationId(String id) {
        return (id.hashCode() & 0x7FFFFFFF) % 100000 + 1000;
    }

    private static long calculateEtaSeconds(DownloadState s) {
        if (s.totalBytes <= 0 || s.smoothedSpeedMBs <= 0.05) return 0;
        long remainingBytes = Math.max(0, s.totalBytes - s.currentBytes);
        double bytesPerSec = s.smoothedSpeedMBs * 1024.0 * 1024.0;
        return (long) (remainingBytes / bytesPerSec);
    }

    private static String formatEtaSeconds(long seconds) {
        if (seconds <= 0) return "";
        long h = seconds / 3600;
        long m = (seconds % 3600) / 60;
        long sec = seconds % 60;
        if (h > 0) return h + " sa " + m + " dk";
        if (m > 0) return m + " dk " + sec + " sn";
        return sec + " sn";
    }
}
