package com.xiptvplay.app;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.widget.Button;

/** Simgeler TextView'in boş metin / compound drawable ölçümünden bağımsız çizilir. */
final class PlayerIconButton extends Button {
    private Drawable controlIcon;
    PlayerIconButton(Context context){super(context);setWillNotDraw(false);}
    void setControlIcon(Drawable icon){
        if(controlIcon!=null)controlIcon.setCallback(null);
        controlIcon=icon;
        if(icon!=null){int size=Math.round(24*getResources().getDisplayMetrics().density);icon.setBounds(0,0,size,size);icon.setCallback(this);}
        invalidate();
    }
    Drawable getControlIcon(){return controlIcon;}
    @Override protected boolean verifyDrawable(Drawable drawable){return drawable==controlIcon||super.verifyDrawable(drawable);}
    @Override protected void onDraw(Canvas canvas){
        if(controlIcon==null)return;
        int saved=canvas.save();
        canvas.translate(getScrollX()+(getWidth()-controlIcon.getBounds().width())/2f,getScrollY()+(getHeight()-controlIcon.getBounds().height())/2f);
        controlIcon.draw(canvas);canvas.restoreToCount(saved);
    }
}
