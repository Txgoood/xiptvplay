package com.xiptvplay.app;

import org.w3c.dom.*;
import javax.xml.parsers.DocumentBuilderFactory;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.util.*;

/** Yerel ağda SSDP keşfi ve UPnP AVTransport; kimlik bilgileri loglanmaz. */
final class DlnaTransport {
    static final class Device {
        final String id,name,controlUrl,serviceType;
        Device(String id,String name,String url,String type){this.id=id;this.name=name;controlUrl=url;serviceType=type;}
    }
    static String escape(String value){return value.replace("&","&amp;").replace("<","&lt;").replace(">","&gt;").replace("\"","&quot;").replace("'","&apos;");}
    static Document xml(String value) throws Exception {
        DocumentBuilderFactory f=DocumentBuilderFactory.newInstance();
        f.setNamespaceAware(true);f.setFeature("http://apache.org/xml/features/disallow-doctype-decl",true);
        f.setFeature("http://xml.org/sax/features/external-general-entities",false);
        f.setFeature("http://xml.org/sax/features/external-parameter-entities",false);
        f.setExpandEntityReferences(false);
        return f.newDocumentBuilder().parse(new ByteArrayInputStream(value.getBytes(StandardCharsets.UTF_8)));
    }
    static String value(Element element,String name){NodeList nodes=element.getElementsByTagNameNS("*",name);return nodes.getLength()>0?nodes.item(0).getTextContent().trim():"";}
    static URL localUrl(String text) throws Exception {
        URL url=new URL(text);
        if(!url.getProtocol().equals("http")&&!url.getProtocol().equals("https"))throw new IOException("Geçersiz cihaz adresi");
        if(url.getUserInfo()!=null)throw new IOException("Geçersiz cihaz adresi");
        InetAddress address=InetAddress.getByName(url.getHost());
        if(!address.isSiteLocalAddress()&&!address.isLinkLocalAddress())throw new IOException("Cihaz yerel ağda değil");
        return url;
    }
    static String read(InputStream stream) throws IOException {
        try(InputStream in=stream;ByteArrayOutputStream out=new ByteArrayOutputStream()){
            byte[] buffer=new byte[4096];int length;while((length=in.read(buffer))!=-1){if(out.size()+length>262144)throw new IOException("Cihaz yanıtı çok büyük");out.write(buffer,0,length);}return out.toString("UTF-8");
        }
    }
    static String get(String address) throws Exception {
        HttpURLConnection connection=(HttpURLConnection)localUrl(address).openConnection();
        connection.setConnectTimeout(1200);connection.setReadTimeout(1200);connection.setInstanceFollowRedirects(false);
        try {if(connection.getResponseCode()!=200)throw new IOException("Cihaz açıklaması alınamadı");return read(connection.getInputStream());} finally {connection.disconnect();}
    }
    static Device description(String location,String body) throws Exception {
        URL locationUrl=localUrl(location);Document document=xml(body);Element root=document.getDocumentElement();
        String base=value(root,"URLBase");URL baseUrl=base.isEmpty()?locationUrl:localUrl(base);
        NodeList devices=root.getElementsByTagNameNS("*","device");
        for(int n=0;n<devices.getLength();n++){
            Element device=(Element)devices.item(n);if(!value(device,"deviceType").contains(":MediaRenderer:"))continue;
            NodeList services=device.getElementsByTagNameNS("*","service");
            for(int i=0;i<services.getLength();i++){
                Element service=(Element)services.item(i);String type=value(service,"serviceType");
                if(!type.startsWith("urn:schemas-upnp-org:service:AVTransport:"))continue;
                String address=localUrl(new URL(baseUrl,value(service,"controlURL")).toString()).toString();
                String id=value(device,"UDN");if(id.isEmpty())id=address;
                String name=value(device,"friendlyName");return new Device(id,name.isEmpty()?locationUrl.getHost():name,address,type);
            }
        }
        return null;
    }
    static List<Device> discover() throws Exception {
        LinkedHashMap<String,String> locations=new LinkedHashMap<>();
        try(DatagramSocket socket=new DatagramSocket()){
            socket.setSoTimeout(350);
            String search="M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: \"ssdp:discover\"\r\nMX: 2\r\nST: urn:schemas-upnp-org:device:MediaRenderer:1\r\n\r\n";
            byte[] request=search.getBytes(StandardCharsets.UTF_8);
            socket.send(new DatagramPacket(request,request.length,InetAddress.getByName("239.255.255.250"),1900));
            long deadline=System.currentTimeMillis()+3000;
            while(System.currentTimeMillis()<deadline&&locations.size()<8){
                byte[] data=new byte[8192];DatagramPacket packet=new DatagramPacket(data,data.length);
                try{socket.receive(packet);String response=new String(data,0,packet.getLength(),StandardCharsets.UTF_8);
                    for(String line:response.split("\r?\n"))if(line.toLowerCase(Locale.ROOT).startsWith("location:")){
                        String location=line.substring(line.indexOf(':')+1).trim();
                        URL url=localUrl(location);
                        // SSDP yanıtı üçüncü bir makineye istek yaptıramaz.
                        if(InetAddress.getByName(url.getHost()).equals(packet.getAddress()))locations.put(location,location);
                    }
                }catch(SocketTimeoutException ignored){}catch(Exception ignored){}
            }
        }
        LinkedHashMap<String,Device> devices=new LinkedHashMap<>();
        for(String location:locations.keySet())try{Device device=description(location,get(location));if(device!=null)devices.put(device.id,device);}catch(Exception ignored){}
        return new ArrayList<>(devices.values());
    }
    static String envelope(Device device,String action,String arguments){return "<?xml version=\"1.0\" encoding=\"utf-8\"?><s:Envelope xmlns:s=\"http://schemas.xmlsoap.org/soap/envelope/\" s:encodingStyle=\"http://schemas.xmlsoap.org/soap/encoding/\"><s:Body><u:"+action+" xmlns:u=\""+escape(device.serviceType)+"\"><InstanceID>0</InstanceID>"+arguments+"</u:"+action+"></s:Body></s:Envelope>";}
    static Document soap(Device device,String action,String arguments) throws Exception {
        HttpURLConnection connection=(HttpURLConnection)localUrl(device.controlUrl).openConnection();
        connection.setRequestMethod("POST");connection.setDoOutput(true);connection.setInstanceFollowRedirects(false);
        connection.setConnectTimeout(3000);connection.setReadTimeout(5000);
        connection.setRequestProperty("Content-Type","text/xml; charset=\"utf-8\"");
        connection.setRequestProperty("SOAPAction","\""+device.serviceType+"#"+action+"\"");
        byte[] bytes=envelope(device,action,arguments).getBytes(StandardCharsets.UTF_8);
        try {connection.setFixedLengthStreamingMode(bytes.length);try(OutputStream out=connection.getOutputStream()){out.write(bytes);}
            if(connection.getResponseCode()<200||connection.getResponseCode()>=300)throw new IOException("TV isteği kabul etmedi ("+connection.getResponseCode()+")");
            return xml(read(connection.getInputStream()));
        }finally{connection.disconnect();}
    }
    static String transportState(Device device) throws Exception {return value(soap(device,"GetTransportInfo","").getDocumentElement(),"CurrentTransportState");}
    static void load(Device device,String uri,String title,String mime,boolean live) throws Exception {
        URL stream=new URL(uri);if(!stream.getProtocol().equals("http")&&!stream.getProtocol().equals("https"))throw new IOException("TV için erişilebilir yayın adresi gerekiyor");
        String metadata="<DIDL-Lite xmlns=\"urn:schemas-upnp-org:metadata-1-0/DIDL-Lite/\" xmlns:dc=\"http://purl.org/dc/elements/1.1/\" xmlns:upnp=\"urn:schemas-upnp-org:metadata-1-0/upnp/\"><item id=\"0\" parentID=\"-1\" restricted=\"1\"><dc:title>"+escape(title)+"</dc:title><upnp:class>object.item.videoItem</upnp:class><res protocolInfo=\"http-get:*:"+escape(mime)+":*\">"+escape(uri)+"</res></item></DIDL-Lite>";
        soap(device,"SetAVTransportURI","<CurrentURI>"+escape(uri)+"</CurrentURI><CurrentURIMetaData>"+escape(metadata)+"</CurrentURIMetaData>");
        soap(device,"Play","<Speed>1</Speed>");
    }
}
