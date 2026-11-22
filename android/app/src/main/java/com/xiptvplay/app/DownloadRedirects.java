package com.xiptvplay.app;

import java.io.IOException;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.HashSet;
import java.util.Set;
import java.util.function.Consumer;

/** Bounded HTTP media redirects for both single and parallel downloads. */
final class DownloadRedirects {
    private static final int MAX_REDIRECTS = 8;

    private DownloadRedirects() {}

    static HttpURLConnection open(URL original, String range, String ifRange,
                                  int connectTimeout, int readTimeout,
                                  Consumer<HttpURLConnection> onOpen) throws IOException {
        URL current = original;
        Set<String> visited = new HashSet<>();
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            String protocol = current.getProtocol();
            if (!"http".equalsIgnoreCase(protocol) && !"https".equalsIgnoreCase(protocol))
                throw new IOException("İndirme adresinin protokolü desteklenmiyor.");
            if (!visited.add(current.toExternalForm()))
                throw new IOException("İndirme bağlantısı yönlendirme döngüsüne girdi.");
            HttpURLConnection connection = (HttpURLConnection) current.openConnection();
            onOpen.accept(connection);
            connection.setConnectTimeout(connectTimeout);
            connection.setReadTimeout(readTimeout);
            connection.setInstanceFollowRedirects(false);
            connection.setRequestProperty("Accept-Encoding", "identity");
            if (range != null) connection.setRequestProperty("Range", range);
            if (ifRange != null) connection.setRequestProperty("If-Range", ifRange);
            final int status;
            try {
                status = connection.getResponseCode();
            } catch (IOException | RuntimeException error) {
                connection.disconnect();
                throw error;
            }
            if (status != 301 && status != 302 && status != 303 && status != 307 && status != 308)
                return connection;
            String location = connection.getHeaderField("Location");
            connection.disconnect();
            if (location == null || location.trim().isEmpty())
                throw new IOException("HTTP " + status + ": yönlendirme adresi eksik.");
            if (hop == MAX_REDIRECTS)
                throw new IOException("İndirme bağlantısı çok fazla yönlendirildi.");
            current = new URL(current, location);
        }
        throw new IOException("Yönlendirme sınırı aşıldı.");
    }
}
