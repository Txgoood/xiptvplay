package com.xiptvplay.app;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Never treat an IPTV provider's tiny redirect/login/error response as a downloaded movie. */
final class MediaDownloadValidation {
    private static final long MIN_VIDEO_BYTES = 128 * 1024L;
    private MediaDownloadValidation() {}

    static void verify(File file) throws IOException {
        if (file == null || !file.isFile() || file.length() < MIN_VIDEO_BYTES)
            throw new IOException("Sunucu geçerli video yerine çok küçük/boş dosya gönderdi (0 MB). İndirme tamamlanmadı.");
        byte[] prefix = new byte[512];
        int read;
        try (FileInputStream stream = new FileInputStream(file)) {
            read = stream.read(prefix);
        }
        if (read <= 0) throw new IOException("İndirilen dosyanın içeriği okunamadı.");
        String start = new String(prefix, 0, read, StandardCharsets.ISO_8859_1)
            .replace("\uFEFF", "").trim().toLowerCase(Locale.ROOT);
        if (start.startsWith("<!doctype html") || start.startsWith("<html")
            || start.startsWith("<?xml") || start.startsWith("{") || start.startsWith("[")
            || start.startsWith("#extm3u") || start.startsWith("#ext-x-")) {
            throw new IOException("Sunucu video yerine HTML/JSON veya oynatma listesi döndürdü. Yönlendirilen içerik indirilemedi.");
        }
    }
}
