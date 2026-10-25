import React, { useEffect, useState } from 'react';
import { CalendarClock, Wifi, BatteryCharging, Moon, X } from 'lucide-react';
import type { MediaItem } from '../../types';
import { ScheduleService, type ScheduledDownload } from '../../services/downloadSchedule';

interface Props {
 items: MediaItem[];
 onClose: () => void;
 onSaved: () => void;
}
const asLocalInput = (d: Date) => {
 const z=new Date(d.getTime()-d.getTimezoneOffset()*60000);
 return z.toISOString().slice(0,16);
};
const clockMinutes = (s:string):number => {
 const [h,m]=s.split(':').map(Number);
 return (h||0)*60+(m||0);
};
export const ScheduleDownloadModal: React.FC<Props> = ({items,onClose,onSaved}) => {
 const [mode,setMode]=useState<'once'|'night'>('night');
 const [date,setDate]=useState(asLocalInput(new Date(Date.now()+3600000)));
 const [start,setStart]=useState('02:00');
 const [end,setEnd]=useState('07:00');
 const [wifiOnly,setWifiOnly]=useState(true);
 const [chargingOnly,setChargingOnly]=useState(false);
 const [busy,setBusy]=useState(false);
 const [error,setError]=useState('');
 const schedule=async()=>{
  if(!items.length)return;
  const dateMs=new Date(date).getTime();
  if(mode==='once'&&(!Number.isFinite(dateMs)||dateMs<Date.now()+30000)){setError('Gelecekteki bir başlangıç saati seç.');return;}
  if(mode==='night'&&start===end){setError('Gece başlangıç ve bitiş saatleri farklı olmalı.');return;}
  setBusy(true);setError('');
  let done=0;
  try{
   for(const item of items){
    const url=item.rawStreamUrl || item.streamUrl;
    if(!url || !/^https?:\/\//i.test(url)) throw new Error('İndirme adresi geçersiz: '+item.title);
    const job:ScheduledDownload={
      id:'sched-'+Date.now()+'-'+done+'-'+Math.random().toString(36).slice(2,6),
      title:item.title,mediaId:item.id,url,poster:item.poster,
      mode,startAt:mode==='once'?dateMs:Date.now(),
      fromMinute:clockMinutes(start),toMinute:clockMinutes(end),
      wifiOnly,chargingOnly,status:'scheduled',bytes:0,total:0,
    };
    await ScheduleService.add(job);
    done++;
   }
   onSaved();
  }catch(e:any){setError((e?.message||'Zamanlama kaydedilemedi.')+(done?' · '+done+' görev kaydedildi.':''));}
  finally{setBusy(false);}
 };
 useEffect(()=>{if(items.length===0)onClose();},[items.length]);
 return <div className="fixed inset-0 z-[160] bg-black/85 p-4 flex items-center justify-center text-[#e5e1e4]">
  <div role="dialog" aria-modal="true" className="bg-[#1f2024] border border-white/10 rounded-3xl p-5 w-full max-w-md space-y-4 max-h-[95dvh] overflow-y-auto">
   <header className="flex items-center justify-between"><h2 className="font-bold text-lg flex items-center gap-2"><CalendarClock className="text-[#00f0ff]"/> İndirmeyi Zamanla</h2><button onClick={onClose} aria-label="Kapat"><X/></button></header>
   <p className="text-xs text-[#b9cacb]">{items.length===1?items[0]?.title:items.length+' bölüm sırayla indirilecek.'}</p>
   <div className="grid grid-cols-2 gap-2">
    <button onClick={()=>setMode('once')} className={'rounded-xl p-3 text-sm font-bold border '+(mode==='once'?'bg-[#00f0ff] text-black border-[#00f0ff]':'bg-white/5 border-white/10')}>⏰ Belirli Saat</button>
    <button onClick={()=>setMode('night')} className={'rounded-xl p-3 text-sm font-bold border '+(mode==='night'?'bg-[#00f0ff] text-black border-[#00f0ff]':'bg-white/5 border-white/10')}><Moon className="inline w-4 h-4 mr-1"/> Gece Modu</button>
   </div>
   {mode==='once'?<label className="text-xs block">Başlangıç tarihi ve saati<input type="datetime-local" value={date} onChange={e=>setDate(e.target.value)} className="block w-full rounded-xl bg-[#323339] p-3 mt-2 text-white"/></label>:
   <div className="grid grid-cols-2 gap-3">
    <label className="text-xs">Başlangıç<input type="time" value={start} onChange={e=>setStart(e.target.value)} className="block w-full rounded-xl bg-[#323339] p-3 mt-2 text-white"/></label>
    <label className="text-xs">Bitiş / Duraklat<input type="time" value={end} onChange={e=>setEnd(e.target.value)} className="block w-full rounded-xl bg-[#323339] p-3 mt-2 text-white"/></label>
   </div>}
   <label className="flex justify-between gap-2 items-center rounded-xl bg-white/5 p-3 text-sm"><span><Wifi className="inline w-4 h-4 mr-1"/> Yalnızca Wi-Fi</span><input type="checkbox" checked={wifiOnly} onChange={e=>setWifiOnly(e.target.checked)} className="w-5 h-5 accent-cyan-400"/></label>
   <label className="flex justify-between gap-2 items-center rounded-xl bg-white/5 p-3 text-sm"><span><BatteryCharging className="inline w-4 h-4 mr-1"/> Sadece şarjdayken</span><input type="checkbox" checked={chargingOnly} onChange={e=>setChargingOnly(e.target.checked)} className="w-5 h-5 accent-cyan-400"/></label>
   <p className="text-xs text-[#b9cacb]">{mode==='night'?'İndirme bu gece saat aralığında başlar, bitmezse sonraki gece devam etmeyi dener.':'İndirme en erken seçilen saatte başlayacak. Android pil tasarrufu nedeniyle gecikebilir.'} Program tamamen kapatılsa bile Android alarmı görevi saklar; bazı cihazlarda sistem kısıtları başlatmayı erteleyebilir.</p>
   {error&&<p className="text-sm text-red-300">{error}</p>}
   <button disabled={busy} onClick={()=>void schedule()} className="bg-[#00f0ff] disabled:opacity-40 text-[#00363a] p-3 w-full rounded-xl font-bold">{busy?'Kaydediliyor...':'⏰ Planı Kaydet'}</button>
  </div>
 </div>;
};
