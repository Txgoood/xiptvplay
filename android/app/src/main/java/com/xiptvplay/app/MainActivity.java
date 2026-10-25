package com.xiptvplay.app;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeMediaPlayerPlugin.class);
        registerPlugin(NativeDownloadPlugin.class);
        registerPlugin(NativeNotificationsPlugin.class);
        registerPlugin(DownloadFilesPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
