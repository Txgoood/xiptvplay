package com.xiptvplay.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.view.View;
import android.view.ViewGroup;
import android.widget.Button;
import androidx.lifecycle.Lifecycle;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;
import androidx.test.core.app.ActivityScenario;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.lang.reflect.Field;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;
import static org.junit.Assert.*;

@RunWith(AndroidJUnit4.class)
public class NativePlayerControlsTest {
    private static ExoPlayer player(NativePlayerActivity activity) {
        try{Field field=NativePlayerActivity.class.getDeclaredField("player");field.setAccessible(true);return (ExoPlayer)field.get(activity);}catch(Exception e){throw new AssertionError(e);}
    }
    private static View find(View root,String description) {
        if(description.contentEquals(root.getContentDescription()==null?"":root.getContentDescription()))return root;
        if(root instanceof ViewGroup){ViewGroup group=(ViewGroup)root;for(int i=0;i<group.getChildCount();i++){View found=find(group.getChildAt(i),description);if(found!=null)return found;}}
        return null;
    }
    private static PlayerView video(View root){if(root instanceof PlayerView)return (PlayerView)root;if(root instanceof ViewGroup){ViewGroup group=(ViewGroup)root;for(int i=0;i<group.getChildCount();i++){PlayerView found=video(group.getChildAt(i));if(found!=null)return found;}}return null;}
    private static Button button(NativePlayerActivity a,String label){View result=find(a.getWindow().getDecorView(),label);assertNotNull(label,result);return (Button)result;}
    private static void ready(ActivityScenario<NativePlayerActivity> scenario) throws Exception {
        long end=System.currentTimeMillis()+12000;AtomicBoolean ready=new AtomicBoolean();
        while(System.currentTimeMillis()<end){scenario.onActivity(a->{ExoPlayer p=player(a);ready.set(p!=null&&p.getDuration()>0&&p.getPlaybackState()==androidx.media3.common.Player.STATE_READY);});if(ready.get())return;Thread.sleep(100);}
        fail("Test videosu hazırlanamadı");
    }
    private static void screenshot(String name) throws Exception {
        Bitmap bitmap=InstrumentationRegistry.getInstrumentation().getUiAutomation().takeScreenshot();assertNotNull(bitmap);
        try(FileOutputStream out=new FileOutputStream(new File(InstrumentationRegistry.getInstrumentation().getTargetContext().getFilesDir(),name))){bitmap.compress(Bitmap.CompressFormat.PNG,100,out);}bitmap.recycle();
    }
    @Test public void realVideoPauseHideResumeRotateAndBackground() throws Exception {
        Context target=InstrumentationRegistry.getInstrumentation().getTargetContext();
        File clip=File.createTempFile("player-controls-",".mp4",target.getCacheDir());
        try(InputStream in=InstrumentationRegistry.getInstrumentation().getContext().getAssets().open("player-smoke.mp4");FileOutputStream out=new FileOutputStream(clip)){byte[] data=new byte[8192];int n;while((n=in.read(data))!=-1)out.write(data,0,n);}
        Intent intent=new Intent(target,NativePlayerActivity.class).putExtra("url",android.net.Uri.fromFile(clip).toString()).putExtra("isLocalFile",true).putExtra("title","XIPTV Play · Kontrol testi").putExtra("nextUrl",android.net.Uri.fromFile(clip).toString()).putExtra("nextTitle","İkinci test bölümü").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try(ActivityScenario<NativePlayerActivity> scenario=ActivityScenario.launch(intent)){
            ready(scenario);Thread.sleep(500);AtomicLong pausedPosition=new AtomicLong();AtomicReference<ExoPlayer> first=new AtomicReference<>();
            scenario.onActivity(a->{
                first.set(player(a));Button pause=button(a,"Duraklat"),brightness=button(a,"Parlaklık"),speed=button(a,"Oynatma hızı");
                ViewGroup row=(ViewGroup)pause.getParent();assertEquals(row.indexOfChild(brightness)+1,row.indexOfChild(pause));assertEquals(row.indexOfChild(pause)+1,row.indexOfChild(speed));
                assertTrue(pause.getWidth()>=48*a.getResources().getDisplayMetrics().density-1);
                if(!pause.isShown())video(a.getWindow().getDecorView()).performClick();
                assertTrue(pause.isShown());pause.performClick();assertFalse(player(a).getPlayWhenReady());assertEquals("Oynat",pause.getContentDescription());pausedPosition.set(player(a).getCurrentPosition());
            });
            screenshot("player-controls-portrait.png");
            Thread.sleep(3900);
            scenario.onActivity(a->{assertTrue(Math.abs(player(a).getCurrentPosition()-pausedPosition.get())<250);assertFalse(button(a,"Oynat").isShown());video(a.getWindow().getDecorView()).performClick();assertTrue(button(a,"Oynat").isShown());button(a,"Oynat").performClick();assertTrue(player(a).getPlayWhenReady());});
            Thread.sleep(700);
            scenario.onActivity(a->{assertTrue(player(a).getCurrentPosition()>pausedPosition.get()+200);button(a,"Tam ekran / küçük ekran").performClick();});
            Thread.sleep(1200);
            scenario.onActivity(a->{assertSame("Yön değişimi oynatıcı oturumunu yeniden kurmamalı",first.get(),player(a));assertNull(player(a).getPlayerError());if(!button(a,"Duraklat").isShown())video(a.getWindow().getDecorView()).performClick();button(a,"Duraklat").performClick();assertFalse(player(a).getPlayWhenReady());});
            screenshot("player-controls-landscape.png");
            scenario.moveToState(Lifecycle.State.CREATED);
            scenario.moveToState(Lifecycle.State.RESUMED);ready(scenario);
            scenario.onActivity(a->{assertFalse("Kullanıcı duraklatması arka plandan dönüşte korunmalı",player(a).getPlayWhenReady());assertTrue(player(a).getCurrentPosition()>0);});
            screenshot("player-controls-restored.png");
            scenario.onActivity(a->{if(!button(a,"Sonraki bölüm").isShown())video(a.getWindow().getDecorView()).performClick();button(a,"Sonraki bölüm").performClick();});ready(scenario);
            scenario.onActivity(a->{assertTrue(player(a).getPlayWhenReady());assertTrue(button(a,"Duraklat").isShown());});
        }finally{clip.delete();}
    }
}
