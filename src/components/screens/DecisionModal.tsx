import React, {useMemo,useState} from 'react';
import {X,Dices,Play} from 'lucide-react';
import type {MediaItem} from '../../types';
import type {WatchHistoryEntry} from '../../services/watchHistory';
import {discoveryTags,durationMinutes,eligibleDecisions,pickDecisions,type DecisionFilters} from '../../services/discoveryTools';
import {peekTmdbDetails} from '../../services/tmdbClient';
export function DecisionModal({catalog,history,onClose,onInfo,onPlay}:{catalog:MediaItem[];history:WatchHistoryEntry[];onClose:()=>void;onInfo:(item:MediaItem)=>void;onPlay:(item:MediaItem)=>void}) {
  const [filters,setFilters]=useState<DecisionFilters>({type:'movie',tag:'',maxMinutes:0,minRating:0,hideWatched:true});
  const [round,setRound]=useState(0), seen=React.useRef(new Set<string>());
  const tags=useMemo(()=>[...new Set(catalog.filter(i=>i.type===filters.type).flatMap(i=>discoveryTags(i)))].sort((a,b)=>a.localeCompare(b,'tr')).slice(0,100),[catalog,filters.type]);
  const eligible=useMemo(()=>eligibleDecisions(catalog,filters,history),[catalog,filters,history]);
  const picks=useMemo(()=>{const result=pickDecisions(eligible,seen.current);result.forEach(item=>seen.current.add(item.id));return result;},[eligible,round]);
  const update=(patch:Partial<DecisionFilters>)=>{seen.current.clear();setFilters(prev=>({...prev,...patch}));};
  return <div className="fixed inset-0 z-[100] bg-black/85 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={onClose}>
    <section role="dialog" aria-modal="true" aria-label="Karar veremiyorum" onClick={e=>e.stopPropagation()} className="w-full max-w-lg max-h-[92dvh] overflow-y-auto bg-[#171719] rounded-t-3xl sm:rounded-3xl p-5 space-y-4 border border-white/10">
      <div className="flex items-center justify-between"><h2 className="font-bold text-xl flex items-center gap-2"><Dices className="text-[#00f0ff]"/>Karar veremiyorum</h2><button onClick={onClose} aria-label="Önerileri kapat" className="p-3"><X/></button></div>
      <p className="text-xs text-[#b9cacb]">Kataloğundan sana 3 seçenek · {eligible.length} uygun içerik</p>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <label>İçerik<select aria-label="Öneri türü" value={filters.type} onChange={e=>update({type:e.target.value as 'movie'|'series',tag:''})} className="discovery-select"><option value="movie">Film</option><option value="series">Dizi</option></select></label>
        <label>Tür / kategori<select aria-label="Öneri kategorisi" value={filters.tag} onChange={e=>update({tag:e.target.value})} className="discovery-select"><option value="">Tümü</option>{tags.map(tag=><option key={tag}>{tag}</option>)}</select></label>
        <label>{filters.type==='series'?'Bölüm süresi':'Süre'}<select aria-label="En fazla süre" value={filters.maxMinutes} onChange={e=>update({maxMinutes:Number(e.target.value)})} className="discovery-select"><option value="0">Fark etmez</option>{[30,60,90,120,180].map(n=><option value={n} key={n}>En fazla {n} dk</option>)}</select></label>
        <label>Minimum puan<select aria-label="Minimum puan" value={filters.minRating} onChange={e=>update({minRating:Number(e.target.value)})} className="discovery-select"><option value="0">Fark etmez</option>{[6,7,8].map(n=><option value={n} key={n}>{n} ve üzeri</option>)}</select></label>
      </div>
      <label className="flex gap-2 items-center text-sm"><input type="checkbox" checked={filters.hideWatched} onChange={e=>update({hideWatched:e.target.checked})}/> İzlediklerimi gösterme</label>
      <p className="text-[11px] text-[#849495]">Süre / puan filtresinde bilgisi eksik içerikler elenir. Dizi süresi biliniyorsa bölüm süresidir.</p>
      {!picks.length&&<p role="status" className="p-4 rounded-xl bg-white/5">Bu filtrelere uygun içerik yok. Süre veya puan sınırını kaldırabilirsin.</p>}
      {picks.map(item=>{const cached=peekTmdbDetails(item),minutes=cached?.runtimeMinutes||durationMinutes(item.duration);return <article key={item.id} className="flex gap-3 p-3 rounded-2xl bg-[#242427] border border-white/5">
        <button onClick={()=>onInfo(item)} aria-label={item.title+' bilgileri'} className="w-20 shrink-0"><img src={item.poster} alt="" className="w-full aspect-[2/3] object-cover rounded-xl" loading="lazy"/></button>
        <div className="min-w-0 flex-1 space-y-2"><button className="text-left font-bold text-sm" onClick={()=>onInfo(item)}>{item.title}</button><p className="text-xs text-[#b9cacb]">{minutes?Math.round(minutes)+' dk':'Süre bilinmiyor'} · {cached?`${cached.rating.toFixed(1)} TMDB`:item.rating?`${item.rating} sağlayıcı puanı`:'Puan bilinmiyor'}</p><p className="text-xs text-[#b9cacb]">{filters.tag?'Seçtiğin tür / kategoriye uygun.':'Kataloğundaki uygun seçeneklerden seçildi.'}</p><button onClick={()=>onPlay(item)} className="min-h-11 px-4 bg-[#00f0ff] text-[#00363a] rounded-full flex items-center gap-2 font-bold text-sm"><Play size={16}/>{item.type==='series'?'Bölümleri aç':'İzle'}</button></div>
      </article>})}
      {picks.length>0&&<button onClick={()=>setRound(n=>n+1)} className="min-h-11 w-full rounded-full border border-[#00f0ff]/40 text-[#00f0ff]">Başka 3 öner</button>}
    </section>
  </div>;
}
