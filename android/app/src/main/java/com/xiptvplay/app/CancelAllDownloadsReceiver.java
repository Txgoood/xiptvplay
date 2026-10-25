package com.xiptvplay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

public class CancelAllDownloadsReceiver extends BroadcastReceiver {
    public static final String CANCEL_ITEM_ACTION = "com.xiptvplay.app.CANCEL_ITEM_ACTION";
    public static final String CANCEL_ITEM_EVENT = "com.xiptvplay.app.CANCEL_ITEM_DOWNLOAD";

    @Override public void onReceive(Context context, Intent intent) {
        if (intent != null && CANCEL_ITEM_ACTION.equals(intent.getAction())) {
            String id = intent.getStringExtra("id");
            if (id == null || id.isEmpty()) return;
            // Stop an active native transfer immediately even when the JS WebView is paused.
            NativeDownloadPlugin.cancelDownloadById(id);
            Intent request = new Intent(CANCEL_ITEM_EVENT);
            request.setPackage(context.getPackageName());
            request.putExtra("id", id);
            context.sendBroadcast(request);
            return;
        }
        Intent request = new Intent("com.xiptvplay.app.CANCEL_ALL_DOWNLOADS");
        request.setPackage(context.getPackageName());
        context.sendBroadcast(request);
    }
}
