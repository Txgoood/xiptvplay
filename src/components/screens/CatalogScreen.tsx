import React, { useState, useMemo } from 'react';
import { MediaItem, Playlist } from '../../types';
import { ArrowLeft, Search, X, Tv, Heart, Play, Download, Film, Clapperboard, Filter } from 'lucide-react';

interface CatalogScreenProps {
  catalog: MediaItem[];
  activePlaylist: Playlist | null;
  onBackToPlaylists: () => void;
  onPlayMedia: (item: MediaItem) => void;
  onDownloadMedia: (item: MediaItem) => void;
  onToggleFavorite: (id: string) => void;
}

type TabType = 'all' | 'live' | 'movie' | 'series';

export const CatalogScreen: React.FC<CatalogScreenProps> = ({
  catalog,
  activePlaylist,
  onBackToPlaylists,
  onPlayMedia,
  onDownloadMedia,
  onToggleFavorite,
}) => {
  const [activeTab, setActiveTab] = useState<TabType>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Extract distinct categories based on current tab
  const categories = useMemo(() => {
    const list = activeTab === 'all' ? catalog : catalog.filter((item) => item.type === activeTab);
    const set = new Set<string>();
    list.forEach((item) => {
      if (item.category) set.add(item.category);
    });
    return Array.from(set).sort();
  }, [catalog, activeTab]);

  // Filtered items
  const filteredItems = useMemo(() => {
    return catalog.filter((item) => {
      if (activeTab !== 'all' && item.type !== activeTab) return false;
      if (selectedCategory !== 'all' && item.category !== selectedCategory) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.title.toLowerCase().includes(q);
        const matchesCat = item.category?.toLowerCase().includes(q);
        return matchesTitle || matchesCat;
      }
      return true;
    });
  }, [catalog, activeTab, selectedCategory, searchQuery]);

  return (
    <div className="flex-1 w-full max-w-7xl mx-auto px-4 py-4 flex flex-col gap-4 pb-24">
      {/* Top Bar with Playlist Information */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#18181b]/90 border border-white/5 rounded-2xl p-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <button
            onClick={onBackToPlaylists}
            className="w-9 h-9 rounded-xl bg-[#201f21] hover:bg-[#2a2a2c] flex items-center justify-center text-[#e5e1e4] hover:text-[#00f0ff] transition-colors border border-white/5 cursor-pointer shrink-0"
            title="Playlistlere Dön"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="font-headline font-bold text-base sm:text-lg text-white truncate">
                {activePlaylist?.name || 'Katalog İçeriği'}
              </h1>
              {activePlaylist?.badge && (
                <span className="px-2 py-0.5 rounded-full bg-[#00f0ff]/10 text-[#00f0ff] text-[10px] font-bold border border-[#00f0ff]/20">
                  {activePlaylist.badge}
                </span>
              )}
            </div>
            <span className="text-xs text-[#849495] truncate">
              {activePlaylist?.serverUrl || 'Önbellek Veritabanı'} • Toplam {catalog.length} içerik
            </span>
          </div>
        </div>

        {/* Search input in Top Bar */}
        <div className="relative w-full sm:w-72">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#849495]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Kanal veya film ara..."
            className="w-full bg-[#201f21] rounded-xl pl-9 pr-8 py-2 text-xs text-[#e5e1e4] placeholder:text-[#849495] border border-white/5 focus:outline-none focus:border-[#00f0ff]/40"
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[#849495] hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Tabs Row */}
      <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
        {[
          { id: 'all' as TabType, label: 'Tümü', icon: Tv, count: catalog.length },
          {
            id: 'live' as TabType,
            label: 'Canlı TV',
            icon: Tv,
            count: catalog.filter((i) => i.type === 'live').length,
          },
          {
            id: 'movie' as TabType,
            label: 'Filmler',
            icon: Film,
            count: catalog.filter((i) => i.type === 'movie').length,
          },
          {
            id: 'series' as TabType,
            label: 'Diziler',
            icon: Clapperboard,
            count: catalog.filter((i) => i.type === 'series').length,
          },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id);
                setSelectedCategory('all');
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold whitespace-nowrap transition-all cursor-pointer ${
                isActive
                  ? 'bg-[#00f0ff] text-[#00363a] font-bold shadow-[0_0_12px_rgba(0,240,255,0.3)]'
                  : 'bg-[#18181b] text-[#b9cacb] hover:text-white hover:bg-[#201f21] border border-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isActive ? 'bg-[#00363a]/20 text-[#00363a]' : 'bg-[#2a2a2c] text-[#849495]'
                }`}
              >
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Categories Filter Selector */}
      {categories.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
          <div className="flex items-center gap-1.5 text-xs text-[#849495] shrink-0 pl-1">
            <Filter className="w-3.5 h-3.5 text-[#00f0ff]" />
            <span>Kategori:</span>
          </div>
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-[#2a2a2c] text-white border border-[#00f0ff]/40'
                : 'bg-[#18181b] text-[#849495] hover:text-white border border-white/5'
            }`}
          >
            Tüm Kategoriler
          </button>
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-[#2a2a2c] text-[#00f0ff] border border-[#00f0ff]/40 font-semibold'
                  : 'bg-[#18181b] text-[#849495] hover:text-white border border-white/5'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      {/* Media Catalog Grid */}
      {filteredItems.length === 0 ? (
        <div className="flex-1 flex flex-col items-center justify-center py-20 text-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-[#1c1b1d] border border-white/10 flex items-center justify-center text-[#849495]">
            <Search className="w-8 h-8" />
          </div>
          <h3 className="font-headline font-bold text-base text-white">İçerik Bulunamadı</h3>
          <p className="text-xs text-[#849495] max-w-sm">
            Seçilen filtreler veya arama sorgusuna uygun yayın kaydı yok. Arama kelimesini değiştirmeyi veya filtreleri sıfırlamayı deneyin.
          </p>
          {(searchQuery || selectedCategory !== 'all') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setSelectedCategory('all');
              }}
              className="mt-2 px-4 py-2 rounded-xl bg-[#201f21] hover:bg-[#2a2a2c] text-xs font-semibold text-[#00f0ff] border border-[#00f0ff]/20 cursor-pointer"
            >
              Filtreleri Temizle
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-3 sm:gap-4">
          {filteredItems.map((item) => (
            <div
              key={item.id}
              className="group relative bg-[#18181b] rounded-2xl border border-white/5 hover:border-[#00f0ff]/30 overflow-hidden flex flex-col transition-all duration-200 hover:shadow-[0_8px_20px_rgba(0,0,0,0.6)]"
            >
              {/* Thumbnail Container */}
              <div className="relative aspect-[16/10] sm:aspect-square bg-[#0e0e10] overflow-hidden">
                <img
                  src={item.poster}
                  alt={item.title}
                  className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&auto=format&fit=crop&q=80';
                  }}
                />

                {/* Badges Overlay */}
                <div className="absolute top-2 left-2 flex items-center gap-1">
                  <span className="px-1.5 py-0.5 rounded bg-[#0e0e10]/90 text-[#00f0ff] font-headline text-[9px] font-bold tracking-normal shadow">
                    {item.resolution}
                  </span>
                  {item.rating && (
                    <span className="px-1.5 py-0.5 rounded bg-[#0e0e10]/90 text-[#ffb703] font-headline text-[9px] font-bold shadow">
                      ★ {item.rating}
                    </span>
                  )}
                </div>

                {/* Favorite Button */}
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onToggleFavorite(item.id);
                  }}
                  className={`absolute top-2 right-2 w-7 h-7 rounded-full flex items-center justify-center transition-all cursor-pointer backdrop-blur-md ${
                    item.isFavorite
                      ? 'bg-[#ff5470] text-white shadow-md'
                      : 'bg-black/50 text-white/70 hover:text-white hover:bg-black/80'
                  }`}
                  title={item.isFavorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                >
                  <Heart className={`w-3.5 h-3.5 ${item.isFavorite ? 'fill-current' : ''}`} />
                </button>

                {/* Quick Play Hover Overlay */}
                <div
                  onClick={() => onPlayMedia(item)}
                  className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer backdrop-blur-[2px]"
                >
                  <div className="w-11 h-11 rounded-full bg-[#00f0ff] text-[#00363a] flex items-center justify-center shadow-[0_0_16px_rgba(0,240,255,0.6)] transform scale-90 group-hover:scale-100 transition-transform">
                    <Play className="w-5 h-5 fill-current ml-0.5" />
                  </div>
                </div>
              </div>

              {/* Info Container */}
              <div className="p-3 flex flex-col justify-between flex-1 gap-2">
                <div className="flex flex-col min-w-0">
                  <span className="text-[10px] text-[#00f0ff] font-mono truncate">
                    {item.category || 'Genel'}
                  </span>
                  <h4
                    className="font-headline font-bold text-xs text-[#e5e1e4] group-hover:text-white line-clamp-2 title-ellipsis leading-tight"
                    title={item.title}
                  >
                    {item.title}
                  </h4>
                </div>

                {/* Bottom Action Buttons */}
                <div className="flex items-center gap-1.5 pt-1 border-t border-white/5">
                  <button
                    onClick={() => onPlayMedia(item)}
                    className="flex-1 py-1.5 rounded-lg bg-[#201f21] hover:bg-[#00f0ff] text-[#e5e1e4] hover:text-[#00363a] font-headline text-[11px] font-bold flex items-center justify-center gap-1 transition-all cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>İzle</span>
                  </button>

                  <button
                    onClick={() => onDownloadMedia(item)}
                    className="p-1.5 rounded-lg bg-[#201f21] hover:bg-[#2a2a2c] text-[#849495] hover:text-[#00f0ff] transition-all cursor-pointer"
                    title="İndirme Kuyruğuna Ekle"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
