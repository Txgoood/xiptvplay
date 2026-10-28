/**
 * XIPTV Play LG-only experimental media companion.
 * Separate process: NEVER runs in the Android/standard IPTV backend.
 * Requires explicit LG_MEDIA_ALLOWED_HOSTS, limiting upstreams to operator-approved hosts.
 * Credentials live only in short-lived memory and are never returned/logged.
 */
import http from 'node:http';
import { spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||3101);
const FFMPEG=process.env.LG_FFMPEG_PATH||path.join(here,'node_modules/@ffmpeg-installer/linux-x64/ffmpeg');
const FFPROBE=process.env.LG_FFPROBE_PATH||path.join(here,'node_modules/@ffprobe-installer/linux-x64/ffprobe');
const allowHosts=(process.env.LG_MEDIA_ALLOWED_HOSTS||'').toLowerCase().split(',').map(x=>x.trim()).filter(Boolean);
const allowOrigins=(process.env.LG_MEDIA_ALLOWED_ORIGINS||'null').split(',').map(x=>x.trim()).filter(Boolean);
const MAX_BODY=8192, PROBE_TIMEOUT=22000, MAX_SESSIONS=64, SESSION_TTL=90*60*1000;
// Deliberate test-mode limits prevent accidental high-bandwidth bills on Render Free.
const STREAM_SECONDS=Math.max(15,Math.min(300,Number(process.env.LG_MEDIA_MAX_STREAM_SECONDS||120)));
const STREAM_BYTES=Math.max(5,Math.min(100,Number(process.env.LG_MEDIA_MAX_STREAM_MB||60)))*1024*1024;
const sessions=new Map(),ratelimits=new Map();
let activeProbes=0,activeStreams=0;
function json(res,status,body){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));}
function error(res,status,message){json(res,status,{success:false,error:message});}
function safeIp(ip){
 const v=String(ip||'').replace(/^::ffff:/,'');
 if(!isIP(v))return false;
 if(v.includes(':'))return !(v==='::1'||v.startsWith('fe80:')||v.startsWith('fc')||v.startsWith('fd')||v==='::'||v.startsWith('2001:db8:'));
 const n=v.split('.').map(Number);
 return ! (n[0]===0||n[0]===10||n[0]===127||n[0]>=224||
  n[0]===169&&n[1]===254||n[0]===172&&n[1]>=16&&n[1]<=31||
  n[0]===192&&n[1]===168||n[0]===100&&n[1]>=64&&n[1]<=127||
  n[0]===192&&n[1]===0&&n[2]===0||
  n[0]===198&&n[1]>=18&&n[1]<=19);
}
export async function validateHost(serverUrl){
 const u=new URL(serverUrl);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/'&&u.pathname!=='')throw Error('Sunucu adresi geçersiz.');
 const h=u.hostname.replace(/^\[|\]$/g,'').toLowerCase().replace(/\.$/,'');
 if(!allowHosts.length||!allowHosts.includes(h))throw Error('Bu yayın sunucusu LG medya servisi için izinli değil.');
 const addresses=await lookup(h,{all:true,verbatim:true});
 if(!addresses.length||addresses.some(a=>!safeIp(a.address)))throw Error('Sunucu adresi yerel veya özel ağa yönlendiriliyor.');
 return u.origin;
}
export function sourcePath(data,origin){
 if(!['movie','series'].includes(data.kind))throw Error('Alternatif motor yalnızca Film/Dizi için kullanılabilir.');
 const id=String(data.id||'');
 if(!/^[0-9]{1,12}$/.test(id))throw Error('İçerik kimliği geçersiz.');
 const user=String(data.username||''),pass=String(data.password||'');
 if(!user||!pass||user.length>160||pass.length>160||/[\/\r\n]/.test(user+pass))throw Error('Xtream kimlik bilgisi geçersiz.');
 const ext=String(data.extension||'mp4').toLowerCase();
 if(!['mp4','mkv','avi','ts','mov','m4v'].includes(ext))throw Error('Dosya uzantısı desteklenmiyor.');
 return origin+'/'+data.kind+'/'+encodeURIComponent(user)+'/'+encodeURIComponent(pass)+'/'+id+'.'+ext;
}
function limited(req,res){
 const addr=String(req.socket.remoteAddress||'unknown'),now=Date.now();
 const entry=ratelimits.get(addr)||{time:now,count:0};
 if(now-entry.time>60000){entry.time=now;entry.count=0;}
 entry.count++;ratelimits.set(addr,entry);
 if(ratelimits.size>1000)ratelimits.clear();
 if(entry.count>40){error(res,429,'Çok fazla istek. Bir dakika sonra deneyin.');return true;}
 return false;
}
function readBody(req){
 return new Promise((resolve,reject)=>{
  let size=0,parts=[];
  req.on('data',p=>{size+=p.length;if(size>MAX_BODY){reject(Error('İstek çok büyük'));req.destroy();}else parts.push(p);});
  req.on('end',()=>{try{resolve(JSON.parse(Buffer.concat(parts).toString('utf8')));}catch(e){reject(Error('Geçersiz JSON'));}});
  req.on('error',reject);
 });
}
function collect(executable,args,timeout=PROBE_TIMEOUT,maxBytes=256000){
 return new Promise((resolve,reject)=>{
  let ended=false,bytes=0,chunks=[];
  const proc=spawn(executable,args,{stdio:['ignore','pipe','ignore'],windowsHide:true});
  const timer=setTimeout(()=>{proc.kill('SIGKILL');finish(Error('Analiz zaman aşımı.'));},timeout);
  function finish(err,value){if(ended)return;ended=true;clearTimeout(timer);if(err)reject(err);else resolve(value);}
  proc.on('error',()=>finish(Error('Medya analiz aracı bu sunucuda kullanılamıyor.')));
  proc.stdout.on('data',chunk=>{bytes+=chunk.length;if(bytes>maxBytes){proc.kill('SIGKILL');finish(Error('Medya analiz çıktısı çok büyük.'));}else chunks.push(chunk);});
  proc.on('close',code=>{if(code!==0)finish(Error('Medya analizi başarısız oldu; kaynak veya codec desteklenmiyor.'));else finish(null,Buffer.concat(chunks).toString('utf8'));});
 });
}
function probeArgs(url){return ['-v','error','-rw_timeout','12000000','-probesize','3000000','-analyzeduration','5000000','-show_entries','stream=index,codec_type,codec_name,disposition:stream_tags=language,title,LANGUAGE','-of','json',url];}
function normalizeStreams(raw){
 const streams=(raw.streams||[]).filter(s=>s.codec_type==='audio'||s.codec_type==='subtitle');
 return streams.map(s=>({index:Number(s.index),type:s.codec_type,codec:String(s.codec_name||'unknown'),language:String(s.tags?.language||s.tags?.LANGUAGE||'und').slice(0,32),title:String(s.tags?.title||'').slice(0,60),externalVtt: s.codec_type==='subtitle'&&['subrip','ass','ssa','mov_text','webvtt','text'].includes(String(s.codec_name||'').toLowerCase())})).filter(s=>Number.isInteger(s.index)&&s.index>=0&&s.index<256).slice(0,40);
}
function getSession(token){const s=sessions.get(token);if(!s||s.expiry<Date.now()){sessions.delete(token);return null;}return s;}
function sendStream(res,req,args,contentType,maxMs){
 let first=true,finished=false,bytesSent=0;
 const proc=spawn(FFMPEG,args,{stdio:['ignore','pipe','ignore'],windowsHide:true});
 const timeout=setTimeout(()=>proc.kill('SIGKILL'),maxMs);
 function done(){if(finished)return;finished=true;clearTimeout(timeout);activeStreams=Math.max(0,activeStreams-1);}
 proc.on('error',()=>{if(!res.headersSent)error(res,503,'FFmpeg çalıştırılamadı.');else res.end();done();});
 proc.stdout.on('data',chunk=>{
  bytesSent+=chunk.length;
  if(bytesSent>STREAM_BYTES){proc.kill('SIGKILL');return;}
  if(first){res.writeHead(200,{'Content-Type':contentType,'Cache-Control':'no-store','Access-Control-Expose-Headers':'Content-Type'});first=false;}
  if(!res.write(chunk)){proc.stdout.pause();res.once('drain',()=>proc.stdout.resume());}
 });
 proc.on('close',code=>{if(first&&!res.headersSent)error(res,502,'Bu medya akışı mevcut codec veya dosya biçimiyle açılamadı.');else res.end();done();});
 res.on('close',()=>{if(!res.writableEnded)proc.kill('SIGKILL');});
}
function cleanup(){for(const [k,v] of sessions)if(v.expiry<Date.now())sessions.delete(k);}
const server=http.createServer(async(req,res)=>{
 const origin=req.headers.origin;
 if(origin&&allowOrigins.includes(origin)){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
 if(req.method==='OPTIONS'){
  res.writeHead(204,{'Access-Control-Allow-Methods':'GET, POST, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Access-Control-Max-Age':'600'});res.end();return;
 }
 if(limited(req,res))return;
 const pathname=new URL(req.url||'/', 'http://localhost').pathname;
 if(req.method==='GET'&&pathname==='/health'){json(res,200,{ok:true,service:'lg-media',ffprobeConfigured:!!FFPROBE,restrictedHosts:allowHosts.length});return;}
 if(req.method==='POST'&&pathname==='/tracks'){
  if(activeProbes>=1){error(res,429,'Bir analiz işlemi sürüyor. Biraz sonra tekrar deneyin.');return;}
  activeProbes++;
  try{
   const data=await readBody(req);
   const base=await validateHost(String(data.serverUrl||''));
   const url=sourcePath(data,base);
   const text=await collect(FFPROBE,probeArgs(url));
   let parsed;try{parsed=JSON.parse(text);}catch(e){throw Error('Medya parça verisi okunamadı.');}
   const streams=normalizeStreams(parsed);
   const token=randomBytes(24).toString('hex');
   cleanup();
   if(sessions.size>=MAX_SESSIONS)sessions.delete(sessions.keys().next().value);
   sessions.set(token,{url,expiry:Date.now()+SESSION_TTL,streams});
   json(res,200,{success:true,token,expiresIn:Math.floor(SESSION_TTL/1000),tracks:streams,playback:{method:'mpegts-copy',experimental:true}});
  }catch(e){error(res,400,String(e.message||'Analiz başarısız').slice(0,150));}
  finally{activeProbes--;}
  return;
 }
 const match=pathname.match(/^\/(stream|subtitle)\/([a-f0-9]{48})\/([0-9]{1,3})(?:\.vtt)?$/);
 if(req.method==='GET'&&match){
  const [,type,token,indexStr]=match,s=getSession(token),index=Number(indexStr);
  if(!s){error(res,401,'Analiz oturumu sona erdi. Tekrar tarayın.');return;}
  const track=s.streams.find(t=>t.index===index&&t.type===(type==='stream'?'audio':'subtitle'));
  if(!track){error(res,400,'Bu parça medya kaynağında bulunmuyor.');return;}
  if(type==='subtitle'&&!track.externalVtt){error(res,422,'Bu altyazı biçimi webVTT olarak dönüştürülemiyor.');return;}
  if(activeStreams>=1){error(res,429,'Alternatif oynatma meşgul.');return;}
  activeStreams++;
  if(type==='stream'){
   const start=Math.max(0,Math.min(14400,Number(new URL(req.url,'http://localhost').searchParams.get('start'))||0));
   const args=['-nostdin','-v','error','-rw_timeout','12000000','-ss',String(start),'-i',s.url,'-map','0:v:0','-map','0:'+index,'-c:v','copy','-c:a','copy','-f','mpegts','pipe:1'];
   sendStream(res,req,args,'video/mp2t',STREAM_SECONDS*1000);
  }else{
   const args=['-nostdin','-v','error','-rw_timeout','12000000','-i',s.url,'-map','0:'+index,'-c:s','webvtt','-f','webvtt','pipe:1'];
   sendStream(res,req,args,'text/vtt; charset=utf-8',90000);
  }
  return;
 }
 error(res,404,'Uç nokta bulunamadı.');
});
if(process.env.NODE_ENV!=='test')server.listen(PORT,'0.0.0.0',()=>console.log('[lg-media] listening on port '+PORT+'; allowed upstream hosts: '+allowHosts.length));
export {server,probeArgs,normalizeStreams,safeIp};
