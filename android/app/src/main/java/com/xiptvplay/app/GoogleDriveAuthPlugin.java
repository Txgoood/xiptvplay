package com.xiptvplay.app;

import android.app.Activity;
import android.accounts.Account;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import java.security.KeyStore;
import javax.crypto.KeyGenerator;
import javax.crypto.SecretKey;
import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import java.nio.charset.StandardCharsets;
import java.io.File;
import java.io.FileOutputStream;
import java.io.FileInputStream;
import java.io.ByteArrayOutputStream;
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
        boolean silent=Boolean.TRUE.equals(call.getBoolean("silent",false));
        AuthorizationRequest.Builder builder=AuthorizationRequest.builder().setRequestedScopes(scopes);
        String email=call.getString("email");
        if(silent){
            if(email==null || email.isEmpty()){call.reject("Google hesabına yeniden bağlan.");return;}
            builder.setAccount(new Account(email,"com.google"));
        }else builder.setPrompt(AuthorizationRequest.Prompt.SELECT_ACCOUNT);
        AuthorizationRequest request=builder.build();
        Identity.getAuthorizationClient(getActivity()).authorize(request)
            .addOnSuccessListener(result -> {
                if(result.hasResolution()){
                    if(silent){call.reject("Google izni yenilenmeli. Google ile Bağlan düğmesini kullan.");return;}
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
    private static final String ALIAS="xiptv_sync_secret_v1";
    private File secretFile(){return new File(getContext().getNoBackupFilesDir(),"drive-sync-secret");}
    private SecretKey secretKey() throws Exception {
        KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
        if(!store.containsAlias(ALIAS)){
            KeyGenerator generator=KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES,"AndroidKeyStore");
            generator.init(new KeyGenParameterSpec.Builder(ALIAS,KeyProperties.PURPOSE_ENCRYPT|KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            generator.generateKey();
        }
        return (SecretKey)store.getKey(ALIAS,null);
    }
    @PluginMethod public void saveSyncSecret(PluginCall call){
        try{
            String value=call.getString("value");
            if(value==null || value.length()>8192)throw new Exception();
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");cipher.init(Cipher.ENCRYPT_MODE,secretKey());
            String data=Base64.encodeToString(cipher.getIV(),Base64.NO_WRAP)+":"+Base64.encodeToString(cipher.doFinal(value.getBytes(StandardCharsets.UTF_8)),Base64.NO_WRAP);
            android.util.AtomicFile file=new android.util.AtomicFile(secretFile());
            FileOutputStream out=null;
            try{out=file.startWrite();out.write(data.getBytes(StandardCharsets.UTF_8));file.finishWrite(out);}
            catch(Exception e){if(out!=null)file.failWrite(out);throw e;}
            call.resolve();
        }catch(Exception e){call.reject("Güvenli eşitleme anahtarı kaydedilemedi.");}
    }
    @PluginMethod public void loadSyncSecret(PluginCall call){
        try{
            JSObject result=new JSObject();
            android.util.AtomicFile file=new android.util.AtomicFile(secretFile());
            if(!file.getBaseFile().exists()){call.resolve(result);return;}
            String data=new String(file.readFully(),StandardCharsets.UTF_8);
            String[] parts=data.split(":",2);
            Cipher cipher=Cipher.getInstance("AES/GCM/NoPadding");
            cipher.init(Cipher.DECRYPT_MODE,secretKey(),new GCMParameterSpec(128,Base64.decode(parts[0],Base64.NO_WRAP)));
            result.put("value",new String(cipher.doFinal(Base64.decode(parts[1],Base64.NO_WRAP)),StandardCharsets.UTF_8));
            call.resolve(result);
        }catch(Exception e){call.reject("Güvenli kayıt açılamadı. Eşitlemeyi parolanla yeniden etkinleştir.");}
    }
    @PluginMethod public void clearSyncSecret(PluginCall call){
        try{
            new android.util.AtomicFile(secretFile()).delete();
            KeyStore store=KeyStore.getInstance("AndroidKeyStore");store.load(null);
            if(store.containsAlias(ALIAS))store.deleteEntry(ALIAS);
            call.resolve();
        }catch(Exception e){call.reject("Güvenli kayıt kaldırılamadı.");}
    }
    @PluginMethod public void disconnect(PluginCall call) {
        // Disconnect only removes the in-memory session on the JS side.
        // Revoking Google-wide scopes must be a separate deliberate operation.
        call.resolve();
    }
}
