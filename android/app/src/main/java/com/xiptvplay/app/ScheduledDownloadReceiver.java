package com.xiptvplay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.os.Build;

public class ScheduledDownloadReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent){
        String action=intent==null?"":intent.getAction();
        if(Intent.ACTION_BOOT_COMPLETED.equals(action)||Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)){
            ScheduledDownloadStore.scheduleNext(context);
            return;
        }
        Intent start=new Intent(context,ScheduledDownloadService.class);
        try{
            if(Build.VERSION.SDK_INT>=26)context.startForegroundService(start);
            else context.startService(start);
        }catch(Exception ignored){
            // Android may limit background starts; restore the schedule for a later opportunity.
            context.getSharedPreferences("xiptv_schedule",0).edit()
                .putLong("retry_after",System.currentTimeMillis()+15*60000L).apply();
            ScheduledDownloadStore.scheduleNext(context);
        }
    }
}
