import React, { useState, useMemo } from 'react';
import { MediaItem, Playlist } from '../../types';
import { StorageService } from '../../services/storage';
import {
  ArrowLeft,
  Search,
  X,
  Tv,
  Heart,
  Play,
  Download,
  Layers,
  Film,
  Info,
  Sparkles,
  ChevronDown,
  ListFilter,
} from 'lucide-react';

interface CatalogScreenProps {
  catalog: MediaItem[];
  activePlaylist: Playlist | null;
  onBackToPlaylists: () => void;
  onPlayMedia: (item: MediaItem) => void;
  onDownloadMedia: (item: MediaItem) => void;
  onToggleFavorite: (id: string) => void;
  onOpenSeriesDetail: (item: MediaItem) => void;
  onOpenTmdbInfo: (item: MediaItem) => void;
  isCatalogLoading?: boolean;
}

const PAGE_CHUNK = 60;

export const CatalogScreen: React.FC<CatalogScreenProps> = ({
  catalog,
  activePlaylist,
  onBackToPlaylists,
  onPlayMedia,
  onDownloadMedia,
  onToggleFavorite,
  onOpenSeriesDetail,
  onOpenTmdbInfo,
  isCatalogLoading,
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'live' | 'movie' | 'series'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_CHUNK);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [categorySort, setCategorySort] = useState<'az' | 'za' | 'oldest' | 'newest'>('az');
  const appSettings = StorageService.getSettings();
  const hideAdultCategories = Boolean(appSettings.hideAdultCategories);
  const showOnlyTurkishCategories = Boolean(appSettings.showOnlyTurkishCategories);
  const isTurkishCategory = (name: string) => /^\s*TR\b/i.test(name);
  const isAdultCategory = (name: string) => /(^|[^a-z])(xxx|adult|adults|18\s*\+|erotik|erotic|porn|porno)([^a-z]|$)/i.test(name) || /❤️|♥️|💗|💖/.test(name) && /xxx|adult|erotik|erotic|porn|porno/i.test(name);

  // 2- İçerik Sayılarının Örtüşmesi (Rozetlerin Gerçek Sunucu Toplamını Göstermesi)
  const serverLiveTotal =
    activePlaylist?.liveCount !== undefined
      ? activePlaylist.liveCount
      : catalog.filter((i) => i.type === 'live').length;

  const serverMovieTotal =
    activePlaylist?.movieCount !== undefined
      ? activePlaylist.movieCount
      : catalog.filter((i) => i.type === 'movie').length;

  const serverSeriesTotal =
    activePlaylist?.seriesCount !== undefined
      ? activePlaylist.seriesCount
      : catalog.filter((i) => i.type === 'series').length;

  const serverGrandTotal =
    activePlaylist?.liveCount !== undefined &&
    activePlaylist?.movieCount !== undefined &&
    activePlaylist?.seriesCount !== undefined
      ? activePlaylist.liveCount + activePlaylist.movieCount + activePlaylist.seriesCount
      : catalog.length;

  // 1- Dinamik Kategori / Alt Klasör Filtrelemesi:
  // Seçili sekmeye (live, movie, series) ait içerikler
  const visibleCatalog = useMemo(() => catalog.filter((item) => {
    const category = (item.category || 'Genel').trim();
    if (hideAdultCategories && isAdultCategory(category)) return false;
    if (showOnlyTurkishCategories && !isTurkishCategory(category)) return false;
    return true;
  }), [catalog, hideAdultCategories, showOnlyTurkishCategories]);

  const itemsForActiveTab = useMemo(() => {
    if (activeTab === 'all') return visibleCatalog;
    return visibleCatalog.filter((item) => item.type === activeTab);
  }, [visibleCatalog, activeTab]);

  // Seçili sekmeye ait dinamik kategoriler ve içerik adetleri
  const categoriesForTab = useMemo(() => {
    const countsMap = new Map<string, number>();

    itemsForActiveTab.forEach((item) => {
      const cat = (item.category || 'Genel').trim();
      countsMap.set(cat, (countsMap.get(cat) || 0) + 1);
    });

    // En çok içeriğe sahip kategorileri öne sırala
    const sorted = Array.from(countsMap.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    return [
      { name: 'Tümü', count: itemsForActiveTab.length },
      ...sorted,
    ];
  }, [itemsForActiveTab]);

  const sortedCategories = useMemo(() => {
    const categories = categoriesForTab.filter((cat) => (!hideAdultCategories || cat.name === 'Tümü' || !isAdultCategory(cat.name)) && (!showOnlyTurkishCategories || cat.name === 'Tümü' || isTurkishCategory(cat.name)));
    const allCategory = categories.find((cat) => cat.name === 'Tümü');
    const children = categories.filter((cat) => cat.name !== 'Tümü');
    const yearForCategory = (name: string) => {
      const years = visibleCatalog.filter((item) => (item.category || 'Genel').trim() === name && typeof item.year === 'number' && item.year > 0).map((item) => item.year as number);
      return years.length ? Math.min(...years) : null;
    };
    children.sort((a, b) => {
      if (categorySort === 'za') return b.name.localeCompare(a.name, 'tr', { sensitivity: 'base' });
      if (categorySort === 'oldest' || categorySort === 'newest') {
        const ay = yearForCategory(a.name), by = yearForCategory(b.name);
        if (ay === null && by !== null) return 1;
        if (by === null && ay !== null) return -1;
        if (ay !== null && by !== null && ay !== by) return categorySort === 'oldest' ? ay - by : by - ay;
      }
      return a.name.localeCompare(b.name, 'tr', { sensitivity: 'base' });
    });
    return allCategory ? [allCategory, ...children] : children;
  }, [categoriesForTab, categorySort, visibleCatalog, hideAdultCategories, showOnlyTurkishCategories]);

  const searchedCategories = useMemo(() => {
    const q = categorySearch.trim().toLocaleLowerCase('tr-TR');
    return sortedCategories.filter((cat) => !q || cat.name.toLocaleLowerCase('tr-TR').includes(q));
  }, [sortedCategories, categorySearch]);

  // Sekme değiştirildiğinde kategoriyi otomatik 'Tümü' yap ve sayfa limitini sıfırla
  const handleTabChange = (tab: 'all' | 'live' | 'movie' | 'series') => {
    setActiveTab(tab);
    setSelectedCategory('Tümü');
    setVisibleCount(PAGE_CHUNK);
  };

  // Kategori tıklandığında sayfa limitini sıfırla
  const handleCategorySelect = (categoryName: string) => {
    setSelectedCategory(categoryName);
    setVisibleCount(PAGE_CHUNK);
  };

  // Arama veya kategori filtresi
  const filteredItems = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return visibleCatalog.filter((item) => {
      if (activeTab !== 'all' && item.type !== activeTab) return false;
      if (
        selectedCategory !== 'Tümü' &&
        (item.category || 'Genel').trim() !== selectedCategory
      ) {
        return false;
      }
      if (q) {
        const titleMatch = item.title.toLowerCase().includes(q);
        const catMatch = item.category && item.category.toLowerCase().includes(q);
        return titleMatch || catMatch;
      }
      return true;
    });
  }, [visibleCatalog, activeTab, selectedCategory, searchQuery]);

  // Performanslı DOM gösterimi için sayfalanmış içerik
  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, visibleCount);
  }, [filteredItems, visibleCount]);

  const handleLoadMore = () => {
    setVisibleCount((prev) => Math.min(filteredItems.length, prev + PAGE_CHUNK));
  };

  const handleLoadAll = () => {
    setVisibleCount(filteredItems.length);
  };

  return (
    <div className="flex flex-col w-full max-w-xl mx-auto px-4 pt-2 pb-28 gap-3.5 select-none">
      {/* Active Playlist Header Strip */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-[#1c1b1d] border border-white/5 shadow-md">
        <div className="flex items-center gap-2.5 min-w-0">
          <button
            onClick={onBackToPlaylists}
            className="w-8 h-8 rounded-full bg-[#201f21] hover:bg-[#2a2a2c] flex items-center justify-center text-[#00f0ff] shrink-0 border border-white/5 cursor-pointer"
            title="Playlistlere Dön"
          >
            <ArrowLeft className="w-4 h-4 text-[#00f0ff]" />
          </button>
          <div className="flex flex-col min-w-0">
            <span className="font-headline text-xs font-bold text-white truncate">
              {activePlaylist ? activePlaylist.name : 'Tüm Kanallar'}
            </span>
            <span className="text-[10px] text-[#b9cacb] truncate font-mono">
              {activePlaylist
                ? `${serverGrandTotal.toLocaleString('tr-TR')} İçerik • ${filteredItems.length.toLocaleString('tr-TR')} Eşleşen`
                : `${catalog.length.toLocaleString('tr-TR')} Kanal`}
            </span>
          </div>
        </div>
        {activePlaylist?.badge && (
          <span className="px-2 py-0.5 rounded-full bg-[#00f0ff]/15 text-[#00f0ff] font-headline text-[10px] font-bold shrink-0">
            {activePlaylist.badge}
          </span>
        )}
      </div>

      {/* Search Input Bar */}
      <div className="relative flex items-center rounded-2xl bg-[#1c1b1d] border border-white/5 focus-within:border-[#00f0ff]/40 shadow-md">
        <div className="absolute left-3.5 flex items-center pointer-events-none text-[#b9cacb]">
          <Search className="w-4 h-4 text-[#b9cacb]" />
        </div>
        <input
          className="w-full bg-transparent pl-11 pr-10 py-3 text-[14px] text-[#e5e1e4] placeholder:text-[#849495] focus:outline-none"
          placeholder="Gerçek Kanal, Film veya Dizi Ara..."
          type="text"
          value={searchQuery}
          onChange={(e) => {
            setSearchQuery(e.target.value);
            setVisibleCount(PAGE_CHUNK);
          }}
        />
        {searchQuery && (
          <button
            onClick={() => {
              setSearchQuery('');
              setVisibleCount(PAGE_CHUNK);
            }}
            className="absolute right-3 p-1 rounded-full text-[#b9cacb] hover:text-[#e5e1e4] cursor-pointer"
          >
            <X className="w-4 h-4 text-[#b9cacb]" />
          </button>
        )}
      </div>

      {/* Media Type Tabs with Real Server Totals */}
      <div className="flex items-center gap-1.5 p-1 rounded-full bg-[#1c1b1d] border border-white/5">
        <button
          onClick={() => handleTabChange('all')}
          className={`flex-1 py-1.5 px-2 rounded-full font-headline text-xs font-bold transition-all cursor-pointer truncate ${
            activeTab === 'all'
              ? 'bg-[#00f0ff] text-[#00363a] shadow-[0_0_10px_rgba(0,240,255,0.35)]'
              : 'text-[#b9cacb] hover:text-[#e5e1e4]'
          }`}
        >
          Tümü ({serverGrandTotal.toLocaleString('tr-TR')})
        </button>
        <button
          onClick={() => handleTabChange('live')}
          className={`flex-1 py-1.5 px-2 rounded-full font-headline text-xs font-bold transition-all cursor-pointer truncate ${
            activeTab === 'live'
              ? 'bg-[#00f0ff] text-[#00363a] shadow-[0_0_10px_rgba(0,240,255,0.35)]'
              : 'text-[#b9cacb] hover:text-[#e5e1e4]'
          }`}
        >
          Canlı ({serverLiveTotal.toLocaleString('tr-TR')})
        </button>
        <button
          onClick={() => handleTabChange('movie')}
          className={`flex-1 py-1.5 px-2 rounded-full font-headline text-xs font-bold transition-all cursor-pointer truncate ${
            activeTab === 'movie'
              ? 'bg-[#00f0ff] text-[#00363a] shadow-[0_0_10px_rgba(0,240,255,0.35)]'
              : 'text-[#b9cacb] hover:text-[#e5e1e4]'
          }`}
        >
          Film ({serverMovieTotal.toLocaleString('tr-TR')})
        </button>
        <button
          onClick={() => handleTabChange('series')}
          className={`flex-1 py-1.5 px-2 rounded-full font-headline text-xs font-bold transition-all cursor-pointer truncate ${
            activeTab === 'series'
              ? 'bg-[#00f0ff] text-[#00363a] shadow-[0_0_10px_rgba(0,240,255,0.35)]'
              : 'text-[#b9cacb] hover:text-[#e5e1e4]'
          }`}
        >
          Dizi ({serverSeriesTotal.toLocaleString('tr-TR')})
        </button>
      </div>

      {/* Kategori çipleri ve tüm alt kategorileri açan menü */}
      {categoriesForTab.length > 1 && (
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex-1 min-w-0 flex items-center gap-1.5 overflow-x-auto no-scrollbar py-1">
            {categoriesForTab.filter((cat) => (!hideAdultCategories || cat.name === 'Tümü' || !isAdultCategory(cat.name)) && (!showOnlyTurkishCategories || cat.name === 'Tümü' || isTurkishCategory(cat.name))).map((cat) => (
              <button
                key={cat.name}
                onClick={() => handleCategorySelect(cat.name)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-headline font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${selectedCategory === cat.name ? 'bg-[#0566d9] text-white shadow-[0_0_8px_rgba(5,102,217,0.4)]' : 'bg-[#201f21] text-[#b9cacb] hover:text-[#e5e1e4] border border-white/5'}`}
              >
                <span className="truncate max-w-[180px]">{cat.name}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${selectedCategory === cat.name ? 'bg-white/20 text-white' : 'bg-[#2a2a2c] text-[#849495]'}`}>{cat.count.toLocaleString('tr-TR')}</span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setIsCategoryMenuOpen(true); setCategorySearch(''); }} aria-label="Alt kategorileri listele" title="Alt kategorileri listele" className="shrink-0 w-10 h-10 rounded-xl bg-[#201f21] border border-white/10 text-[#00f0ff] flex items-center justify-center hover:bg-[#2a2a2c]">
            <ListFilter className="w-5 h-5" />
          </button>
        </div>
      )}

      {isCategoryMenuOpen && (
        <div className="fixed inset-0 z-[100] bg-black/75 flex items-end sm:items-center justify-center p-0 sm:p-4" onClick={() => setIsCategoryMenuOpen(false)}>
          <section role="dialog" aria-modal="true" aria-label="Alt kategoriler" onClick={(e) => e.stopPropagation()} className="w-full max-w-xl max-h-[88dvh] flex flex-col rounded-t-3xl sm:rounded-3xl bg-[#151517] border border-white/10 shadow-2xl overflow-hidden">
            <div className="p-4 border-b border-white/10 flex items-center justify-between gap-3">
              <div className="min-w-0"><h2 className="text-base font-bold text-[#e5e1e4]">Alt Kategoriler</h2><p className="text-xs text-[#849495] mt-1">{activeTab === 'all' ? 'Tüm içerikler' : activeTab === 'live' ? 'Canlı TV' : activeTab === 'movie' ? 'Filmler' : 'Diziler'} · {searchedCategories.length.toLocaleString('tr-TR')} kategori</p></div>
              <button type="button" onClick={() => setIsCategoryMenuOpen(false)} className="w-9 h-9 rounded-full bg-[#252527] text-[#e5e1e4] flex items-center justify-center" aria-label="Menüyü kapat"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 flex flex-col gap-3">
              <div className="relative"><Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[#849495]" /><input value={categorySearch} onChange={(e) => setCategorySearch(e.target.value)} placeholder="Alt kategori ara..." className="w-full bg-[#222224] border border-white/10 rounded-xl py-3 pl-10 pr-3 text-sm text-[#e5e1e4] outline-none focus:border-[#00f0ff]/50" /></div>
              <label className="text-xs text-[#b9cacb] flex flex-col gap-1.5">Sıralama
                <select value={categorySort} onChange={(e) => setCategorySort(e.target.value as typeof categorySort)} className="w-full bg-[#222224] border border-white/10 rounded-xl px-3 py-2.5 text-sm text-[#e5e1e4] outline-none">
                  <option value="az">Alfabetik (A–Z)</option><option value="za">Alfabetik (Z–A)</option><option value="oldest">En eski içerik önce</option><option value="newest">En yeni içerik önce</option>
                </select>
              </label>
            </div>
            <div className="overflow-y-auto px-4 pb-5 min-h-0">
              {searchedCategories.length ? searchedCategories.map((cat) => (
                <button key={cat.name} type="button" onClick={() => { handleCategorySelect(cat.name); setIsCategoryMenuOpen(false); }} className={`w-full flex items-center justify-between gap-3 px-3 py-3 mb-1 rounded-xl text-left border ${selectedCategory === cat.name ? 'bg-[#00f0ff]/10 border-[#00f0ff]/40 text-[#00f0ff]' : 'bg-[#202022] border-white/5 text-[#e5e1e4]'}`}>
                  <span className="text-sm break-words">{cat.name}</span><span className="shrink-0 text-xs font-mono text-[#849495]">{cat.count.toLocaleString('tr-TR')}</span>
                </button>
              )) : <p className="text-center text-sm text-[#849495] py-8">Aramanla eşleşen kategori bulunamadı.</p>}
            </div>
          </section>
        </div>
      )}

      {/* Empty State */}
      {isCatalogLoading ? (
        <div className="flex flex-col items-center justify-center p-8 bg-[#1c1b1d] rounded-2xl border border-white/5 text-center my-4 gap-3">
          <div className="text-xs text-[#b9cacb]">Katalog yükleniyor…</div>
        </div>
      ) : catalog.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 bg-[#1c1b1d] rounded-2xl border border-white/5 text-center my-4 gap-3">
          <div className="w-14 h-14 rounded-full bg-[#2a2a2c] flex items-center justify-center text-[#849495]">
            <Tv className="w-7 h-7 text-[#849495]" />
          </div>
          <h3 className="font-headline text-base font-bold text-[#e5e1e4]">
            Kanal Listesi Bulunamadı
          </h3>
          <p className="text-xs text-[#b9cacb] max-w-xs leading-relaxed">
            Seçili playlist için sunucudan henüz kanal çekilmemiş veya bağlantı kurulamamış olabilir.
          </p>
          <button
            onClick={onBackToPlaylists}
            className="px-4 py-2 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold shadow-[0_0_10px_rgba(0,240,255,0.4)] cursor-pointer active:scale-95"
          >
            Playlistlere Geri Dön
          </button>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center p-8 bg-[#1c1b1d] rounded-2xl border border-white/5 text-center my-4 gap-2">
          <Sparkles className="w-8 h-8 text-[#849495]" />
          <span className="text-xs text-[#b9cacb]">
            "{searchQuery || selectedCategory}" kriterine uygun içerik bulunamadı
          </span>
          <button
            onClick={() => {
              setSelectedCategory('Tümü');
              setSearchQuery('');
            }}
            className="mt-2 text-xs text-[#00f0ff] hover:underline cursor-pointer"
          >
            Filtreleri Temizle
          </button>
        </div>
      ) : (
        <>
          {/* Catalog Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {visibleItems.map((item) => {
              const isLive = item.type === 'live';
              const isSeries = item.type === 'series';

              return (
                <div
                  key={item.id}
                  className="group relative flex flex-col rounded-2xl bg-[#1c1b1d] border border-white/5 p-3 shadow-md gap-2.5 transition-all hover:border-[#00f0ff]/30 overflow-hidden"
                >
                  {/* Poster / Thumbnail with click interaction */}
                  <div
                    onClick={() => {
                      if (!isLive) onOpenTmdbInfo(item);
                      else onPlayMedia(item);
                    }}
                    className="relative aspect-video rounded-xl bg-[#2a2a2c] overflow-hidden cursor-pointer"
                  >
                    <img
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      alt={item.title}
                      src={item.poster}
                      onError={(e) => {
                        (e.target as HTMLImageElement).src =
                          'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&auto=format&fit=crop&q=80';
                      }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-[#0e0e10] via-transparent to-transparent"></div>

                    {/* Badges */}
                    <div className="absolute top-2 left-2 flex items-center gap-1.5">
                      <span className="px-1.5 py-0.5 rounded bg-[#0e0e10]/90 text-[#00f0ff] font-headline text-[9px] font-bold tracking-normal shadow">
                        {item.resolution}
                      </span>
                      {isLive && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#65f2b5]/20 text-[#4edea3] font-headline text-[9px] font-bold flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#4edea3] animate-pulse"></span>
                          CANLI
                        </span>
                      )}
                      {isSeries && (
                        <span className="px-1.5 py-0.5 rounded-full bg-[#0566d9]/30 text-[#adc6ff] font-headline text-[9px] font-bold flex items-center gap-1">
                          <Layers className="w-3 h-3 text-[#00f0ff]" />
                          DİZİ
                        </span>
                      )}
                    </div>

                    {/* Favorite Button */}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onToggleFavorite(item.id);
                      }}
                      className="absolute top-2 right-2 w-7 h-7 rounded-full bg-black/60 hover:bg-black/90 flex items-center justify-center text-[#ffb4ab] transition-colors cursor-pointer"
                      title={item.isFavorite ? 'Favorilerden Çıkar' : 'Favorilere Ekle'}
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          item.isFavorite ? 'fill-[#ffb4ab] text-[#ffb4ab]' : 'text-[#ffb4ab]'
                        }`}
                      />
                    </button>

                    {/* Rating / Duration / Channel Number */}
                    <div className="absolute bottom-2 left-2 right-2 flex items-center justify-between text-[11px] text-[#e5e1e4]">
                      {item.channelNumber && (
                        <span className="font-mono text-[#00f0ff] font-bold">#{item.channelNumber}</span>
                      )}
                      {item.duration && <span>{item.duration}</span>}
                      {item.rating && (
                        <span className="px-1 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold flex items-center gap-0.5">
                          ★ {item.rating}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Title & EPG Info */}
                  <div className="flex flex-col min-w-0">
                    <h4
                      onClick={() => {
                        if (!isLive) onOpenTmdbInfo(item);
                        else onPlayMedia(item);
                      }}
                      className="font-headline text-[14px] font-bold text-[#e5e1e4] truncate cursor-pointer hover:text-[#00f0ff] transition-colors"
                      title={item.title}
                    >
                      {item.title}
                    </h4>
                    {isLive && item.epgCurrent ? (
                      <div className="flex flex-col gap-1 mt-1">
                        <span className="text-[11px] text-[#4edea3] font-medium truncate">
                          {item.epgCurrent}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[11px] text-[#b9cacb] mt-0.5 truncate">
                        {item.category} •{' '}
                        {item.type === 'movie'
                          ? 'Film'
                          : item.type === 'series'
                          ? 'Dizi (Çok Sezonlu)'
                          : 'Yayın'}
                      </span>
                    )}
                  </div>

                  {/* Action Buttons */}
                  <div className="flex items-center gap-2 pt-1 border-t border-white/5">
                    {!isLive && <button
                      onClick={() => onOpenTmdbInfo(item)}
                      className="h-9 px-3 rounded-full bg-[#201f21] text-[#00f0ff] border border-white/10 flex items-center justify-center gap-1 text-xs font-semibold"
                      title="Film / dizi bilgileri"
                    ><Info className="w-4 h-4" /><span>Bilgi</span></button>
                    {isSeries ? (
                      <button
                        onClick={() => onOpenSeriesDetail(item)}
                        className="flex-1 h-9 rounded-full bg-gradient-to-r from-[#0566d9] to-[#00f0ff] text-[#002022] font-headline text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_10px_rgba(0,240,255,0.35)] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                      >
                        <Layers className="w-3.5 h-3.5" />
                        <span>Sezonlar &amp; Bölümler</span>
                      </button>
                    ) : (
                      <button
                        onClick={() => onPlayMedia(item)}
                        className="flex-1 h-9 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold flex items-center justify-center gap-1.5 shadow-[0_0_10px_rgba(0,240,255,0.35)] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>{isLive ? 'İzle' : 'Oynat'}</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        if (isSeries) {
                          onOpenSeriesDetail(item);
                        } else {
                          onDownloadMedia(item);
                        }
                      }}
                      className="h-9 px-3 rounded-full bg-[#201f21] hover:bg-[#2a2a2c] text-[#e5e1e4] font-headline text-xs font-semibold flex items-center justify-center gap-1.5 border border-white/5 cursor-pointer active:scale-95"
                      title={isSeries ? 'Bölüm Listesi ve İndirme' : 'İndir (Offline)'}
                    >
                      <Download className="w-3.5 h-3.5 text-[#00f0ff]" />
                      <span className="hidden sm:inline">{isSeries ? 'Bölümler' : 'İndir'}</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Pagination & Load More Footer */}
          {filteredItems.length > visibleCount && (
            <div className="flex flex-col items-center justify-center pt-4 pb-2 gap-2.5">
              <span className="text-xs text-[#b9cacb] font-mono">
                Gösterilen: {visibleItems.length.toLocaleString('tr-TR')} / {filteredItems.length.toLocaleString('tr-TR')} içerik
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handleLoadMore}
                  className="px-5 py-2.5 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold shadow-[0_0_10px_rgba(0,240,255,0.4)] hover:brightness-110 active:scale-95 transition-all flex items-center gap-1.5 cursor-pointer"
                >
                  <ChevronDown className="w-4 h-4" />
                  <span>Daha Fazla Göster (+{PAGE_CHUNK})</span>
                </button>
                {filteredItems.length > visibleCount + PAGE_CHUNK && (
                  <button
                    onClick={handleLoadAll}
                    className="px-4 py-2.5 rounded-full bg-[#201f21] hover:bg-[#2a2a2c] text-[#e5e1e4] font-headline text-xs font-medium border border-white/5 cursor-pointer transition-colors"
                  >
                    Tümünü Listele
                  </button>
                )}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
