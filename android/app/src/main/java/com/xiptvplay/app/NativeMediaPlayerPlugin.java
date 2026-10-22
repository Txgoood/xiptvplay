package com.xiptvplay.app;

import android.app.Activity;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeMediaPlayer")
public class NativeMediaPlayerPlugin extends Plugin {
    @PluginMethod
    public void stop(PluginCall call) {
        NativePlayerActivity.closeActivePlayer();
        call.resolve();
    }

    @PluginMethod
    public void play(PluginCall call) {
        String url = call.getString("url");
        if (url == null || url.trim().isEmpty()) {
            call.reject("Video adresi boş.");
            return;
        }

        Intent intent = new Intent(getContext(), NativePlayerActivity.class);
        intent.putExtra("url", url);
        intent.putExtra("title", call.getString("title", "XIPTV Play"));
        intent.putExtra("bufferSeconds", Math.max(3, Math.min(45, call.getInt("bufferSeconds", 15))));
        intent.putExtra("nextUrl", call.getString("nextUrl"));
        intent.putExtra("nextTitle", call.getString("nextTitle"));
        intent.putExtra("nextNextUrl", call.getString("nextNextUrl"));
        intent.putExtra("nextNextTitle", call.getString("nextNextTitle"));
        try {
            startActivityForResult(call, intent, "handlePlayerResult");
        } catch (Exception error) {
            call.reject("Yerel oynatıcı başlatılamadı: " + error.getMessage(), error);
        }
    }

    @com.getcapacitor.annotation.ActivityCallback
    private void handlePlayerResult(PluginCall call, ActivityResult activityResult) {
        if (call == null) {
            return;
        }

        JSObject result = new JSObject();
        Intent data = activityResult == null ? null : activityResult.getData();
        boolean returnedToInline = activityResult != null
                && activityResult.getResultCode() == Activity.RESULT_OK
                && data != null
                && data.getBooleanExtra("returnedToInline", false);

        result.put("started", true);
        result.put("returnedToInline", returnedToInline);
        result.put("positionMs", returnedToInline ? data.getLongExtra("positionMs", 0L) : 0L);
        call.resolve(result);
    }
}
