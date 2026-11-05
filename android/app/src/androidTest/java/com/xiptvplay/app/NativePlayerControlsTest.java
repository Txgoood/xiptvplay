package com.xiptvplay.app;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.graphics.Color;
import android.view.View;
import android.view.MotionEvent;
import android.os.SystemClock;
import android.media.AudioManager;
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
    private static View button(NativePlayerActivity a,String label){View result=find(a.getWindow().getDecorView(),label);assertNotNull(label,result);return result;}
    private static void assertIconPainted(View button,boolean dark) {
        Bitmap image=Bitmap.createBitmap(button.getWidth(),button.getHeight(),Bitmap.Config.ARGB_8888);
        button.draw(new Canvas(image));int pixels=0,half=Math.round(12*button.getResources().getDisplayMetrics().density);
        for(int y=image.getHeight()/2-half;y<image.getHeight()/2+half;y++)for(int x=image.getWidth()/2-half;x<image.getWidth()/2+half;x++){
            int color=image.getPixel(x,y);
            if(Color.alpha(color)>220 && (dark ? Color.red(color)<80&&Color.green(color)<130&&Color.blue(color)<140 : Color.red(color)>200&&Color.green(color)>200&&Color.blue(color)>200))pixels++;
        }
        image.recycle();assertTrue("Düğmenin simgesi gerçekten çizilmeli: "+button.getContentDescription(),pixels>20);
    }
    private static void ready(ActivityScenario<NativePlayerActivity> scenario) throws Exception {
        long end=System.currentTimeMillis()+12000;AtomicBoolean ready=new AtomicBoolean();
        while(System.currentTimeMillis()<end){scenario.onActivity(a->{ExoPlayer p=player(a);ready.set(p!=null&&p.getDuration()>0&&p.getPlaybackState()==androidx.media3.common.Player.STATE_READY);});if(ready.get())return;Thread.sleep(100);}
        fail("Test videosu hazırlanamadı");
    }
    private static void touch(NativePlayerActivity activity, long down, long time, int action, float x, float y) {
        MotionEvent event = MotionEvent.obtain(down, time, action, x, y, 0);
        try { activity.dispatchTouchEvent(event); } finally { event.recycle(); }
    }
    private static void doubleTap(NativePlayerActivity activity, float x, float y, long start) {
        touch(activity, start, start, MotionEvent.ACTION_DOWN, x, y);
        touch(activity, start, start + 15, MotionEvent.ACTION_UP, x, y);
        touch(activity, start + 75, start + 75, MotionEvent.ACTION_DOWN, x, y);
        touch(activity, start + 75, start + 90, MotionEvent.ACTION_UP, x, y);
    }
    private static void swipe(NativePlayerActivity activity, float x, float y, float distance, long start) {
        touch(activity, start, start, MotionEvent.ACTION_DOWN, x, y);
        touch(activity, start, start + 50, MotionEvent.ACTION_MOVE, x, y + distance);
        touch(activity, start, start + 70, MotionEvent.ACTION_UP, x, y + distance);
    }
    private static void verifyPlayerGestures(NativePlayerActivity activity) {
        ExoPlayer player = player(activity);
        long initial = player.getCurrentPosition();
        View surface = activity.getWindow().getDecorView().findViewWithTag("player-gesture-surface");
        assertNotNull(surface);
        int[] location = new int[2];
        surface.getLocationInWindow(location);
        float left = location[0] + surface.getWidth() * 0.2f;
        float right = location[0] + surface.getWidth() * 0.8f;
        float centerY = location[1] + surface.getHeight() * 0.5f;
        float travel = surface.getHeight() * 0.25f;
        long start = SystemClock.uptimeMillis() - 500;
        View forward = button(activity, "10 saniye ileri sar");
        assertTrue(forward.isShown() && forward.isEnabled());
        forward.performClick();
        assertEquals(initial + 10000L, player.getCurrentPosition(), 250L);
        doubleTap(activity, right, centerY, start);
        assertEquals(initial + 20000L, player.getCurrentPosition(), 250L);
        doubleTap(activity, left, centerY, start + 100);
        assertEquals(initial + 10000L, player.getCurrentPosition(), 250L);
        swipe(activity, left, centerY, travel, start + 200);
        float dimmed = activity.getWindow().getAttributes().screenBrightness;
        assertTrue(dimmed < 0.7f);
        swipe(activity, left, centerY, -travel, start + 300);
        assertTrue(activity.getWindow().getAttributes().screenBrightness > dimmed);
        AudioManager audio = (AudioManager) activity.getSystemService(Context.AUDIO_SERVICE);
        if (audio != null && !audio.isVolumeFixed()) {
            int stream = AudioManager.STREAM_MUSIC;
            int original = audio.getStreamVolume(stream);
            int max = audio.getStreamMaxVolume(stream);
            try {
                audio.setStreamVolume(stream, max, 0);
                int before = audio.getStreamVolume(stream);
                swipe(activity, right, centerY, travel, start + 400);
                int reduced = audio.getStreamVolume(stream);
                assertTrue(reduced < before);
                swipe(activity, right, centerY, -travel, start + 500);
                assertTrue(audio.getStreamVolume(stream) > reduced);
            } finally {
                audio.setStreamVolume(stream, original, 0);
            }
        }
        player.seekTo(initial);
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
                first.set(player(a));View pause=button(a,"Duraklat"),brightness=button(a,"Parlaklık"),speed=button(a,"Oynatma hızı");
                ViewGroup row=(ViewGroup)pause.getParent();assertEquals(row.indexOfChild(brightness)+1,row.indexOfChild(pause));assertEquals(row.indexOfChild(pause)+1,row.indexOfChild(speed));
                assertTrue(pause.getWidth()>=48*a.getResources().getDisplayMetrics().density-1);
                assertIconPainted(pause,true);assertIconPainted(button(a,"Videoyu kapat"),false);assertIconPainted(brightness,false);
                if(!pause.isShown())video(a.getWindow().getDecorView()).performClick();
                assertTrue(pause.isShown());pause.performClick();assertFalse(player(a).getPlayWhenReady());assertEquals("Oynat",pause.getContentDescription());verifyPlayerGestures(a);pausedPosition.set(player(a).getCurrentPosition());
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
