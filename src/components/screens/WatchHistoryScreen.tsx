import React, { useMemo, useState } from 'react';
import { History, Play, Trash2, CheckCircle2, RotateCcw, X } from 'lucide-react';
import type { MediaItem, DownloadItem } from '../../types';
import type { WatchHistoryEntry } from '../../services/watchHistory';

interface Props {
  entries: WatchHistoryEntry[];
  onPlay: (media: MediaItem | DownloadItem) => void;
  onRemove: (id: string) => void;
  onComplete: (id: string) => void;
  onClear: () => void;
  onBack: () => void;
  isChildMode: boolean;
}
const time = (sec: number) => {
  const total = Math.max(0, Math.floor(sec));
  return [Math.floor(total / 3600), Math.floor(total % 3600 / 60), total % 60]
    .map(x => String(x).padStart(2, '0')).join(':');
};
export const WatchHistoryScreen: React.FC<Props> = ({ entries, onPlay, onRemove, onComplete, onClear, onBack, isChildMode }) => {
  const [tab, setTab] = useState<'all' | 'movie' | 'series' | 'live'>('all');
  const [confirmClear, setConfirmClear] = useState(false);
  const visible = useMemo(() => entries.filter(e => tab === 'all' || e.media.type === tab), [entries, tab]);
  const ongoing = entries.filter(e => e.media.type !== 'live' && e.positionSeconds > 0 && e.durationSeconds > 0 && !e.completed);
  return <section className="flex flex-col gap-4 w-full max-w-xl mx-auto px-4 pt-3 pb-28 text-[#e5e1e4]">
    <header className="flex items-center justify-between">
      <div><h1 className="text-xl font-bold flex gap-2 items-center"><History className="text-[#00f0ff]" /> İzleme Geçmişi</h1><p className="text-xs text-[#b9cacb]">Bu profile özel · {entries.length} içerik</p></div>
      <button onClick={onBack} className="rounded-xl bg-[#28282a] px-3 py-2 text-xs">Kataloğa Dön</button>
    </header>
    {ongoing.length > 0 && <div className="bg-[#1d272b] rounded-2xl border border-[#00f0ff]/20 p-3">
      <p className="text-sm font-bold text-[#00f0ff] mb-3">▶ İzlemeye Devam Et</p>
      <div className="flex gap-3 overflow-x-auto">{ongoing.slice(0, 12).map(e => <button key={e.id} onClick={() => onPlay(e.media)} className="shrink-0 w-32 text-left">
        <img src={e.media.poster} alt="" className="w-full h-20 object-cover rounded-lg bg-[#333]" />
        <span className="text-xs font-semibold line-clamp-2 mt-1">{e.media.title}</span>
        <span className="text-[10px] text-[#b9cacb]">{time(e.positionSeconds)}</span>
        <div className="h-1 bg-white/15 rounded mt-1"><div className="h-full rounded bg-[#00f0ff]" style={{width: Math.min(100, 100*e.positionSeconds/e.durationSeconds)+'%'}} /></div>
      </button>)}</div>
    </div>}
    <div className="grid grid-cols-4 gap-1 bg-[#222224] rounded-xl p-1">
      {([['all','Tümü'],['movie','Film'],['series','Dizi'],['live','Canlı']] as const).map(([id,label]) => <button key={id} onClick={() => setTab(id)} className={'rounded-lg py-2 text-xs '+(tab===id?'bg-[#00f0ff] text-[#00363a] font-bold':'text-[#b9cacb]')}>{label}</button>)}
    </div>
    {visible.length ? <div className="space-y-3">{visible.map(e => {
      const percent=e.durationSeconds>0 ? Math.min(100,Math.round(100*e.positionSeconds/e.durationSeconds)):0;
      return <article key={e.id} className="rounded-2xl bg-[#202022] border border-white/5 p-3 flex gap-3">
        <img src={e.media.poster} alt="" className="w-24 h-24 shrink-0 rounded-lg object-cover bg-[#333]" />
        <div className="min-w-0 flex-1 space-y-1">
          <h3 className="font-bold text-sm break-words line-clamp-2">{e.media.title}</h3>
          <p className="text-[11px] text-[#b9cacb]">{new Date(e.watchedAt).toLocaleString('tr-TR')} · {e.media.type==='live'?'Canlı TV':e.media.type==='movie'?'Film':'Dizi'}</p>
          {e.media.type!=='live'&&<><div className="h-1 rounded bg-white/10"><div className="h-full rounded bg-[#00f0ff]" style={{width:percent+'%'}} /></div><p className="text-[11px] text-[#b9cacb]">{e.completed?'İzlendi':e.durationSeconds?percent+'% · '+time(e.positionSeconds)+' / '+time(e.durationSeconds):'Son açılan içerik · konum bilinmiyor'}</p></>}
          <div className="flex flex-wrap gap-1.5 pt-1">
            <button onClick={()=>onPlay(e.media)} className="rounded-lg bg-[#00f0ff] text-[#00363a] px-2 py-1.5 text-[11px] font-bold flex items-center gap-1"><Play size={12}/>{e.media.type==='live'?'Kanalı Aç':'Oynat'}</button>
            {e.media.type!=='live'&&!e.completed&&<button aria-label="İzlendi işaretle" title="İzlendi" onClick={()=>onComplete(e.id)} className="rounded-lg bg-white/10 px-2 py-1.5"><CheckCircle2 size={15}/></button>}
            <button aria-label="Geçmişten kaldır" title="Geçmişten Kaldır" onClick={()=>onRemove(e.id)} className="rounded-lg bg-white/10 text-[#ffb4ab] px-2 py-1.5"><X size={15}/></button>
          </div>
        </div>
      </article>;
    })}</div>:<p className="rounded-2xl bg-[#222224] p-8 text-center text-sm text-[#b9cacb]">Bu bölümde henüz izleme geçmişi yok.</p>}
    {entries.length>0 && <button onClick={()=>setConfirmClear(true)} className="text-xs text-[#ffb4ab] flex items-center justify-center gap-2 py-3"><Trash2 size={15}/> Bu Profilin Geçmişini Temizle</button>}
    {confirmClear&&<div className="fixed inset-0 z-[160] bg-black/85 flex items-center justify-center p-4"><div className="rounded-2xl p-5 w-full max-w-sm bg-[#222224] space-y-4">
      <h3 className="font-bold">Geçmiş silinsin mi?</h3><p className="text-sm text-[#b9cacb]">Yalnızca {isChildMode?'çocuk':'bu'} profilinin izleme geçmişi silinecek. Playlist ve indirmeler korunur.</p>
      <div className="flex gap-2"><button className="flex-1 rounded-lg bg-white/10 p-3 text-sm" onClick={()=>setConfirmClear(false)}>Vazgeç</button><button className="flex-1 rounded-lg bg-[#ffb4ab] text-black p-3 text-sm" onClick={()=>{onClear();setConfirmClear(false);}}>Temizle</button></div>
    </div></div>}
  </section>;
};
