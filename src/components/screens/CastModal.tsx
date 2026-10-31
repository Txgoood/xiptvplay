import React,{useEffect,useState} from 'react';
import {Cast,Tv,X,RefreshCw,Play,Pause,Square} from 'lucide-react';
import {NativeCast,supportsNativeCast,type CastState,type CastDevice} from '../../services/nativeCast';
import type {MediaItem} from '../../types';
export function CastModal({state,media,onClose,onChange,onSend}:{state:CastState;media:MediaItem|null;onClose:()=>void;onChange:(s:CastState)=>void;onSend:(m:MediaItem)=>Promise<void>}) {
 const [devices,setDevices]=useState<CastDevice[]>([]),[scanning,setScanning]=useState(false),[working,setWorking]=useState(false),[error,setError]=useState(''),[scanned,setScanned]=useState(false);
 const alive=React.useRef(true);useEffect(()=>()=>{alive.current=false;},[]);
 const run=async(work:()=>Promise<unknown>)=>{setWorking(true);setError('');try{await work();if(alive.current)onChange(await NativeCast.status());}catch(e){if(alive.current)setError((e as Error).message||'TV işlemi tamamlanamadı.');}finally{if(alive.current)setWorking(false);}};
 const scan=async()=>{if(scanning)return;setScanning(true);setError('');try{const result=await NativeCast.scan();if(alive.current){setDevices(result.devices);setScanned(true);}}catch(e){if(alive.current)setError((e as Error).message);}finally{if(alive.current)setScanning(false);}};
 useEffect(()=>{if(supportsNativeCast()&&!state.connected)void scan();},[]);
 return <div className="fixed inset-0 z-[110] bg-black/85 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}><section role="dialog" aria-modal="true" aria-label="Cihaza bağlan" onClick={e=>e.stopPropagation()} className="w-full max-w-md bg-[#1c1b1d] rounded-t-3xl sm:rounded-3xl border border-white/10 p-5 space-y-4 max-h-[90dvh] overflow-y-auto">
 <div className="flex items-center justify-between"><h2 className="text-lg font-bold flex items-center gap-2"><Cast className="text-[#00f0ff]"/>Cihaza bağlan</h2><button className="p-3" onClick={onClose} aria-label="Cihaz panelini kapat"><X/></button></div>
 <p className="text-xs text-[#b9cacb]">Telefon ve TV aynı yerel ağda olmalı. TV'deki bağlantı iznini kabul et.</p>
 {!supportsNativeCast()?<p role="status" className="p-3 rounded-xl bg-white/5 text-sm">Cihaz bağlantısı Android APK'da kullanılabilir.</p>:<>
 {state.connected?<div className="space-y-3 p-3 rounded-2xl border border-[#00f0ff]/30"><p className="font-bold text-[#00f0ff]">{state.name} · {state.protocol}</p><p className="text-xs break-words">{state.title||'Katalogdan bir yayın seçebilirsin.'}</p><p className="text-xs text-[#b9cacb]">{state.state==='PLAYING'?'TV oynatıyor':state.state==='PAUSED_PLAYBACK'?'Duraklatıldı':state.state==='TRANSITIONING'?'TV yayını hazırlıyor':'TV hazır'}</p><div className="flex gap-2">{(['play','pause','stop'] as const).map((action,i)=><button key={action} disabled={working} onClick={()=>void run(()=>NativeCast.control({action}))} aria-label={['TV devam et','TV duraklat','TV durdur'][i]} className="min-h-11 min-w-11 flex items-center justify-center bg-white/10 rounded-full">{i===0?<Play size={18}/>:i===1?<Pause size={18}/>:<Square size={18}/>}</button>)}</div>
 {media&&<button disabled={working} onClick={()=>void run(()=>onSend(media))} className="w-full min-h-11 rounded-full bg-[#00f0ff] text-[#00363a] font-bold text-sm px-3">Seçili yayını TV'de aç: {media.title}</button>}
 <button disabled={working} onClick={()=>void run(()=>NativeCast.disconnect())} className="min-h-11 text-sm text-[#ffb4ab]">Bağlantıyı kes</button></div>:<>
 <button disabled={working||scanning} onClick={()=>void run(()=>NativeCast.openCastPicker())} className="w-full p-3 rounded-2xl border border-white/10 flex gap-3 items-center text-left"><Cast className="text-[#00f0ff]"/><span><span className="block text-sm font-bold">Google Cast cihazları</span><span className="text-xs text-[#849495]">Chromecast ve uyumlu TV'leri aç</span></span></button>
 <h3 className="text-sm font-bold">Yerel ağdaki TV'ler · DLNA</h3>
 {devices.map(device=><button disabled={working||scanning} key={device.id} onClick={()=>void run(async()=>onChange(await NativeCast.connect({id:device.id})))} className="w-full p-3 rounded-2xl bg-white/5 flex gap-3 items-center text-left min-h-14"><Tv className="text-[#00f0ff]"/><span className="flex-1 text-sm">{device.name}</span><span className="text-xs text-[#00f0ff]">Bağlan</span></button>)}
 {scanned&&!devices.length&&<p role="status" className="text-sm text-[#b9cacb]">DLNA cihazı bulunamadı. TV'nin medya paylaşımını ve ağ bağlantısını kontrol et. Google Cast için yukarıdaki düğmeyi kullan.</p>}
 <button disabled={scanning||working} onClick={()=>void scan()} className="min-h-11 w-full rounded-full border border-white/10 flex justify-center items-center gap-2 text-sm"><RefreshCw size={16} className={scanning?'animate-spin':''}/>{scanning?'TV’ler aranıyor…':'Yeniden tara'}</button>
 </>}
 </>}
 {error&&<p role="alert" className="rounded-xl bg-amber-500/10 text-amber-200 p-3 text-sm">{error}</p>}
 <p className="text-[10px] text-[#849495]">Yayın TV'de doğrudan açılır. Video biçimi ve sağlayıcının bağlantı sınırı TV'de oynatmayı etkileyebilir.</p>
 </section></div>;
}
