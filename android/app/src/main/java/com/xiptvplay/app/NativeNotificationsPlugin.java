package com.xiptvplay.app;

import android.Manifest;
import android.content.pm.PackageManager;
import android.os.Build;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.content.ContextCompat;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

/**
 * Handles Android 13+ POST_NOTIFICATIONS permission checks and requests.
 * Download progress notifications are managed exclusively by DownloadForegroundService
 * to avoid duplicate or competing updaters.
 */
@CapacitorPlugin(
    name = "NativeNotifications",
    permissions = {
        @Permission(
            strings = { Manifest.permission.POST_NOTIFICATIONS },
            alias = "notifications"
        )
    }
)
public class NativeNotificationsPlugin extends Plugin {

    @PluginMethod
    public void checkPermissions(PluginCall call) {
        JSObject ret = new JSObject();
        boolean granted = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            granted = ContextCompat.checkSelfPermission(getContext(), Manifest.permission.POST_NOTIFICATIONS)
                    == PackageManager.PERMISSION_GRANTED;
        } else {
            granted = NotificationManagerCompat.from(getContext()).areNotificationsEnabled();
        }
        ret.put("display", granted ? "granted" : "denied");
        call.resolve(ret);
    }

    @PluginMethod
    public void requestPermissions(PluginCall call) {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            requestPermissionForAlias("notifications", call, "permissionCallback");
        } else {
            checkPermissions(call);
        }
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        checkPermissions(call);
    }
}
