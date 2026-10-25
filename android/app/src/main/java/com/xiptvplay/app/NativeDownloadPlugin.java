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
    private static final ConcurrentHashMap<String, AtomicBoolean> cancellations = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, HttpURLConnection> connections = new ConcurrentHashMap<>();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());
    private static final ConcurrentHashMap<String, PauseGate> pauseGates = new ConcurrentHashMap<>();

    private static final class PauseGate {
        volatile boolean paused;
        synchronized void pause() { paused = true; }
        synchronized void resume() { paused = false; notifyAll(); }
        synchronized void awaitResume(AtomicBoolean cancelled) throws InterruptedException {
            while (paused && !cancelled.get()) wait(250L);
        }
    }

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
        final PauseGate pauseGate = new PauseGate();
        pauseGates.put(id, pauseGate);
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
                int count;
                while (true) {
                    pauseGate.awaitResume(cancelled);
                    if (cancelled.get()) throw new InterruptedException("İndirme iptal edildi.");
                    count = input.read(buffer);
                    if (count == -1) break;
                    if (cancelled.get()) throw new InterruptedException("İndirme kullanıcı tarafından iptal edildi.");
                    output.write(buffer, 0, count);
                    received += count;
                    DownloadForegroundService.updateDownloadProgress(getContext(), id, downloadTitle, received, total, false);
                    long now = System.currentTimeMillis();
                    if (now - lastEmit >= 150) {
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
                if (total > 0 && target.length() < total) throw new Exception("İndirme eksik kaldı; sunucu bağlantıyı erken kapattı.");
                DownloadForegroundService.updateDownloadProgress(getContext(), id, downloadTitle, target.length(), total > 0 ? total : target.length(), true);
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
                pauseGates.remove(id);
                DownloadForegroundService.clearDownloadProgress(id);
            }
        });
    }

    public static void cancelDownloadById(String id) {
        if (id == null) return;
        AtomicBoolean flag = cancellations.get(id);
        if (flag != null) flag.set(true);
        PauseGate gate = pauseGates.get(id);
        if (gate != null) gate.resume();
        HttpURLConnection connection = connections.get(id);
        if (connection != null) connection.disconnect();
    }

    @PluginMethod
    public void pauseDownload(PluginCall call) {
        String id = call.getString("id");
        PauseGate gate = id == null ? null : pauseGates.get(id);
        if (gate == null) { call.reject("Aktif indirme bulunamadı."); return; }
        gate.pause();
        call.resolve();
    }

    @PluginMethod
    public void resumeDownload(PluginCall call) {
        String id = call.getString("id");
        PauseGate gate = id == null ? null : pauseGates.get(id);
        if (gate == null) { call.reject("Devam ettirilecek indirme bulunamadı."); return; }
        gate.resume();
        call.resolve();
    }

    @PluginMethod
    public void cancelDownload(PluginCall call) {
        String id = call.getString("id");
        cancelDownloadById(id);
        call.resolve();
    }
}
