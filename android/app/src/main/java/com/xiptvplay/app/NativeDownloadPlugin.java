package com.xiptvplay.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeDownload")
public class NativeDownloadPlugin extends Plugin {
    private BroadcastReceiver receiver;

    @Override
    public void load() {
        receiver = new BroadcastReceiver() {
            @Override public void onReceive(Context context, Intent intent) {
                JSObject event = new JSObject();
                String type = intent.getStringExtra("type");
                if (type != null) event.put("type", type);
                String id = intent.getStringExtra("id");
                if (id != null) event.put("id", id);
                String path = intent.getStringExtra("path");
                if (path != null) event.put("path", path);
                event.put("bytes", intent.getLongExtra("bytes", 0));
                event.put("contentLength", intent.getLongExtra("total", 0));
                String extra = intent.getStringExtra("extra");
                if (extra != null) event.put("extra", extra);
                notifyListeners("backgroundDownloadEvent", event);
            }
        };
        IntentFilter filter = new IntentFilter(BackgroundDownloadService.ACTION_EVENT);
        if (Build.VERSION.SDK_INT >= 33) {
            getContext().registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            getContext().registerReceiver(receiver, filter);
        }
    }

    @PluginMethod
    public void enqueue(PluginCall call) {
        String id=call.getString("id"), url=call.getString("url"), path=call.getString("path");
        String title=call.getString("title", "İndiriliyor");
        if (id == null || url == null || path == null) {
            call.reject("İndirme bilgileri eksik.");
            return;
        }
        Intent intent=new Intent(getContext(), BackgroundDownloadService.class);
        intent.setAction(BackgroundDownloadService.ACTION_ENQUEUE);
        intent.putExtra(BackgroundDownloadService.EXTRA_ID,id);
        intent.putExtra(BackgroundDownloadService.EXTRA_URL,url);
        intent.putExtra(BackgroundDownloadService.EXTRA_PATH,path);
        intent.putExtra(BackgroundDownloadService.EXTRA_TITLE,title);
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) getContext().startForegroundService(intent);
            else getContext().startService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("Arka plan indirmesi başlatılamadı: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        String id=call.getString("id");
        Intent intent=new Intent(getContext(), BackgroundDownloadService.class);
        intent.setAction(BackgroundDownloadService.ACTION_CANCEL_ONE);
        intent.putExtra(BackgroundDownloadService.EXTRA_ID,id);
        try {
            getContext().startService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("İndirme iptal edilemedi: " + e.getMessage());
        }
    }

    @PluginMethod
    public void cancelAll(PluginCall call) {
        Intent intent=new Intent(getContext(), BackgroundDownloadService.class);
        intent.setAction(BackgroundDownloadService.ACTION_CANCEL_ALL);
        try {
            getContext().startService(intent);
            call.resolve();
        } catch (Exception e) {
            call.reject("İndirmeler durdurulamadı: " + e.getMessage());
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (receiver != null) {
            try { getContext().unregisterReceiver(receiver); } catch (Exception ignored) {}
            receiver = null;
        }
        super.handleOnDestroy();
    }
}