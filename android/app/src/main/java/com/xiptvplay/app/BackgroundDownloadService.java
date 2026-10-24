package com.xiptvplay.app;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import androidx.core.app.NotificationCompat;
import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayDeque;
import java.util.Queue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.atomic.AtomicBoolean;

public class BackgroundDownloadService extends Service {
    public static final String ACTION_ENQUEUE = "com.xiptvplay.app.DOWNLOAD_ENQUEUE";
    public static final String ACTION_CANCEL_ALL = "com.xiptvplay.app.DOWNLOAD_CANCEL_ALL";
    public static final String ACTION_CANCEL_ONE = "com.xiptvplay.app.DOWNLOAD_CANCEL_ONE";
    public static final String ACTION_EVENT = "com.xiptvplay.app.DOWNLOAD_EVENT";
    public static final String EXTRA_ID = "id";
    public static final String EXTRA_URL = "url";
    public static final String EXTRA_PATH = "path";
    public static final String EXTRA_TITLE = "title";
    private static final String CHANNEL_ID = "xiptv_downloads";
    private static final int NOTIFICATION_ID = 7304;
    private final Queue<Task> queue = new ArrayDeque<>();
    private final ExecutorService worker = Executors.newSingleThreadExecutor();
    private final AtomicBoolean cancelAll = new AtomicBoolean(false);
    private final AtomicBoolean cancelCurrent = new AtomicBoolean(false);
    private volatile HttpURLConnection activeConnection;
    private volatile Task activeTask;
    private volatile boolean working = false;
    private static class Task {
        final String id, url, path, title;
        Task(String id, String url, String path, String title) {
            this.id=id; this.url=url; this.path=path; this.title=title;
        }
    }

    @Override public void onCreate() {
        super.onCreate();
        createChannel();
    }
    @Override public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) { stopSelf(); return START_NOT_STICKY; }
        String action = intent.getAction();
        if (ACTION_CANCEL_ALL.equals(action)) {
            cancelAll.set(true);
            HttpURLConnection c = activeConnection;
            if (c != null) c.disconnect();
            synchronized (queue) { queue.clear(); }
            emit("cancelAll", null, null, 0, 0, null);
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_CANCEL_ONE.equals(action)) {
            String id = intent.getStringExtra(EXTRA_ID);
            synchronized (queue) { queue.removeIf(t -> t.id.equals(id)); }
            Task active = activeTask;
            if (active != null && active.id.equals(id)) {
                cancelCurrent.set(true);
                HttpURLConnection c = activeConnection;
                if (c != null) c.disconnect();
            }
            return START_NOT_STICKY;
        }
        if (ACTION_ENQUEUE.equals(action)) {
            String id=intent.getStringExtra(EXTRA_ID), url=intent.getStringExtra(EXTRA_URL);
            String path=intent.getStringExtra(EXTRA_PATH), title=intent.getStringExtra(EXTRA_TITLE);
            if (id != null && url != null && path != null) {
                synchronized (queue) { queue.add(new Task(id,url,path,title == null ? "İndiriliyor" : title)); }
                startForeground(NOTIFICATION_ID, buildNotification("İndirme kuyruğa eklendi", 0, false));
                if (!working) {
                    working = true;
                    worker.execute(this::runQueue);
                }
            }
        }
        return START_NOT_STICKY;
    }
    private void runQueue() {
        try {
            while (!cancelAll.get()) {
                Task task;
                synchronized (queue) { task=queue.poll(); }
                if (task == null) break;
                // Reset cancellation before publishing the active task so a cancel action
                // cannot be overwritten by a late reset.
                cancelCurrent.set(false);
                activeTask=task;
                download(task);
                activeTask=null;
                cancelCurrent.set(false);
            }
        } finally {
            working=false;
            if (cancelAll.get() || queue.isEmpty()) {
                stopForeground(true);
                stopSelf();
            }
        }
    }
    private void download(Task task) {
        File target=null;
        InputStream in=null;
        BufferedOutputStream out=null;
        try {
            File base = new File(getFilesDir(), "downloads");
            if (!base.exists() && !base.mkdirs()) throw new Exception("İndirme klasörü oluşturulamadı.");
            String name = new File(task.path).getName();
            target = new File(base, name);
            HttpURLConnection c = (HttpURLConnection)new URL(task.url).openConnection();
            activeConnection=c;
            c.setConnectTimeout(45000);
            c.setReadTimeout(120000);
            c.setInstanceFollowRedirects(true);
            c.setRequestProperty("Accept-Encoding","identity");
            c.connect();
            int code=c.getResponseCode();
            if (code < 200 || code >= 300) throw new Exception("HTTP " + code);
            long total=c.getContentLengthLong(), received=0, last=0;
            in=new BufferedInputStream(c.getInputStream(), 256*1024);
            out=new BufferedOutputStream(new FileOutputStream(target,false),256*1024);
            byte[] buffer=new byte[256*1024]; int n;
            while ((n=in.read(buffer)) != -1) {
                if (cancelAll.get() || cancelCurrent.get()) throw new InterruptedException("İndirme iptal edildi.");
                out.write(buffer,0,n); received+=n;
                long now=System.currentTimeMillis();
                if (now-last >= 500) {
                    int pct=total>0 ? (int)Math.min(100,(received*100)/total) : 0;
                    updateNotification(task.title, pct, total>0);
                    emit("progress",task.id,null,received,total,null);
                    last=now;
                }
            }
            out.flush(); out.close(); out=null; in.close(); in=null;
            if (target.length() <= 0) throw new Exception("İndirilen dosya boş.");
            emit("done",task.id,"downloads/"+name,target.length(),total,"file://"+target.getAbsolutePath());
        } catch (Exception e) {
            if (target != null && target.exists()) target.delete();
            if (!cancelAll.get() && !cancelCurrent.get()) emit("error",task.id,null,0,0,e.getMessage() == null ? "İndirme başarısız" : e.getMessage());
        } finally {
            try { if (out != null) out.close(); } catch(Exception ignored) {}
            try { if (in != null) in.close(); } catch(Exception ignored) {}
            HttpURLConnection c=activeConnection; activeConnection=null;
            if (c != null) c.disconnect();
        }
    }
    private void emit(String type, String id, String path, long bytes, long total, String extra) {
        Intent event=new Intent(ACTION_EVENT);
        event.setPackage(getPackageName());
        event.putExtra("type",type);
        if(id!=null) event.putExtra("id",id);
        if(path!=null) event.putExtra("path",path);
        event.putExtra("bytes",bytes); event.putExtra("total",total);
        if(extra!=null) event.putExtra("extra",extra);
        sendBroadcast(event);
    }
    private void createChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            NotificationChannel channel=new NotificationChannel(CHANNEL_ID,"İndirmeler",NotificationManager.IMPORTANCE_LOW);
            channel.setDescription("XIPTV Play indirme durumu");
            getSystemService(NotificationManager.class).createNotificationChannel(channel);
        }
    }
    private Notification buildNotification(String text, int progress, boolean determinate) {
        Intent open=new Intent(this, MainActivity.class);
        open.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        PendingIntent openPending=PendingIntent.getActivity(this,1,open,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Intent cancel=new Intent(this, BackgroundDownloadService.class).setAction(ACTION_CANCEL_ALL);
        PendingIntent cancelPending=PendingIntent.getService(this,2,cancel,PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        NotificationCompat.Builder b=new NotificationCompat.Builder(this,CHANNEL_ID)
            .setSmallIcon(getApplicationInfo().icon)
            .setContentTitle("XIPTV Play")
            .setContentText(text)
            .setContentIntent(openPending).setOngoing(true).setOnlyAlertOnce(true)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel,"Tüm indirmeleri iptal et",cancelPending)
            .setPriority(NotificationCompat.PRIORITY_LOW);
        if (determinate) b.setProgress(100,Math.max(0,Math.min(100,progress)),false);
        else b.setProgress(0,0,true);
        return b.build();
    }
    private void updateNotification(String title, int progress, boolean determinate) {
        ((NotificationManager)getSystemService(NOTIFICATION_SERVICE)).notify(NOTIFICATION_ID,buildNotification(title+" • "+(determinate?progress+"%":"indiriliyor"),progress,determinate));
    }
    @Override public void onTaskRemoved(Intent rootIntent) {
        cancelAll.set(true);
        HttpURLConnection c=activeConnection; if(c!=null)c.disconnect();
        synchronized(queue){queue.clear();}
        stopForeground(true);
        stopSelf();
        super.onTaskRemoved(rootIntent);
    }
    @Override public void onDestroy() {
        cancelAll.set(true);
        HttpURLConnection c=activeConnection; if(c!=null)c.disconnect();
        worker.shutdownNow();
        super.onDestroy();
    }
    @Override public IBinder onBind(Intent intent) { return null; }
}