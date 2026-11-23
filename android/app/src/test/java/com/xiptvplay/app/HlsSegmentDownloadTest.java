package com.xiptvplay.app;

import static org.junit.Assert.*;
import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLConnection;
import java.net.URLStreamHandler;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.util.concurrent.atomic.AtomicInteger;
import org.junit.Test;

public class HlsSegmentDownloadTest {
    private static URL playlist(String name, boolean ended) throws Exception {
        return new URL(null, "http://hls.invalid/" + name, new URLStreamHandler() {
            @Override protected URLConnection openConnection(URL address) {
                return new HttpURLConnection(address) {
                    @Override public void connect() { connected = true; }
                    @Override public void disconnect() {}
                    @Override public boolean usingProxy() { return false; }
                    @Override public int getResponseCode() { return 200; }
                    @Override public InputStream getInputStream() {
                        String path=address.getPath();
                        if (path.equals("/master.m3u8")) {
                            return body("#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1000000\nsub/media.m3u8\n");
                        }
                        if (path.equals("/sub/media.m3u8") || path.equals("/media.m3u8")) {
                            return body("#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXTINF:6,\nseg0.ts\n"
                                +"#EXTINF:6,\nseg1.ts\n"+(ended?"#EXT-X-ENDLIST\n":""));
                        }
                        if (path.endsWith("seg0.ts") || path.endsWith("seg1.ts")) {
                            byte[] segment=new byte[100000];
                            segment[0]=0x47;
                            segment[1]=(byte)(path.endsWith("seg0.ts") ? 1 : 2);
                            return new ByteArrayInputStream(segment);
                        }
                        return body("ERROR");
                    }
                };
            }
        });
    }
    private static InputStream body(String text) {
        return new ByteArrayInputStream(text.getBytes(StandardCharsets.UTF_8));
    }

    @Test public void downloadsRedirectCompatibleMasterAndSegmentsInOrder() throws Exception {
        File target=Files.createTempFile("xiptv-hls-", ".ts").toFile();
        target.delete();
        AtomicInteger lastProgress=new AtomicInteger();
        java.util.concurrent.atomic.AtomicLong estimatedTotal=new java.util.concurrent.atomic.AtomicLong();
        try {
            long size=HlsSegmentDownload.download(playlist("master.m3u8",true), target,
                conn->{}, ()->{}, (bytes,percent,total)->{lastProgress.set(percent);estimatedTotal.set(total);});
            assertEquals(200000L,size);
            assertEquals(200000L,target.length());
            assertEquals(100,lastProgress.get());
            assertEquals(200000L,estimatedTotal.get());
            byte[] data=Files.readAllBytes(target.toPath());
            assertEquals(0x47,data[0]&0xff);
            assertEquals(1,data[1]);
            assertEquals(0x47,data[100000]&0xff);
            assertEquals(2,data[100001]);
            MediaDownloadValidation.verify(target,"video/mp2t");
        } finally {
            Files.deleteIfExists(target.toPath());
            Files.deleteIfExists(new File(target+".part").toPath());
        }
    }

    @Test public void liveOrIncompleteManifestNeverReportsCompletedFile() throws Exception {
        File target=Files.createTempFile("xiptv-hls-live-", ".ts").toFile();
        target.delete();
        try {
            try {
                HlsSegmentDownload.download(playlist("media.m3u8",false),target,conn->{},()->{},(b,p,total)->{});
                fail("Incomplete HLS stream was accepted");
            } catch(IOException expected) {
                assertTrue(expected.getMessage().contains("ENDLIST"));
            }
            assertFalse(target.exists());
        } finally { Files.deleteIfExists(target.toPath()); }
    }
}
