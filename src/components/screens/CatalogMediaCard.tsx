import { useState, useEffect, useRef } from 'react';
import { isTvMode } from '../../services/tvNavigation';
import { CatalogPoster } from '../CatalogPoster';
import { CalendarDays, Download, Heart, Info, Layers, Play, MoreHorizontal, X } from 'lucide-react';
import { MovieCollectionBadge } from '../MovieCollectionBadge';
import type { MediaItem } from '../../types';
import type { CatalogView } from '../../services/catalogDiscovery';
import { catalogRating } from '../../services/catalogDiscovery';

interface Props {
  item: MediaItem;
  view: CatalogView;
  isChildMode: boolean;
  onPlay: (item: MediaItem) => void;
  onSeries: (item: MediaItem) => void;
  onInfo: (item: MediaItem) => void;
  onEpg: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
  onSchedule: (item: MediaItem) => void;
  onFavorite: (id: string) => void;
}
export function CatalogMediaCard({ item, view, isChildMode, onPlay, onSeries, onInfo, onEpg, onDownload, onSchedule, onFavorite }: Props) {
  const [actions,setActions]=useState(false);
  useEffect(()=>{if(!actions)return;const back=(e:Event)=>{e.stopImmediatePropagation();setActions(false);};window.addEventListener('xiptv-tv-back',back,true);return()=>window.removeEventListener('xiptv-tv-back',back,true);},[actions]);
  const press=useRef<ReturnType<typeof setTimeout>|null>(null);
  const longPress=useRef(false);
  const cancelPress=()=>{if(press.current!==null){clearTimeout(press.current);press.current=null;}};
  useEffect(()=>()=>{if(press.current!==null)clearTimeout(press.current);},[]);
  const tv=isTvMode();
  const live = item.type === 'live', series = item.type === 'series';
  const list = view === 'list' || view === 'details';
  const open = () => live ? onPlay(item) : onInfo(item);
  const rating = catalogRating(item.rating);
  if(tv){
    const activate=()=>live?onPlay(item):series?onSeries(item):onInfo(item);
    const choose=(fn:()=>void)=>{setActions(false);fn();};
    return <article className={`tv-simple-card tv-simple-card--${view} ${live?'tv-simple-live':''}`} data-media-id={item.id}>
      <button type="button" className="tv-simple-target" aria-label={item.title+' · OK: aç, uzun OK: seçenekler'} data-tv-poster="true"
        onKeyDown={e=>{if(e.key!=='Enter'&&e.key!==' ')return;e.preventDefault();if(e.repeat||press.current!==null)return;longPress.current=false;press.current=setTimeout(()=>{press.current=null;longPress.current=true;window.dispatchEvent(new Event('xiptv-long-confirm'));setActions(true);},650);}}
        onKeyUp={e=>{if(e.key!=='Enter'&&e.key!==' ')return;e.preventDefault();cancelPress();if(!longPress.current)activate();longPress.current=false;}}
        onBlur={cancelPress} onClick={activate} onContextMenu={e=>{e.preventDefault();setActions(true);}}>
        <div className="tv-simple-art"><CatalogPoster media={item} className={`w-full h-full ${live?'object-contain p-3':'object-cover'}`}/>
          {item.isFavorite&&<Heart size={15} className="tv-simple-heart" fill="currentColor"/>}
          {rating&&!live&&<span className="tv-simple-rating">★ {rating}</span>}
          {live&&<span className="tv-simple-live-badge">{item.resolution||'CANLI'}</span>}
        </div>
        <div className="tv-simple-meta"><span className="tv-simple-title">{item.title}</span>{view==='details'&&<span className="tv-simple-category">{item.category}</span>}
        {view==='details'&&live&&item.epgCurrent&&<span className="tv-simple-category">{item.epgCurrent}</span>}</div>
      </button>
      {actions&&<div role="dialog" aria-modal="true" aria-label={item.title+' seçenekleri'} className="fixed inset-0 z-[130] bg-black/75 flex items-center justify-center"><div className="tv-simple-menu"><strong>{item.title}</strong>
        <button onClick={()=>choose(()=>series?onSeries(item):onPlay(item))}>{series?'Bölümler':'İzle'}</button>
        <button onClick={()=>choose(()=>live?onEpg(item):onInfo(item))}>{live?'Yayın bilgisi':'Bilgiler'}</button>
        <button onClick={()=>choose(()=>onFavorite(item.id))}>{item.isFavorite?'Favorilerden çıkar':'Favorilere ekle'}</button>
        {!isChildMode&&!live&&<button onClick={()=>choose(()=>series?onSeries(item):onDownload(item))}>İndir</button>}
        {!isChildMode&&!live&&<button onClick={()=>choose(()=>series?onSeries(item):onSchedule(item))}>İndirmeyi zamanla</button>}
        <button onClick={()=>setActions(false)}>Kapat</button></div></div>}
    </article>;
  }
  return <article className={`catalog-card catalog-card--${view} ${live?"catalog-card--live":""} group min-w-0 rounded-2xl bg-[#1c1b1d] border border-white/5 overflow-hidden hover:border-[#00f0ff]/30`}>
    <div className="catalog-card-poster relative bg-[#2a2a2c] overflow-hidden">
      <button type="button" onClick={open} className="block w-full h-full" aria-label={`${item.title} ${live ? 'izle' : 'bilgileri'}`}>
        <CatalogPoster media={item} className={`w-full h-full ${live ? 'object-contain p-3' : 'object-cover'}`} />
      </button>
      {!live && <MovieCollectionBadge media={item} showRuntime />}
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 pointer-events-none" />
      <span className="absolute bottom-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-[#00f0ff] pointer-events-none">{live ? 'CANLI' : series ? 'DİZİ' : 'FİLM'}</span>
      {rating && <span className="absolute bottom-2 right-2 rounded bg-black/70 text-amber-300 px-1.5 py-0.5 text-[11px] pointer-events-none" title="Sağlayıcı puanı / 10">★ {rating}</span>}
      <button onClick={() => onFavorite(item.id)} aria-label={item.isFavorite ? `${item.title} favorilerden çıkar` : `${item.title} favorilere ekle`} aria-pressed={Boolean(item.isFavorite)}
        className={`absolute top-1 right-1 ${tv ? "w-7 h-7" : "min-w-10 min-h-10"} rounded-full bg-black/65 text-[#ffb4ab] flex items-center justify-center`}>
        <Heart className={`w-4 h-4 ${item.isFavorite ? 'fill-current' : ''}`} />
      </button>
      {tv && !live && <button type="button" aria-label="Bilgiler" onClick={()=>onInfo(item)} className="absolute top-1 right-9 w-7 h-7 rounded-full bg-black/65 flex items-center justify-center text-white"><Info size={16}/></button>}
      {tv && !live && !isChildMode && <button type="button" aria-label="İçerik seçenekleri" onClick={()=>setActions(true)} className="absolute top-1 right-[4.25rem] w-7 h-7 rounded-full bg-black/65 flex items-center justify-center text-white"><MoreHorizontal size={16}/></button>}
    </div>
    {actions && <div role="dialog" aria-modal="true" className="fixed inset-0 z-[130] bg-black/75 flex items-center justify-center"><div className="w-full max-w-sm rounded-2xl bg-[#202022] p-4 flex flex-col gap-2"><div className="flex justify-between gap-2"><strong>{item.title}</strong><button onClick={()=>setActions(false)} aria-label="Kapat"><X size={20}/></button></div>{!isChildMode&&<button className="p-3 rounded-xl bg-white/10 text-left" onClick={()=>{setActions(false);series?onSeries(item):onDownload(item);}}>İndir</button>}{!isChildMode&&<button className="p-3 rounded-xl bg-white/10 text-left" onClick={()=>{setActions(false);series?onSeries(item):onSchedule(item);}}>İndirmeyi zamanla</button>}</div></div>}
    <div className="catalog-card-body flex flex-col min-w-0 p-2.5 gap-2">
      <button type="button" className="catalog-card-heading text-left min-w-0" onClick={open}>
        <h3 className="catalog-card-title font-bold text-[13px] leading-snug line-clamp-2 text-[#e5e1e4]" title={item.title}>{item.title}</h3>
        <p className="catalog-card-category text-[11px] text-[#b9cacb] truncate mt-1">{item.category}</p>
      </button>
      {view === 'details' && <div className="text-xs text-[#b9cacb] flex flex-wrap gap-x-3 gap-y-1">
        <span>{live ? 'Canlı TV' : series ? 'Dizi' : 'Film'}</span><span>{item.resolution}</span>
        {item.year && <span>{item.year}</span>}
        {item.addedAt && <span>Eklendi: {new Date(item.addedAt).toLocaleDateString('tr-TR')}</span>}
        {item.releaseDate && <span>İlk yayın: {item.releaseDate}</span>}
      </div>}
      {live && item.epgCurrent && <p className="catalog-card-epg text-[11px] text-[#4edea3] truncate" title={item.epgCurrent}>{item.epgCurrent}</p>}
      <div className={`catalog-card-actions flex flex-wrap items-center gap-1.5 ${list || tv ? '' : 'mt-auto'}`}>
        <button type="button" className="catalog-primary min-h-10 px-2 rounded-xl bg-[#00f0ff] text-[#00363a] font-bold text-xs flex items-center justify-center gap-1 flex-1 min-w-0"
          onClick={() => series ? onSeries(item) : onPlay(item)} aria-label={series ? `${item.title} sezonlar ve bölümler` : `${item.title} oynat`}>
          {series ? <Layers size={15} className="shrink-0" /> : <Play size={15} className="shrink-0" />}<span>{series ? 'Bölümler' : 'İzle'}</span>
        </button>
        {!tv && <button type="button" onClick={() => live ? onEpg(item) : onInfo(item)} className="min-h-10 min-w-10 rounded-xl bg-[#29292c] flex items-center justify-center text-[#00f0ff]" aria-label={`${item.title} ${live ? 'yayın rehberi' : 'bilgileri'}`}>
          {live ? <CalendarDays size={16}/> : <Info size={16}/>}
        </button>}
        {!tv && !isChildMode && !live && <button type="button" onClick={() => series ? onSeries(item) : onDownload(item)} className="min-h-10 min-w-10 rounded-xl bg-[#29292c] text-[#00f0ff] flex items-center justify-center" aria-label={`${item.title} indir`}><Download size={16}/></button>}
        {!tv && !isChildMode && !live && !series && <button type="button" onClick={() => onSchedule(item)} className="catalog-schedule min-h-10 min-w-10 rounded-xl bg-[#29292c] text-[#00f0ff] flex items-center justify-center" aria-label={`${item.title} indirmeyi zamanla`}><CalendarDays size={16}/></button>}
      </div>
    </div>
  </article>;
}
