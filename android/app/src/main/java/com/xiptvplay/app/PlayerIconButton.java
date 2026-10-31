package com.xiptvplay.app;
import android.content.Context;
import android.graphics.Canvas;
import android.graphics.drawable.Drawable;
import android.widget.Button;

/** Geniş ve dar ekranlarda simge yazı karakterine bağlı kalmadan ortalanır. */
final class PlayerIconButton extends Button {
    PlayerIconButton(Context context){super(context);}
    @Override protected void onDraw(Canvas canvas){
        Drawable icon=getCompoundDrawables()[0];if(icon==null)return;
        int saved=canvas.save();canvas.translate((getWidth()-icon.getBounds().width())/2f,(getHeight()-icon.getBounds().height())/2f);
        icon.draw(canvas);canvas.restoreToCount(saved);
    }
}
