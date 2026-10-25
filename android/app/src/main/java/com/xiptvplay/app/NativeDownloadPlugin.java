package com.xiptvplay.app;

import android.os.Handler;
import android.os.Looper;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.atomic.AtomicBoolean;

@CapacitorPlugin(name = "NativeDownload")
public class NativeDownloadPlugin extends Plugin {
    private final ExecutorService executor = Executors.newCachedThreadPool();
    private final ConcurrentHashMap<String, AtomicBoolean> cancellations = new ConcurrentHashMap<>();
    private final ConcurrentHashMap<String, HttpURLConnection> connections = new ConcurrentHashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @PluginMethod
    public void downloadFile(PluginCall call) {
        final String id = call.getString("id");
        final String url = call.getString("url");
        final String relativePath = call.getString("path");
        final String downloadTitle = call.getString("title", "İndiriliyor");
        if (id == null || id.isEmpty() || url == null || url.isEmpty() || relativePath == null || relativePath.isEmpty()) {
            call.reject("İndirme bilgileri eksik.");
            return;
        }
        final AtomicBoolean cancelled = new AtomicBoolean(false);
        cancellations.put(id, cancelled);
        executor.execute(() -> {
            OutputStream output = null;
            InputStream input = null;
            File target = null;
            try {
                File base = new File(getContext().getFilesDir(), "downloads");
                if (!base.exists() && !base.mkdirs()) throw new Exception("İndirme klasörü oluşturulamadı.");
                String safeName = new File(relativePath).getName();
                target = new File(base, safeName);
                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connections.put(id, connection);
                connection.setConnectTimeout(30000);
                // Veri akışı durduğunda 2 dakika boyunca ekranda donmuş gibi kalmasın.
                // Uzun sessizlikleri daha erken yakalamak için okuma zaman aşımı 30 saniye.
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept-Encoding", "identity");

                connection.connect();
                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) throw new Exception("Sunucu HTTP " + code + " yanıtı verdi.");
                long total = connection.getContentLengthLong();
                input = new BufferedInputStream(connection.getInputStream(), 256 * 1024);
                output = new BufferedOutputStream(new FileOutputStream(target, false), 256 * 1024);
                byte[] buffer = new byte[256 * 1024];
                long received = 0;
                long lastEmit = 0;
                long lastNotificationBytes = 0;
                long lastNotificationTime = 0;
                double smoothedBytesPerSecond = 0;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (cancelled.get()) throw new InterruptedException("İndirme kullanıcı tarafından iptal edildi.");
                    output.write(buffer, 0, count);
                    received += count;
                    long now = System.currentTimeMillis();
                    if (now - lastEmit >= 150) {
                        if (lastNotificationTime > 0 && now > lastNotificationTime) {
                            double currentBps = (received - lastNotificationBytes) * 1000.0 / (now - lastNotificationTime);
                            smoothedBytesPerSecond = smoothedBytesPerSecond <= 0 ? currentBps
                                : (smoothedBytesPerSecond * 0.35 + currentBps * 0.65);
                        }
                        lastNotificationBytes = received;
                        lastNotificationTime = now;
                        final long current = received;
                        final long length = total;
                        postProgressNotification(id, downloadTitle, current, length, smoothedBytesPerSecond);
                        JSObject event = new JSObject();
                        event.put("id", id);
                        event.put("bytes", current);
                        event.put("contentLength", length);
                        mainHandler.post(() -> notifyListeners("downloadProgress", event));
                        lastEmit = now;
                    }
                }
                output.flush();
                output.close(); output = null;
                input.close(); input = null;
                if (cancelled.get()) throw new InterruptedException("İndirme kullanıcı tarafından iptal edildi.");
                if (target.length() <= 0) throw new Exception("İndirilen dosya boş.");
                JSObject result = new JSObject();
                result.put("path", "downloads/" + safeName);
                result.put("fileUri", "file://" + target.getAbsolutePath());
                result.put("bytes", target.length());
                call.resolve(result);
            } catch (Exception error) {
                if (target != null && target.exists()) target.delete();
                if (cancelled.get()) call.reject("İndirme iptal edildi.");
                else call.reject("İndirme başarısız: " + (error.getMessage() == null ? error.toString() : error.getMessage()));
            } finally {
                try { if (output != null) output.close(); } catch (Exception ignored) {}
                try { if (input != null) input.close(); } catch (Exception ignored) {}
                HttpURLConnection connection = connections.remove(id);
                if (connection != null) connection.disconnect();
                cancellations.remove(id);
            }
        });
    }

    // Bildirimi doğrudan indirme motorundan güncelle: JS ekranı veya listener gecikse bile yüzde ilerler.
    private void postProgressNotification(String id, String title, long received, long total, double bytesPerSecond) {
        try {
            if (!NotificationManagerCompat.from(getContext()).areNotificationsEnabled()) return;
            int notificationId = id.hashCode() & 0x7fffffff;
            int progress = total > 0 ? (int) Math.min(100, Math.max(0, (received * 100L) / total)) : 0;
            String speed = String.format(java.util.Locale.getDefault(), "%.1f MB/sn", bytesPerSecond / 1_000_000.0);
            String detail = total > 0
                ? progress + "% indirildi • " + speed
                : String.format(java.util.Locale.getDefault(), "%.1f MB indirildi • %s", received / 1_000_000.0, speed);
            NotificationCompat.Builder builder = new NotificationCompat.Builder(getContext(), "xiptv_downloads")
                .setSmallIcon(android.R.drawable.stat_sys_download)
                .setContentTitle(title)
                .setContentText(detail)
                .setSubText(speed)
                .setOnlyAlertOnce(true)
                .setOngoing(true)
                .setGroup("com.xiptvplay.app.DOWNLOAD_GROUP")
                .setCategory(NotificationCompat.CATEGORY_PROGRESS)
                .setProgress(100, progress, total <= 0)
                .setPriority(NotificationCompat.PRIORITY_LOW);
            NotificationManagerCompat.from(getContext()).notify(notificationId, builder.build());
        } catch (Exception ignored) {
            // Bildirim başarısızlığı indirme akışını durdurmamalı.
        }
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        String id = call.getString("id");
        if (id != null) {
            AtomicBoolean flag = cancellations.get(id);
            if (flag != null) flag.set(true);
            HttpURLConnection connection = connections.get(id);
            if (connection != null) connection.disconnect();
        }
        call.resolve();
    }
}
