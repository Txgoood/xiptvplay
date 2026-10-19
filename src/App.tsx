import React, { useState, useEffect } from 'react';
import { ScreenType, AppMode, Playlist, DownloadItem, MediaItem } from './types';
import { INITIAL_STATS } from './data/mockData';
import { StorageService } from './services/storage';
import { XtreamClientService } from './services/xtreamClient';
import { M3UParserService } from './services/m3uParser';
import { Header } from './components/Header';
import { BottomNav } from './components/BottomNav';
import { OnboardingScreen } from './components/screens/OnboardingScreen';
import { PlaylistsScreen } from './components/screens/PlaylistsScreen';
import { AddPlaylistModal } from './components/screens/AddPlaylistModal';
import { DownloadsScreen } from './components/screens/DownloadsScreen';
import { CatalogScreen } from './components/screens/CatalogScreen';
import { FavoritesScreen } from './components/screens/FavoritesScreen';
import { SettingsScreen } from './components/screens/SettingsScreen';
import { VideoPlayerModal } from './components/player/VideoPlayerModal';
import { PrdHub } from './components/prd/PrdHub';
import { Info, Cast as CastIcon, Tv as TvIcon, Search as SearchIcon, PlayCircle, X as CloseIcon } from 'lucide-react';

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('app');
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('playlists');
  const [userEmail, setUserEmail] = useState<string | null>('bahritugtekin@gmail.com');

  // Persistent Application Data States (Restored from StorageService)
  const [stats, setStats] = useState(INITIAL_STATS);
  const [playlists, setPlaylists] = useState<Playlist[]>(() => StorageService.getPlaylists());
  const [downloads, setDownloads] = useState<DownloadItem[]>(() => StorageService.getDownloads());
  const [favoriteIds, setFavoriteIds] = useState<string[]>(() => StorageService.getFavorites());

  // Active Selected Playlist and Its Loaded Items
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [catalogItems, setCatalogItems] = useState<MediaItem[]>([]);

  // Modals & Player State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalType, setAddModalType] = useState<'xtream' | 'm3u'>('xtream');
  const [activePlayerMedia, setActivePlayerMedia] = useState<MediaItem | DownloadItem | null>(null);

  // Cast, Search & Profile Modals
  const [isCastOpen, setIsCastOpen] = useState(false);
  const [isCastConnected, setIsCastConnected] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  // Toast System
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3200);
  };

  // Sync playlists to persistent storage whenever modified
  useEffect(() => {
    StorageService.savePlaylists(playlists);
    setStats((prev) => ({
      ...prev,
      activePlaylistsCount: playlists.length,
    }));
  }, [playlists]);

  // Sync downloads to persistent storage
  useEffect(() => {
    StorageService.saveDownloads(downloads);
  }, [downloads]);

  // Sync favorites to persistent storage
  useEffect(() => {
    StorageService.saveFavorites(favoriteIds);
  }, [favoriteIds]);

  // When active playlist changes, load its real items from storage
  useEffect(() => {
    if (activePlaylist) {
      const items = StorageService.getPlaylistItems(activePlaylist.id);
      setCatalogItems(items);
    } else if (playlists.length > 0) {
      const items = StorageService.getPlaylistItems(playlists[0].id);
      setCatalogItems(items);
    } else {
      setCatalogItems([]);
    }
  }, [activePlaylist, playlists]);

  // Add Playlist Handler
  const handleOpenAddModal = (type: 'xtream' | 'm3u' = 'xtream') => {
    setAddModalType(type);
    setIsAddModalOpen(true);
  };

  const handleAddPlaylist = (newPl: Playlist, items: MediaItem[]) => {
    setPlaylists((prev) => [newPl, ...prev]);
    setActivePlaylist(newPl);
    setCatalogItems(items);
    showToast(`"${newPl.name}" başarıyla doğrulandı ve kaydedildi (${items.length} içerik)!`);
  };

  // Permanent Delete Handler
  const handleDeletePlaylist = (id: string) => {
    StorageService.deletePlaylist(id);
    setPlaylists((prev) => prev.filter((p) => p.id !== id));
    if (activePlaylist?.id === id) {
      setActivePlaylist(null);
      setCatalogItems([]);
    }
    showToast('Playlist kalıcı olarak silindi.');
  };

  // Real Refresh / Sync Handler
  const handleRefreshPlaylist = async (id: string) => {
    const target = playlists.find((p) => p.id === id);
    if (!target) return;

    if (target.type === 'xtream' && target.serverUrl && target.username && target.password) {
      const verifyRes = await XtreamClientService.verifyConnection(
        target.serverUrl,
        target.username,
        target.password
      );

      if (!verifyRes.success) {
        setPlaylists((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  status: 'error',
                  statusLabel: 'Bağlantı Hatası',
                  errorMessage: verifyRes.error,
                  lastSync: 'Hata',
                }
              : p
          )
        );
        showToast(`Yenileme başarısız: ${verifyRes.error || 'Sunucu hatası'}`);
        return;
      }

      const effectiveUrl = verifyRes.effectiveServerUrl || target.serverUrl;
      const catalogRes = await XtreamClientService.fetchCatalog(
        effectiveUrl,
        target.username,
        target.password,
        target.id
      );

      StorageService.savePlaylistItems(target.id, catalogRes.items);

      setPlaylists((prev) =>
        prev.map((p) =>
          p.id === id
            ? {
                ...p,
                serverUrl: effectiveUrl,
                status: 'active',
                statusLabel: 'Bağlı (Aktif)',
                liveCount: catalogRes.counts.live,
                movieCount: catalogRes.counts.movie,
                seriesCount: catalogRes.counts.series,
                expiryDays: verifyRes.expiryDays || p.expiryDays,
                expiryDateStr: verifyRes.expiryDateStr || p.expiryDateStr,
                pingMs: verifyRes.pingMs || p.pingMs,
                lastSync: 'Şimdi',
                errorMessage: undefined,
              }
            : p
        )
      );

      if (activePlaylist?.id === id) {
        setCatalogItems(catalogRes.items);
      }
      showToast(`"${target.name}" yenilendi (${catalogRes.items.length} içerik güncel).`);
    } else if (target.type === 'm3u' && target.m3uUrl) {
      try {
        const fetchRes = await M3UParserService.fetchM3U(target.m3uUrl);
        if (!fetchRes.success || !fetchRes.content) {
          showToast(`M3U senkronizasyonu başarısız: ${fetchRes.error || 'İçerik alınamadı'}`);
          return;
        }

        const parsed = M3UParserService.parse(fetchRes.content, target.id);
        StorageService.savePlaylistItems(target.id, parsed.items);

        setPlaylists((prev) =>
          prev.map((p) =>
            p.id === id
              ? {
                  ...p,
                  m3uUrl: fetchRes.effectiveUrl || p.m3uUrl,
                  liveCount: parsed.counts.live,
                  movieCount: parsed.counts.movie,
                  seriesCount: parsed.counts.series,
                  lastSync: 'Şimdi',
                }
              : p
          )
        );

        if (activePlaylist?.id === id) {
          setCatalogItems(parsed.items);
        }
        showToast(`M3U listesi güncellendi (${parsed.items.length} kanal).`);
      } catch (err: any) {
        showToast(`M3U senkronizasyonu başarısız: ${err.message}`);
      }
    } else {
      showToast(`"${target.name}" önbellekten güncellendi.`);
    }
  };

  // Explicit Demo Data Loader
  const handleLoadDemoData = () => {
    const demos = StorageService.loadDemoPlaylists();
    setPlaylists(demos);
    if (demos[0]) {
      setActivePlaylist(demos[0]);
      setCatalogItems(StorageService.getPlaylistItems(demos[0].id));
    }
    setDownloads(StorageService.getDownloads());
    showToast('Test amaçlı demo oynatma listeleri yüklendi.');
  };

  // Open Playlist in Catalog
  const handleSelectPlaylist = (playlist: Playlist) => {
    setActivePlaylist(playlist);
    const items = StorageService.getPlaylistItems(playlist.id);
    setCatalogItems(items);
    setCurrentScreen('catalog');
  };

  // Favorites Toggle
  const handleToggleFavorite = (mediaId: string) => {
    setFavoriteIds((prev) => {
      const exists = prev.includes(mediaId);
      const next = exists ? prev.filter((id) => id !== mediaId) : [...prev, mediaId];
      showToast(exists ? 'Favorilerden çıkarıldı' : 'Favorilere eklendi');
      return next;
    });
  };

  // Download Media Handler
  const handleDownloadMedia = (item: MediaItem) => {
    const existing = downloads.find((d) => d.mediaId === item.id);
    if (existing) {
      showToast(`"${item.title}" zaten indirme listesinde mevcut.`);
      setCurrentScreen('downloads');
      return;
    }

    const newDownload: DownloadItem = {
      id: `dl-${Date.now()}`,
      mediaId: item.id,
      title: item.title,
      subtitle: `${item.category} • ${item.resolution} • ${item.fileSizeGb || 1.8} GB`,
      type: item.type === 'movie' ? 'movie' : 'series',
      resolutionBadge: item.resolution,
      totalSizeGb: item.fileSizeGb || 1.8,
      downloadedGb: 0.05,
      speedMbps: 9.4,
      eta: '2d 15s',
      progressPercent: 3,
      status: 'downloading',
      statusLabel: 'İniyor',
      poster: item.poster,
      streamUrl: item.streamUrl,
    };

    setDownloads([newDownload, ...downloads]);
    showToast(`"${item.title}" indirme kuyruğuna eklendi.`);
    setCurrentScreen('downloads');
  };

  // Downloads Batch Actions
  const handlePauseAll = () => {
    setDownloads((prev) =>
      prev.map((d) => (d.status === 'downloading' ? { ...d, status: 'paused', speedMbps: 0 } : d))
    );
    showToast('Tüm aktif indirmeler duraklatıldı.');
  };

  const handleResumeAll = () => {
    setDownloads((prev) =>
      prev.map((d) =>
        d.status === 'paused'
          ? { ...d, status: 'downloading', speedMbps: parseFloat((Math.random() * 5 + 6).toFixed(1)) }
          : d
      )
    );
    showToast('İndirmeler kaldığı bayt noktasından devam ediyor.');
  };

  const handleClearCompleted = () => {
    setDownloads((prev) => prev.filter((d) => d.status !== 'completed'));
    showToast('Tamamlanan indirme bildirimleri temizlendi.');
  };

  const handleTogglePauseItem = (id: string) => {
    setDownloads((prev) =>
      prev.map((d) => {
        if (d.id === id) {
          if (d.status === 'downloading') {
            return { ...d, status: 'paused', speedMbps: 0 };
          }
          if (d.status === 'paused') {
            return { ...d, status: 'downloading', speedMbps: 8.2 };
          }
        }
        return d;
      })
    );
  };

  const handleCancelItem = (id: string) => {
    setDownloads((prev) => prev.filter((d) => d.id !== id));
    showToast('İndirme iptal edildi.');
  };

  const handlePromoteItem = (id: string) => {
    setDownloads((prev) =>
      prev.map((d) => {
        if (d.id === id && d.status === 'queued') {
          return {
            ...d,
            status: 'downloading',
            speedMbps: 8.5,
            queueOrder: undefined,
            eta: '3d 40s',
          };
        }
        return d;
      })
    );
    showToast('İndirme sırası en öne alındı!');
  };

  // Clear Storage and Reset
  const handleClearCache = () => {
    setStats((prev) => ({
      ...prev,
      releasableMb: 0,
      cacheSizeGb: 1.15,
    }));
  };

  const handleResetApp = () => {
    StorageService.clearAll();
    setPlaylists([]);
    setDownloads([]);
    setFavoriteIds([]);
    setActivePlaylist(null);
    setCatalogItems([]);
    showToast('Tüm veriler ve kayıtlı playlistler silindi.');
  };

  // Favorites array mapped with isFavorite property
  const allFavoritesList = catalogItems.filter((c) => favoriteIds.includes(c.id));
  const activeDownloadsCount = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'queued'
  ).length;

  return (
    <div className="min-h-screen bg-[#131315] text-[#e5e1e4] flex flex-col font-body selection:bg-[#00f0ff] selection:text-[#00363a]">
      {/* Toast Notification Container */}
      {toast && (
        <div className="fixed top-20 inset-x-0 flex justify-center z-50 pointer-events-none px-4">
          <div className="px-4 py-2 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold shadow-2xl flex items-center gap-1.5 border border-white/20 pointer-events-auto">
            <Info className="w-4 h-4 shrink-0" />
            <span>{toast}</span>
          </div>
        </div>
      )}

      {/* Top Header */}
      <Header
        currentScreen={currentScreen}
        appMode={appMode}
        setAppMode={setAppMode}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenCast={() => setIsCastOpen(true)}
        isCastConnected={isCastConnected}
        userEmail={userEmail}
        onOpenProfile={() => setIsProfileOpen(true)}
      />

      {/* Main View Port */}
      <main className="flex-1 w-full pt-16 flex flex-col">
        {appMode === 'prd' ? (
          <PrdHub onBackToApp={() => setAppMode('app')} />
        ) : (
          <>
            {currentScreen === 'onboarding' && (
              <OnboardingScreen
                onContinueAsGuest={() => {
                  setCurrentScreen('playlists');
                  showToast('Misafir oturumu ile giriş yapıldı.');
                }}
                onSignInWithGoogle={() => {
                  setUserEmail('bahritugtekin@gmail.com');
                  setCurrentScreen('playlists');
                  showToast('Google Hesabı ile giriş yapıldı.');
                }}
              />
            )}

            {currentScreen === 'playlists' && (
              <PlaylistsScreen
                playlists={playlists}
                stats={stats}
                onOpenAddModal={handleOpenAddModal}
                onSelectPlaylist={handleSelectPlaylist}
                onRefreshPlaylist={handleRefreshPlaylist}
                onDeletePlaylist={handleDeletePlaylist}
                onLoadDemoData={handleLoadDemoData}
              />
            )}

            {currentScreen === 'catalog' && (
              <CatalogScreen
                catalog={catalogItems.map((c) => ({
                  ...c,
                  isFavorite: favoriteIds.includes(c.id),
                }))}
                activePlaylist={activePlaylist}
                onBackToPlaylists={() => setCurrentScreen('playlists')}
                onPlayMedia={(item) => setActivePlayerMedia(item)}
                onDownloadMedia={handleDownloadMedia}
                onToggleFavorite={handleToggleFavorite}
              />
            )}

            {currentScreen === 'downloads' && (
              <DownloadsScreen
                downloads={downloads}
                stats={stats}
                onPlayMedia={(download) => setActivePlayerMedia(download)}
                onPauseAll={handlePauseAll}
                onResumeAll={handleResumeAll}
                onClearCompleted={handleClearCompleted}
                onTogglePauseItem={handleTogglePauseItem}
                onCancelItem={handleCancelItem}
                onPromoteItem={handlePromoteItem}
              />
            )}

            {currentScreen === 'favorites' && (
              <FavoritesScreen
                favorites={allFavoritesList}
                onPlayMedia={(item) => setActivePlayerMedia(item)}
                onRemoveFavorite={handleToggleFavorite}
                onOpenCatalog={() => setCurrentScreen('catalog')}
              />
            )}

            {currentScreen === 'settings' && (
              <SettingsScreen
                stats={stats}
                onClearCache={handleClearCache}
                onResetApp={handleResetApp}
              />
            )}
          </>
        )}
      </main>

      {/* Bottom Nav: Only visible when in 'app' mode and not in onboarding */}
      {appMode === 'app' && currentScreen !== 'onboarding' && (
        <BottomNav
          currentScreen={currentScreen}
          onSelectScreen={setCurrentScreen}
          activeDownloadsCount={activeDownloadsCount}
          favoritesCount={favoriteIds.length}
        />
      )}

      {/* Add Playlist Modal */}
      <AddPlaylistModal
        initialType={addModalType}
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddPlaylist={handleAddPlaylist}
      />

      {/* Real Video Player Modal */}
      <VideoPlayerModal
        media={activePlayerMedia}
        isOpen={!!activePlayerMedia}
        onClose={() => setActivePlayerMedia(null)}
      />

      {/* Chromecast Simulation Modal */}
      {isCastOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#1c1b1d] rounded-3xl p-5 border border-white/10 shadow-2xl flex flex-col gap-3">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <div className="flex items-center gap-2">
                <CastIcon className="w-5 h-5 text-[#00f0ff]" />
                <span className="font-headline font-bold text-sm text-white">Yansıtılacak Cihaz</span>
              </div>
              <button onClick={() => setIsCastOpen(false)} className="text-[#849495] hover:text-white cursor-pointer">
                ✕
              </button>
            </div>
            <div className="flex flex-col gap-2 py-1">
              {[
                { name: 'Salon Android TV (4K)', type: 'Google Cast' },
                { name: 'Oturma Odası Chromecast', type: 'Chromecast Ultra' },
                { name: 'Yatak Odası Mi Box', type: 'DLNA / AirPlay' },
              ].map((device) => (
                <button
                  key={device.name}
                  onClick={() => {
                    setIsCastConnected(true);
                    setIsCastOpen(false);
                    showToast(`"${device.name}" cihazına bağlandı!`);
                  }}
                  className="flex items-center justify-between p-3 rounded-2xl bg-[#201f21] hover:bg-[#2a2a2c] text-left transition-all border border-white/5 cursor-pointer"
                >
                  <div className="flex flex-col">
                    <span className="font-headline text-xs font-bold text-white">{device.name}</span>
                    <span className="text-[10px] text-[#b9cacb]">{device.type}</span>
                  </div>
                  <TvIcon className="w-4 h-4 text-[#00f0ff]" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Quick Search Dialog Modal */}
      {isSearchOpen && (
        <div className="fixed inset-0 z-50 flex items-start justify-center pt-20 px-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-md bg-[#1c1b1d] rounded-3xl p-4 border border-white/10 shadow-2xl flex flex-col gap-3">
            <div className="relative flex items-center">
              <SearchIcon className="w-4 h-4 absolute left-3.5 text-[#00f0ff]" />
              <input
                autoFocus
                type="text"
                value={globalSearchTerm}
                onChange={(e) => setGlobalSearchTerm(e.target.value)}
                placeholder="Kanal veya içerik adı yazın..."
                className="w-full bg-[#201f21] rounded-2xl pl-11 pr-10 py-3 text-xs text-[#e5e1e4] placeholder:text-[#849495] border border-white/5 focus:outline-none focus:border-[#00f0ff]/50"
              />
              <button
                onClick={() => setIsSearchOpen(false)}
                className="absolute right-3 text-[#b9cacb] hover:text-white cursor-pointer"
              >
                <CloseIcon className="w-4 h-4" />
              </button>
            </div>

            <div className="flex flex-col gap-1 max-h-60 overflow-y-auto no-scrollbar">
              {catalogItems
                .filter(
                  (c) =>
                    !globalSearchTerm ||
                    c.title.toLowerCase().includes(globalSearchTerm.toLowerCase()) ||
                    c.category.toLowerCase().includes(globalSearchTerm.toLowerCase())
                )
                .map((item) => (
                  <button
                    key={item.id}
                    onClick={() => {
                      setIsSearchOpen(false);
                      setActivePlayerMedia(item);
                    }}
                    className="flex items-center justify-between p-2 rounded-xl hover:bg-[#201f21] text-left transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <img
                        src={item.poster}
                        alt=""
                        className="w-9 h-9 rounded-lg object-cover shrink-0"
                        onError={(e) => {
                          (e.target as HTMLImageElement).src =
                            'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&auto=format&fit=crop&q=80';
                        }}
                      />
                      <div className="flex flex-col min-w-0">
                        <span className="font-headline text-xs font-semibold text-white truncate">
                          {item.title}
                        </span>
                        <span className="text-[10px] text-[#b9cacb]">{item.category}</span>
                      </div>
                    </div>
                    <PlayCircle className="w-5 h-5 text-[#00f0ff] shrink-0" />
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}

      {/* Profile Dialog */}
      {isProfileOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="w-full max-w-sm bg-[#1c1b1d] rounded-3xl p-5 border border-white/10 shadow-2xl flex flex-col gap-4 text-center items-center">
            <div className="w-16 h-16 rounded-full bg-gradient-to-tr from-[#0566d9] to-[#00f0ff] flex items-center justify-center text-white text-2xl font-bold shadow-lg">
              BT
            </div>
            <div className="flex flex-col">
              <span className="font-headline text-base font-bold text-white">Bahri Tuğtekin</span>
              <span className="text-xs text-[#00f0ff] font-mono">{userEmail}</span>
              <span className="text-[11px] text-[#4edea3] mt-1 font-semibold">
                ● Kalıcı Depolama Etkin
              </span>
            </div>

            <div className="w-full grid grid-cols-2 gap-2 text-xs">
              <div className="p-2.5 rounded-xl bg-[#201f21] border border-white/5">
                <span className="text-[10px] text-[#849495] block">Bağlı Playlist</span>
                <span className="font-headline font-bold text-sm text-white">
                  {playlists.length} Adet
                </span>
              </div>
              <div className="p-2.5 rounded-xl bg-[#201f21] border border-white/5">
                <span className="text-[10px] text-[#849495] block">İndirilen Arşiv</span>
                <span className="font-headline font-bold text-sm text-[#00f0ff]">
                  {downloads.length} Öğe
                </span>
              </div>
            </div>

            <div className="flex flex-col gap-2 w-full pt-1">
              <button
                onClick={() => {
                  setCurrentScreen('onboarding');
                  setIsProfileOpen(false);
                  showToast('Başlangıç ekranına geçildi.');
                }}
                className="w-full py-2.5 rounded-full bg-[#201f21] hover:bg-[#2a2a2c] text-xs font-semibold text-[#ffb4ab] border border-white/5 cursor-pointer"
              >
                Başlangıç Ekranı
              </button>
              <button
                onClick={() => setIsProfileOpen(false)}
                className="w-full py-2.5 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold shadow-[0_0_10px_rgba(0,240,255,0.4)] cursor-pointer"
              >
                Kapat
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
