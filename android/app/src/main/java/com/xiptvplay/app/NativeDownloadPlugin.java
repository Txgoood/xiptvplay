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
                // Bağlantı kesilirse aynı dosyayı Range ile sürdür; hiçbir zaman kısmi dosyayı tamamlanmış sayma.
                long received = 0L;
                long total = -1L;
                long lastEmit = 0L;
                Exception lastError = null;
                for (int attempt = 0; attempt < 5; attempt++) {
                    if (cancelled.get()) throw new InterruptedException("İndirme iptal edildi.");
                    HttpURLConnection connection = null;
                    try {
                        connection = (HttpURLConnection) new URL(url).openConnection();
                        connections.put(id, connection);
                        connection.setConnectTimeout(30000);
                        connection.setReadTimeout(30000);
                        connection.setInstanceFollowRedirects(true);
                        connection.setRequestProperty("Accept-Encoding", "identity");
                        if (received > 0) connection.setRequestProperty("Range", "bytes=" + received + "-");
                        connection.connect();
                        int code = connection.getResponseCode();
                        if (code != 200 && code != 206) throw new java.io.IOException("Sunucu HTTP " + code + " yanıtı verdi.");
                        boolean append = received > 0 && code == 206;
                        if (code == 206) {
                            String range = connection.getHeaderField("Content-Range");
                            if (range == null || !range.startsWith("bytes " + received + "-"))
                                throw new java.io.IOException("Sunucu beklenen Range konumunu döndürmedi.");
                            int slash = range.indexOf('/');
                            if (slash > 0 && !range.substring(slash + 1).equals("*"))
                                total = Long.parseLong(range.substring(slash + 1).trim());
                        } else {
                            // Sunucu Range desteklemiyorsa eskisini ekleme: dosyayı sıfırdan indir.
                            received = 0L;
                            total = connection.getContentLengthLong();
                        }
                        if (total <= 0 && connection.getContentLengthLong() > 0)
                            total = received + connection.getContentLengthLong();
                        input = new BufferedInputStream(connection.getInputStream(), 256 * 1024);
                        output = new BufferedOutputStream(new FileOutputStream(target, append), 256 * 1024);
                        byte[] buffer = new byte[256 * 1024];
                        int count;
                        while (true) {
                            pauseGate.awaitResume(cancelled);
                            if (cancelled.get()) throw new InterruptedException("İndirme iptal edildi.");
                            count = input.read(buffer);
                            if (count == -1) break;
                            output.write(buffer, 0, count);
                            received += count;
                            DownloadForegroundService.updateDownloadProgress(getContext(), id, downloadTitle, received, total, false);
                            long now = android.os.SystemClock.elapsedRealtime();
                            if (now - lastEmit >= 900) {
                                JSObject event = new JSObject();
                                event.put("id", id);
                                event.put("bytes", received);
                                event.put("contentLength", total);
                                notifyListeners("downloadProgress", event);
                                lastEmit = now;
                            }
                        }
                        output.flush();
                        output.close(); output = null;
                        input.close(); input = null;
                        if (total > 0 && received != total)
                            throw new java.io.EOFException("Akış erken bitti: " + received + "/" + total);
                        lastError = null;
                        break;
                    } catch (java.io.IOException networkError) {
                        lastError = networkError;
                        if (cancelled.get()) throw new InterruptedException("İndirme iptal edildi.");
                        // 401/403/404 gibi kalıcı HTTP yanıtlarında gereksiz yeniden deneme yapma.
                        if (networkError.getMessage() != null &&
                            networkError.getMessage().matches(".*HTTP (400|401|403|404|410|416).*")) throw networkError;
                        if (attempt == 4) throw networkError;
                    } finally {
                        try { if (output != null) { output.flush(); output.close(); } } catch (Exception ignored) {}
                        try { if (input != null) input.close(); } catch (Exception ignored) {}
                        output = null; input = null;
                        if (connection != null) connection.disconnect();
                        connections.remove(id, connection);
                    }
                    // Exponential backoff, iptal edilebilir.
                    long delay = Math.min(12000L, 1000L << attempt);
                    for (long waited = 0; waited < delay; waited += 250L) {
                        if (cancelled.get()) throw new InterruptedException("İndirme iptal edildi.");
                        Thread.sleep(Math.min(250L, delay - waited));
                    }
                }
                if (lastError != null) throw lastError;
                if (cancelled.get()) throw new InterruptedException("İndirme iptal edildi.");
                if (target.length() <= 0) throw new Exception("İndirilen dosya boş.");
                if (total > 0 && target.length() != total) throw new Exception("İndirilen dosyanın boyutu uyuşmuyor.");
                DownloadForegroundService.updateDownloadProgress(getContext(), id, downloadTitle, target.length(), total > 0 ? total : target.length(), true);
                JSObject finalEvent = new JSObject();
                finalEvent.put("id", id);
                finalEvent.put("bytes", target.length());
                finalEvent.put("contentLength", total > 0 ? total : target.length());
                notifyListeners("downloadProgress", finalEvent);
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
