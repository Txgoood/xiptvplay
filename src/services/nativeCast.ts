import {Capacitor,registerPlugin,type PluginListenerHandle} from '@capacitor/core';
import type {MediaItem} from '../types';
export interface CastDevice {id:string;name:string;protocol:string}
export interface CastState {connected:boolean;name:string;protocol:string;state:string;title:string}
export const EMPTY_CAST:CastState={connected:false,name:'',protocol:'',state:'STOPPED',title:''};
interface NativeCastApi {
 scan():Promise<{devices:CastDevice[]}>;openCastPicker():Promise<void>;connect(options:{id:string}):Promise<CastState>;status():Promise<CastState>;
 loadMedia(options:{url:string;title:string;mime:string;live:boolean}):Promise<CastState>;
 control(options:{action:'play'|'pause'|'stop'}):Promise<void>;disconnect():Promise<void>;
 addListener(event:'castState',callback:(state:CastState)=>void):Promise<PluginListenerHandle>;
}
const LocalPlayer=registerPlugin<{stop():Promise<void>}>('NativeMediaPlayer');
export const stopLocalPlayback=()=>LocalPlayer.stop();
export const NativeCast=registerPlugin<NativeCastApi>('NativeCast');
export const supportsNativeCast=()=>Capacitor.getPlatform()==='android'&&Capacitor.isPluginAvailable('NativeCast');
export function castMediaRequest(item:MediaItem) {
 const url=item.rawStreamUrl||item.streamUrl;
 if(!/^https?:\/\//i.test(url||''))throw new Error('Bu yerel dosya doğrudan TV’ye gönderilemiyor. Katalogdaki yayını seç.');
 let ext=item.containerExtension?.toLowerCase()||'';
 try{ext=ext||new URL(url).pathname.split('.').pop()!.toLowerCase();}catch{}
 const mime=ext==='m3u8'?'application/x-mpegURL':ext==='ts'?'video/mp2t':ext==='mkv'?'video/x-matroska':'video/mp4';
 return {url,title:item.title,mime,live:item.type==='live'};
}
