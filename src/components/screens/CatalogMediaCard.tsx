import { CalendarDays, Download, Heart, Info, Layers, Play } from 'lucide-react';
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
  const live = item.type === 'live', series = item.type === 'series';
  const list = view === 'list' || view === 'details';
  const open = () => live ? onPlay(item) : onInfo(item);
  const rating = catalogRating(item.rating);
  return <article className={`catalog-card catalog-card--${view} group min-w-0 rounded-2xl bg-[#1c1b1d] border border-white/5 overflow-hidden hover:border-[#00f0ff]/30`}>
    <div className="catalog-card-poster relative bg-[#2a2a2c] overflow-hidden">
      <button type="button" onClick={open} className="block w-full h-full" aria-label={`${item.title} ${live ? 'izle' : 'bilgileri'}`}>
        <img className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" src={item.poster || '/brand/xiptvplay-icon.svg'} alt="" loading="lazy" decoding="async"
          onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/brand/xiptvplay-icon.svg'; }} />
      </button>
      <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/80 pointer-events-none" />
      <span className="absolute bottom-2 left-2 text-[10px] px-1.5 py-0.5 rounded bg-black/70 text-[#00f0ff] pointer-events-none">{live ? 'CANLI' : series ? 'DİZİ' : 'FİLM'}</span>
      {rating && <span className="absolute bottom-2 right-2 rounded bg-black/70 text-amber-300 px-1.5 py-0.5 text-[11px] pointer-events-none" title="Sağlayıcı puanı / 10">★ {rating}</span>}
      <button onClick={() => onFavorite(item.id)} aria-label={item.isFavorite ? `${item.title} favorilerden çıkar` : `${item.title} favorilere ekle`} aria-pressed={Boolean(item.isFavorite)}
        className="absolute top-1 right-1 min-w-10 min-h-10 rounded-full bg-black/65 text-[#ffb4ab] flex items-center justify-center">
        <Heart className={`w-4 h-4 ${item.isFavorite ? 'fill-current' : ''}`} />
      </button>
    </div>
    <div className="catalog-card-body flex flex-col min-w-0 p-2.5 gap-2">
      <button type="button" className="text-left min-w-0" onClick={open}>
        <h3 className="font-bold text-[13px] leading-snug line-clamp-2 text-[#e5e1e4]" title={item.title}>{item.title}</h3>
        <p className="catalog-card-category text-[11px] text-[#b9cacb] truncate mt-1">{item.category}</p>
      </button>
      {view === 'details' && <div className="text-xs text-[#b9cacb] flex flex-wrap gap-x-3 gap-y-1">
        <span>{live ? 'Canlı TV' : series ? 'Dizi' : 'Film'}</span><span>{item.resolution}</span>
        {item.year && <span>{item.year}</span>}{item.duration && <span>{item.duration}</span>}
        {item.addedAt && <span>Eklendi: {new Date(item.addedAt).toLocaleDateString('tr-TR')}</span>}
        {item.releaseDate && <span>İlk yayın: {item.releaseDate}</span>}
      </div>}
      {live && item.epgCurrent && <p className="text-[11px] text-[#4edea3] truncate">{item.epgCurrent}</p>}
      <div className={`catalog-card-actions flex flex-wrap items-center gap-1.5 ${list ? '' : 'mt-auto'}`}>
        <button type="button" className="catalog-primary min-h-10 px-2 rounded-xl bg-[#00f0ff] text-[#00363a] font-bold text-xs flex items-center justify-center gap-1 flex-1 min-w-0"
          onClick={() => series ? onSeries(item) : onPlay(item)} aria-label={series ? `${item.title} sezonlar ve bölümler` : `${item.title} oynat`}>
          {series ? <Layers size={15} className="shrink-0" /> : <Play size={15} className="shrink-0" />}<span>{series ? 'Bölümler' : 'İzle'}</span>
        </button>
        <button type="button" onClick={() => live ? onEpg(item) : onInfo(item)} className="min-h-10 min-w-10 rounded-xl bg-[#29292c] flex items-center justify-center text-[#00f0ff]" aria-label={`${item.title} ${live ? 'yayın rehberi' : 'bilgileri'}`}>
          {live ? <CalendarDays size={16}/> : <Info size={16}/>}
        </button>
        {!isChildMode && !live && <button type="button" onClick={() => series ? onSeries(item) : onDownload(item)} className="min-h-10 min-w-10 rounded-xl bg-[#29292c] text-[#00f0ff] flex items-center justify-center" aria-label={`${item.title} indir`}><Download size={16}/></button>}
        {!isChildMode && !live && !series && <button type="button" onClick={() => onSchedule(item)} className="catalog-schedule min-h-10 min-w-10 rounded-xl bg-[#29292c] text-[#00f0ff] flex items-center justify-center" aria-label={`${item.title} indirmeyi zamanla`}><CalendarDays size={16}/></button>}
      </div>
    </div>
  </article>;
}
