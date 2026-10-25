package com.xiptvplay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class CancelAllDownloadsReceiver extends BroadcastReceiver {
    @Override public void onReceive(Context context, Intent intent) {
        Intent request = new Intent("com.xiptvplay.app.CANCEL_ALL_DOWNLOADS");
        request.setPackage(context.getPackageName());
        context.sendBroadcast(request);
    }
}
