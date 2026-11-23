package com.xiptvplay.app;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLStreamHandler;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.Test;

public class DownloadRedirectsTest {
    @Test public void follows302AndPreservesRange() throws Exception {
        AtomicInteger hops = new AtomicInteger();
        AtomicReference<String> finalRange = new AtomicReference<>();
        AtomicReference<String> finalUserAgent = new AtomicReference<>();
        URL original = new URL(null, "http://example.invalid/start", new URLStreamHandler() {
            @Override protected URLConnection openConnection(URL url) {
                return new HttpURLConnection(url) {
                    @Override public void disconnect() {}
                    @Override public boolean usingProxy() { return false; }
                    @Override public void connect() { connected = true; }
                    @Override public int getResponseCode() {
                        if (!connected) {
                            if (url.getPath().equals("/final")) {
                                finalRange.set(getRequestProperty("Range"));
                                finalUserAgent.set(getRequestProperty("User-Agent"));
                            }
                            connected = true;
                            hops.incrementAndGet();
                        }
                        return url.getPath().equals("/start") ? 302 : 206;
                    }
                    @Override public String getHeaderField(String name) {
                        return "Location".equalsIgnoreCase(name) && url.getPath().equals("/start")
                            ? "/final" : null;
                    }
                    @Override public InputStream getInputStream() {
                        return new ByteArrayInputStream(new byte[] { 7 });
                    }
                };
            }
        });
        HttpURLConnection response = DownloadRedirects.open(original, "bytes=0-0", null, 500, 500, c -> {});
        try {
            assertEquals(206, response.getResponseCode());
            assertEquals("bytes=0-0", finalRange.get());
            assertEquals("IPTVSmartersPro", finalUserAgent.get());
            assertEquals("/final", response.getURL().getPath());
            assertEquals(2, hops.get());
        } finally { response.disconnect(); }
    }

    @Test public void rejectsRedirectLoop() throws Exception {
        URL original = new URL(null, "http://example.invalid/loop", new URLStreamHandler() {
            @Override protected URLConnection openConnection(URL url) {
                return new HttpURLConnection(url) {
                    @Override public void disconnect() {}
                    @Override public boolean usingProxy() { return false; }
                    @Override public void connect() { connected = true; }
                    @Override public int getResponseCode() { return 302; }
                    @Override public String getHeaderField(String name) {
                        return "Location".equalsIgnoreCase(name) ? "/loop" : null;
                    }
                };
            }
        });
        try {
            DownloadRedirects.open(original, null, null, 500, 500, c -> {});
            fail("Redirect loop was accepted");
        } catch (IOException expected) {
            assertTrue(expected.getMessage().contains("döngüsüne"));
        }
    }
}
