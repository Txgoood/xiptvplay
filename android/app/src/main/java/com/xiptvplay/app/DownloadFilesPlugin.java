package com.xiptvplay.app;

import android.app.Activity;
import android.content.ContentValues;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.os.Build;
import android.os.Environment;
import android.provider.DocumentsContract;
import android.provider.MediaStore;
import android.content.ContentUris;
import android.content.ActivityNotFoundException;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;

@CapacitorPlugin(name = "DownloadFiles")
public class DownloadFilesPlugin extends Plugin {
    private static final String FOLDER = "Movies/XIPTVPlay/";

    @PluginMethod
    public void openLocation(PluginCall call) {
        String path = call.getString("path");
        if (path == null || path.isEmpty()) { call.reject("Dosya yolu eksik."); return; }
        new Thread(() -> {
            try {
                String fileName = new File(path).getName();
                File source = new File(new File(getContext().getFilesDir(), "downloads"), fileName);
                if (!source.isFile()) throw new Exception("İndirilen dosya bulunamadı.");
                if (Build.VERSION.SDK_INT < 29) {
                    // Eski Android surumlerinde sistem dosya secicisi ile klasor secimi sun.
                    openFolderPicker();
                    call.resolve();
                    return;
                }
                String mime = fileName.toLowerCase().endsWith(".mkv") ? "video/x-matroska" : "video/mp4";
                Uri collection = MediaStore.Video.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY);
                Uri published = null;
                String selection = MediaStore.MediaColumns.DISPLAY_NAME + "=? AND " + MediaStore.MediaColumns.RELATIVE_PATH + "=?";
                try (Cursor cursor = getContext().getContentResolver().query(collection,
                    new String[]{MediaStore.MediaColumns._ID, MediaStore.MediaColumns.SIZE},
                    selection, new String[]{fileName, FOLDER}, null)) {
                    if (cursor != null) {
                        while (cursor.moveToNext()) {
                            if (cursor.getLong(1) == source.length()) {
                                published = ContentUris.withAppendedId(collection, cursor.getLong(0));
                                break;
                            }
                        }
                    }
                }
                if (published == null) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, fileName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    values.put(MediaStore.MediaColumns.RELATIVE_PATH, FOLDER);
                    values.put(MediaStore.MediaColumns.IS_PENDING, 1);
                    published = getContext().getContentResolver().insert(collection, values);
                    if (published == null) throw new Exception("Video ortak klasore eklenemedi.");
                    boolean success = false;
                    try (InputStream in = new FileInputStream(source);
                         OutputStream out = getContext().getContentResolver().openOutputStream(published)) {
                        if (out == null) throw new Exception("Hedef dosya acilamadi.");
                        byte[] buffer = new byte[256 * 1024];
                        int n;
                        while ((n = in.read(buffer)) != -1) out.write(buffer, 0, n);
                        success = true;
                    } finally {
                        if (!success) getContext().getContentResolver().delete(published, null, null);
                    }
                    values.clear();
                    values.put(MediaStore.MediaColumns.IS_PENDING, 0);
                    getContext().getContentResolver().update(published, values, null, null);
                }
                openFolderPicker();
                call.resolve();
            } catch (Exception error) {
                call.reject("Konum acilamadi: " + error.getMessage(), error);
            }
        }, "XIPTV-ExportFile").start();
    }

    private void openFolderPicker() {
        getActivity().runOnUiThread(() -> {
            // Android bu sistem arayuzunu destekler; dosya yoneticisi markaya gore degisir.
            Intent picker = new Intent(Intent.ACTION_OPEN_DOCUMENT_TREE);
            picker.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
            if (Build.VERSION.SDK_INT >= 26) {
                Uri initial = DocumentsContract.buildDocumentUri(
                    "com.android.externalstorage.documents", "primary:Movies/XIPTVPlay");
                picker.putExtra(DocumentsContract.EXTRA_INITIAL_URI, initial);
            }
            try { getActivity().startActivity(picker); }
            catch (ActivityNotFoundException ignored) {
                // Dosya secici olmayan cihazda kullaniciya hata bildir.
            }
        });
    }
}
