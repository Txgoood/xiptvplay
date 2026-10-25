import { Capacitor, registerPlugin } from '@capacitor/core';

export interface ScheduledDownload {
 id:string; title:string; url:string; poster?:string; mediaId:string;
 mediaType?:'movie'|'series'; playlistId?:string; resolution?:string; category?:string;
 seriesTitle?:string; seasonNumber?:number; episodeNumber?:number; episodeTitle?:string;
 mode:'once'|'night'; startAt:number; fromMinute:number; toMinute:number;
 wifiOnly:boolean; chargingOnly:boolean; status:'scheduled'|'downloading'|'completed'|'paused'|'error'|'cancelled';
 bytes:number; total:number; path?:string; error?:string;
}
interface NativeScheduler {
 schedule(options:ScheduledDownload):Promise<void>;
 list():Promise<{items:ScheduledDownload[]}>;
 cancel(options:{id:string}):Promise<void>;
 checkNow():Promise<void>;
}
const plugin=registerPlugin<NativeScheduler>('DownloadScheduler');
const KEY='xiptvplay_scheduled_downloads_v1';
const load=():ScheduledDownload[]=>{try{const d=JSON.parse(localStorage.getItem(KEY)||'[]');return Array.isArray(d)?d:[]}catch{return []}};
const store=(items:ScheduledDownload[])=>localStorage.setItem(KEY,JSON.stringify(items));
export const ScheduleService={
 async list():Promise<ScheduledDownload[]>{
  if(!Capacitor.isNativePlatform())return load();
  try{const response=await plugin.list();store(response.items||[]);return response.items||[]}catch{return load()}
 },
 async add(job:ScheduledDownload):Promise<void>{
  if(Capacitor.isNativePlatform())await plugin.schedule(job);
  else throw new Error('Zamanlanmış arka plan indirmesi yalnızca Android APK üzerinde destekleniyor.');
  store([...load().filter(j=>j.id!==job.id),job]);
 },
 async cancel(id:string):Promise<void>{
  if(Capacitor.isNativePlatform())await plugin.cancel({id});
  store(load().filter(j=>j.id!==id));
 },
 async checkNow(){if(Capacitor.isNativePlatform())await plugin.checkNow()}
};
