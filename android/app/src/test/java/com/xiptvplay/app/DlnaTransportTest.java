package com.xiptvplay.app;
import org.junit.Test;
import static org.junit.Assert.*;
public class DlnaTransportTest {
 @Test public void discoversOnlyRendererWithTransport() throws Exception {
  String body="<root xmlns=\"urn:schemas-upnp-org:device-1-0\"><device><deviceType>urn:schemas-upnp-org:device:MediaRenderer:1</deviceType><friendlyName>Salon TV</friendlyName><UDN>uuid:tv</UDN><serviceList><service><serviceType>urn:schemas-upnp-org:service:AVTransport:1</serviceType><controlURL>/upnp/control</controlURL></service></serviceList></device></root>";
  DlnaTransport.Device device=DlnaTransport.description("http://192.168.1.20:8000/device.xml",body);
  assertNotNull(device);assertEquals("Salon TV",device.name);assertEquals("http://192.168.1.20:8000/upnp/control",device.controlUrl);
  assertNull(DlnaTransport.description("http://192.168.1.20/device.xml",body.replace("MediaRenderer","MediaServer")));
 }
 @Test public void externalEntityDocumentsAreRejected() throws Exception {
  try{DlnaTransport.xml("<!DOCTYPE root [<!ENTITY x SYSTEM 'file:///etc/passwd'>]><root>&x;</root>");fail("External entity accepted");}catch(Exception expected){}
 }
 @Test public void publicAndLoopbackDeviceAddressesAreRejected() throws Exception {
  for(String url:new String[]{"http://8.8.8.8/control","http://127.0.0.1/control","file:///etc/passwd"}){
   try{DlnaTransport.localUrl(url);fail("Non-LAN device accepted");}catch(Exception expected){}
  }
 }
 @Test public void credentialsAndTitleAreXmlEscaped() throws Exception {
  String raw="https://example.invalid/a?u=x&p=y<title>";
  assertEquals(raw,DlnaTransport.xml("<root><uri>"+DlnaTransport.escape(raw)+"</uri></root>").getDocumentElement().getTextContent());
  DlnaTransport.Device device=new DlnaTransport.Device("id","TV","http://192.168.1.20/control","urn:schemas-upnp-org:service:AVTransport:1");
  assertTrue(DlnaTransport.envelope(device,"Play","<Speed>1</Speed>").contains("<InstanceID>0</InstanceID>"));
 }
}
