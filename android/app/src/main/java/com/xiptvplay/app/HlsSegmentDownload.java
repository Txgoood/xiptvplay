package com.xiptvplay.app;

import java.io.BufferedInputStream;
import java.io.BufferedOutputStream;
import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Locale;
import java.util.function.Consumer;
import javax.crypto.Cipher;
import javax.crypto.CipherInputStream;
import javax.crypto.spec.IvParameterSpec;
import javax.crypto.spec.SecretKeySpec;

/** Downloads complete, MPEG-TS based VOD HLS playlists into one seekable .ts file.
 * Never claims success for incomplete/live manifests, DRM, fMP4 or separate-audio streams.
 */
final class HlsSegmentDownload {
    interface Gate { void check() throws Exception; }
    interface Progress { void report(long bytes, int percent); }
    static final class Part {
        final URL url;
        final long rangeStart, rangeLength;
        final URL keyUrl;
        final byte[] iv;
        Part(URL url, long start, long length, URL key, byte[] iv) {
            this.url=url; rangeStart=start; rangeLength=length; keyUrl=key; this.iv=iv;
        }
    }
    static final class Playlist {
        final List<Part> parts;
        Playlist(List<Part> parts) { this.parts=parts; }
    }
    private HlsSegmentDownload() {}

    private static boolean isWeb(URL url) {
        return "http".equalsIgnoreCase(url.getProtocol()) || "https".equalsIgnoreCase(url.getProtocol());
    }
    private static URL webUrl(URL base, String relative) throws IOException {
        URL result = new URL(base, relative);
        if (!isWeb(result)) throw new IOException("HLS parça bağlantısı güvenli HTTP adresi değil.");
        return result;
    }
    private static String attribute(String attributes, String key) {
        java.util.regex.Matcher matcher = java.util.regex.Pattern.compile(
            "(?:^|,)\\s*" + java.util.regex.Pattern.quote(key) + "=(?:\\\"([^\\\"]*)\\\"|([^,]*))"
        ).matcher(attributes);
        return matcher.find() ? (matcher.group(1) != null ? matcher.group(1) : matcher.group(2)) : null;
    }
    private static byte[] parseIv(String value, long sequence) throws IOException {
        byte[] iv = new byte[16];
        if (value == null) {
            for (int i=15; i>=0 && sequence!=0; i--) { iv[i]=(byte)sequence; sequence >>>= 8; }
        } else {
            String hex = value.startsWith("0x") || value.startsWith("0X") ? value.substring(2) : value;
            if (!hex.matches("[0-9a-fA-F]{1,32}")) throw new IOException("Geçersiz HLS şifreleme IV değeri.");
            if ((hex.length() & 1) != 0) hex = "0"+hex;
            int offset=16-hex.length()/2;
            for (int i=0;i<hex.length();i+=2) iv[offset+i/2]=(byte)Integer.parseInt(hex.substring(i,i+2),16);
        }
        return iv;
    }
    private static String readManifest(URL url, Consumer<HttpURLConnection> onOpen, Gate gate, URL[] effectiveUrl) throws Exception {
        gate.check();
        HttpURLConnection connection = DownloadRedirects.open(url,null,null,15000,30000,onOpen);
        try {
            int status=connection.getResponseCode();
            if (status != 200) throw new IOException("HLS oynatma listesi HTTP " + status + " yanıtı verdi.");
            effectiveUrl[0] = connection.getURL();
            try (InputStream in = connection.getInputStream(); ByteArrayOutputStream output=new ByteArrayOutputStream()) {
                byte[] buffer=new byte[8192];
                int n;
                while ((n=in.read(buffer))!=-1) {
                    gate.check();
                    if (output.size()+n > 2*1024*1024) throw new IOException("HLS oynatma listesi çok büyük.");
                    output.write(buffer,0,n);
                }
                return output.toString(StandardCharsets.UTF_8.name()).replace("\uFEFF","");
            }
        } finally { connection.disconnect(); }
    }
    static Playlist resolve(URL original, Consumer<HttpURLConnection> onOpen, Gate gate) throws Exception {
        URL[] effectiveUrl=new URL[1];
        String text=readManifest(original,onOpen,gate,effectiveUrl);
        return resolveFromText(effectiveUrl[0],text,onOpen,gate,0);
    }
    private static Playlist resolveFromText(URL url, String text, Consumer<HttpURLConnection> onOpen,
                                             Gate gate, int depth) throws Exception {
        if (!text.trim().startsWith("#EXTM3U")) throw new IOException("HLS oynatma listesi geçersiz.");
        String[] lines=text.split("\\r?\\n");
        URL bestVariant=null;
        long bestBandwidth=-1;
        boolean master=false, ended=false;
        long sequence=0, implicitRangeOffset=0;
        URL previousRangeUrl=null, keyUrl=null;
        String explicitIv=null, nextRange=null;
        boolean unsupportedMap=false;
        List<Part> parts=new ArrayList<>();
        for (int i=0;i<lines.length;i++) {
            String line=lines[i].trim();
            if (line.isEmpty()) continue;
            if (line.startsWith("#EXT-X-STREAM-INF:")) {
                master=true;
                String bandwidth=attribute(line.substring(18),"BANDWIDTH");
                long bitrate=0;
                try { bitrate=Long.parseLong(bandwidth); } catch (Exception ignored) {}
                String audio=attribute(line.substring(18),"AUDIO");
                if (audio!=null && !audio.isEmpty())
                    throw new IOException("Bu HLS akışı ayrı ses parçası kullanıyor; eksik sesli dosya kaydedilmeyecek.");
                for(int j=i+1;j<lines.length;j++) {
                    String candidate=lines[j].trim();
                    if (candidate.isEmpty() || candidate.startsWith("#")) continue;
                    if(bitrate>=bestBandwidth) {bestBandwidth=bitrate;bestVariant=webUrl(url,candidate);}
                    i=j; break;
                }
                continue;
            }
            if(line.equals("#EXT-X-ENDLIST")) ended=true;
            if(line.startsWith("#EXT-X-MAP:") || line.startsWith("#EXT-X-PART:")) unsupportedMap=true;
            if(line.startsWith("#EXT-X-MEDIA-SEQUENCE:")) {
                try {sequence=Long.parseLong(line.substring(22).trim());} catch(NumberFormatException e) {
                    throw new IOException("HLS parça sıra numarası geçersiz.");
                }
            }
            if(line.startsWith("#EXT-X-KEY:")) {
                String attrs=line.substring(11);
                String method=attribute(attrs,"METHOD");
                if("NONE".equals(method)) {keyUrl=null;explicitIv=null;}
                else if("AES-128".equals(method)) {
                    String key=attribute(attrs,"URI");
                    if(key==null) throw new IOException("HLS şifreleme anahtarı belirtilmedi.");
                    keyUrl=webUrl(url,key);
                    explicitIv=attribute(attrs,"IV");
                } else throw new IOException("HLS DRM/şifreleme türü desteklenmiyor: " + (method==null?"bilinmiyor":method));
            }
            if(line.startsWith("#EXT-X-BYTERANGE:")) nextRange=line.substring(17).trim();
            if(line.startsWith("#")) continue;
            if(master) continue;
            URL partUrl=webUrl(url,line);
            long start=-1,length=-1;
            if(nextRange!=null) {
                String[] range=nextRange.split("@",2);
                try {
                    length=Long.parseLong(range[0].trim());
                    if(length<=0) throw new NumberFormatException();
                    start=range.length==2 ? Long.parseLong(range[1].trim())
                        : previousRangeUrl!=null && previousRangeUrl.equals(partUrl) ? implicitRangeOffset : -1;
                    if(start<0) throw new NumberFormatException();
                } catch(NumberFormatException e) {throw new IOException("HLS byte-range bilgisi geçersiz.");}
                implicitRangeOffset=start+length;
            }
            previousRangeUrl=partUrl;
            nextRange=null;
            parts.add(new Part(partUrl,start,length,keyUrl,keyUrl==null?null:parseIv(explicitIv,sequence)));
            sequence++;
            if(parts.size()>20000) throw new IOException("HLS oynatma listesinde çok fazla parça var.");
        }
        if(master) {
            if(bestVariant==null || depth>=3) throw new IOException("HLS kalite listesi çözümlenemedi.");
            URL[] effectiveUrl=new URL[1];
            String next=readManifest(bestVariant,onOpen,gate,effectiveUrl);
            return resolveFromText(effectiveUrl[0],next,onOpen,gate,depth+1);
        }
        if(unsupportedMap) throw new IOException("Bu HLS yayını fMP4 parçaları içeriyor; MPEG-TS birleştirme için uygun değil.");
        if(parts.isEmpty()) throw new IOException("HLS oynatma listesinde video parçası bulunamadı.");
        if(!ended) throw new IOException("HLS yayını henüz tamamlanmamış (ENDLIST yok); eksik film kaydedilmeyecek.");
        return new Playlist(parts);
    }

    static long download(URL url, File target, Consumer<HttpURLConnection> onOpen,
                         Gate gate, Progress progress) throws Exception {
        Playlist playlist=resolve(url,onOpen,gate);
        long bytes=0;
        File staging=new File(target.getAbsolutePath()+".part");
        if(staging.exists() && !staging.delete()) throw new IOException("Eski yarım dosya temizlenemedi.");
        try (BufferedOutputStream out=new BufferedOutputStream(new FileOutputStream(staging),256*1024)) {
            byte[] buffer=new byte[256*1024];
            int count=playlist.parts.size();
            for(int i=0;i<count;i++) {
                gate.check();
                Part part=playlist.parts.get(i);
                String range=part.rangeStart<0?null:"bytes="+part.rangeStart+"-"+(part.rangeStart+part.rangeLength-1);
                HttpURLConnection conn=DownloadRedirects.open(part.url,range,null,15000,30000,onOpen);
                try {
                    int status=conn.getResponseCode();
                    if(status != (range==null?200:206))
                        throw new IOException("HLS parçası HTTP "+status+" yanıtı verdi.");
                    InputStream stream=new BufferedInputStream(conn.getInputStream(),64*1024);
                    if(part.keyUrl!=null) {
                        byte[] secret=fetchKey(part.keyUrl,onOpen,gate);
                        Cipher cipher=Cipher.getInstance("AES/CBC/PKCS5Padding");
                        cipher.init(Cipher.DECRYPT_MODE,new SecretKeySpec(secret,"AES"),new IvParameterSpec(part.iv));
                        stream=new CipherInputStream(stream,cipher);
                    }
                    try (InputStream input=stream) {
                        int n;
                        boolean first=true;
                        long partBytes=0;
                        while((n=input.read(buffer))!=-1) {
                            gate.check();
                            if(first) {
                                // MPEG-TS starts with the 0x47 synchronization byte.
                                if(n<=0 || (buffer[0]&0xff)!=0x47)
                                    throw new IOException("HLS video parçası MPEG-TS formatında değil; yanlış dosya kaydedilmeyecek.");
                                first=false;
                            }
                            out.write(buffer,0,n);
                            bytes+=n;
                            partBytes+=n;
                        }
                        if(partBytes==0) throw new IOException("HLS video parçası boş.");
                    }
                } finally {conn.disconnect();}
                progress.report(bytes,(i+1)*100/count);
            }
            out.flush();
        } catch(Exception e) {
            staging.delete();
            throw e;
        }
        if(!staging.renameTo(target)) {
            staging.delete();
            throw new IOException("HLS indirilen dosya kaydedilemedi.");
        }
        return bytes;
    }

    private static byte[] fetchKey(URL url,Consumer<HttpURLConnection> onOpen,Gate gate) throws Exception {
        gate.check();
        HttpURLConnection conn=DownloadRedirects.open(url,null,null,15000,30000,onOpen);
        try {
            if(conn.getResponseCode()!=200) throw new IOException("HLS AES anahtarı alınamadı (HTTP "+conn.getResponseCode()+").");
            byte[] key=new byte[17];
            int offset=0;
            try(InputStream in=conn.getInputStream()){
                while(offset<17) {
                    gate.check();
                    int n=in.read(key,offset,17-offset);
                    if(n<0) break;
                    offset+=n;
                }
            }
            if(offset!=16) throw new IOException("HLS AES-128 anahtarı hatalı.");
            return Arrays.copyOf(key,16);
        } finally {conn.disconnect();}
    }
}
