package com.xiptvplay.app;

import static org.junit.Assert.*;

import com.sun.net.httpserver.HttpServer;
import java.io.File;
import java.io.InputStream;
import java.net.InetSocketAddress;
import java.net.URL;
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
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/file", exchange -> {
            try {
                requests.incrementAndGet();
                String[] range = exchange.getRequestHeaders().getFirst("Range").substring(6).split("-");
                int start = Integer.parseInt(range[0]);
                int end = Integer.parseInt(range[1]);
                exchange.getResponseHeaders().set("ETag", "\"test-file\"");
                int advertisedEnd = rejectRange && end > 0 ? end - 1 : end;
                exchange.getResponseHeaders().set("Content-Range", "bytes " + start + "-" + advertisedEnd + "/" + SIZE);
                exchange.sendResponseHeaders(206, end - start + 1);
                byte[] buffer = new byte[32768];
                for (int offset = start; offset <= end;) {
                    int length = Math.min(buffer.length, end - offset + 1);
                    for (int i = 0; i < length; i++) buffer[i] = (byte) ((offset + i) % 251);
                    exchange.getResponseBody().write(buffer, 0, length);
                    offset += length;
                }
            } finally {
                exchange.close();
            }
        });
        server.start();
        File target = Files.createTempFile("range-test", ".bin").toFile();
        try {
            URL url = new URL("http://127.0.0.1:" + server.getAddress().getPort() + "/file");
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
            server.stop(0);
            Files.deleteIfExists(target.toPath());
        }
    }
}
