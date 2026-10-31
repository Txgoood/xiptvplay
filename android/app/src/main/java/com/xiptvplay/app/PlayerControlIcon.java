package com.xiptvplay.app;

import android.graphics.Canvas;
import android.graphics.ColorFilter;
import android.graphics.Paint;
import android.graphics.Path;
import android.graphics.PixelFormat;
import android.graphics.Rect;
import android.graphics.drawable.Drawable;

/** Yazı / emoji yerine tek sefer oluşturulan hafif çizgi simgeleri. */
final class PlayerControlIcon extends Drawable {
    private final Paint paint = new Paint(Paint.ANTI_ALIAS_FLAG);
    private final Path path = new Path();
    private final String kind;
    PlayerControlIcon(String kind, int color) {
        this.kind=kind;paint.setColor(color);paint.setStrokeWidth(1.8f);
        paint.setStrokeCap(Paint.Cap.ROUND);paint.setStrokeJoin(Paint.Join.ROUND);
        if(kind.equals("play")){path.moveTo(8,5);path.lineTo(19,12);path.lineTo(8,19);path.close();}
        if(kind.equals("audio")){path.moveTo(9,17);path.lineTo(9,5);path.lineTo(19,3);path.lineTo(19,15);path.moveTo(9,8);path.lineTo(19,6);}
        if(kind.equals("volume")){path.moveTo(4,9);path.lineTo(8,9);path.lineTo(13,5);path.lineTo(13,19);path.lineTo(8,15);path.lineTo(4,15);path.close();}
        if(kind.equals("brightness")){for(int n=0;n<8;n++){double angle=n*Math.PI/4;path.moveTo(12+(float)Math.cos(angle)*7,12+(float)Math.sin(angle)*7);path.lineTo(12+(float)Math.cos(angle)*9,12+(float)Math.sin(angle)*9);}}
        if(kind.equals("next")){path.moveTo(6,5);path.lineTo(16,12);path.lineTo(6,19);path.close();}
    }
    @Override public void draw(Canvas canvas) {
        Rect bounds=getBounds();int saved=canvas.save();canvas.translate(bounds.left,bounds.top);canvas.scale(bounds.width()/24f,bounds.height()/24f);
        paint.setStyle(Paint.Style.STROKE);
        switch(kind){
            case "play": paint.setStyle(Paint.Style.FILL);canvas.drawPath(path,paint);break;
            case "pause":paint.setStyle(Paint.Style.FILL);canvas.drawRoundRect(6,5,10,19,1,1,paint);canvas.drawRoundRect(14,5,18,19,1,1,paint);break;
            case "close":canvas.drawLine(6,6,18,18,paint);canvas.drawLine(18,6,6,18,paint);break;
            case "audio":canvas.drawPath(path,paint);canvas.drawOval(4,15,9,19,paint);canvas.drawOval(14,13,19,17,paint);break;
            case "volume":canvas.drawPath(path,paint);canvas.drawArc(10,7,20,17,-60,120,false,paint);canvas.drawArc(8,3,24,21,-55,110,false,paint);break;
            case "brightness":canvas.drawCircle(12,12,4,paint);canvas.drawPath(path,paint);break;
            case "next":paint.setStyle(Paint.Style.FILL);canvas.drawPath(path,paint);paint.setStyle(Paint.Style.STROKE);canvas.drawLine(19,5,19,19,paint);break;
            case "fullscreen":canvas.drawLine(4,9,4,4,paint);canvas.drawLine(4,4,9,4,paint);canvas.drawLine(15,4,20,4,paint);canvas.drawLine(20,4,20,9,paint);canvas.drawLine(4,15,4,20,paint);canvas.drawLine(4,20,9,20,paint);canvas.drawLine(15,20,20,20,paint);canvas.drawLine(20,20,20,15,paint);break;
        }
        canvas.restoreToCount(saved);
    }
    @Override public void setAlpha(int alpha){paint.setAlpha(alpha);invalidateSelf();}
    @Override public void setColorFilter(ColorFilter filter){paint.setColorFilter(filter);invalidateSelf();}
    @Override public int getOpacity(){return PixelFormat.TRANSLUCENT;}
}
