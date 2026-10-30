import React from 'react';
import { MovieCollectionBadge } from '../MovieCollectionBadge';
import { MediaItem } from '../../types';
import { Heart, Play } from 'lucide-react';

interface FavoritesScreenProps {
  favorites: MediaItem[];
  onPlayMedia: (item: MediaItem) => void;
  onRemoveFavorite: (id: string) => void;
  onOpenCatalog: () => void;
}

export const FavoritesScreen: React.FC<FavoritesScreenProps> = ({
  favorites,
  onPlayMedia,
  onRemoveFavorite,
  onOpenCatalog,
}) => {
  return (
    <div className="flex flex-col w-full max-w-xl mx-auto px-4 pt-2 pb-28 gap-4 select-none">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="w-5 h-5 fill-[#ffb4ab] text-[#ffb4ab]" />
          <h2 className="font-headline text-lg font-bold text-[#e5e1e4]">Favori Kanallar &amp; Medyalar</h2>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-[#201f21] text-[#b9cacb] font-headline text-xs font-semibold border border-white/5">
          {favorites.length} Adet
        </span>
      </div>

      {favorites.length === 0 ? (
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
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          {favorites.map((item) => (
            <div
              key={item.id}
              className="relative flex flex-col rounded-2xl bg-[#1c1b1d] border border-white/5 p-3 shadow-md gap-2"
            >
              <div className="relative aspect-video rounded-xl bg-[#2a2a2c] overflow-hidden">
                <img
                  className="w-full h-full object-cover"
                  alt={item.title}
                  src={item.poster}
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&auto=format&fit=crop&q=80';
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
              <div className="flex flex-col min-w-0">
                <h4 className="font-headline text-sm font-bold text-[#e5e1e4] truncate">
                  {item.title}
                </h4>
                <span className="text-[11px] text-[#b9cacb] truncate">{item.category}</span>
              </div>
              <button
                onClick={() => onPlayMedia(item)}
                className="w-full h-9 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_10px_rgba(0,240,255,0.35)] active:scale-95 cursor-pointer mt-1"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>Şimdi İzle</span>
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

