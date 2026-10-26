package com.xiptvplay.app;

import android.app.Activity;
import android.app.PendingIntent;
import android.content.Intent;
import androidx.activity.result.ActivityResult;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.IntentSenderRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.auth.api.identity.AuthorizationRequest;
import com.google.android.gms.auth.api.identity.AuthorizationResult;
import com.google.android.gms.auth.api.identity.Identity;
import com.google.android.gms.common.api.Scope;
import java.util.Arrays;
import java.util.List;

@CapacitorPlugin(name="XiptvGoogleDrive")
public class GoogleDriveAuthPlugin extends Plugin {
    private static final String APPDATA="https://www.googleapis.com/auth/drive.appdata";
    private ActivityResultLauncher<IntentSenderRequest> authorizationLauncher;
    private PluginCall pending;

    @Override public void load() {
        authorizationLauncher=bridge.registerForActivityResult(
            new ActivityResultContracts.StartIntentSenderForResult(),
            result -> {
                PluginCall call=pending;
                pending=null;
                if(call==null)return;
                if(result.getResultCode()!=Activity.RESULT_OK || result.getData()==null) {
                    call.reject("Google bağlantısı iptal edildi.");return;
                }
                try {
                    AuthorizationResult auth=Identity.getAuthorizationClient(getActivity())
                        .getAuthorizationResultFromIntent(result.getData());
                    resolveToken(call,auth);
                }catch(Exception e){call.reject("Google yetkilendirme tamamlanamadı: "+e.getMessage());}
            }
        );
    }
    @PluginMethod public void authorize(PluginCall call) {
        if(pending!=null){call.reject("Google bağlantısı zaten açılıyor.");return;}
        List<Scope> scopes=Arrays.asList(new Scope(APPDATA),new Scope("openid"),new Scope("email"));
        AuthorizationRequest request=AuthorizationRequest.builder().setRequestedScopes(scopes).build();
        Identity.getAuthorizationClient(getActivity()).authorize(request)
            .addOnSuccessListener(result -> {
                if(result.hasResolution()){
                    PendingIntent pendingIntent=result.getPendingIntent();
                    if(pendingIntent==null){call.reject("Google izin ekranı açılamadı.");return;}
                    try {
                        pending=call;
                        authorizationLauncher.launch(new IntentSenderRequest.Builder(pendingIntent.getIntentSender()).build());
                    }catch(Exception e){pending=null;call.reject("Google giriş ekranı açılamadı: "+e.getMessage());}
                }else resolveToken(call,result);
            })
            .addOnFailureListener(e -> call.reject("Google bağlantısı kurulamadı: "+e.getMessage()));
    }
    private void resolveToken(PluginCall call,AuthorizationResult result){
        String token=result.getAccessToken();
        if(token==null || token.isEmpty()){call.reject("Google erişim izni alınamadı.");return;}
        JSObject data=new JSObject();
        data.put("accessToken",token);
        data.put("grantedScopes",result.getGrantedScopes());
        // Google API /userinfo identifies which account owns this token.
        call.resolve(data);
    }
    @PluginMethod public void disconnect(PluginCall call) {
        // Disconnect only removes the in-memory session on the JS side.
        // Revoking Google-wide scopes must be a separate deliberate operation.
        call.resolve();
    }
}
