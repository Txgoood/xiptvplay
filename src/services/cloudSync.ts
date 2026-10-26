import { CloudDriveService, type GoogleDriveSession } from './cloudDrive';
import { StorageService } from './storage';
import { FamilyProfilesService } from './familyProfiles';
import type { MediaItem } from '../types';
import type { WatchHistoryEntry } from './watchHistory';

// One encrypted, append-only journal per device. Different devices never overwrite
// each other's files, so simultaneous offline changes cannot cause lost updates.
type Event = { id:string; device:string; seq:number; ts:number; kind:'favorite'|'history'; profile:string; mediaId:string; enabled?:boolean; media?:MediaItem; history?:WatchHistoryEntry };
type Journal = { version:1; device:string; events:Event[] };
type Envelope = {schema:1;salt:string;nonce:string;payload:string};
const DRIVE='https://www.googleapis.com/drive/v3', UPLOAD='https://www.googleapis.com/upload/drive/v3';
const PREFIX='xiptvplay-sync-journal-';
const DEVICE_KEY='xiptvplay_sync_device_v1', OWNER_KEY='xiptvplay_cloud_owner_v1';
const EVENT_KEY='xiptvplay_sync_events_v1', LAST_SEEN_KEY='xiptvplay_sync_seen_v1';
const b64=(v:Uint8Array)=>btoa(Array.from(v,x=>String.fromCharCode(x)).join(''));
const un64=(s:string)=>Uint8Array.from(atob(s),c=>c.charCodeAt(0));
const deviceId=()=>{let d=localStorage.getItem(DEVICE_KEY);if(!d){d=crypto.randomUUID();localStorage.setItem(DEVICE_KEY,d);}return d;};
function events():Event[]{try{const v=JSON.parse(localStorage.getItem(EVENT_KEY)||'[]');return Array.isArray(v)?v:[];}catch{return [];}}
function saveEvents(v:Event[]){localStorage.setItem(EVENT_KEY,JSON.stringify(v));}
function profileIds(){return [...new Set(['parent',...(FamilyProfilesService.get()?.profiles||[]).map(p=>p.id)])];}
const favKey=(p:string)=>p==='parent'?'xiptvplay_favorite_items_v1':'xiptvplay_profile_favorites_v1_'+p;
const histKey=(p:string)=>'xiptvplay_watch_history_v1_'+p;
function readItems<T>(key:string):T[]{try{const d=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(d)?d:[];}catch{return [];}}
function snapshots(){
 const fav:Record<string,MediaItem[]>={},hist:Record<string,WatchHistoryEntry[]>={};
 for(const p of profileIds()){
  fav[p]=p==='parent'?StorageService.getFavoriteItems():readItems<MediaItem>(favKey(p));
  hist[p]=readItems<WatchHistoryEntry>(histKey(p));
 }
 return {fav,hist};
}
function captureLocalChanges(){
 const now=snapshots(),device=deviceId(),previous=localStorage.getItem(LAST_SEEN_KEY);
 let old:typeof now|undefined;
 try{if(previous)old=JSON.parse(previous);}catch{}
 const journal=events();let seq=journal.reduce((x,e)=>Math.max(x,e.device===device?e.seq:0),0);
 const add=(event:Omit<Event,'id'|'device'|'seq'|'ts'>,ts=Date.now())=>{
  const number=++seq; journal.push({...event,id:device+':'+number,device,seq:number,ts});
 };
 for(const p of profileIds()){
  const oldFav=new Map((old?.fav[p]||[]).map(v=>[v.id,v]));
  const newFav=new Map((now.fav[p]||[]).map(v=>[v.id,v]));
  for(const [id,item] of newFav)if(!oldFav.has(id))add({kind:'favorite',profile:p,mediaId:id,enabled:true,media:item});
  // Empty first snapshot is NOT interpreted as delete of remote entries.
  if(old)for(const id of oldFav.keys())if(!newFav.has(id))add({kind:'favorite',profile:p,mediaId:id,enabled:false});
  const oldHist=new Map((old?.hist[p]||[]).map(v=>[v.id,v]));
  for(const item of now.hist[p]||[]){
   const previous=oldHist.get(item.id);
   if(!previous||item.watchedAt>previous.watchedAt||item.completed!==previous.completed||item.positionSeconds!==previous.positionSeconds)
    add({kind:'history',profile:p,mediaId:item.id,history:item},item.watchedAt||Date.now());
  }
  // Watch-history deletion does not propagate in v1: it must never erase another
  // device's legitimate playback progress without a confirmation protocol.
 }
 saveEvents(journal);
 localStorage.setItem(LAST_SEEN_KEY,JSON.stringify(now));
}
async function key(password:string,salt:Uint8Array){
 const raw=await crypto.subtle.importKey('raw',new TextEncoder().encode(password),'PBKDF2',false,['deriveKey']);
 return crypto.subtle.deriveKey({name:'PBKDF2',salt:salt as BufferSource,iterations:240000,hash:'SHA-256'},raw,{name:'AES-GCM',length:256},false,['encrypt','decrypt']);
}
async function seal(journal:Journal,password:string):Promise<Envelope>{
 const salt=crypto.getRandomValues(new Uint8Array(16)),nonce=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv:nonce as BufferSource},await key(password,salt),new TextEncoder().encode(JSON.stringify(journal)));
 return {schema:1,salt:b64(salt),nonce:b64(nonce),payload:b64(new Uint8Array(cipher))};
}
async function unseal(data:Envelope,password:string):Promise<Journal>{
 const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(data.nonce) as BufferSource},await key(password,un64(data.salt)),un64(data.payload) as BufferSource);
 const j=JSON.parse(new TextDecoder().decode(clear));
 if(j.version!==1||!Array.isArray(j.events))throw Error('Senkronizasyon dosyası biçimi geçersiz.');
 return j;
}
async function request(url:string,token:string,init:RequestInit={}){
 const response=await fetch(url,{...init,headers:{Authorization:'Bearer '+token,...(init.headers||{})}});
 if(!response.ok)throw Error('Google Drive HTTP '+response.status);
 return response;
}
type DriveFile={id:string;name:string;etag?:string};
async function allFiles(token:string):Promise<DriveFile[]>{
 let page='',result:DriveFile[]=[];
 do{
  const params=new URLSearchParams({spaces:'appDataFolder',q:"name contains '"+PREFIX+"' and trashed = false",fields:'nextPageToken,files(id,name)',pageSize:'100'});
  if(page)params.set('pageToken',page);
  const data=await (await request(DRIVE+'/files?'+params,token)).json();
  result=result.concat(data.files||[]);page=data.nextPageToken||'';
 }while(page);
 return result.filter(f=>f.name?.startsWith(PREFIX)&&f.name.endsWith('.json'));
}
async function uploadOwn(token:string,own:DriveFile|undefined,body:string){
 if(own){
  // Only our device updates this immutable-ownership file.
  await request(UPLOAD+'/files/'+encodeURIComponent(own.id)+'?uploadType=media',token,{method:'PATCH',headers:{'Content-Type':'application/json'},body});
 }else{
  const boundary='xiptv_'+crypto.randomUUID();
  const name=PREFIX+deviceId()+'.json';
  const multipart='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
   +JSON.stringify({name,parents:['appDataFolder'],mimeType:'application/json'})
   +'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+body+'\r\n--'+boundary+'--';
  await request(UPLOAD+'/files?uploadType=multipart',token,{method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body:multipart});
 }
}
function applyRemote(entries:Event[]){
 const recentFav=new Map<string,Event>(),recentHistory=new Map<string,Event>();
 const compare=(a:Event,b:Event)=>a.ts-b.ts||a.device.localeCompare(b.device)||a.seq-b.seq;
 for(const e of entries){
  if(!e?.profile||!e?.mediaId||!e?.id)continue;
  const key=e.profile+'\u0000'+e.mediaId,table=e.kind==='favorite'?recentFav:recentHistory;
  const old=table.get(key);
  if(!old||compare(e,old)>0)table.set(key,e);
 }
 const current=snapshots();let changed=false;
 for(const p of profileIds()){
  const existing=new Map((current.fav[p]||[]).map(i=>[i.id,i]));
  for(const [key,e] of recentFav)if(key.startsWith(p+'\u0000')){
   if(e.enabled&&e.media)existing.set(e.mediaId,e.media);
   else if(!e.enabled)existing.delete(e.mediaId);
  }
  const values=[...existing.values()];
  if(JSON.stringify(values)!==JSON.stringify(current.fav[p])){localStorage.setItem(favKey(p),JSON.stringify(values));changed=true;}
  const history=new Map((current.hist[p]||[]).map(i=>[i.id,i]));
  for(const [k,e] of recentHistory)if(k.startsWith(p+'\u0000')&&e.history){
   const existing=history.get(e.mediaId);
   if(!existing||e.history.watchedAt>existing.watchedAt)history.set(e.mediaId,e.history);
  }
  const h=[...history.values()].sort((a,b)=>b.watchedAt-a.watchedAt).slice(0,350);
  if(JSON.stringify(h)!==JSON.stringify(current.hist[p])){localStorage.setItem(histKey(p),JSON.stringify(h));changed=true;}
 }
 if(changed)window.dispatchEvent(new CustomEvent('xiptv-cloud-data-changed'));
 // Do not create false removal events from changes downloaded from Drive.
 localStorage.setItem(LAST_SEEN_KEY,JSON.stringify(snapshots()));
 return changed;
}
let running=false;
export const CloudSyncService={
 async sync(session:GoogleDriveSession,password:string):Promise<{devices:number;records:number;changed:boolean}>{
  if(running)throw Error('Senkronizasyon zaten çalışıyor.');
  const owner=localStorage.getItem(OWNER_KEY);
  if(owner && owner!==session.accountId)throw Error('Başka Google hesabına ait cihaz verileri eşitlenemez.');
  if(password.length<10)throw Error('Senkronizasyon parolası en az 10 karakter olmalı.');
  running=true;
  try{
   captureLocalChanges();
   const files=await allFiles(session.accessToken),ownName=PREFIX+deviceId()+'.json';
   const own=files.find(f=>f.name===ownName);
   const journal:Journal={version:1,device:deviceId(),events:events()};
   const payload=JSON.stringify(await seal(journal,password));
   const all=new Map<string,Event>();
   for(const file of files.filter(f=>f.name!==ownName)){
    let data:Envelope;
    try{data=await (await request(DRIVE+'/files/'+encodeURIComponent(file.id)+'?alt=media',session.accessToken)).json();}
    catch(e){throw Error('Diğer cihazın senkronizasyon dosyası okunamadı: '+file.name);}
    let remote:Journal;
    try{remote=await unseal(data,password);}
    catch{throw Error('Başka cihazın senkronizasyon parolası farklı; veriler değiştirilmedi.');}
    for(const e of remote.events)all.set(e.id,e);
   }
   for(const e of journal.events)all.set(e.id,e);
   // Verify every remote journal before writing anything to Drive.
   await uploadOwn(session.accessToken,own,payload);
   const changed=applyRemote([...all.values()]);
   localStorage.setItem(OWNER_KEY,session.accountId);
   return {devices:files.length+(own?0:1),records:all.size,changed};
  }finally{running=false;}
 }
};

// Credentials and the encryption passphrase stay in memory, never localStorage.
// Automatic sync pauses after an app restart until the user unlocks it again.
let timer:number|null=null;
let current:{session:GoogleDriveSession;password:string}|null=null;
let lastError:string|null=null;
let latest:string|null=null;
async function tick(){
 if(!current || document.visibilityState!=='visible' || !navigator.onLine)return;
 try{
  await CloudSyncService.sync(current.session,current.password);
  latest=new Date().toISOString();lastError=null;
  window.dispatchEvent(new Event('xiptv-cloud-sync-status'));
 }catch(e){
  lastError=e instanceof Error?e.message:String(e);
  if(/HTTP 401|HTTP 403|parolası farklı|Başka Google hesabına/.test(lastError))CloudSyncController.stop();
  window.dispatchEvent(new Event('xiptv-cloud-sync-status'));
 }
}
const onForeground=()=>{if(document.visibilityState==='visible')void tick();};
export const CloudSyncController={
 start(session:GoogleDriveSession,password:string){
  if(password.length<10)throw Error('Senkronizasyon parolası en az 10 karakter olmalı.');
  this.stop();current={session,password};lastError=null;
  timer=window.setInterval(()=>void tick(),90000);
  document.addEventListener('visibilitychange',onForeground);
  void tick();
 },
 stop(){
  current=null;
  if(timer!==null){window.clearInterval(timer);timer=null;}
  document.removeEventListener('visibilitychange',onForeground);
 },
 status(){return {active:current!==null,lastError,lastSync:latest};},
 async now(){if(!current)throw Error('Önce otomatik senkronizasyonu aç.');await tick();}
};

