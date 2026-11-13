package com.xiptvplay.app;

import static org.junit.Assert.*;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLStreamHandler;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class ParallelDownloadTest {
    private static final int SIZE = 24 * 1024 * 1024 + 5;

    @Test
    public void combinesValidatedRangesWithoutMissingBytes() throws Exception {
        runDownload(false);
    }

    @Test
    public void wrongRangeReturnsControlToSingleConnectionDownload() throws Exception {
        runDownload(true);
    }

    private void runDownload(boolean rejectRange) throws Exception {
        AtomicInteger requests = new AtomicInteger();
        URL url = new URL(null, "http://test.invalid/file", new URLStreamHandler() {
            @Override
            protected URLConnection openConnection(URL address) {
                return new HttpURLConnection(address) {
                    private int start;
                    private int end;

                    @Override public void connect() {
                        if (connected) return;
                        String[] range = getRequestProperty("Range").substring(6).split("-");
                        start = Integer.parseInt(range[0]);
                        end = Integer.parseInt(range[1]);
                        requests.incrementAndGet();
                        connected = true;
                    }

                    @Override public int getResponseCode() {
                        connect();
                        return 206;
                    }

                    @Override public String getHeaderField(String name) {
                        if (name.equalsIgnoreCase("ETag")) return "\"test-file\"";
                        if (name.equalsIgnoreCase("Content-Range")) {
                            int advertisedEnd = rejectRange && end > 0 ? end - 1 : end;
                            return "bytes " + start + "-" + advertisedEnd + "/" + SIZE;
                        }
                        return null;
                    }

                    @Override public InputStream getInputStream() {
                        byte[] bytes = new byte[end - start + 1];
                        for (int i = 0; i < bytes.length; i++) bytes[i] = (byte) ((start + i) % 251);
                        return new ByteArrayInputStream(bytes);
                    }

                    @Override public void disconnect() {}
                    @Override public boolean usingProxy() { return false; }
                };
            }
        });
        File target = Files.createTempFile("range-test", ".bin").toFile();
        try {
            assertEquals(!rejectRange, new ParallelDownload().download(url, target, 3, () -> {}, (bytes, total) -> {}));
            if (!rejectRange) {
                assertEquals(4, requests.get());
                assertEquals(SIZE, target.length());
                try (InputStream file = Files.newInputStream(target.toPath())) {
                    byte[] buffer = new byte[32768];
                    int offset = 0;
                    int read;
                    while ((read = file.read(buffer)) > 0) {
                        for (int i = 0; i < read; i++) {
                            if (buffer[i] != (byte) ((offset + i) % 251)) fail("Bozuk byte: " + (offset + i));
                        }
                        offset += read;
                    }
                    assertEquals(SIZE, offset);
                }
            }
        } finally {
            Files.deleteIfExists(target.toPath());
        }
    }
}
