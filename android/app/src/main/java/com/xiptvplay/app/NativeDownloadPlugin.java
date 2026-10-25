package com.xiptvplay.app;

import android.os.Handler;
import android.os.Looper;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
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
        final String title = call.getString("title", "Medya İndiriliyor");

        if (id == null || id.isEmpty() || url == null || url.isEmpty() || relativePath == null || relativePath.isEmpty()) {
            call.reject("İndirme bilgileri eksik.");
            return;
        }

        final AtomicBoolean cancelled = new AtomicBoolean(false);
        cancellations.put(id, cancelled);

        // Register download with the foreground service for single-source notification management & background persistence
        DownloadForegroundService.start(getContext(), id, title);

        executor.execute(() -> {
            OutputStream output = null;
            InputStream input = null;
            File target = null;
            try {
                File base = new File(getContext().getFilesDir(), "downloads");
                if (!base.exists() && !base.mkdirs()) {
                    throw new Exception("İndirme klasörü oluşturulamadı.");
                }
                String safeName = new File(relativePath).getName();
                target = new File(base, safeName);

                HttpURLConnection connection = (HttpURLConnection) new URL(url).openConnection();
                connections.put(id, connection);
                connection.setConnectTimeout(30000);
                connection.setReadTimeout(30000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept-Encoding", "identity");

                connection.connect();
                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) {
                    throw new Exception("Sunucu HTTP " + code + " yanıtı verdi.");
                }

                long total = connection.getContentLengthLong();
                input = new BufferedInputStream(connection.getInputStream(), 256 * 1024);
                output = new BufferedOutputStream(new FileOutputStream(target, false), 256 * 1024);
                byte[] buffer = new byte[256 * 1024];
                long received = 0;
                long lastEmit = 0;
                int count;

                while ((count = input.read(buffer)) != -1) {
                    if (cancelled.get()) {
                        throw new InterruptedException("İndirme kullanıcı tarafından iptal edildi.");
                    }
                    output.write(buffer, 0, count);
                    received += count;

                    // 1. Update Android Foreground Service notification (throttled to ~1s with monotonic speed)
                    DownloadForegroundService.updateProgress(getContext(), id, received, total);

                    // 2. Notify in-app JS UI listeners at smooth 250ms intervals
                    long now = System.currentTimeMillis();
                    if (now - lastEmit >= 250) {
                        final long current = received;
                        final long length = total;
                        JSObject event = new JSObject();
                        event.put("id", id);
                        event.put("bytes", current);
                        event.put("contentLength", length);
                        mainHandler.post(() -> notifyListeners("downloadProgress", event));
                        lastEmit = now;
                    }
                }

                output.flush();
                output.close();
                output = null;
                input.close();
                input = null;

                if (cancelled.get()) {
                    throw new InterruptedException("İndirme kullanıcı tarafından iptal edildi.");
                }
                if (target.length() <= 0) {
                    throw new Exception("İndirilen dosya boş.");
                }

                // Final 100% notification & completion
                DownloadForegroundService.complete(getContext(), id, true, null);

                // Final 100% JS progress event
                final long finalLen = target.length();
                JSObject finalEvent = new JSObject();
                finalEvent.put("id", id);
                finalEvent.put("bytes", finalLen);
                finalEvent.put("contentLength", total > 0 ? total : finalLen);
                mainHandler.post(() -> notifyListeners("downloadProgress", finalEvent));

                JSObject result = new JSObject();
                result.put("path", "downloads/" + safeName);
                result.put("fileUri", "file://" + target.getAbsolutePath());
                result.put("bytes", finalLen);
                call.resolve(result);

            } catch (Exception error) {
                if (target != null && target.exists()) {
                    target.delete();
                }
                boolean wasCancelled = cancelled.get();
                DownloadForegroundService.complete(getContext(), id, false, wasCancelled ? "İptal edildi" : error.getMessage());

                if (wasCancelled) {
                    call.reject("İndirme iptal edildi.");
                } else {
                    String msg = error.getMessage() == null ? error.toString() : error.getMessage();
                    call.reject("İndirme başarısız: " + msg);
                }
            } finally {
                try { if (output != null) output.close(); } catch (Exception ignored) {}
                try { if (input != null) input.close(); } catch (Exception ignored) {}
                HttpURLConnection connection = connections.remove(id);
                if (connection != null) connection.disconnect();
                cancellations.remove(id);
            }
        });
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        String id = call.getString("id");
        if (id != null) {
            AtomicBoolean flag = cancellations.get(id);
            if (flag != null) flag.set(true);
            HttpURLConnection connection = connections.get(id);
            if (connection != null) connection.disconnect();
            DownloadForegroundService.cancel(id);
        }
        call.resolve();
    }
}
