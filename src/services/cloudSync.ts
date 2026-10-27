import { CloudDriveService, type GoogleDriveSession } from './cloudDrive';
import { StorageService } from './storage';
import { FamilyProfilesService, type FamilyConfiguration, type FamilyProfile } from './familyProfiles';
import type { Playlist } from '../types';
import type { MediaItem } from '../types';
import type { WatchHistoryEntry } from './watchHistory';

// One encrypted, append-only journal per device. Different devices never overwrite
// each other's files, so simultaneous offline changes cannot cause lost updates.
type Event = { id:string; device:string; seq:number; ts:number; kind:'favorite'|'history'|'playlist'|'family'|'profile'; profile:string; mediaId:string; enabled?:boolean; media?:MediaItem; history?:WatchHistoryEntry; playlist?:Playlist; family?:Pick<FamilyConfiguration,'version'|'pinSalt'|'pinHash'>; familyProfile?:FamilyProfile };
type Snapshot = {fav:Record<string,MediaItem[]>;hist:Record<string,WatchHistoryEntry[]>;playlists:Playlist[];family:FamilyConfiguration|null};
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
// Sync connection definitions, not the large 70,000-item catalog cache,
// changing ping measurements, progress counters, or downloaded media.
function portablePlaylist(p:Playlist):Playlist {
 const canInline=(!p.m3uUrl && p.m3uContent && p.m3uContent.length<1024*1024);
 return {
  id:p.id,name:p.name,type:p.type,serverUrl:p.serverUrl,
  username:p.username,password:p.password,m3uUrl:p.m3uUrl,
  m3uContent:canInline?p.m3uContent:undefined,
  status:'active',statusLabel:'Buluttan aktarıldı',expiryDays:0,
  expiryDateStr:'',liveCount:0,movieCount:0,seriesCount:0,
  isCached:false,lastSync:''
 };
}
function portableSignature(p:Playlist){
 const normalized=portablePlaylist(p);
 return JSON.stringify([normalized.id,normalized.name,normalized.type,
  normalized.serverUrl,normalized.username,normalized.password,
  normalized.m3uUrl,normalized.m3uContent]);
}
function readItems<T>(key:string):T[]{try{const d=JSON.parse(localStorage.getItem(key)||'[]');return Array.isArray(d)?d:[];}catch{return [];}}
function snapshots(): Snapshot {
 const fav:Record<string,MediaItem[]>={},hist:Record<string,WatchHistoryEntry[]>={};
 for(const p of profileIds()){
  fav[p]=p==='parent'?StorageService.getFavoriteItems():readItems<MediaItem>(favKey(p));
  hist[p]=readItems<WatchHistoryEntry>(histKey(p));
 }
 return {fav,hist,playlists:StorageService.getPlaylists(),family:FamilyProfilesService.get()};
}
function captureLocalChanges(){
 const now=snapshots(),device=deviceId(),previous=localStorage.getItem(LAST_SEEN_KEY);
 let old:Snapshot|undefined;
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
 // First device sends its existing playlist definitions; importing on an empty
 // device never generates removals or overwrites an existing remote connection.
 const prevPlaylists = new Map((old?.playlists||[]).map(x=>[x.id,x]));
 for(const item of now.playlists){
  const previousItem=prevPlaylists.get(item.id);
  if(!previousItem || portableSignature(previousItem)!==portableSignature(item)){
   if(item.type==='m3u' && !item.m3uUrl && (item.m3uContent?.length||0)>=1024*1024)
    continue; // Large, inline-only M3U: manually transfer rather than flood Drive.
   add({kind:'playlist',profile:'shared',mediaId:item.id,playlist:portablePlaylist(item)});
  }
 }
 // An account-wide parental PIN is copied only to devices that do not yet
 // have a family configuration. Profile permissions are versioned per ID.
 if(now.family && (!old?.family || old.family.pinSalt!==now.family.pinSalt || old.family.pinHash!==now.family.pinHash))
  add({kind:'family',profile:'shared',mediaId:'family-security',family:{
   version:1,pinSalt:now.family.pinSalt,pinHash:now.family.pinHash,
  }});
 const oldProfiles=new Map((old?.family?.profiles||[]).map(p=>[p.id,p]));
 for(const profile of now.family?.profiles||[]){
  const previousProfile=oldProfiles.get(profile.id);
  if(!previousProfile || JSON.stringify(previousProfile)!==JSON.stringify(profile))
   add({kind:'profile',profile:'shared',mediaId:profile.id,familyProfile:profile});
 }
 // Playlist/profile removals are deliberately *not* propagated in this
 // iteration. A fresh device must never erase the existing family's data.
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
 const recentPlaylist=new Map<string,Event>(),recentProfile=new Map<string,Event>();
 let familySeed:Event|undefined;
 const compare=(a:Event,b:Event)=>a.ts-b.ts||a.device.localeCompare(b.device)||a.seq-b.seq;
 for(const e of entries){
  if(!e?.profile||!e?.mediaId||!e?.id)continue;
  if(e.kind==='family'){
   if(e.family && (!familySeed || compare(e,familySeed)>0))familySeed=e;
   continue;
  }
  const key=e.profile+'\u0000'+e.mediaId;
  const table=e.kind==='favorite'?recentFav:e.kind==='history'?recentHistory:
    e.kind==='playlist'?recentPlaylist:e.kind==='profile'?recentProfile:null;
  if(!table)continue;
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
 // Use latest edit per playlist ID, retaining unrelated local playlists.
 // A remote empty list is never treated as a delete request.
 const playlistMap=new Map(current.playlists.map(p=>[p.id,p]));
 for(const e of recentPlaylist.values()){
  if(e.playlist && e.playlist.id===e.mediaId){
   const existing=playlistMap.get(e.mediaId);
   playlistMap.set(e.mediaId,existing
     ? {...existing,...e.playlist,status:existing.status,statusLabel:existing.statusLabel,
         expiryDays:existing.expiryDays,expiryDateStr:existing.expiryDateStr,
         liveCount:existing.liveCount,movieCount:existing.movieCount,
         seriesCount:existing.seriesCount,isCached:existing.isCached,
         lastSync:existing.lastSync,m3uContent:e.playlist.m3uContent??existing.m3uContent}
     :e.playlist);
  }
 }
 const mergedPlaylists=[...playlistMap.values()];
 if(JSON.stringify(mergedPlaylists)!==JSON.stringify(current.playlists)){
  if(!StorageService.savePlaylists(mergedPlaylists))throw Error('Playlistler cihazda saklanamadı.');
  changed=true;
 }
 // Parent PIN/settings bootstrap: never change an already-configured device's
 // parental PIN as a side effect of ordinary background synchronization.
 const localFamily=current.family;
 const seed=familySeed?.family;
 if(seed && typeof seed.pinHash==='string' && typeof seed.pinSalt==='string'){
  const remoteProfiles=[...recentProfile.values()].map(e=>e.familyProfile).filter((p):p is FamilyProfile=>Boolean(p?.id && p.name));
  if(!localFamily){
   const newConfig:FamilyConfiguration={version:1,pinSalt:seed.pinSalt,pinHash:seed.pinHash,
    profiles:remoteProfiles.length?remoteProfiles:[{id:'parent',name:'Ana Profil',kind:'adult',role:'admin',allowedCategories:[],allowedItemIds:[]}]};
   FamilyProfilesService.save(newConfig);changed=true;
  }else{
   // Existing parental configuration stays authoritative for current members;
   // new adult/child profiles from other devices are safely added.
   const sameAdminPin=localFamily.pinHash===seed.pinHash && localFamily.pinSalt===seed.pinSalt;
   if(sameAdminPin){
    const ownProfileChanges=new Map(events().filter(e=>e.kind==='profile').map(e=>[e.mediaId,e]));
    const existingProfiles=new Map(localFamily.profiles.map(p=>[p.id,p]));
    let familyChanged=false;
    for(const [id,event] of recentProfile){
     const profile=event.familyProfile;
     if(!profile || id!=='shared\u0000'+profile.id)continue;
     const old=existingProfiles.get(profile.id);
     if(!old){
      // An entirely new adult/child profile can be imported automatically.
      if(profile.id!=='parent' || profile.kind==='adult'){
       existingProfiles.set(profile.id,profile);familyChanged=true;
      }
     }else if(event.device!==deviceId() && old.id!=='parent'){
      const localEvents=events().filter(e=>e.kind==='profile'&&e.mediaId===old.id);
      const lastLocal=localEvents.length?localEvents[localEvents.length-1]:undefined;
      if(lastLocal && compare(event,lastLocal)<=0)continue;
      // A remote child edit may rename the profile or make rules stricter,
      // but must not silently increase its age rating / allowed items.
      if(old.kind==='child'){
       if(profile.kind!=='child')continue;
       const oldAllowed=new Set(old.allowedCategories);
       const oldItems=new Set(old.allowedItemIds);
       const widened=(profile.ageLimit||7)>(old.ageLimit||7) ||
        profile.allowedCategories.some(cat=>!oldAllowed.has(cat)) ||
        profile.allowedItemIds.some(item=>!oldItems.has(item));
       if(widened)continue;
      }
      if(JSON.stringify(old)!==JSON.stringify(profile)){
       existingProfiles.set(old.id,profile);familyChanged=true;
      }
     }
    }
    if(familyChanged){
     FamilyProfilesService.save({...localFamily,profiles:[...existingProfiles.values()]});
     changed=true;
    }
   }
  }
 }
 // Prevent the React UI from writing its old state over imported records.
 // First record the new snapshot, then notify the UI.
 localStorage.setItem(LAST_SEEN_KEY,JSON.stringify(snapshots()));
 if(changed)window.dispatchEvent(new CustomEvent('xiptv-cloud-data-changed'));
 // Imported data is the new baseline; do not echo it as local edits.
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
   for(const file of files){
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

// Persistent passphrase is encrypted by Android Keystore, never localStorage.
let timer:number|null=null,current:{session:GoogleDriveSession;password:string}|null=null;
let lastError:string|null=null,latest:string|null=localStorage.getItem('xiptvplay_auto_sync_latest_v1');
let busy=false,restoring=false,generation=0;
const emit=()=>window.dispatchEvent(new Event('xiptv-cloud-sync-status'));
const onForeground=()=>{if(document.visibilityState==='visible')void tick();};
function pause(){
 generation++;current=null;
 if(timer!==null){window.clearInterval(timer);timer=null;}
 document.removeEventListener('visibilitychange',onForeground);
 window.removeEventListener('online',onForeground);
 emit();
}
async function tick():Promise<boolean>{
 if(!current||busy||document.visibilityState!=='visible'||!navigator.onLine){emit();return false;}
 const credentials=current,epoch=generation;busy=true;emit();
 try{
  try{await CloudSyncService.sync(credentials.session,credentials.password);}
  catch(e){
   if(!/HTTP 401/.test(String(e)))throw e;
   const refreshed=await CloudDriveService.signIn(credentials.session.email);
   if(refreshed.accountId!==credentials.session.accountId)throw Error('Google hesabı değişti. Yeniden bağlan.');
   if(epoch!==generation)return false;
   credentials.session=refreshed;
   await CloudSyncService.sync(refreshed,credentials.password);
  }
  if(epoch!==generation)return false;
  latest=new Date().toISOString();localStorage.setItem('xiptvplay_auto_sync_latest_v1',latest);lastError=null;
  return true;
 }catch(e){if(epoch===generation)lastError=e instanceof Error?e.message:'Eşitleme başarısız.';return false;}
 finally{busy=false;emit();}
}
function activate(session:GoogleDriveSession,password:string){
 pause();current={session,password};lastError=null;
 timer=window.setInterval(()=>void tick(),90000);
 document.addEventListener('visibilitychange',onForeground);
 window.addEventListener('online',onForeground);
 emit();
}
export const CloudSyncController={
 async start(session:GoogleDriveSession,password:string){
  if(password.length<10)throw Error('Senkronizasyon parolası en az 10 karakter olmalı.');
  if(busy||restoring)throw Error('Devam eden eşitlemeyi bekle.');
  activate(session,password);
  if(!await tick())throw Error(lastError||'İnternet bağlantısını kontrol edip yeniden dene.');
  try{await CloudDriveService.rememberSync(session,password);}catch(e){lastError='Bu oturumda eşitleme açık, ancak güvenli kayıt yapılamadı. Yeniden etkinleştir.';emit();throw e;}
  emit();
 },
 async restore(){
  if(restoring||current||!navigator.onLine)return;
  restoring=true;const epoch=generation;emit();
  try{
   const saved=await CloudDriveService.savedSync();if(!saved)return;
   const owner=CloudDriveService.linkedOwner();
   if(owner&&owner!==saved.accountId)throw Error('Kayıtlı Google hesabı cihazla eşleşmiyor.');
   const session=await CloudDriveService.signIn(saved.email);
   if(epoch!==generation)return;
   if(session.accountId!==saved.accountId)throw Error('Google hesabı değişti. Yeniden bağlan.');
   activate(session,saved.password);await tick();
  }catch(e){lastError=e instanceof Error?e.message:'Otomatik eşitleme başlatılamadı.';}
  finally{restoring=false;emit();}
 },
 async stop(){pause();await CloudDriveService.forgetSync();emit();},
 session(){return current?.session||null;},
 status(){
  let pending=false;
  try{pending=localStorage.getItem(LAST_SEEN_KEY)!==JSON.stringify(snapshots());}catch{}
  return {active:current!==null,busy,restoring,offline:!navigator.onLine,pending,lastError,lastSync:latest};
 },
 async now(){if(!current){await this.restore();return;}await tick();}
};
