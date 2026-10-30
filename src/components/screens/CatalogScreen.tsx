import React, { useState, useMemo, useEffect } from 'react';
import { MediaItem, Playlist } from '../../types';
import { StorageService } from '../../services/storage';
import type { WatchHistoryEntry } from '../../services/watchHistory';
import { CatalogMediaCard } from './CatalogMediaCard';
import { buildDiscoveryShelves, readCatalogPreferences, saveCatalogPreferences, sortCatalog, SORT_OPTIONS, VIEW_OPTIONS, type CatalogSort, type CatalogView, type CatalogPreferences } from '../../services/catalogDiscovery';
import {
  ArrowLeft,
  Search,
  X,
  Tv,
  Sparkles,
  ChevronDown,
  ListFilter,
  ArrowDownUp,
  LayoutGrid,
  Check,
} from 'lucide-react';

interface CatalogScreenProps {
  catalog: MediaItem[];
  profileId?: string;
  watchHistory?: WatchHistoryEntry[];
  activePlaylist: Playlist | null;
  onBackToPlaylists: () => void;
  onRetryCatalog?: () => void;
  onPlayMedia: (item: MediaItem) => void;
  onDownloadMedia: (item: MediaItem) => void;
  onScheduleMedia: (item: MediaItem) => void;
  onToggleFavorite: (id: string) => void;
  onOpenSeriesDetail: (item: MediaItem) => void;
  onOpenTmdbInfo: (item: MediaItem) => void;
  onOpenEpgGuide: (item: MediaItem) => void;
  isCatalogLoading?: boolean;
  isChildMode?: boolean;
  continueWatching?: WatchHistoryEntry[];
}

const PAGE_CHUNK = 60;

export const CatalogScreen: React.FC<CatalogScreenProps> = ({
  catalog,
  profileId = 'parent',
  watchHistory = [],
  activePlaylist,
  onBackToPlaylists,
  onRetryCatalog,
  onPlayMedia,
  onDownloadMedia,
  onScheduleMedia,
  onToggleFavorite,
  onOpenSeriesDetail,
  onOpenTmdbInfo,
  onOpenEpgGuide,
  isCatalogLoading,
  isChildMode = false,
  continueWatching = [],
}) => {
  const [activeTab, setActiveTab] = useState<'all' | 'live' | 'movie' | 'series'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tümü');
  const [searchQuery, setSearchQuery] = useState('');
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_CHUNK);
  const [isCategoryMenuOpen, setIsCategoryMenuOpen] = useState(false);
  const [categorySearch, setCategorySearch] = useState('');
  const [categorySort, setCategorySort] = useState<'az' | 'za' | 'oldest' | 'newest'>('az');
  const [preferences, setPreferences] = useState(() => readCatalogPreferences(profileId));
  const [openTools, setOpenTools] = useState<'sort' | 'view' | null>(null);
  useEffect(() => { setPreferences(readCatalogPreferences(profileId)); setOpenTools(null); }, [profileId]);
  useEffect(() => { setVisibleCount(PAGE_CHUNK); }, [catalog, preferences.sort, preferences.view]);
  useEffect(() => {
    if (!openTools) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpenTools(null); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [openTools]);
  const updatePreferences = (patch: Partial<CatalogPreferences>) => {
    const next = { ...preferences, ...patch };
    setPreferences(next); saveCatalogPreferences(profileId, next); setOpenTools(null);
  };
  const sortable = activeTab === 'movie' || activeTab === 'series';
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
    const categoryYears = new Map<string, number>();
    for (const item of visibleCatalog) if (item.year) {
      const name = (item.category || 'Genel').trim();
      categoryYears.set(name, Math.min(categoryYears.get(name) ?? item.year, item.year));
    }
    const yearForCategory = (name: string) => categoryYears.get(name) ?? null;
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

  const orderedItems = useMemo(() => sortable ? sortCatalog(filteredItems, preferences.sort) : filteredItems,
    [filteredItems, sortable, preferences.sort]);
  const shelves = useMemo(() => buildDiscoveryShelves(itemsForActiveTab, watchHistory), [itemsForActiveTab, watchHistory]);
  const hasAddedDates = filteredItems.some(item => Boolean(item.addedAt));

  // Performanslı DOM gösterimi için sayfalanmış içerik
  const visibleItems = useMemo(() => {
    return orderedItems.slice(0, visibleCount);
  }, [orderedItems, visibleCount]);

  const handleLoadMore = () => {
    setVisibleCount((prev) => Math.min(filteredItems.length, prev + PAGE_CHUNK));
  };


  return (
    <div className="flex flex-col w-full max-w-none mx-auto px-3 sm:px-4 lg:px-6 pt-2 pb-28 gap-3.5 select-none">
      {/* Active Playlist Header Strip */}
      <div className="flex items-center justify-between p-3 rounded-2xl bg-[#1c1b1d] border border-white/5 shadow-md">
        <div className="flex items-center gap-2.5 min-w-0">
          {!isChildMode && <button
            onClick={onBackToPlaylists}
            className="w-8 h-8 rounded-full bg-[#201f21] hover:bg-[#2a2a2c] flex items-center justify-center text-[#00f0ff] shrink-0 border border-white/5 cursor-pointer"
            title="Playlistlere Dön"
          >
            <ArrowLeft className="w-4 h-4 text-[#00f0ff]" />
          </button>}
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

      {continueWatching.length > 0 && (
        <section className="rounded-2xl bg-[#1d272b] border border-[#00f0ff]/20 p-3">
          <h2 className="font-bold text-sm text-[#00f0ff] mb-2">▶ İzlemeye Devam Et</h2>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {continueWatching.slice(0, 12).map(entry => (
              <button key={entry.id} className="w-32 shrink-0 text-left" onClick={() => onPlayMedia(entry.media as MediaItem)}>
                <img src={entry.media.poster} alt="" className="w-full h-20 rounded-lg object-cover bg-[#29292c]"/>
                <span className="text-xs font-bold line-clamp-2 mt-1">{entry.media.title}</span>
                <div className="h-1.5 mt-2 rounded-full bg-white/10 overflow-hidden">
                  <div className="h-full bg-[#00f0ff]" style={{width: Math.min(100, Math.max(0, 100 * entry.positionSeconds / entry.durationSeconds))+'%'}} />
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
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

      {!isCatalogLoading && catalog.length > 0 && activeTab !== 'live' && !searchQuery.trim() && selectedCategory === 'Tümü' && !shelves.some(shelf => shelf.title === 'Bu hafta çıkanlar') && (
        <section className="rounded-2xl bg-[#1c1b1d] border border-white/5 p-3" aria-label="Bu hafta çıkanlar">
          <h2 className="font-bold text-sm text-[#00f0ff]">Bu hafta çıkanlar</h2>
          <p className="text-xs text-[#b9cacb] mt-1">Bu hafta için doğrulanmış ilk yayın tarihi bulunmuyor. Yeni eklenenler ve sana uygun seçimler aşağıda gösterilir.</p>
        </section>
      )}
      {!isCatalogLoading && activeTab !== 'live' && !searchQuery.trim() && selectedCategory === 'Tümü' && shelves.map(shelf => (
        <section key={shelf.title} className="catalog-shelf min-w-0" aria-label={shelf.title}>
          <div className="flex items-center gap-2 mb-1"><Sparkles size={17} className="text-[#00f0ff]"/><h2 className="font-bold text-base">{shelf.title}</h2></div>
          <p className="text-[11px] text-[#849495] mb-3">{shelf.subtitle}</p>
          <div className="flex gap-3 overflow-x-auto pb-3 snap-x">
            {shelf.items.map(item => <button type="button" key={item.id} onClick={() => item.type === 'series' ? onOpenSeriesDetail(item) : onOpenTmdbInfo(item)}
              className="relative shrink-0 w-[32vw] sm:w-36 lg:w-44 snap-start text-left group" aria-label={`${item.title} keşfet`}>
              <div className="relative aspect-[2/3] rounded-xl overflow-hidden bg-[#29292c]">
                <img src={item.poster || '/brand/xiptvplay-icon.svg'} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover group-hover:scale-105 transition-transform" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/brand/xiptvplay-icon.svg'; }}/>
                {shelf.badge && <span className="absolute bottom-0 inset-x-0 px-2 py-1 bg-[#00f0ff] text-[#00363a] font-bold text-[10px] text-center">{shelf.badge}</span>}
              </div>
              <span className="block text-xs font-bold mt-1.5 line-clamp-2">{item.title}</span>
            </button>)}
          </div>
        </section>
      ))}

      {/* Kategori çipleri ve tüm alt kategorileri açan menü */}
      {categoriesForTab.length > 0 && (
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
          {sortable && <button type="button" onClick={() => setOpenTools(openTools === 'sort' ? null : 'sort')} aria-label="İçerikleri sırala" aria-expanded={openTools === 'sort'} title="İçerikleri sırala" className="shrink-0 min-h-10 px-2 rounded-xl bg-[#201f21] border border-[#00f0ff]/30 text-[#00f0ff] flex items-center gap-1.5 text-xs font-bold"><ArrowDownUp size={18}/><span className="hidden min-[400px]:inline">Sırala</span></button>}
          <button type="button" onClick={() => setOpenTools(openTools === 'view' ? null : 'view')} aria-label="Katalog görünümü" aria-expanded={openTools === 'view'} title="Katalog görünümü" className="shrink-0 w-10 h-10 rounded-xl bg-[#201f21] border border-white/10 text-[#00f0ff] flex items-center justify-center"><LayoutGrid size={18}/></button>
        </div>
      )}
      {sortable && <p className="text-[11px] text-[#849495] -mt-1" aria-live="polite">
        {SORT_OPTIONS.find(([key]) => key === preferences.sort)?.[1]} · {VIEW_OPTIONS.find(([key]) => key === preferences.view)?.[1]}
        {preferences.sort.startsWith('added-') && !hasAddedDates && ' · Eklenme tarihi yok; sağlayıcı sırası korunuyor. Kataloğu yenileyerek tarihleri alabilirsin.'}
      </p>}
      {openTools && <div className="fixed inset-0 z-[110] bg-black/70 flex items-end sm:items-center justify-center sm:p-4" onClick={() => setOpenTools(null)}>
        <section role="dialog" aria-modal="true" aria-label={openTools === 'sort' ? 'İçerik sıralaması' : 'Katalog görünümü'} onClick={event => event.stopPropagation()} className="w-full sm:max-w-md max-h-[88dvh] overflow-auto rounded-t-3xl sm:rounded-3xl bg-[#171719] border border-white/10 p-4 pb-8">
          <div className="flex items-center justify-between mb-3"><h2 className="font-bold text-base">{openTools === 'sort' ? 'İçerikleri sırala' : 'Katalog görünümü'}</h2><button autoFocus type="button" onClick={() => setOpenTools(null)} aria-label="Seçenekleri kapat" className="min-h-10 min-w-10 flex items-center justify-center"><X size={20}/></button></div>
          <p className="text-xs text-[#b9cacb] mb-3">Seçimin bu profil için hatırlanır.{openTools === 'sort' ? ' Film ve Dizi sekmelerinde, tüm alt kategorilerde uygulanır. Tarihi veya puanı olmayanlar sonda gösterilir.' : ''}</p>
          {(openTools === 'sort' ? SORT_OPTIONS : VIEW_OPTIONS).map(([key, label]) => <button type="button" key={key} aria-pressed={key === (openTools === 'sort' ? preferences.sort : preferences.view)}
            onClick={() => openTools === 'sort' ? updatePreferences({ sort: key as CatalogSort }) : updatePreferences({ view: key as CatalogView })}
            className="w-full min-h-12 flex items-center justify-between gap-3 px-3 py-3 mb-1 rounded-xl bg-white/5 text-left text-sm">
            {label}{key === (openTools === 'sort' ? preferences.sort : preferences.view) && <Check size={18} className="text-[#00f0ff]"/>}
          </button>)}
          {openTools === 'sort' && <p className="text-[11px] text-[#849495] mt-3">Puanlar sağlayıcının bildirdiği 10 üzerinden puanlardır; IMDb kaynağı doğrulanmış değildir. Eklenme tarihi ile yapım yılı farklıdır.</p>}
        </section>
      </div>}

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
            Seçili playlist için IPTV kataloğu bu cihazda henüz oluşturulamadı.
          </p>
          {activePlaylist?.errorMessage && <p role="alert" className="text-xs text-[#ffb4ab] p-3 max-w-sm bg-[#401f24] rounded-xl break-words">
            Hata: {activePlaylist.errorMessage}
          </p>}
          {onRetryCatalog && activePlaylist && <button onClick={onRetryCatalog}
            className="px-4 py-2 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold">
            Kataloğu Tekrar İndir
          </button>}
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
          <div className={`catalog-grid catalog-grid--${preferences.view}`} data-testid="catalog-grid">
            {visibleItems.map(item => <CatalogMediaCard key={item.id} item={item} view={preferences.view} isChildMode={isChildMode}
              onPlay={onPlayMedia} onSeries={onOpenSeriesDetail} onInfo={onOpenTmdbInfo} onEpg={onOpenEpgGuide}
              onDownload={onDownloadMedia} onSchedule={onScheduleMedia} onFavorite={onToggleFavorite}/>) }
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

              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

