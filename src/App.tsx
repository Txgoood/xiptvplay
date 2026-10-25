import { useState, useEffect, useMemo, useRef } from 'react';
import { ScreenType, AppMode, Playlist, DownloadItem, MediaItem, SeriesEpisode } from './types';
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
import { SeriesDetailModal } from './components/screens/SeriesDetailModal';
import { VideoPlayerModal } from './components/player/VideoPlayerModal';
import { PrdHub } from './components/prd/PrdHub';
import { Info, Cast as CastIcon, Tv as TvIcon, Search as SearchIcon, PlayCircle, X as CloseIcon } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor } from '@capacitor/core';
import { DownloadNotifications } from './services/downloadNotifications';

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('app');
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('playlists');
  const [userEmail, setUserEmail] = useState<string | null>('bahritugtekin@gmail.com');

  // Persistent Application Data States (Clean Empty Initial States)
  const [stats, setStats] = useState(INITIAL_STATS);
  const [playlists, setPlaylists] = useState<Playlist[]>(() => StorageService.getPlaylists());
  const [downloads, setDownloads] = useState<DownloadItem[]>(() => StorageService.getDownloads());
  const [favoriteItems, setFavoriteItems] = useState<MediaItem[]>(() => StorageService.getFavoriteItems());

  // Active Selected Playlist and Its Loaded Items
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [catalogItems, setCatalogItems] = useState<MediaItem[]>([]);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const autoRefreshAttemptedRef = useRef<Set<string>>(new Set());

  // Modals & Player State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalType, setAddModalType] = useState<'xtream' | 'm3u'>('xtream');
  const [activePlayerMedia, setActivePlayerMedia] = useState<MediaItem | DownloadItem | null>(null);
  const [selectedSeriesItem, setSelectedSeriesItem] = useState<MediaItem | null>(null);
  const [catalogTargetSeason, setCatalogTargetSeason] = useState<number | undefined>(undefined);

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

  // Android bildirim iznini iste; izin reddedilirse uygulama normal çalışmaya devam eder.
  useEffect(() => { void DownloadNotifications.requestPermission(); }, []);

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
    StorageService.saveFavoriteItems(favoriteItems);
  }, [favoriteItems]);

  // Aktif playlist id'sini kalıcı sakla (açılışta geri yüklemek için)
  useEffect(() => {
    StorageService.setActivePlaylistId(activePlaylist ? activePlaylist.id : null);
  }, [activePlaylist]);

  // Açılışta kayıtlı (yoksa ilk) playlist'i otomatik seç
  useEffect(() => {
    const savedId = StorageService.getActivePlaylistId();
    const target = playlists.find((p) => p.id === savedId) || playlists[0];
    if (target) {
      setActivePlaylist(target);
    }
  }, []);

  // When active playlist changes, load its items from storage
  useEffect(() => {
    if (activePlaylist) {
      setIsCatalogLoading(true);
      // 1. Fast load (localStorage)
      const items = StorageService.getPlaylistItems(activePlaylist.id);
      setCatalogItems(items);

      // 2. Slow load (IndexedDB)
      StorageService.loadPlaylistItemsPersistent(activePlaylist.id).then(persistentItems => {
        if (persistentItems && persistentItems.length > items.length) {
          setCatalogItems(persistentItems);
        }
        setIsCatalogLoading(false);
        
        // Auto-refresh logic:
        // check total > 0 and no movie/series in catalog
        const totalItems = (activePlaylist.liveCount || 0) + (activePlaylist.movieCount || 0) + (activePlaylist.seriesCount || 0);
        const hasMovieOrSeries = persistentItems ? persistentItems.some(i => i.type === 'movie' || i.type === 'series') : false;
        
        if (totalItems > 0 && !hasMovieOrSeries && !autoRefreshAttemptedRef.current.has(activePlaylist.id)) {
            autoRefreshAttemptedRef.current.add(activePlaylist.id);
            handleRefreshPlaylist(activePlaylist.id);
        }
      });
    } else {
      setCatalogItems([]);
      setIsCatalogLoading(false);
    }
  }, [activePlaylist]);



  // Add Playlist Handler
  const handleOpenAddModal = (type: 'xtream' | 'm3u' = 'xtream') => {
    setAddModalType(type);
    setIsAddModalOpen(true);
  };

  const handleAddPlaylist = (newPl: Playlist, items: MediaItem[]) => {
    setPlaylists((prev) => [newPl, ...prev]);
    setActivePlaylist(newPl);
    setCatalogItems(items);
    setAppMode('app');
    setCurrentScreen('catalog');

    // 3. M3U listesi başarıyla yüklendiğinde katalog ekranında hemen listele ve ilk kanalı VideoPlayerModal'da otomatik oynat
    if (items.length > 0) {
      const firstPlayable = items.find((i) => i.type === 'live') || items[0];
      setActivePlayerMedia(firstPlayable);
      showToast(
        `"${newPl.name}" başarıyla yüklendi (${items.length} kanal). "${firstPlayable.title}" otomatik başlatılıyor...`
      );
    } else {
      showToast(`"${newPl.name}" başarıyla doğrulandı ve kaydedildi!`);
    }
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

  const handleUpdatePlaylist = (updated: Playlist) => {
    StorageService.upsertPlaylist(updated);
    setPlaylists((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    if (activePlaylist?.id === updated.id) {
      setActivePlaylist(updated);
    }
    showToast(`"${updated.name}" başarıyla güncellendi ve kaydedildi.`);
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

      const catalogRes = await XtreamClientService.fetchCatalog(
        target.serverUrl,
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

  // Katalog ekranına güvenli geçiş: playlist yoksa ekle, hiç playlist yoksa listeye yönlendir
  const handleNavigateToCatalog = () => {
    if (activePlaylist) {
      setCurrentScreen('catalog');
    } else if (playlists.length > 0) {
      setActivePlaylist(playlists[0]);
      setCurrentScreen('catalog');
    } else {
      setCurrentScreen('playlists');
      showToast('Önce bir playlist ekleyin.');
    }
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
    setFavoriteItems((prev) => {
      const exists = prev.find(item => item.id === mediaId);
      const next = exists 
        ? prev.filter((item) => item.id !== mediaId) 
        : [...prev, catalogItems.find(item => item.id === mediaId) || { id: mediaId, title: 'Bilinmiyor', category: 'Genel', type: 'movie', resolution: 'HD', poster: '', streamUrl: '' } as MediaItem];
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
      id: `dl-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      mediaId: item.id,
      playlistId: item.playlistId,
      title: item.title,
      subtitle: `${item.category} • ${item.resolution} • ${item.fileSizeGb && item.fileSizeGb > 0 ? `${item.fileSizeGb.toFixed(2)} GB` : 'Boyut bekleniyor'}`, 
      type: item.type === 'movie' ? 'movie' : 'series',
      resolutionBadge: item.resolution,
      totalSizeGb: item.fileSizeGb && item.fileSizeGb > 0 ? item.fileSizeGb : 0,
      downloadedGb: 0,
      speedMbps: 0,
      eta: '0s',
      progressPercent: 0,
      status: 'queued',
      statusLabel: 'Sırada bekliyor',
      poster: item.poster,
      streamUrl: item.streamUrl,
      rawStreamUrl: item.rawStreamUrl || item.streamUrl,
      ...(item.seriesTitle ? { seriesTitle: item.seriesTitle } : {}),
      ...(typeof item.seasonNumber === 'number' ? { seasonNumber: item.seasonNumber } : {}),
      ...(typeof item.episodeNumber === 'number' ? { episodeNumber: item.episodeNumber } : {}),
      ...(item.episodeTitle ? { episodeTitle: item.episodeTitle } : {}),
    };

    setDownloads((prev) => [newDownload, ...prev]);
    showToast(`"${item.title}" indirme başlatılıyor...`);
    void DownloadNotifications.progress(newDownload.id, item.title, 0, 'İndirme başlatılıyor');
    
    import('./services/downloadManager').then(dm => {
        dm.startDownload(
            newDownload,
            (progress, downloadedGb, speedMbps, eta, reportedTotalSizeGb) => {
                void DownloadNotifications.progress(newDownload.id, item.title, progress, `${progress}% • ${speedMbps.toFixed(1)} Mbps`);
                setDownloads(prev => prev.map(d => {
                  if (d.id !== newDownload.id) return d;
                  const totalSizeGb = reportedTotalSizeGb && reportedTotalSizeGb > 0 ? reportedTotalSizeGb : d.totalSizeGb;
                  const sizeLabel = totalSizeGb > 0 ? `${totalSizeGb.toFixed(2)} GB` : 'Boyut bekleniyor';
                  return {
                    ...d,
                    progressPercent: progress,
                    downloadedGb,
                    speedMbps,
                    eta,
                    totalSizeGb,
                    subtitle: `${item.category} • ${item.resolution} • ${sizeLabel}`,
                  };
                }));
            },
            (localUrl, relativePath, fileUri) => {
                (async () => {
                  let actualSizeGb = 0;
                  try {
                    if (relativePath) {
                      const info = await Filesystem.stat({ path: relativePath, directory: Directory.Data });
                      actualSizeGb = Number(info.size || 0) / 1_000_000_000;
                    }
                  } catch (sizeError) {
                    console.warn('[Downloads] Gerçek dosya boyutu okunamadı.', sizeError);
                  }
                  setDownloads(prev => prev.map(d => d.id === newDownload.id ? {
                    ...d,
                    status: 'completed',
                    statusLabel: 'Tamamlandı',
                    localUrl,
                    offlinePath: relativePath,
                    fileUri,
                    ...(actualSizeGb > 0 ? {
                      totalSizeGb: actualSizeGb,
                      downloadedGb: actualSizeGb,
                      subtitle: d.subtitle.replace(/\d+(?:\.\d+)? GB/, `${actualSizeGb.toFixed(2)} GB`)
                    } : {}),
                    progressPercent: 100,
                    eta: 'Tamamlandı'
                  } : d));
                })();
                void DownloadNotifications.complete(newDownload.id, item.title);
                showToast(`"${item.title}" indirildi.`);
            },
            (error) => {
                // Bildirim çubuğundaki sistem iptali uygulamanın cancelDownload
                // fonksiyonunu çağırmayabilir; iptal hatasını listeden de kaldır.
                if (/iptal|cancel(?:led|ed)?|canceled|aborted by user/i.test(error)) {
                  void DownloadNotifications.cancel(newDownload.id);
                  setDownloads(prev => prev.filter(d => d.id !== newDownload.id));
                  showToast(`"${item.title}" indirmesi iptal edildi; yarım kalan dosya temizlendi.`);
                  return;
                }
                void DownloadNotifications.cancel(newDownload.id);
                setDownloads(prev => prev.map(d => d.id === newDownload.id ? { ...d, status: 'error', statusLabel: 'Hata', errorMessage: error } : d));
                showToast(`İndirme hatası: ${error}`);
            },
            (status, queueOrder) => {
              setDownloads(prev => prev.map(d => d.id === newDownload.id ? {
                ...d,
                status,
                statusLabel: status === 'downloading' ? 'İniyor' : 'Sırada bekliyor',
                queueOrder: status === 'queued' ? queueOrder : undefined,
                speedMbps: status === 'queued' ? 0 : d.speedMbps,
              } : d));
            }
        );
    });
    
    setCurrentScreen('downloads');
  };

  // İndirme küçük resminden ilgili katalog konumuna dön.
  const handleOpenCatalogFromDownload = (item: DownloadItem) => {
    const playlist = playlists.find((p) => p.id === item.playlistId) || activePlaylist || playlists[0];
    if (!playlist) {
      showToast('Kataloğu açmak için önce ilgili playlist eklenmeli.');
      setCurrentScreen('playlists');
      return;
    }
    setActivePlaylist(playlist);
    setCatalogItems(StorageService.getPlaylistItems(playlist.id));
    setCurrentScreen('catalog');
    if (item.type === 'series') {
      const seriesTitle = item.seriesTitle || item.title.replace(/\\s*-\\s*S\\d{1,2}E\\d{1,2}:.*$/i, '').trim();
      const series = StorageService.getPlaylistItems(playlist.id).find((entry) => entry.type === 'series' && entry.title.toLocaleLowerCase('tr') === seriesTitle.toLocaleLowerCase('tr'));
      if (series) {
        setCatalogTargetSeason(item.seasonNumber || 1);
        setSelectedSeriesItem(series);
      } else {
        showToast('Dizi katalogda bulunamadı; playlist önbelleğini yenilemeyi deneyin.');
      }
    } else {
      showToast('İlgili playlist kataloğu açıldı.');
    }
  };

  // Series Episode Play Handler
  const handlePlayEpisode = (episode: SeriesEpisode, seriesItem: MediaItem, nextEpisode?: SeriesEpisode, nextNextEpisode?: SeriesEpisode) => {
    const seasonStr = String(episode.seasonNum).padStart(2, '0');
    const epStr = String(episode.episodeNum).padStart(2, '0');

    // 1- Dizi Bölümü URL Oluşturma Mantığı:
    // ${serverUrl}/series/${username}/${password}/${episode.id}.${episode.container_extension || 'mp4'}
    let finalStreamUrl = episode.streamUrl;
    let directUrl = episode.rawStreamUrl;
    if (
      activePlaylist &&
      activePlaylist.type === 'xtream' &&
      activePlaylist.serverUrl &&
      activePlaylist.username &&
      activePlaylist.password
    ) {
      const serverUrl = XtreamClientService.normalizeServerUrl(activePlaylist.serverUrl);
      const ext = episode.containerExtension || 'mp4';
      directUrl = `${serverUrl}/series/${activePlaylist.username}/${activePlaylist.password}/${episode.id}.${ext}`;
      // 2- Proxy ve Güvenli Oynatıcı:
      finalStreamUrl = XtreamClientService.getSafeStreamUrl(directUrl);
    } else if (finalStreamUrl && !finalStreamUrl.startsWith('/api/')) {
      directUrl = finalStreamUrl;
      finalStreamUrl = XtreamClientService.getSafeStreamUrl(finalStreamUrl);
    }

    const episodeMedia: MediaItem = {
      id: `ep-${seriesItem.id}-${episode.id}`,
      playlistId: seriesItem.playlistId,
      title: `${seriesItem.title} - S${seasonStr}E${epStr}: ${episode.title}`,
      category: seriesItem.category || 'Dizi',
      type: 'series',
      resolution: seriesItem.resolution || 'FHD 60P',
      duration: episode.duration,
      rating: episode.rating,
      poster: episode.image || seriesItem.poster,
      streamUrl: finalStreamUrl,
      rawStreamUrl: directUrl || episode.rawStreamUrl,
      audioTracks: ['Türkçe Dublaj', 'English (Dolby)'],
      subtitles: ['Türkçe', 'English', 'Off'],
      containerExtension: episode.containerExtension || 'mp4',
      streamId: episode.id,
    };
    if (nextEpisode) {
      let nextDirectUrl = nextEpisode.rawStreamUrl || nextEpisode.streamUrl;
      if (
        activePlaylist &&
        activePlaylist.type === 'xtream' &&
        activePlaylist.serverUrl &&
        activePlaylist.username &&
        activePlaylist.password
      ) {
        const serverUrl = XtreamClientService.normalizeServerUrl(activePlaylist.serverUrl);
        const nextExt = nextEpisode.containerExtension || 'mp4';
        nextDirectUrl = `${serverUrl}/series/${activePlaylist.username}/${activePlaylist.password}/${nextEpisode.id}.${nextExt}`;
      }
      const nextSeasonStr = String(nextEpisode.seasonNum).padStart(2, '0');
      const nextEpStr = String(nextEpisode.episodeNum).padStart(2, '0');
      episodeMedia.nextEpisodeUrl = nextDirectUrl || undefined;
      episodeMedia.nextEpisodeTitle = `${seriesItem.title} - S${nextSeasonStr}E${nextEpStr}: ${nextEpisode.title}`;
      if (nextNextEpisode) {
        let nextNextDirectUrl = nextNextEpisode.rawStreamUrl || nextNextEpisode.streamUrl;
        if (activePlaylist && activePlaylist.type === 'xtream' && activePlaylist.serverUrl && activePlaylist.username && activePlaylist.password) {
          const serverUrl = XtreamClientService.normalizeServerUrl(activePlaylist.serverUrl);
          const nextNextExt = nextNextEpisode.containerExtension || 'mp4';
          nextNextDirectUrl = `${serverUrl}/series/${activePlaylist.username}/${activePlaylist.password}/${nextNextEpisode.id}.${nextNextExt}`;
        }
        const nextNextSeasonStr = String(nextNextEpisode.seasonNum).padStart(2, '0');
        const nextNextEpStr = String(nextNextEpisode.episodeNum).padStart(2, '0');
        episodeMedia.nextNextEpisodeUrl = nextNextDirectUrl || undefined;
        episodeMedia.nextNextEpisodeTitle = `${seriesItem.title} - S${nextNextSeasonStr}E${nextNextEpStr}: ${nextNextEpisode.title}`;
      }
    }
    setActivePlayerMedia(episodeMedia);
  };

  // Series Episode Download Handler
  const handleDownloadEpisode = (episode: SeriesEpisode, seriesItem: MediaItem) => {
    const seasonStr = String(episode.seasonNum).padStart(2, '0');
    const epStr = String(episode.episodeNum).padStart(2, '0');

    let finalStreamUrl = episode.streamUrl;
    let directUrl = episode.rawStreamUrl;
    if (
      activePlaylist &&
      activePlaylist.type === 'xtream' &&
      activePlaylist.serverUrl &&
      activePlaylist.username &&
      activePlaylist.password
    ) {
      const serverUrl = XtreamClientService.normalizeServerUrl(activePlaylist.serverUrl);
      const ext = episode.containerExtension || 'mp4';
      directUrl = `${serverUrl}/series/${activePlaylist.username}/${activePlaylist.password}/${episode.id}.${ext}`;
      finalStreamUrl = XtreamClientService.getSafeStreamUrl(directUrl);
    } else if (finalStreamUrl && !finalStreamUrl.startsWith('/api/')) {
      finalStreamUrl = XtreamClientService.getSafeStreamUrl(finalStreamUrl);
    }

    const episodeMedia: MediaItem = {
      id: `ep-${seriesItem.id}-${episode.id}`,
      playlistId: seriesItem.playlistId,
      title: `${seriesItem.title} - S${seasonStr}E${epStr}: ${episode.title}`,
      category: seriesItem.category || 'Dizi',
      type: 'series',
      resolution: seriesItem.resolution || 'FHD 60P',
      duration: episode.duration,
      rating: episode.rating,
      poster: episode.image || seriesItem.poster,
      streamUrl: finalStreamUrl,
      rawStreamUrl: directUrl || episode.rawStreamUrl,
      fileSizeGb: 0,
      audioTracks: ['Türkçe Dublaj', 'English (Dolby)'],
      subtitles: ['Türkçe', 'English', 'Off'],
      containerExtension: episode.containerExtension || 'mp4',
      streamId: episode.id,
      seriesTitle: seriesItem.title,
      seasonNumber: episode.seasonNum,
      episodeNumber: episode.episodeNum,
      episodeTitle: episode.title,
    };
    handleDownloadMedia(episodeMedia);
  };

  // İndirilen dosyayı oynatmadan önce gerçek dosyanın hâlâ cihazda olduğunu doğrula.
  // Yeni indirmeler Data/downloads altına kaydedilir; eski Documents kayıtları da desteklenir.
  const handlePlayDownloadedItem = async (item: DownloadItem) => {
    const relativePath = item.offlinePath;
    if (relativePath) {
      try {
        // Önce yeni indirmelerin uygulama özelindeki güvenli klasörünü kontrol et.
        let directory = Directory.Data;
        try {
          await Filesystem.stat({ path: relativePath, directory: Directory.Data });
        } catch {
          // Eski sürümde Documents klasörüne kaydedilmiş dosyalarla geriye dönük uyumluluk.
          directory = Directory.Documents;
          await Filesystem.stat({ path: relativePath, directory });
        }
        const uriResult = await Filesystem.getUri({ path: relativePath, directory });
        const localFileUri = uriResult.uri;
        const localUrl = Capacitor.convertFileSrc(localFileUri);
        const fileInfo = await Filesystem.stat({ path: relativePath, directory });
        const actualSizeGb = Number(fileInfo.size || 0) / 1_000_000_000;
        setActivePlayerMedia({
          ...item,
          fileUri: localFileUri,
          localUrl,
          ...(actualSizeGb > 0 ? { totalSizeGb: actualSizeGb, downloadedGb: actualSizeGb } : {}),
        });
        showToast('İndirilen dosya telefondan açılıyor; internetten yeniden indirilmeyecek.');
        return;
      } catch (err) {
        console.warn('[Downloads] Yerel dosya bulunamadı; çevrimiçi kaynağa geçiliyor.', err);
      }
    }

    // Dosya silinmişse, varsa kayıtlı akış adresiyle çevrimiçi oynat.
    const { localUrl: _localUrl, fileUri: _fileUri, offlinePath: _offlinePath, ...onlineItem } = item;
    setActivePlayerMedia(onlineItem);
    showToast('Yerel dosya bulunamadı. İnternet üzerinden oynatılacak.');
  };

  // Dosyanın konumunu göster; indirme servisi Documents/downloads kullanır.
  const handleOpenDownloadedFile = async (item: DownloadItem) => {
    try {
      let fileUri = item.fileUri;
      if (!fileUri && item.offlinePath) {
        try {
          const result = await Filesystem.getUri({ path: item.offlinePath, directory: Directory.Data });
          fileUri = result.uri;
        } catch {
          const result = await Filesystem.getUri({ path: item.offlinePath, directory: Directory.Documents });
          fileUri = result.uri;
        }
      }
      const path = item.offlinePath || fileUri;
      if (!path) {
        showToast('Dosya yolu bulunamadı. İndirme kaydı eksik olabilir.');
        return;
      }
      showToast(`Dosya konumu: ${path}`);
    } catch (err: any) {
      showToast(`Dosya konumu alınamadı: ${err?.message || 'Bilinmeyen hata'}`);
    }
  };

  // Downloads Batch Actions
  const handlePauseAll = () => {
    showToast('Gerçek duraklat/devam özelliği bu indirme altyapısında henüz desteklenmiyor. İndirmeyi iptal edip yeniden başlatabilirsiniz.');
  };

  const handleResumeAll = () => {
    showToast('Gerçek kaldığı yerden devam özelliği henüz desteklenmiyor; yanıltıcı durum göstermek yerine indirmeyi yeniden başlatın.');
  };

  const handleClearCompleted = () => {
    setDownloads((prev) => prev.filter((d) => d.status !== 'completed'));
    showToast('Tamamlanan indirme bildirimleri temizlendi.');
  };

  const handleTogglePauseItem = (id: string) => {
    const item = downloads.find(d => d.id === id);
    if (item?.status === 'queued') {
      handleCancelItem(id);
      return;
    }
    showToast('Gerçek duraklat/devam özelliği henüz desteklenmiyor. Aktif indirme için bu düğme indirmeyi durdurmaz.');
  };

  const handleDeleteDownload = async (id: string) => {
    const item = downloads.find((d) => d.id === id);
    if (!item) return;
    if (item.status !== 'completed') {
      showToast('Yalnızca tamamlanmış indirmeler buradan silinebilir.');
      return;
    }
    if (item.offlinePath) {
      let deleted = false;
      for (const directory of [Directory.Data, Directory.Documents]) {
        try {
          await Filesystem.deleteFile({ path: item.offlinePath, directory });
          deleted = true;
          break;
        } catch {
          // Dosya diğer uygulama dizininde olabilir; ikinci dizini dene.
        }
      }
      if (!deleted) {
        showToast('Dosya cihazda bulunamadı veya silinemedi; kayıt korunuyor.');
        return;
      }
    }
    setDownloads((prev) => prev.filter((d) => d.id !== id));
    showToast('İndirilen dosya ve kaydı silindi.');
  };

  const handleCancelItem = (id: string) => {
    const item = downloads.find(d => d.id === id);
    void import('./services/downloadManager').then(dm => dm.cancelDownload(id));
    setDownloads(prev => prev.filter(d => d.id !== id));
    showToast(item?.status === 'queued'
      ? 'Bekleyen indirme kuyruktan kaldırıldı.'
      : 'İndirme iptal ediliyor; ağ bağlantısı kesiliyor.');
  };

  const handlePromoteItem = (id: string) => {
    void import('./services/downloadManager').then(dm => {
      const promoted = dm.promoteDownload(id);
      if (promoted) {
        setDownloads(prev => {
          const target = prev.find(d => d.id === id);
          if (!target || target.status !== 'queued') return prev;
          const queued = prev.filter(d => d.status === 'queued' && d.id !== id);
          const others = prev.filter(d => d.status !== 'queued');
          return [
            ...others.filter(d => d.status === 'downloading'),
            { ...target, queueOrder: 1 },
            ...queued.map((d, index) => ({ ...d, queueOrder: index + 2 })),
            ...others.filter(d => d.status !== 'downloading'),
          ];
        });
        showToast('Bekleyen indirme kuyruğun başına alındı; mevcut indirme bitince başlayacak.');
      } else {
        showToast('Bu içerik artık kuyrukta beklemiyor.');
      }
    });
  };

  // Clear Storage and Reset
  const handleClearCache = () => {
    setStats((prev) => ({
      ...prev,
      releasableMb: 0,
      cacheSizeGb: 0,
    }));
  };

  const handleResetApp = () => {
    StorageService.clearAll();
    setPlaylists([]);
    setDownloads([]);
    setFavoriteItems([]);
    setActivePlaylist(null);
    setCatalogItems([]);
    setSelectedSeriesItem(null);
    setStats((prev) => ({
      ...prev,
      activePlaylistsCount: 0,
      cacheSizeGb: 0,
      releasableMb: 0,
      iptvArchiveGb: 0,
      usedPercent: 0,
      downloadSpeedMbps: 0,
    }));
    showToast('Tüm veriler ve kayıtlı playlistler silindi.');
  };

  // 1- Rozet Sayısı Hesaplaması: Sadece mevcut katalogda gerçekten eşleşen favorileri say
  const allFavoritesList = useMemo(() => {
    return favoriteItems;
  }, [favoriteItems]);
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
                onUpdatePlaylist={handleUpdatePlaylist}
              />
            )}

            {currentScreen === 'catalog' && (
              <CatalogScreen
                catalog={catalogItems.map((c) => ({
                  ...c,
                  isFavorite: favoriteItems.some(f => f.id === c.id),
                }))}
                activePlaylist={activePlaylist}
                onBackToPlaylists={() => setCurrentScreen('playlists')}
                onPlayMedia={(item) => setActivePlayerMedia(item)}
                onDownloadMedia={handleDownloadMedia}
                onToggleFavorite={handleToggleFavorite}
                onOpenSeriesDetail={(item) => { setCatalogTargetSeason(undefined); setSelectedSeriesItem(item); }}
                isCatalogLoading={isCatalogLoading}
              />
            )}

            {currentScreen === 'downloads' && (
              <DownloadsScreen
                downloads={downloads}
                stats={stats}
                onPlayMedia={handlePlayDownloadedItem}
                onOpenDownloadedFile={handleOpenDownloadedFile}
                onOpenCatalog={handleOpenCatalogFromDownload}
                onPauseAll={handlePauseAll}
                onResumeAll={handleResumeAll}
                onClearCompleted={handleClearCompleted}
                onTogglePauseItem={handleTogglePauseItem}
                onCancelItem={handleCancelItem}
                onDeleteItem={handleDeleteDownload}
                onPromoteItem={handlePromoteItem}
              />
            )}

            {currentScreen === 'favorites' && (
              <FavoritesScreen
                favorites={allFavoritesList}
                onPlayMedia={(item) => {
                  if (item.type === 'series') {
                    setSelectedSeriesItem(item);
                  } else {
                    setActivePlayerMedia(item);
                  }
                }}
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
          onSelectScreen={(s) => {
            if (s === 'catalog') handleNavigateToCatalog();
            else setCurrentScreen(s);
          }}
          activeDownloadsCount={activeDownloadsCount}
          favoritesCount={allFavoritesList.length}
        />
      )}

      {/* Add Playlist Modal */}
      <AddPlaylistModal
        initialType={addModalType}
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddPlaylist={handleAddPlaylist}
      />

      {/* Series Detail & Episodes Selection Modal */}
      <SeriesDetailModal
        seriesItem={selectedSeriesItem}
        activePlaylist={activePlaylist}
        isOpen={!!selectedSeriesItem}
        onClose={() => { setSelectedSeriesItem(null); setCatalogTargetSeason(undefined); }}
        onPlayEpisode={handlePlayEpisode}
        onDownloadEpisode={handleDownloadEpisode}
        initialSeason={catalogTargetSeason}
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
              {catalogItems.length === 0 ? (
                <div className="p-4 text-center text-xs text-[#849495]">
                  Arama yapmak için önce bir playlist ekleyin.
                </div>
              ) : (
                catalogItems
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
                        if (item.type === 'series') {
                          setSelectedSeriesItem(item);
                        } else {
                          setActivePlayerMedia(item);
                        }
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
                  ))
              )}
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
                ✓ Kalıcı Depolama Etkin
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
