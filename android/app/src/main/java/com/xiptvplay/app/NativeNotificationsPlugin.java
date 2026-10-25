package com.xiptvplay.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.content.BroadcastReceiver;
import android.content.IntentFilter;
import android.app.PendingIntent;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.PermissionState;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

@CapacitorPlugin(name = "NativeNotifications", permissions = {
    @Permission(alias = "notifications", strings = { Manifest.permission.POST_NOTIFICATIONS })
})
public class NativeNotificationsPlugin extends Plugin {
    private static final String CHANNEL_ID = "xiptv_downloads";
    private static final String GROUP_KEY = "com.xiptvplay.app.DOWNLOAD_GROUP";
    private static final int SUMMARY_ID = 7319; // Foreground servis bildirimi ayni grup basligi
    private final java.util.Map<Integer, String> activeTitles = new java.util.concurrent.ConcurrentHashMap<>();
    private BroadcastReceiver cancelReceiver;

    @Override public void load() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "İndirme bildirimleri", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("XIPTV Play indirmelerinin ilerlemesini gösterir.");
            NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(channel);
        }
        cancelReceiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                if ("com.xiptvplay.app.CANCEL_ALL_DOWNLOADS".equals(intent.getAction())) {
                    notifyListeners("cancelAllRequested", new com.getcapacitor.JSObject());
                }
            }
        };
        IntentFilter filter = new IntentFilter("com.xiptvplay.app.CANCEL_ALL_DOWNLOADS");
        if (Build.VERSION.SDK_INT >= 33) getContext().registerReceiver(cancelReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        else getContext().registerReceiver(cancelReceiver, filter);
    }

    @Override protected void handleOnDestroy() {
        if (cancelReceiver != null) {
            try { getContext().unregisterReceiver(cancelReceiver); } catch (Exception ignored) {}
            cancelReceiver = null;
        }
        super.handleOnDestroy();
    }

    @PluginMethod public void requestPermission(PluginCall call) {
        if (Build.VERSION.SDK_INT < 33 || getPermissionState("notifications") == PermissionState.GRANTED) { call.resolve(); return; }
        requestPermissionForAlias("notifications", call, "permissionCallback");
    }
    @PermissionCallback private void permissionCallback(PluginCall call) {
        if (getPermissionState("notifications") == PermissionState.GRANTED) call.resolve();
        else call.reject("Bildirim izni verilmedi.");
    }
    @PluginMethod public void startForegroundDownload(PluginCall call) {
        Intent intent = new Intent(getContext(), DownloadForegroundService.class);
        intent.setAction(DownloadForegroundService.ACTION_START);
        intent.putExtra("title", call.getString("title", "Dosya"));
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent);
            else getContext().startService(intent);
            call.resolve();
        } catch (Exception error) {
            call.reject("Arka plan indirme servisi başlatılamadı: " + error.getMessage(), error);
        }
    }

    @PluginMethod public void stopForegroundDownload(PluginCall call) {
        Intent intent = new Intent(getContext(), DownloadForegroundService.class);
        intent.setAction(DownloadForegroundService.ACTION_STOP);
        try {
            getContext().startService(intent);
        } catch (Exception ignored) {
            getContext().stopService(new Intent(getContext(), DownloadForegroundService.class));
        }
        call.resolve();
    }

    private void postSummary() {
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) return;
        int count = activeTitles.size();
        // Tamamlanan bolumler de tek grubun altinda kalsin.
        // Foreground bildirimini iptal etmek servisi etkileyebilecegi icin
        // ayni bildirim kimligini guncelliyoruz.
        Intent cancelIntent = new Intent(getContext(), CancelAllDownloadsReceiver.class);
        cancelIntent.setAction("com.xiptvplay.app.CANCEL_ALL_ACTION");
        PendingIntent cancelPendingIntent = PendingIntent.getBroadcast(getContext(), 7301, cancelIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | (Build.VERSION.SDK_INT >= 23 ? PendingIntent.FLAG_IMMUTABLE : 0));
        NotificationCompat.Builder summary = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle(count > 0 ? "XIPTV Play — " + count + " indirme" : "XIPTV Play — İndirmeler")
            .setContentText("İndirmeleri görmek için genişletin")
            .setGroup(GROUP_KEY).setGroupSummary(true).setOngoing(count > 0).setAutoCancel(count <= 0)
            .setOnlyAlertOnce(true).setPriority(NotificationCompat.PRIORITY_LOW)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Tüm indirmeleri iptal et", cancelPendingIntent);
        NotificationManagerCompat.from(getContext()).notify(SUMMARY_ID, summary.build());
    }

    @PluginMethod public void showProgress(PluginCall call) {
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) { call.reject("Bildirim izni kapalı."); return; }
        String id = call.getString("id", "download");
        int notificationId = id.hashCode() & 0x7fffffff;
        activeTitles.put(notificationId, call.getString("title", "İndiriliyor"));
        int progress = Math.max(0, Math.min(100, call.getInt("progress", 0)));
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle(call.getString("title", "İndiriliyor"))
            .setContentText(call.getString("detail", "İndirme devam ediyor")).setOnlyAlertOnce(true).setOngoing(true)
            .setGroup(GROUP_KEY).setCategory(NotificationCompat.CATEGORY_PROGRESS)
            .setProgress(100, progress, false).setPriority(NotificationCompat.PRIORITY_LOW);
        NotificationManagerCompat.from(getContext()).notify(notificationId, builder.build());
        postSummary();
        call.resolve();
    }
    @PluginMethod public void complete(PluginCall call) {
        String id = call.getString("id", "download");
        int notificationId = id.hashCode() & 0x7fffffff;
        activeTitles.remove(notificationId);
        if (NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download_done).setContentTitle(call.getString("title", "İndirme tamamlandı"))
                .setContentText("Dosya başarıyla indirildi.").setAutoCancel(true).setOngoing(false)
                .setGroup(GROUP_KEY).setPriority(NotificationCompat.PRIORITY_LOW);
            NotificationManagerCompat.from(getContext()).notify(notificationId, builder.build());
        }
        postSummary();
        call.resolve();
    }
    @PluginMethod public void cancel(PluginCall call) {
        String id = call.getString("id", "download");
        int notificationId = id.hashCode() & 0x7fffffff;
        activeTitles.remove(notificationId);
        NotificationManagerCompat.from(getContext()).cancel(notificationId);
        postSummary();
        call.resolve();
    }
}
