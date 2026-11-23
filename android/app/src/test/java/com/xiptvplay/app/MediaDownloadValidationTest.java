package com.xiptvplay.app;

import static org.junit.Assert.*;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import org.junit.Test;

public class MediaDownloadValidationTest {
    private static void rejects(byte[] bytes) throws Exception {
        File file = Files.createTempFile("xiptv-invalid-media-", ".mp4").toFile();
        try {
            Files.write(file.toPath(), bytes);
            try { MediaDownloadValidation.verify(file); fail("Invalid response accepted as movie"); }
            catch (IOException expected) { assertNotNull(expected.getMessage()); }
        } finally { Files.deleteIfExists(file.toPath()); }
    }

    @Test public void emptyAndTinyProviderResponsesAreNotMovies() throws Exception {
        rejects(new byte[0]);
        rejects("<html>Login</html>".getBytes(StandardCharsets.UTF_8));
        rejects(new byte[400]);
    }

    @Test public void longHtmlAndPlaylistsAreNotMovies() throws Exception {
        for (String beginning : new String[]{"<!DOCTYPE html><html>", "{\"error\":\"expired\"}", "#EXTM3U"}) {
            byte[] bytes = new byte[150 * 1024];
            byte[] signature = beginning.getBytes(StandardCharsets.US_ASCII);
            System.arraycopy(signature, 0, bytes, 0, signature.length);
            rejects(bytes);
        }
    }

    @Test public void classifiesHlsManifestWithoutLeakingUrl() throws Exception {
        File file = Files.createTempFile("xiptv-manifest-", ".mp4").toFile();
        try {
            Files.write(file.toPath(), "#EXTM3U\\n#EXT-X-VERSION:3\\n".getBytes(StandardCharsets.US_ASCII));
            try {
                MediaDownloadValidation.verify(file, "application/vnd.apple.mpegurl");
                fail("HLS manifest was treated as a full video");
            } catch (IOException expected) {
                assertTrue(expected.getMessage().contains("HLS"));
            }
        } finally { Files.deleteIfExists(file.toPath()); }
    }

    @Test public void emptyResponseIncludesSafeContentTypeAndByteCount() throws Exception {
        File file = Files.createTempFile("xiptv-empty-", ".mp4").toFile();
        try {
            try {
                MediaDownloadValidation.verify(file, "application/octet-stream");
                fail("Empty response was accepted");
            } catch (IOException expected) {
                assertTrue(expected.getMessage().contains("0 bayt"));
                assertTrue(expected.getMessage().contains("application/octet-stream"));
            }
        } finally { Files.deleteIfExists(file.toPath()); }
    }

    @Test public void sufficientlyLargeBinaryVideoMayComplete() throws Exception {
        File file = Files.createTempFile("xiptv-valid-media-", ".mp4").toFile();
        try {
            byte[] bytes = new byte[150 * 1024];
            bytes[0] = 0; bytes[1] = 0; bytes[2] = 0; bytes[3] = 24;
            bytes[4] = 'f'; bytes[5] = 't'; bytes[6] = 'y'; bytes[7] = 'p';
            Files.write(file.toPath(), bytes);
            MediaDownloadValidation.verify(file);
        } finally { Files.deleteIfExists(file.toPath()); }
    }
}
