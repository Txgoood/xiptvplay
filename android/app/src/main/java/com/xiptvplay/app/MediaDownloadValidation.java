package com.xiptvplay.app;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Safely diagnose upstream media responses; never expose credential-bearing URLs. */
final class MediaDownloadValidation {
    private static final long MIN_VIDEO_BYTES = 128 * 1024L;
    private MediaDownloadValidation() {}

    static void verify(File file) throws IOException {
        verify(file, null);
    }

    static void verify(File file, String contentType) throws IOException {
        long size = file != null && file.isFile() ? file.length() : 0L;
        byte[] prefix = new byte[512];
        int read = 0;
        if (size > 0) {
            try (FileInputStream stream = new FileInputStream(file)) {
                read = stream.read(prefix);
            }
        }
        String start = read > 0 ? new String(prefix, 0, read, StandardCharsets.ISO_8859_1)
            .replace("\uFEFF", "").trim().toLowerCase(Locale.ROOT) : "";
        String mime = contentType == null ? "" : contentType.split(";", 2)[0].trim().toLowerCase(Locale.ROOT);

        if (start.startsWith("#extm3u") || start.startsWith("#ext-x-")
            || mime.contains("mpegurl") || mime.contains("vnd.apple.mpegurl")) {
            throw new IOException("Sunucu HLS (m3u8) oynatma listesi gönderdi; indirme motoru bunu tek video dosyası olarak kaydedemez.");
        }
        if (start.startsWith("<!doctype html") || start.startsWith("<html")
            || start.startsWith("<?xml") || mime.contains("text/html")) {
            throw new IOException("Sunucu video yerine HTML hata/giriş sayfası gönderdi. İçerik indirilmedi.");
        }
        if (start.startsWith("{") || start.startsWith("[") || mime.contains("application/json")) {
            throw new IOException("Sunucu video yerine JSON yanıtı gönderdi. İçerik indirilmedi.");
        }
        if (size < MIN_VIDEO_BYTES) {
            String type = mime.isEmpty() ? "belirtilmedi" : mime.replaceAll("[^a-z0-9.+/-]", "");
            throw new IOException("Sunucu yalnızca " + size + " bayt döndürdü (içerik türü: " + type
                + "). Film kaynağı indirilemiyor; oynatma çalışsa da dosya yanıtı boş/küçük.");
        }
    }
}
