import { Capacitor, registerPlugin } from '@capacitor/core';
import { FamilyProfilesService } from './familyProfiles';
import { StorageService } from './storage';

type GoogleDriveNative = {
  authorize(): Promise<{ accessToken: string; grantedScopes: string[] }>;
  disconnect(): Promise<void>;
};
const Native = registerPlugin<GoogleDriveNative>('XiptvGoogleDrive');
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3';
const FILE_NAME = 'xiptvplay-backup-v1.enc.json';
const OWNER_KEY = 'xiptvplay_cloud_owner_v1';
const LAST_SYNC_KEY = 'xiptvplay_cloud_last_backup_v1';

export interface GoogleDriveSession { accountId: string; email: string; accessToken: string; }
export interface CloudEnvelope { schema: 1; salt: string; nonce: string; payload: string; createdAt: string; }
export interface CloudSnapshot {
  schema: 1;
  createdAt: string;
  profiles: ReturnType<typeof FamilyProfilesService.get>;
  playlists: ReturnType<typeof StorageService.getPlaylists>;
  favorites: Record<string, unknown[]>;
  history: Record<string, unknown[]>;
  settings: ReturnType<typeof StorageService.getSettings>;
}
const encode = (data: Uint8Array) => btoa(Array.from(data, b => String.fromCharCode(b)).join(''));
const decode = (data: string) => Uint8Array.from(atob(data), char => char.charCodeAt(0));
const saltBytes = () => crypto.getRandomValues(new Uint8Array(16));
const encryptionKey = async (password: string, salt: Uint8Array): Promise<CryptoKey> => {
  if (password.length < 10) throw Error('Yedek şifresi en az 10 karakter olmalı.');
  const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return crypto.subtle.deriveKey({ name: 'PBKDF2', salt: salt as BufferSource, iterations: 240000, hash: 'SHA-256' },
    base, {name:'AES-GCM',length:256},false,['encrypt','decrypt']);
};
async function encrypt(snapshot: CloudSnapshot, password: string): Promise<CloudEnvelope> {
  const salt=saltBytes(), nonce=crypto.getRandomValues(new Uint8Array(12));
  const key=await encryptionKey(password,salt);
  const cipher=await crypto.subtle.encrypt({ name:'AES-GCM',iv:nonce as BufferSource },key,
    new TextEncoder().encode(JSON.stringify(snapshot)));
  return {schema:1,salt:encode(salt),nonce:encode(nonce),payload:encode(new Uint8Array(cipher)),createdAt:snapshot.createdAt};
}
async function decrypt(envelope: CloudEnvelope, password: string): Promise<CloudSnapshot> {
  if(envelope.schema!==1)throw Error('Yedek sürümü desteklenmiyor.');
  try {
    const key=await encryptionKey(password,decode(envelope.salt));
    const data=await crypto.subtle.decrypt({name:'AES-GCM',iv:decode(envelope.nonce) as BufferSource},
      key,decode(envelope.payload) as BufferSource);
    const parsed=JSON.parse(new TextDecoder().decode(data));
    if(parsed.schema!==1||!parsed.profiles||!Array.isArray(parsed.playlists))throw Error('Yedek içeriği geçersiz.');
    return parsed as CloudSnapshot;
  }catch(e){throw Error('Yedek şifresi yanlış ya da dosya bozuk.');}
}
const call = async (url:string, token:string, init:RequestInit={}) => {
  const response=await fetch(url,{...init,headers:{Authorization:'Bearer '+token,...(init.headers||{})}});
  if(!response.ok)throw Error('Google Drive bağlantısı HTTP '+response.status);
  return response;
};
const findFile = async (token:string):Promise<string|null> => {
  const params=new URLSearchParams({spaces:'appDataFolder',q:"name = '"+FILE_NAME+"' and trashed = false",fields:'files(id,name,modifiedTime)',page_size:'10'});
  const data=await (await call(DRIVE+'/files?'+params,token)).json();
  return data.files?.[0]?.id||null;
};
const collect = ():CloudSnapshot => {
  const profiles=FamilyProfilesService.get();
  const profileIds=[...new Set(['parent',...(profiles?.profiles||[]).map(p=>p.id)])];
  const favorites:Record<string,unknown[]>={};
  const history:Record<string,unknown[]>={};
  for(const id of profileIds){
    if(id==='parent')favorites[id]=StorageService.getFavoriteItems();
    else{
      try { favorites[id]=JSON.parse(localStorage.getItem('xiptvplay_profile_favorites_v1_'+id)
        || (id==='child'?localStorage.getItem('xiptvplay_child_favorite_items_v1'):'') || '[]'); }
      catch { favorites[id]=[]; }
    }
    try{history[id]=JSON.parse(localStorage.getItem('xiptvplay_watch_history_v1_'+id)||'[]');}
    catch{history[id]=[];}
  }
  return {schema:1,createdAt:new Date().toISOString(),profiles,
    playlists:StorageService.getPlaylists(),favorites,history,settings:StorageService.getSettings()};
};
export const CloudDriveService={
  linkedOwner():string|null { return localStorage.getItem(OWNER_KEY); },
  lastBackup():string|null { return localStorage.getItem(LAST_SYNC_KEY); },
  async signIn():Promise<GoogleDriveSession>{
    if(!Capacitor.isNativePlatform())throw Error('Google bağlantısı şimdilik Android APK için destekleniyor.');
    const result=await Native.authorize();
    const identity=await (await call('https://openidconnect.googleapis.com/v1/userinfo',result.accessToken)).json();
    if(!identity.sub || !identity.email)throw Error('Google hesap bilgisi doğrulanamadı.');
    return { accountId:identity.sub,email:identity.email,accessToken:result.accessToken };
  },
  async remoteInfo(session:GoogleDriveSession):Promise<{exists:boolean}>{
    return {exists:Boolean(await findFile(session.accessToken))};
  },
  async backup(session:GoogleDriveSession, password:string):Promise<void> {
    const owner=this.linkedOwner();
    // Never upload data created by another signed-in Drive account.
    if(owner && owner!==session.accountId)throw Error('Bu cihazdaki veriler başka bir Google hesabına bağlı. Önce o hesaba dön veya yeni hesap için ayrı kurulum yap.');
    const fileId=await findFile(session.accessToken);
    const payload=JSON.stringify(await encrypt(collect(),password));
    if(fileId){
      await call(UPLOAD+'/files/'+encodeURIComponent(fileId)+'?uploadType=media',session.accessToken,
        {method:'PATCH',headers:{'Content-Type':'application/json'},body:payload});
    }else {
      const boundary='xiptv_'+crypto.randomUUID();
      const body='--'+boundary+'\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n'
       +JSON.stringify({name:FILE_NAME,parents:['appDataFolder'],mimeType:'application/json'})
       +'\r\n--'+boundary+'\r\nContent-Type: application/json\r\n\r\n'+payload+'\r\n--'+boundary+'--';
      await call(UPLOAD+'/files?uploadType=multipart',session.accessToken,
        {method:'POST',headers:{'Content-Type':'multipart/related; boundary='+boundary},body});
    }
    localStorage.setItem(OWNER_KEY,session.accountId);
    localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());
  },
  async inspectBackup(session:GoogleDriveSession,password:string):Promise<CloudSnapshot> {
    const fileId=await findFile(session.accessToken);
    if(!fileId)throw Error('Bu Google hesabında henüz XIPTV Play yedeği bulunamadı.');
    const envelope=await (await call(DRIVE+'/files/'+encodeURIComponent(fileId)+'?alt=media',session.accessToken)).json();
    return decrypt(envelope,password);
  },
  restore(session:GoogleDriveSession,snapshot:CloudSnapshot):void {
    if(snapshot.schema!==1||!snapshot.profiles||!Array.isArray(snapshot.playlists))throw Error('Yedek geçersiz.');
    const owner=this.linkedOwner();
    if(owner && owner!==session.accountId)throw Error('Bu cihaz başka bir Google hesabına bağlı. Hesap verilerini karıştırmamak için geri yükleme engellendi.');
    // Keep original downloaded files and native schedules local. Import only
    // portable profile, playlists, history and favorite records.
    if(snapshot.profiles)FamilyProfilesService.save(snapshot.profiles);
    StorageService.savePlaylists(snapshot.playlists);
    if(snapshot.settings)StorageService.saveSettings(snapshot.settings);
    for(const [id,items] of Object.entries(snapshot.favorites||{})){
      if(!Array.isArray(items))continue;
      if(id==='parent')StorageService.saveFavoriteItems(items as any);
      else localStorage.setItem('xiptvplay_profile_favorites_v1_'+id,JSON.stringify(items));
    }
    for(const [id,items] of Object.entries(snapshot.history||{})){
      if(Array.isArray(items))localStorage.setItem('xiptvplay_watch_history_v1_'+id,JSON.stringify(items));
    }
    localStorage.setItem(OWNER_KEY,session.accountId);
    localStorage.setItem(LAST_SYNC_KEY,new Date().toISOString());
  },
  async disconnect(){await Native.disconnect();}
};
