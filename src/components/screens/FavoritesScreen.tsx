import {readCategoryFavorites,toggleCategoryFavorite,type CategoryFavorite} from '../../services/categoryFavorites';
import React, {useState} from 'react';
import {readCatalogPreferences,saveCatalogPreferences,VIEW_OPTIONS,type CatalogView} from '../../services/catalogDiscovery';
import { MovieCollectionBadge } from '../MovieCollectionBadge';
import { MediaItem } from '../../types';
import { Heart, Play } from 'lucide-react';

interface FavoritesScreenProps {
  favorites: MediaItem[];
  profileId?: string;
  onOpenInfo?: (item:MediaItem)=>void;
  onPlayMedia: (item: MediaItem) => void;
  onRemoveFavorite: (id: string) => void;
  onOpenCatalog: () => void;
  onOpenCategory?: (category:CategoryFavorite)=>void;
}

export const FavoritesScreen: React.FC<FavoritesScreenProps> = ({
  favorites,
  profileId = 'parent',
  onOpenInfo,
  onPlayMedia,
  onRemoveFavorite,
  onOpenCatalog,
  onOpenCategory,
}) => {
  const [categories,setCategories]=useState(()=>readCategoryFavorites(profileId));
  const [kind,setKind]=useState('all');
  const filtered=favorites.filter(item=>kind==='all'||item.type===kind);
  const [view,setView]=useState<CatalogView>(()=>readCatalogPreferences(profileId+'_favorites').view);
  return (
    <div className="flex flex-col w-full max-w-none mx-auto px-4 pt-2 pb-28 gap-4 select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 fill-[#ffb4ab] text-[#ffb4ab]" />
          <h2 className="font-headline text-lg font-bold text-[#e5e1e4]">Favori Kanallar &amp; Medyalar</h2>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-[#201f21] text-[#b9cacb] font-headline text-xs font-semibold border border-white/5">
          {favorites.length} Adet
        </span>
      </div>

      {onOpenCategory&&categories.length>0&&<section className="rounded-xl bg-[#1c1b1d] p-3"><h3 className="font-bold mb-2">Favori kategoriler</h3>{categories.map(row=><div key={JSON.stringify(row)} className="flex gap-2 mb-2"><button className="flex-1 text-left bg-white/5 rounded-lg p-3" onClick={()=>onOpenCategory(row)}>{row.name} · {row.tab==='live'?'Canlı TV':row.tab==='movie'?'Film':row.tab==='series'?'Dizi':'Tümü'}</button><button className="p-3 text-[#ffb4ab]" onClick={()=>setCategories(toggleCategoryFavorite(profileId,row))} aria-label="Kategoriyi kaldır"><Heart size={16} fill="currentColor"/></button></div>)}</section>}
      <div className="flex gap-2">{[['all','Tümü'],['live','Canlı TV'],['movie','Film'],['series','Dizi']].map(([value,label])=><button key={value} onClick={()=>setKind(value)} className={kind===value?'p-2 rounded-lg bg-[#0566d9]':'p-2 rounded-lg bg-white/10'}>{label}</button>)}</div>
      <label className="self-end text-xs text-[#b9cacb]">Görünüm <select aria-label="Favori görünümü" value={view} onChange={e=>{const value=e.target.value as CatalogView;setView(value);saveCatalogPreferences(profileId+'_favorites',{sort:'added-desc',view:value});}} className="min-h-11 rounded-xl bg-[#28282b] p-2">{VIEW_OPTIONS.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 bg-[#1c1b1d] rounded-2xl border border-white/5 text-center my-6">
          <div className="w-14 h-14 rounded-full bg-[#2a2a2c] flex items-center justify-center text-[#849495] mb-3">
            <Heart className="w-7 h-7 text-[#849495]" />
          </div>
          <h3 className="font-headline text-base font-bold text-[#e5e1e4]">Henüz Favori Eklenmedi</h3>
          <p className="text-xs text-[#b9cacb] max-w-xs mt-1">
            Katalogdan sık izlediğiniz canlı kanalları veya filmleri kalp ikonuna tıklayarak buraya sabitleyebilirsiniz.
          </p>
          <button
            onClick={onOpenCatalog}
            className="mt-4 px-5 py-2.5 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold shadow-[0_0_12px_rgba(0,240,255,0.4)] active:scale-95 cursor-pointer"
          >
            Kataloğa Git
          </button>
        </div>
      ) : (
        <div className={`catalog-grid catalog-grid--${view}`}>
          {filtered.map((item) => (
            <div
              key={item.id}
              className={`catalog-card catalog-card--${view} catalog-favorite-card relative rounded-2xl bg-[#1c1b1d] border border-white/5 p-2 gap-2`}
            >
              <div className="catalog-card-poster relative rounded-xl bg-[#2a2a2c] overflow-hidden">
                <img
                  className={`w-full h-full ${item.type==='live'?'object-contain p-3':'object-cover'}`}
                  loading="lazy" decoding="async"
                  alt={item.title}
                  src={item.poster}
                  onError={(e) => {
                    e.currentTarget.onerror=null;e.currentTarget.src='/brand/xiptvplay-icon.svg';
                  }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e10] via-transparent to-transparent"></div>
                {item.type === 'movie' && <MovieCollectionBadge media={item}/>}
                <div className="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-[#0e0e10]/90 text-[#00f0ff] font-headline text-[9px] font-bold">
                  {item.resolution}
                </div>
                <button
                  onClick={() => onRemoveFavorite(item.id)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 flex items-center justify-center text-[#ffb4ab] cursor-pointer"
                  title="Favorilerden Kaldır"
                >
                  <Heart className="w-4 h-4 fill-[#ffb4ab] text-[#ffb4ab]" />
                </button>
              </div>
              <div className="catalog-card-body flex flex-col min-w-0 flex-1 gap-2">
                <h4 className="catalog-card-title font-headline text-sm font-bold text-[#e5e1e4] truncate">
                  {item.title}
                </h4>
                <span className="catalog-card-category text-[11px] text-[#b9cacb] truncate">{item.category}</span>
              <button type="button" onClick={()=>onOpenInfo?.(item)} className="text-left min-h-10 text-xs text-[#00f0ff]">Bilgileri aç</button>
              <button
                onClick={() => onPlayMedia(item)}
                className="catalog-favorite-play w-full h-9 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_10px_rgba(0,240,255,0.35)] active:scale-95 cursor-pointer mt-1"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Şimdi İzle</span>
              </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

