package com.xiptvplay.app;

import android.content.Intent;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeMediaPlayer")
public class NativeMediaPlayerPlugin extends Plugin {
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
        intent.putExtra("nextUrl", call.getString("nextUrl"));
        intent.putExtra("nextTitle", call.getString("nextTitle"));
        intent.putExtra("nextNextUrl", call.getString("nextNextUrl"));
        intent.putExtra("nextNextTitle", call.getString("nextNextTitle"));
        try {
            getActivity().startActivity(intent);
            JSObject result = new JSObject();
            result.put("started", true);
            call.resolve(result);
        } catch (Exception error) {
            call.reject("Yerel oynatıcı başlatılamadı: " + error.getMessage(), error);
        }
    }
}
