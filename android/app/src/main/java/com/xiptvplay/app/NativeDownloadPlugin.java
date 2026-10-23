package com.xiptvplay.app;

import android.os.Handler;
import android.os.Looper;
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
        if (id == null || id.isEmpty() || url == null || url.isEmpty() || relativePath == null || relativePath.isEmpty()) {
            call.reject("İndirme bilgileri eksik.");
            return;
        }
        final AtomicBoolean cancelled = new AtomicBoolean(false);
        cancellations.put(id, cancelled);
        executor.execute(() -> {
            FileOutputStream output = null;
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
                // IPTV sunucuları bazen uzun süre veri göndermeden bekletebilir.
                // 20 saniyelik read timeout büyük dosyalarda indirmeyi gereksiz kesiyordu.
                connection.setReadTimeout(120000);
                connection.setInstanceFollowRedirects(true);
                connection.setRequestProperty("Accept-Encoding", "identity");
                connection.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android 10) AppleWebKit/537.36 Chrome/120.0 Mobile Safari/537.36");
                connection.connect();
                int code = connection.getResponseCode();
                if (code < 200 || code >= 300) throw new Exception("Sunucu HTTP " + code + " yanıtı verdi.");
                long total = connection.getContentLengthLong();
                input = new BufferedInputStream(connection.getInputStream(), 256 * 1024);
                output = new BufferedOutputStream(new FileOutputStream(target, false), 256 * 1024);
                byte[] buffer = new byte[256 * 1024];
                long received = 0;
                long lastEmit = 0;
                int count;
                while ((count = input.read(buffer)) != -1) {
                    if (cancelled.get()) throw new InterruptedException("İndirme kullanıcı tarafından iptal edildi.");
                    output.write(buffer, 0, count);
                    received += count;
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
