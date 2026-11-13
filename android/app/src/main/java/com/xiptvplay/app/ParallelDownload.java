package com.xiptvplay.app;

import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.io.RandomAccessFile;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Set;
import java.util.concurrent.CompletionService;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorCompletionService;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

final class ParallelDownload {
    private static final long MIN_BYTES = 24L * 1024 * 1024;
    private static final Pattern CONTENT_RANGE = Pattern.compile("bytes (\\d+)-(\\d+)/(\\d+)");

    interface Gate {
        void check() throws InterruptedException;
    }

    interface Progress {
        void report(long bytes, long total);
    }

    private final Set<HttpURLConnection> connections = ConcurrentHashMap.newKeySet();
    private final AtomicBoolean stopped = new AtomicBoolean();

    void cancel() {
        stopped.set(true);
        for (HttpURLConnection connection : connections) connection.disconnect();
    }

    private HttpURLConnection connect(URL url, long start, long end, String validator) throws IOException {
        HttpURLConnection connection = (HttpURLConnection) url.openConnection();
        connections.add(connection);
        connection.setConnectTimeout(7000);
        connection.setReadTimeout(10000);
        connection.setRequestProperty("Accept-Encoding", "identity");
        connection.setRequestProperty("Range", "bytes=" + start + "-" + end);
        if (validator != null) connection.setRequestProperty("If-Range", validator);
        return connection;
    }

    private void close(HttpURLConnection connection) {
        connections.remove(connection);
        connection.disconnect();
    }

    private static long totalForRange(HttpURLConnection connection, long start, long end) throws IOException {
        if (connection.getResponseCode() != 206) throw new IOException("Sunucu byte aralığını desteklemiyor.");
        String range = connection.getHeaderField("Content-Range");
        String encoding = connection.getHeaderField("Content-Encoding");
        Matcher matcher = CONTENT_RANGE.matcher(range == null ? "" : range);
        if (encoding != null && !encoding.equalsIgnoreCase("identity")
            || !matcher.matches() || Long.parseLong(matcher.group(1)) != start
            || Long.parseLong(matcher.group(2)) != end || Long.parseLong(matcher.group(3)) <= end) {
            throw new IOException("Sunucu istenen byte aralığını göndermedi.");
        }
        return Long.parseLong(matcher.group(3));
    }

    private static String validator(HttpURLConnection connection) {
        String etag = connection.getHeaderField("ETag");
        if (etag != null && etag.startsWith("\"") && etag.endsWith("\"")) return etag;
        return connection.getHeaderField("Last-Modified");
    }

    private void check(Gate gate) throws InterruptedException {
        if (stopped.get() || Thread.currentThread().isInterrupted()) throw new InterruptedException();
        gate.check();
        if (stopped.get()) throw new InterruptedException();
    }

    boolean download(URL url, File target, int workers, Gate gate, Progress progress) throws InterruptedException {
        long size;
        String version;
        try {
            check(gate);
            HttpURLConnection probe = connect(url, 0, 0, null);
            try {
                size = totalForRange(probe, 0, 0);
                version = validator(probe);
            } finally {
                close(probe);
            }
        } catch (IOException | RuntimeException unsupported) {
            return false;
        }
        if (size < MIN_BYTES || size > target.getParentFile().getUsableSpace()) return false;

        ExecutorService pool = Executors.newFixedThreadPool(workers);
        CompletionService<Void> tasks = new ExecutorCompletionService<>(pool);
        AtomicLong received = new AtomicLong();
        AtomicLong nextSample = new AtomicLong();
        try {
            try (RandomAccessFile file = new RandomAccessFile(target, "rw")) {
                file.setLength(size);
            }
            for (int index = 0; index < workers; index++) {
                long start = size / workers * index;
                long end = index == workers - 1 ? size - 1 : size / workers * (index + 1) - 1;
                tasks.submit(() -> {
                    check(gate);
                    HttpURLConnection connection = connect(url, start, end, version);
                    try {
                        if (totalForRange(connection, start, end) != size
                            || (version != null && !version.equals(validator(connection)))) {
                            throw new IOException("İndirme sırasında dosya değişti.");
                        }
                        try (InputStream input = connection.getInputStream();
                             RandomAccessFile file = new RandomAccessFile(target, "rw")) {
                            file.seek(start);
                            byte[] buffer = new byte[256 * 1024];
                            long remaining = end - start + 1;
                            while (remaining > 0) {
                                check(gate);
                                int read = input.read(buffer, 0, (int) Math.min(buffer.length, remaining));
                                if (read < 0) throw new IOException("Dosya parçası eksik.");
                                check(gate);
                                file.write(buffer, 0, read);
                                remaining -= read;
                                received.addAndGet(read);
                                long now = System.nanoTime();
                                long next = nextSample.get();
                                if ((next == 0L || now - next >= 0L)
                                    && nextSample.compareAndSet(next, now + TimeUnit.SECONDS.toNanos(1))) {
                                    progress.report(received.get(), size);
                                }
                            }
                        }
                    } finally {
                        close(connection);
                    }
                    return null;
                });
            }
            for (int i = 0; i < workers; i++) tasks.take().get();
            check(gate);
            return received.get() == size;
        } catch (IOException | java.util.concurrent.ExecutionException | RuntimeException failure) {
            return false;
        } finally {
            cancel();
            pool.shutdownNow();
            // Yazıcılar kapanmadan aynı dosyayla tek bağlantılı indirme başlatılmaz.
            while (!pool.awaitTermination(1, TimeUnit.SECONDS)) {
                cancel();
            }
        }
    }
}
