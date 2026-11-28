package com.xiptvplay.app;
import android.content.Context;
import android.os.Environment;
import java.io.File;
import java.io.IOException;
public final class DownloadStorage {
 static File usb(Context c) {
  for(File f:c.getExternalFilesDirs(null)) {
   if(f!=null && Environment.isExternalStorageRemovable(f) && Environment.MEDIA_MOUNTED.equals(Environment.getExternalStorageState(f))) return f;
  }
  return null;
 }
 static String selected(Context c){return c.getSharedPreferences("download_storage",0).getString("target","internal");}
 static void select(Context c,String target){c.getSharedPreferences("download_storage",0).edit().putString("target",target).apply();}
 static File base(Context c) throws IOException {
  String target=selected(c);
  File root="usb".equals(target)?usb(c):c.getFilesDir();
  if(root==null)throw new IOException("USB bellek bağlı değil veya Android erişime izin vermiyor.");
  File dir=new File(root,"downloads");
  if(!dir.isDirectory()&&!dir.mkdirs())throw new IOException("İndirme klasörü açılamadı.");
  return dir;
 }
 static String path(Context c,File file){return file.getParentFile().equals(new File(c.getFilesDir(),"downloads"))?"downloads/"+file.getName():"file://"+file.getAbsolutePath();}
}
