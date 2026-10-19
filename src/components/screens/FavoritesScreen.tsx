import React from 'react';
import { MediaItem } from '../../types';
import { Heart, Play, Trash2, Tv, Film } from 'lucide-react';

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
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 flex flex-col gap-4 pb-24">
      {/* Top Header Card */}
      <div className="flex items-center justify-between bg-[#18181b]/90 border border-white/5 rounded-2xl p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-[#ff5470]/10 border border-[#ff5470]/20 flex items-center justify-center text-[#ff5470]">
            <Heart className="w-5 h-5 fill-current" />
          </div>
          <div className="flex flex-col">
            <h1 className="font-headline font-bold text-base sm:text-lg text-white">
              Favori Yayınlar &amp; Kanallar
            </h1>
            <span className="text-xs text-[#849495]">
              {favorites.length} kayıtlı içerik cihazınızda yerel olarak saklanmaktadır
            </span>
          </div>
        </div>

        {favorites.length > 0 && (
          <button
            onClick={onOpenCatalog}
            className="px-3.5 py-2 rounded-xl bg-[#201f21] hover:bg-[#2a2a2c] text-xs font-semibold text-[#00f0ff] border border-[#00f0ff]/20 cursor-pointer transition-colors"
          >
            Katalogdan Ekle
          </button>
        )}
      </div>

      {/* Empty State or Favorites Grid */}
      {favorites.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-[#1c1b1d] border border-white/10 flex items-center justify-center text-[#ff5470]/60">
            <Heart className="w-8 h-8" />
          </div>
          <h3 className="font-headline font-bold text-base text-white">Henüz Favori Eklenmedi</h3>
          <p className="text-xs text-[#849495] max-w-sm">
            Katalogdaki kanalların veya filmlerin üzerindeki kalp ikonuna tıklayarak favorilerinize ekleyebilir, buradan hızlıca izleyebilirsiniz.
          </p>
          <button
            onClick={onOpenCatalog}
            className="mt-2 px-5 py-2.5 rounded-full bg-[#00f0ff] hover:bg-[#00c8d6] text-[#00363a] font-headline text-xs font-bold shadow-[0_0_15px_rgba(0,240,255,0.4)] cursor-pointer transition-all"
          >
            Kataloğu Görüntüle
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {favorites.map((item) => (
            <div
              key={item.id}
              className="group relative bg-[#18181b] rounded-2xl border border-white/5 hover:border-[#ff5470]/30 overflow-hidden flex flex-col transition-all duration-200 hover:shadow-[0_8px_20px_rgba(0,0,0,0.6)]"
            >
              <div className="relative aspect-[16/10] bg-[#0e0e10] overflow-hidden">
                <img
                  src={item.poster}
                  alt={item.title}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&auto=format&fit=crop&q=80';
                  }}
                />

                <div className="absolute top-2 left-2 px-1.5 py-0.5 rounded bg-[#0e0e10]/90 text-[#00f0ff] font-headline text-[9px] font-bold shadow">
                  {item.resolution}
                </div>

                <button
                  onClick={() => onRemoveFavorite(item.id)}
                  className="absolute top-2 right-2 w-7 h-7 rounded-full bg-[#ff5470] text-white flex items-center justify-center cursor-pointer shadow hover:bg-[#ff3355] transition-colors"
                  title="Favorilerden Kaldır"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                <div
                  onClick={() => onPlayMedia(item)}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer backdrop-blur-[2px]"
                >
                  <div className="w-10 h-10 rounded-full bg-[#00f0ff] text-[#00363a] flex items-center justify-center shadow-lg">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </div>
                </div>
              </div>

              <div className="p-3 flex flex-col justify-between flex-1 gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-[#00f0ff] font-mono truncate">
                    {item.category}
                  </span>
                  <h4 className="font-headline font-bold text-xs text-white truncate" title={item.title}>
                    {item.title}
                  </h4>
                </div>

                <button
                  onClick={() => onPlayMedia(item)}
                  className="w-full py-1.5 rounded-lg bg-[#201f21] hover:bg-[#00f0ff] text-[#e5e1e4] hover:text-[#00363a] font-headline text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                >
                  <Play className="w-3 h-3 fill-current" />
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
