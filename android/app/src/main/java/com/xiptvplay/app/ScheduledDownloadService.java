package com.xiptvplay.app;

import android.app.Service;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.content.pm.ServiceInfo;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class ScheduledDownloadService extends Service {
    private static final String CHANNEL="xiptv_scheduled_downloads";
    private static final int NOTICE_ID=7337;
    private static final AtomicBoolean busy=new AtomicBoolean(false);
    private static final java.util.concurrent.ConcurrentHashMap<String, HttpURLConnection> activeConnections = new java.util.concurrent.ConcurrentHashMap<>();
    private static final java.util.concurrent.ConcurrentHashMap<String, Thread> activeThreads = new java.util.concurrent.ConcurrentHashMap<>();
    static void cancelActive(String id) {
        HttpURLConnection connection = activeConnections.remove(id);
        if(connection!=null)connection.disconnect();
        Thread worker = activeThreads.get(id);
        if(worker!=null)worker.interrupt();
    }
    static void deletePartial(Context context,String id) {
        String safe=id.replaceAll("[^a-zA-Z0-9_-]","_");
        File base=new File(context.getFilesDir(),"downloads");
        for(String ext:new String[]{"mp4","mkv","ts"}){
            File partial=new File(base,"scheduled_"+safe+"."+ext);
            if(partial.isFile())partial.delete();
        }
    }
    private PowerManager.WakeLock lock;
    private volatile boolean stopped=false;
    @Override public void onCreate(){
        super.onCreate();
        NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
        if(nm!=null&&Build.VERSION.SDK_INT>=26)nm.createNotificationChannel(new NotificationChannel(CHANNEL,"Zamanlanmış indirmeler",NotificationManager.IMPORTANCE_LOW));
    }
    private Notification notice(String name,int percent,boolean progress){
        return new NotificationCompat.Builder(this,CHANNEL)
            .setSmallIcon(android.R.drawable.stat_sys_download)
            .setContentTitle("XIPTV Play · Gece İndirmesi")
            .setContentText(name)
            .setProgress(100,Math.max(0,Math.min(100,percent)),!progress)
            .setOngoing(true).setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW).build();
    }
    @Override public int onStartCommand(Intent intent,int flags,int startId){
        try {
            Notification n=notice("Planlanan işler kontrol ediliyor",0,false);
            if(Build.VERSION.SDK_INT>=29)ServiceCompat.startForeground(this,NOTICE_ID,n,ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC);
            else startForeground(NOTICE_ID,n);
        }catch(Exception e){stopSelf();return START_NOT_STICKY;}
        if(!busy.compareAndSet(false,true))return START_NOT_STICKY;
        stopped=false;
        new Thread(()->{
            try{processJobs();}
            finally{
                busy.set(false);
                ScheduledDownloadStore.scheduleNext(this);
                stopForeground(STOP_FOREGROUND_REMOVE);
                stopSelf();
            }
        },"ScheduledIPTVDownloads").start();
        return START_NOT_STICKY;
    }
    private boolean persist(JSONObject job) { return ScheduledDownloadStore.updateIfPresent(this,job); }
    private boolean cancelled(String id) { return ScheduledDownloadStore.isCancelled(this,id) || find(id)==null; }
    private void processJobs(){
        try{
            PowerManager pm=(PowerManager)getSystemService(POWER_SERVICE);
            if(pm!=null){lock=pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK,"XIPTV:ScheduledDownload");lock.acquire(2*60*60*1000L);}
            JSONArray jobs=ScheduledDownloadStore.read(this);
            for(int i=0;i<jobs.length()&&!stopped;i++){
                JSONObject job=jobs.optJSONObject(i);if(job==null)continue;
                String status=job.optString("status");
                if("completed".equals(status)||"cancelled".equals(status)||"error".equals(status))continue;
                long now=System.currentTimeMillis();
                if(job.optLong("retryAt",0)>now||!ScheduledDownloadStore.inWindow(job,now))continue;
                if(!ScheduledDownloadStore.conditions(this,job)){
                    job.put("retryAt",now+15*60000L);
                    persist(job);continue;
                }
                try{download(job);}catch(Exception e){
                    if(cancelled(job.optString("id")))continue;
                    if("paused".equals(job.optString("status")))continue;
                    int retries=job.optInt("retryCount",0)+1;
                    job.put("retryCount",retries);
                    job.put("status",retries>=3?"error":"paused");
                    job.put("retryAt",System.currentTimeMillis()+15*60000L);
                    job.put("error",String.valueOf(e.getMessage()));
                    persist(job);
                }
            }
        }catch(Exception ignored){}
        finally{try{if(lock!=null&&lock.isHeld())lock.release();}catch(Exception ignored){}}
    }
    private void download(JSONObject job)throws Exception{
        String id=job.getString("id"),title=job.optString("title","İçerik");
        if(cancelled(id))return;
        activeThreads.put(id,Thread.currentThread());
        String url=job.getString("url");
        if(!url.startsWith("http://")&&!url.startsWith("https://"))throw new IOException("Yalnızca HTTP/HTTPS adresleri desteklenir.");
        File base=new File(getFilesDir(),"downloads");if(!base.exists()&&!base.mkdirs())throw new IOException("İndirme klasörü oluşturulamadı");
        String name=id.replaceAll("[^a-zA-Z0-9_-]","_");
        String ext="mp4";
        String clean=url.split("\\?")[0].toLowerCase(java.util.Locale.ROOT);
        if(clean.endsWith(".mkv"))ext="mkv";
        else if(clean.endsWith(".ts"))ext="ts";
        File target=new File(base,"scheduled_"+name+"."+ext);
        long saved=target.isFile()?target.length():0;
        HttpURLConnection connection=null;
        try{
            connection=(HttpURLConnection)new URL(url).openConnection();
            activeConnections.put(id,connection);
            if(cancelled(id))return;
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(30000);
            connection.setRequestProperty("Accept-Encoding","identity");
            if(saved>0)connection.setRequestProperty("Range","bytes="+saved+"-");
            int code=connection.getResponseCode();
            if(code!=200&&code!=206)throw new IOException("Sunucu HTTP "+code);
            boolean append=saved>0&&code==206;
            if(!append)saved=0;
            long total=connection.getContentLengthLong();
            if(total>0&&append)total+=saved;
            long free=base.getUsableSpace();
            if(free<300L*1024*1024||(total>0&&free<Math.max(0,total-saved)+150L*1024*1024))throw new IOException("Yetersiz boş depolama alanı");
            job.put("status","downloading");job.put("error","");
            if(!persist(job))return;
            NotificationManager nm=(NotificationManager)getSystemService(NOTIFICATION_SERVICE);
            long read=saved,lastUpdate=0;
            try(InputStream input=new BufferedInputStream(connection.getInputStream(),128*1024);
                FileOutputStream output=new FileOutputStream(target,append)){
                byte[] buffer=new byte[128*1024];
                int count;
                while((count=input.read(buffer))!=-1){
                    if(stopped || Thread.currentThread().isInterrupted() || cancelled(id))break;
                    if(!ScheduledDownloadStore.inWindow(job,System.currentTimeMillis())||!ScheduledDownloadStore.conditions(this,job))break;
                    output.write(buffer,0,count);
                    read+=count;
                    long now=System.currentTimeMillis();
                    if(now-lastUpdate>=1800){
                        job.put("bytes",read);job.put("total",total);
                        if(!persist(job))break;
                        lastUpdate=now;
                        int percent=total>0?(int)Math.min(100,read*100/total):0;
                        if(nm!=null)nm.notify(NOTICE_ID,notice(title+" · "+percent+"%",percent,total>0));
                    }
                }
                output.flush();
                job.put("bytes",read);job.put("total",total);
                if(!stopped && !Thread.currentThread().isInterrupted() && !cancelled(id)
                    && ScheduledDownloadStore.inWindow(job,System.currentTimeMillis())
                    && ScheduledDownloadStore.conditions(this,job)
                    && (total<=0||read>=total) && find(id)!=null){
                    job.put("status","completed");job.put("retryCount",0);job.put("path","downloads/"+target.getName());
                }else{
                    job.put("status","paused");
                    job.put("retryAt",System.currentTimeMillis()+15*60000L);
                }
                if(!cancelled(id))persist(job);
            }
        }finally{
            activeConnections.remove(id);
            if(connection!=null)connection.disconnect();
            activeThreads.remove(id);
            if(cancelled(id))deletePartial(this,id);
            // An interrupt used to cancel this task must not poison the next task.
            Thread.interrupted();
        }
    }
    private JSONObject find(String id){
        JSONArray jobs=ScheduledDownloadStore.read(this);
        for(int i=0;i<jobs.length();i++){JSONObject j=jobs.optJSONObject(i);if(j!=null&&id.equals(j.optString("id")))return j;}
        return null;
    }
    @Override public void onDestroy(){stopped=true;super.onDestroy();}
    @Override public IBinder onBind(Intent intent){return null;}
}
