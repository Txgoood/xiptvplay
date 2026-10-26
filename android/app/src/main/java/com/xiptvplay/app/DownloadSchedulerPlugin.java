package com.xiptvplay.app;

import android.content.Intent;
import android.os.Build;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import org.json.JSONArray;
import org.json.JSONObject;

@CapacitorPlugin(name="DownloadScheduler")
public class DownloadSchedulerPlugin extends Plugin {
    @PluginMethod public void schedule(PluginCall call){
        try {
            JSONObject item=new JSONObject(call.getData().toString());
            String url=item.optString("url");
            if(item.optString("id").isEmpty()||(!url.startsWith("https://")&&!url.startsWith("http://"))){
                call.reject("İndirme görevi veya URL geçersiz");return;
            }
            item.put("status","scheduled");
            item.put("bytes",0L);
            item.put("total",0L);
            ScheduledDownloadStore.upsert(getContext(),item);
            call.resolve();
        }catch(Exception e){call.reject("Zamanlama kaydedilemedi: "+e.getMessage());}
    }
    @PluginMethod public void list(PluginCall call){
        JSObject response=new JSObject();
        response.put("items",ScheduledDownloadStore.read(getContext()));
        call.resolve(response);
    }
    @PluginMethod public void cancel(PluginCall call){
        String id=call.getString("id","");
        // Mark removed first so the worker cannot reinsert it, then interrupt
        // the transfer and close its socket before cleaning up partial files.
        ScheduledDownloadStore.remove(getContext(),id);
        ScheduledDownloadService.cancelActive(id);
        ScheduledDownloadService.deletePartial(getContext(),id);
        call.resolve();
    }
    @PluginMethod public void checkNow(PluginCall call){
        try{
            Intent intent=new Intent(getContext(),ScheduledDownloadService.class);
            if(Build.VERSION.SDK_INT>=26)getContext().startForegroundService(intent);
            else getContext().startService(intent);
            call.resolve();
        }catch(Exception e){call.reject("İndirme kontrolü başlatılamadı: "+e.getMessage());}
    }
}
