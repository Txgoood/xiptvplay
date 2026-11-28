package com.xiptvplay.app;

import android.os.Bundle;
import android.app.UiModeManager;
import android.content.res.Configuration;
import android.view.KeyEvent;
import android.view.WindowInsets;
import android.os.Build;
import android.webkit.WebView;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private boolean tvMode;
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeCastPlugin.class);
        registerPlugin(NativeMediaPlayerPlugin.class);
        registerPlugin(NativeDownloadPlugin.class);
        registerPlugin(NativeNotificationsPlugin.class);
        registerPlugin(DownloadFilesPlugin.class);
        registerPlugin(DownloadSchedulerPlugin.class);
        registerPlugin(GoogleDriveAuthPlugin.class);
        super.onCreate(savedInstanceState);
        UiModeManager manager = (UiModeManager) getSystemService(UI_MODE_SERVICE);
        tvMode = manager != null && manager.getCurrentModeType() == Configuration.UI_MODE_TYPE_TELEVISION;
        if (tvMode && getBridge() != null) {
            WebView web = getBridge().getWebView();
            web.getSettings().setUserAgentString(web.getSettings().getUserAgentString() + " XIPTV-TV");
            web.requestFocus();
        }
    }
    @Override
    public boolean dispatchKeyEvent(KeyEvent event) {
        if (!tvMode || event.getKeyCode() != KeyEvent.KEYCODE_BACK || getBridge() == null) {
            return super.dispatchKeyEvent(event);
        }
        if (Build.VERSION.SDK_INT >= 30) {
            WindowInsets insets = getWindow().getDecorView().getRootWindowInsets();
            if (insets != null && insets.isVisible(WindowInsets.Type.ime())) return super.dispatchKeyEvent(event);
        }
        if (event.getAction() == KeyEvent.ACTION_UP && !event.isCanceled()) {
            if (event.getEventTime() - event.getDownTime() >= 2000) {
                moveTaskToBack(true);
            } else {
                getBridge().getWebView().evaluateJavascript("window.dispatchEvent(new Event('xiptv-tv-back'))", null);
            }
        }
        return true;
    }
}
