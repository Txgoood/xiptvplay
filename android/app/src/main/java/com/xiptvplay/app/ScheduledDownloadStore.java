package com.xiptvplay.app;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.net.ConnectivityManager;
import android.net.NetworkCapabilities;
import android.os.BatteryManager;
import org.json.JSONArray;
import org.json.JSONObject;
import java.util.Calendar;

public class ScheduledDownloadStore {
    static final String KEY = "scheduled_downloads_v1";
    static synchronized JSONArray read(Context context) {
        try { return new JSONArray(context.getSharedPreferences("xiptv_schedule",0).getString(KEY,"[]")); }
        catch(Exception e){return new JSONArray();}
    }
    static synchronized void save(Context context, JSONArray items) {
        context.getSharedPreferences("xiptv_schedule",0).edit().putString(KEY,items.toString()).apply();
        scheduleNext(context);
    }
    // New jobs are inserted only from the UI; worker status updates must never
    // recreate an item which the user already cancelled.
    static synchronized void upsert(Context context, JSONObject job) throws Exception {
        JSONArray old=read(context), next=new JSONArray();
        for(int i=0;i<old.length();i++){JSONObject row=old.optJSONObject(i);if(row!=null&&!row.optString("id").equals(job.optString("id")))next.put(row);}
        context.getSharedPreferences("xiptv_schedule_cancelled",0).edit().remove(job.getString("id")).commit();
        next.put(job);
        save(context,next);
    }
    static synchronized boolean updateIfPresent(Context context, JSONObject job) {
        String id=job.optString("id","");
        if(id.isEmpty() || isCancelled(context,id))return false;
        JSONArray old=read(context),next=new JSONArray();
        boolean found=false;
        for(int i=0;i<old.length();i++){
            JSONObject row=old.optJSONObject(i);
            if(row==null)continue;
            if(id.equals(row.optString("id"))){
                if("cancelled".equals(row.optString("status")))return false;
                next.put(job);found=true;
            } else next.put(row);
        }
        if(!found)return false;
        save(context,next);
        return true;
    }
    static boolean isCancelled(Context context,String id){
        return context.getSharedPreferences("xiptv_schedule_cancelled",0).getBoolean(id,false);
    }
    static synchronized void remove(Context context,String id) {
        // The marker outlives the worker's local JSONObject. Even an in-flight
        // status update cannot bring a cancelled job back into the list.
        context.getSharedPreferences("xiptv_schedule_cancelled",0).edit().putBoolean(id,true).commit();
        JSONArray old=read(context), next=new JSONArray();
        for(int i=0;i<old.length();i++){JSONObject row=old.optJSONObject(i);if(row!=null&&!row.optString("id").equals(id))next.put(row);}
        save(context,next);
    }
    static long nextWindowStart(JSONObject job,long now){
        if(!"night".equals(job.optString("mode")))return Math.max(now,job.optLong("startAt",now));
        Calendar c=Calendar.getInstance();c.setTimeInMillis(now);
        int from=job.optInt("fromMinute",120),to=job.optInt("toMinute",420);
        int minute=c.get(Calendar.HOUR_OF_DAY)*60+c.get(Calendar.MINUTE);
        boolean overnight=from>to;
        boolean inside=overnight?(minute>=from||minute<to):(minute>=from&&minute<to);
        if(inside)return now;
        c.set(Calendar.HOUR_OF_DAY,from/60);c.set(Calendar.MINUTE,from%60);c.set(Calendar.SECOND,0);c.set(Calendar.MILLISECOND,0);
        if(c.getTimeInMillis()<=now)c.add(Calendar.DAY_OF_YEAR,1);
        return c.getTimeInMillis();
    }
    static boolean inWindow(JSONObject job,long now){
        if(!"night".equals(job.optString("mode")))return now>=job.optLong("startAt",0);
        Calendar c=Calendar.getInstance();c.setTimeInMillis(now);
        int minute=c.get(Calendar.HOUR_OF_DAY)*60+c.get(Calendar.MINUTE);
        int from=job.optInt("fromMinute",120),to=job.optInt("toMinute",420);
        return from>to?(minute>=from||minute<to):(minute>=from&&minute<to);
    }
    static boolean conditions(Context ctx,JSONObject job){
        if(job.optBoolean("chargingOnly",false)){
            BatteryManager b=(BatteryManager)ctx.getSystemService(Context.BATTERY_SERVICE);
            if(b==null||!b.isCharging())return false;
        }
        if(job.optBoolean("wifiOnly",true)){
            ConnectivityManager cm=(ConnectivityManager)ctx.getSystemService(Context.CONNECTIVITY_SERVICE);
            if(cm==null)return false;
            NetworkCapabilities nc=cm.getNetworkCapabilities(cm.getActiveNetwork());
            if(nc==null||!nc.hasTransport(NetworkCapabilities.TRANSPORT_WIFI))return false;
        }
        return true;
    }
    static synchronized void scheduleNext(Context context){
        AlarmManager mgr=(AlarmManager)context.getSystemService(Context.ALARM_SERVICE);
        if(mgr==null)return;
        Intent intent=new Intent(context,ScheduledDownloadReceiver.class);
        intent.setAction("com.xiptvplay.app.RUN_SCHEDULE");
        PendingIntent pending=PendingIntent.getBroadcast(context,73125,intent,PendingIntent.FLAG_UPDATE_CURRENT|PendingIntent.FLAG_IMMUTABLE);
        mgr.cancel(pending);
        JSONArray jobs=read(context);
        long now=System.currentTimeMillis(), next=Long.MAX_VALUE;
        for(int i=0;i<jobs.length();i++){
            JSONObject job=jobs.optJSONObject(i);if(job==null)continue;
            String status=job.optString("status");
            if("completed".equals(status)||"cancelled".equals(status))continue;
            if("error".equals(status))continue; // errors require manual retry
            long candidate=nextWindowStart(job,now);
            candidate=Math.max(candidate,job.optLong("retryAt",0));
            if(candidate<=now)candidate=now+60000L;
            next=Math.min(next,candidate);
        }
        if(next==Long.MAX_VALUE)return;
        // Inexact alarms need no SCHEDULE_EXACT_ALARM permission.
        mgr.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP,next,pending);
    }
}
