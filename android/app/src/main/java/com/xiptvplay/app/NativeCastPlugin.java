package com.xiptvplay.app;

import android.net.wifi.WifiManager;
import android.content.Context;
import android.view.ViewGroup;
import com.getcapacitor.*;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.gms.cast.*;
import com.google.android.gms.cast.framework.*;
import com.google.android.gms.cast.framework.media.RemoteMediaClient;
import androidx.mediarouter.app.MediaRouteButton;
import java.util.*;
import java.util.concurrent.*;

@CapacitorPlugin(name="NativeCast")
public class NativeCastPlugin extends Plugin {
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private final ExecutorService discovery=Executors.newSingleThreadExecutor();
    private final Map<String,DlnaTransport.Device> devices=new ConcurrentHashMap<>();
    private volatile DlnaTransport.Device selected;
    private volatile String lastState="STOPPED",mediaTitle="";
    private CastContext castContext;
    private MediaRouteButton routeButton;
    private boolean discovering=false;
    private final SessionManagerListener<CastSession> sessions=new SessionManagerListener<CastSession>(){
        public void onSessionStarting(CastSession s){}
        public void onSessionStarted(CastSession s,String id){selected=null;emit();}
        public void onSessionStartFailed(CastSession s,int e){emit();}
        public void onSessionEnding(CastSession s){}
        public void onSessionEnded(CastSession s,int e){mediaTitle="";emit();}
        public void onSessionResuming(CastSession s,String id){}
        public void onSessionResumed(CastSession s,boolean suspended){selected=null;emit();}
        public void onSessionResumeFailed(CastSession s,int e){emit();}
        public void onSessionSuspended(CastSession s,int reason){emit();}
    };
    private CastSession session(){return castContext==null?null:castContext.getSessionManager().getCurrentCastSession();}
    private boolean castReady(){CastSession s=session();return s!=null&&s.isConnected();}
    private void initCast() {
        if(castContext!=null)return;
        castContext=CastContext.getSharedInstance(getContext());
        castContext.getSessionManager().addSessionManagerListener(sessions,CastSession.class);
    }
    private JSObject state(){
        JSObject result=new JSObject();boolean cast=castReady();
        result.put("connected",cast||selected!=null);result.put("protocol",cast?"Google Cast":selected!=null?"DLNA":"");
        result.put("name",cast&&session().getCastDevice()!=null?session().getCastDevice().getFriendlyName():selected!=null?selected.name:"");
        String status=lastState;
        if(cast){RemoteMediaClient client=session().getRemoteMediaClient();if(client!=null){status=client.isPlaying()?"PLAYING":client.isPaused()?"PAUSED_PLAYBACK":client.isBuffering()?"TRANSITIONING":"STOPPED";MediaInfo info=client.getMediaInfo();if(info!=null&&info.getMetadata()!=null)mediaTitle=info.getMetadata().getString(MediaMetadata.KEY_TITLE);}}
        result.put("state",status);result.put("title",mediaTitle);return result;
    }
    private void emit(){getActivity().runOnUiThread(()->notifyListeners("castState",state()));}
    @PluginMethod public void scan(PluginCall call){
        synchronized(this){if(discovering){call.reject("Cihaz araması zaten sürüyor");return;}discovering=true;}
        discovery.execute(()->{
            WifiManager.MulticastLock lock=null;
            try{
                WifiManager wifi=(WifiManager)getContext().getApplicationContext().getSystemService(Context.WIFI_SERVICE);
                if(wifi!=null){lock=wifi.createMulticastLock("xiptv-device-discovery");lock.setReferenceCounted(false);lock.acquire();}
                List<DlnaTransport.Device> found=DlnaTransport.discover();JSArray rows=new JSArray();
                devices.clear();for(DlnaTransport.Device device:found){devices.put(device.id,device);JSObject row=new JSObject();row.put("id",device.id);row.put("name",device.name);row.put("protocol","DLNA");rows.put(row);}
                JSObject result=new JSObject();result.put("devices",rows);call.resolve(result);
            }catch(Exception error){call.reject("Yerel ağ taranamadı. Wi-Fi bağlantısını kontrol et.");}
            finally{if(lock!=null&&lock.isHeld())lock.release();synchronized(this){discovering=false;}}
        });
    }
    @PluginMethod public void openCastPicker(PluginCall call){getActivity().runOnUiThread(()->{
        try{
            if(selected!=null){call.reject("Önce DLNA bağlantısını kes");return;}
            initCast();
            if(routeButton==null){routeButton=new MediaRouteButton(getActivity());routeButton.setAlpha(0f);getActivity().addContentView(routeButton,new ViewGroup.LayoutParams(1,1));CastButtonFactory.setUpMediaRouteButton(getActivity(),routeButton);}
            routeButton.showDialog();call.resolve();
        }catch(Exception error){call.reject("Google Cast bu cihazda başlatılamadı. Google Play Hizmetlerini kontrol et.");}
    });}
    @PluginMethod public void connect(PluginCall call){String id=call.getString("id","");network.execute(()->{
        try{DlnaTransport.Device device=devices.get(id);if(device==null)throw new Exception();lastState=DlnaTransport.transportState(device);
            getActivity().runOnUiThread(()->{if(castReady()){call.reject("Önce Google Cast bağlantısını kes");return;}selected=device;mediaTitle="";emit();call.resolve(state());});
        }catch(Exception error){call.reject("TV yanıt vermedi. TV'nin açık ve aynı ağda olduğunu kontrol et.");}
    });}
    @PluginMethod public void status(PluginCall call){
        DlnaTransport.Device device=selected;
        if(device==null){getActivity().runOnUiThread(()->call.resolve(state()));return;}
        network.execute(()->{try{lastState=DlnaTransport.transportState(device);}catch(Exception e){if(selected==device){selected=null;mediaTitle="";}}getActivity().runOnUiThread(()->call.resolve(state()));});
    }
    @PluginMethod public void loadMedia(PluginCall call){
        String uri=call.getString("url",""),title=call.getString("title",""),mime=call.getString("mime","video/mp4");boolean live=call.getBoolean("live",false);
        if(!uri.matches("(?i)^https?://.+")){call.reject("İndirilen yerel dosya doğrudan TV'ye gönderilemiyor. Katalogdaki yayını seç.");return;}
        getActivity().runOnUiThread(()->{
            if(castReady()){
                RemoteMediaClient client=session().getRemoteMediaClient();if(client==null){call.reject("TV medya bağlantısı hazır değil");return;}
                MediaMetadata metadata=new MediaMetadata(MediaMetadata.MEDIA_TYPE_MOVIE);metadata.putString(MediaMetadata.KEY_TITLE,title);
                MediaInfo info=new MediaInfo.Builder(uri).setContentType(mime).setStreamType(live?MediaInfo.STREAM_TYPE_LIVE:MediaInfo.STREAM_TYPE_BUFFERED).setMetadata(metadata).build();
                client.load(new MediaLoadRequestData.Builder().setMediaInfo(info).setAutoplay(true).build()).setResultCallback(result->{if(result.getStatus().isSuccess()){mediaTitle=title;emit();call.resolve(state());}else call.reject("TV yayını açamadı. Yayın biçimi veya erişimi desteklenmiyor olabilir.");});return;
            }
            DlnaTransport.Device device=selected;if(device==null){call.reject("Önce bir TV'ye bağlan");return;}
            network.execute(()->{try{DlnaTransport.load(device,uri,title,mime,live);lastState=DlnaTransport.transportState(device);mediaTitle=title;getActivity().runOnUiThread(()->{emit();call.resolve(state());});}catch(Exception error){call.reject("TV yayını açamadı. Sağlayıcı erişimi veya video biçimi desteklenmiyor olabilir.");}});
        });
    }
    @PluginMethod public void control(PluginCall call){String action=call.getString("action","");if(!Arrays.asList("play","pause","stop").contains(action)){call.reject("Geçersiz kontrol");return;}
        getActivity().runOnUiThread(()->{if(castReady()){RemoteMediaClient client=session().getRemoteMediaClient();if(client==null){call.reject("TV hazır değil");return;}if(action.equals("play"))client.play().setResultCallback(r->{if(r.getStatus().isSuccess())call.resolve();else call.reject("TV kontrolü başarısız");});else if(action.equals("pause"))client.pause().setResultCallback(r->{if(r.getStatus().isSuccess())call.resolve();else call.reject("TV kontrolü başarısız");});else client.stop().setResultCallback(r->{if(r.getStatus().isSuccess())call.resolve();else call.reject("TV kontrolü başarısız");});return;}
            DlnaTransport.Device device=selected;if(device==null){call.reject("TV bağlantısı yok");return;}
            network.execute(()->{try{String command=action.equals("play")?"Play":action.equals("pause")?"Pause":"Stop";DlnaTransport.soap(device,command,action.equals("play")?"<Speed>1</Speed>":"");lastState=DlnaTransport.transportState(device);emit();call.resolve();}catch(Exception error){call.reject("TV kontrolü başarısız");}});
        });
    }
    @PluginMethod public void disconnect(PluginCall call){getActivity().runOnUiThread(()->{if(castContext!=null)castContext.getSessionManager().endCurrentSession(true);DlnaTransport.Device device=selected;selected=null;mediaTitle="";emit();if(device!=null)network.execute(()->{try{DlnaTransport.soap(device,"Stop","");}catch(Exception ignored){}});call.resolve();});}
    @Override protected void handleOnDestroy(){if(castContext!=null)castContext.getSessionManager().removeSessionManagerListener(sessions,CastSession.class);network.shutdownNow();discovery.shutdownNow();super.handleOnDestroy();}
}
