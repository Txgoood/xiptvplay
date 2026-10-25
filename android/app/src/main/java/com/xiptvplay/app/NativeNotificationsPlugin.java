package com.xiptvplay.app;

import android.Manifest;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
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

    @Override public void load() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel = new NotificationChannel(CHANNEL_ID, "İndirme bildirimleri", NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("XIPTV Play indirmelerinin ilerlemesini gösterir.");
            NotificationManager manager = (NotificationManager) getContext().getSystemService(Context.NOTIFICATION_SERVICE);
            if (manager != null) manager.createNotificationChannel(channel);
        }
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

    @PluginMethod public void showProgress(PluginCall call) {
        if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) { call.reject("Bildirim izni kapalı."); return; }
        String id = call.getString("id", "download");
        int progress = Math.max(0, Math.min(100, call.getInt("progress", 0)));
        NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
            .setSmallIcon(android.R.drawable.stat_sys_download).setContentTitle(call.getString("title", "İndiriliyor"))
            .setContentText(call.getString("detail", "İndirme devam ediyor")).setOnlyAlertOnce(true).setOngoing(true)
            .setCategory(NotificationCompat.CATEGORY_PROGRESS).setProgress(100, progress, false).setPriority(NotificationCompat.PRIORITY_LOW);
        NotificationManagerCompat.from(getContext()).notify(id.hashCode() & 0x7fffffff, builder.build());
        call.resolve();
    }
    @PluginMethod public void complete(PluginCall call) {
        String id = call.getString("id", "download");
        if (NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) {
            NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), CHANNEL_ID)
                .setSmallIcon(android.R.drawable.stat_sys_download_done).setContentTitle(call.getString("title", "İndirme tamamlandı"))
                .setContentText("Dosya başarıyla indirildi.").setAutoCancel(true).setOngoing(false).setPriority(NotificationCompat.PRIORITY_LOW);
            NotificationManagerCompat.from(getContext()).notify(id.hashCode() & 0x7fffffff, builder.build());
        }
        call.resolve();
    }
    @PluginMethod public void cancel(PluginCall call) {
        String id = call.getString("id", "download");
        NotificationManagerCompat.from(getContext()).cancel(id.hashCode() & 0x7fffffff);
        call.resolve();
    }
}
