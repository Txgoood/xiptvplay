package com.xiptvplay.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final int NOTIFICATION_PERMISSION_REQUEST = 7305;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(NativeMediaPlayerPlugin.class);
        registerPlugin(NativeDownloadPlugin.class);
        super.onCreate(savedInstanceState);

        // Android 13+ requires the user to grant notification permission at runtime.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU
                && checkSelfPermission(Manifest.permission.POST_NOTIFICATIONS)
                != PackageManager.PERMISSION_GRANTED) {
            requestPermissions(
                    new String[]{Manifest.permission.POST_NOTIFICATIONS},
                    NOTIFICATION_PERMISSION_REQUEST
            );
        }
    }
}
