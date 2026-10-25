package com.xiptvplay.app;

import android.app.Notification;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import android.content.pm.ServiceInfo;

public class DownloadForegroundService extends Service {
    public static final String ACTION_START = "com.xiptvplay.app.DOWNLOAD_START";
    public static final String ACTION_STOP = "com.xiptvplay.app.DOWNLOAD_STOP";
    private static final int NOTIFICATION_ID = 7319;
    private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            releaseWakeLock();
            stopForeground(STOP_FOREGROUND_REMOVE);
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
