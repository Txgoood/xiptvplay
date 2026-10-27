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
import { TmdbInfoModal } from './components/screens/TmdbInfoModal';
import { EpgGuideModal } from './components/screens/EpgGuideModal';
import { WatchHistoryScreen } from './components/screens/WatchHistoryScreen';
import { ScheduleDownloadModal } from './components/screens/ScheduleDownloadModal';
import { ScheduleService, ScheduledDownload } from './services/downloadSchedule';
import { WatchHistoryEntry, WatchHistoryService } from './services/watchHistory';
import { FamilyProfilesModal } from './components/screens/FamilyProfilesModal';
import { CloudBackupModal } from './components/screens/CloudBackupModal';
import { FamilyConfiguration, FamilyProfile, FamilyProfilesService } from './services/familyProfiles';
import { VideoPlayerModal } from './components/player/VideoPlayerModal';
import { PrdHub } from './components/prd/PrdHub';
import { Info, Cast as CastIcon, Tv as TvIcon, Search as SearchIcon, PlayCircle, X as CloseIcon } from 'lucide-react';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Capacitor, registerPlugin } from '@capacitor/core';
import { DownloadNotifications } from './services/downloadNotifications';

export default function App() {
  const [appMode, setAppMode] = useState<AppMode>('app');
  const [currentScreen, setCurrentScreen] = useState<ScreenType>('playlists');
  const [userEmail, setUserEmail] = useState<string | null>(null);

  // Persistent Application Data States (Clean Empty Initial States)
  const [stats, setStats] = useState(INITIAL_STATS);
  const [playlists, setPlaylists] = useState<Playlist[]>(() => StorageService.getPlaylists());
  const [downloads, setDownloads] = useState<DownloadItem[]>(() => StorageService.getDownloads());
  const [scheduledDownloads, setScheduledDownloads] = useState<ScheduledDownload[]>([]);
  const [scheduleSelection, setScheduleSelection] = useState<MediaItem[]>([]);
  // Track imported IDs so frequent UI polling never rechecks or resurrects
  // already imported/deleted native scheduled downloads.
  const importedScheduledIdsRef = useRef<Set<string>>(
    new Set(StorageService.getDownloads().filter(d => d.id.startsWith('sched-')).map(d => d.id))
  );
  const scheduleRefreshBusyRef = useRef(false);
  const refreshScheduled = async () => {
    if (scheduleRefreshBusyRef.current) return;
    scheduleRefreshBusyRef.current = true;
    try {
    const jobs = await ScheduleService.list();
    setScheduledDownloads(prev => JSON.stringify(prev) === JSON.stringify(jobs) ? prev : jobs);
    // A completed native job is also a regular offline item, even if the
    // app was closed during the scheduled download.
    const completed = jobs.filter(j => j.status === 'completed' && j.path && !importedScheduledIdsRef.current.has(j.id));
    if (!completed.length) return;
    const resolved = await Promise.all(completed.map(async job => {
      try {
        const stat = await Filesystem.stat({ path: job.path!, directory: Directory.Data });
        const uri = await Filesystem.getUri({ path: job.path!, directory: Directory.Data });
        return { job, bytes: Number(stat.size || job.bytes || 0), fileUri: uri.uri };
      } catch { return null; }
    }));
    setDownloads(prev => {
      const existing = new Set(prev.map(d => d.id));
      const additions: DownloadItem[] = resolved.filter((row): row is NonNullable<typeof row> => Boolean(row))
        .filter(({job}) => !existing.has(job.id))
        .map(({job,bytes,fileUri}) => ({
          id: job.id, mediaId: job.mediaId, playlistId: job.playlistId,
          title: job.title, subtitle: (job.category || 'Zamanlanmış') + ' • İndirildi',
          type: job.mediaType || 'movie', resolutionBadge: job.resolution || 'HD',
          totalSizeGb: bytes / 1e9, downloadedGb: bytes / 1e9,
          speedMbps: 0, eta: 'Tamamlandı', progressPercent: 100,
          status: 'completed' as const, statusLabel: 'Tamamlandı', source: 'scheduled' as const,
          poster: job.poster || '', streamUrl: job.url, rawStreamUrl: job.url,
          offlinePath: job.path, fileUri,
          seriesTitle: job.seriesTitle, seasonNumber: job.seasonNumber,
          episodeNumber: job.episodeNumber, episodeTitle: job.episodeTitle,
        }));
      // Import exactly once, even when completed tasks stay in native storage.
      for (const row of resolved) if (row) importedScheduledIdsRef.current.add(row.job.id);
      return additions.length ? [...additions, ...prev] : prev;
    });
    } finally {
      scheduleRefreshBusyRef.current = false;
    }
  };
  useEffect(() => {
    if (document.visibilityState === 'visible') void refreshScheduled();
    // Foreground Downloads screen follows the native background worker live.
    // Other screens only need occasional synchronization.
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') void refreshScheduled();
    }, currentScreen === 'downloads' ? 2000 : 15000);
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshScheduled(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { window.clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [currentScreen]);

  const [favoriteItems, setFavoriteItems] = useState<MediaItem[]>(() => StorageService.getFavoriteItems());

  // Active Selected Playlist and Its Loaded Items
  const [activePlaylist, setActivePlaylist] = useState<Playlist | null>(null);
  const [catalogItems, setCatalogItems] = useState<MediaItem[]>([]);
  const [tmdbInfoItem, setTmdbInfoItem] = useState<MediaItem | null>(null);
  const [epgGuideItem, setEpgGuideItem] = useState<MediaItem | null>(null);
  const [isCatalogLoading, setIsCatalogLoading] = useState(false);
  const autoRefreshAttemptedRef = useRef<Set<string>>(new Set());
  const refreshingPlaylistIdsRef = useRef<Set<string>>(new Set());
  const catalogQueueRef = useRef<Promise<void>>(Promise.resolve());
  // The Drive merge can import a playlist between React renders. Always
  // resolve refresh actions from the latest local source of truth.
  const playlistsRef = useRef(playlists);
  playlistsRef.current = playlists;
  const activePlaylistRef = useRef(activePlaylist);
  activePlaylistRef.current = activePlaylist;

  // Modals & Player State
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [addModalType, setAddModalType] = useState<'xtream' | 'm3u'>('xtream');
  const [activePlayerMedia, setActivePlayerMedia] = useState<MediaItem | DownloadItem | null>(null);
  // Central history hook also covers TMDB, EPG, offline playback and automatic selections.
  useEffect(() => {
    if (!activePlayerMedia) return;
    const profileId = profileRef.current;
    setWatchHistory(WatchHistoryService.record(profileId, activePlayerMedia));
  }, [activePlayerMedia?.id]);
  const [selectedSeriesItem, setSelectedSeriesItem] = useState<MediaItem | null>(null);
  const [catalogTargetSeason, setCatalogTargetSeason] = useState<number | undefined>(undefined);

  // Cast, Search & Profile Modals
  const [isCastOpen, setIsCastOpen] = useState(false);
  const [isCastConnected, setIsCastConnected] = useState(false);
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [globalSearchTerm, setGlobalSearchTerm] = useState('');
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [isCloudBackupOpen, setIsCloudBackupOpen] = useState(false);
  const [familyConfiguration, setFamilyConfiguration] = useState<FamilyConfiguration | null>(() => FamilyProfilesService.get());
  // Every app restart requires profile selection after family protection has been configured.
  const [currentProfileId, setCurrentProfileId] = useState<string | null>(() => FamilyProfilesService.get() ? null : 'parent');
  const [familyDialogMode, setFamilyDialogMode] = useState<'setup' | 'manage' | null>(null);
  const [profileFavorites, setProfileFavorites] = useState<MediaItem[]>([]);
  const readProfileFavorites = (profileId: string): MediaItem[] => {
    if (profileId === 'parent') return StorageService.getFavoriteItems();
    try {
      const primary = localStorage.getItem('xiptvplay_profile_favorites_v1_' + profileId);
      // Preserve existing child favorites when migrating the original 'child' profile.
      const raw = primary ?? (profileId === 'child' ? localStorage.getItem('xiptvplay_child_favorite_items_v1') : null);
      const parsed = JSON.parse(raw || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  };
  const activeFamilyProfile = familyConfiguration?.profiles.find(p => p.id === currentProfileId) || null;
  const historyProfileId = currentProfileId || 'parent';
  const [watchHistory, setWatchHistory] = useState<WatchHistoryEntry[]>(() => WatchHistoryService.read('parent'));
  const profileRef = useRef(historyProfileId);
  profileRef.current = historyProfileId;
  useEffect(() => { setWatchHistory(WatchHistoryService.read(historyProfileId)); }, [historyProfileId]);
  // Drive synchronization changes persistent records outside the React state.
  // Refresh the visible profile after remote events have been merged.
  useEffect(() => {
    const onCloudChange = () => {
      playlistsRef.current = StorageService.getPlaylists();
      setFavoriteItems(StorageService.getFavoriteItems());
      setProfileFavorites(historyProfileId === 'parent' ? [] : readProfileFavorites(historyProfileId));
      setWatchHistory(WatchHistoryService.read(historyProfileId));
      const syncedPlaylists = StorageService.getPlaylists();
      setPlaylists(syncedPlaylists);
      setActivePlaylist(prev => prev ? (syncedPlaylists.find(p => p.id === prev.id) || prev) : syncedPlaylists[0] || null);
      // Newly imported connections need a local catalog fetch. Process one
      // at a time instead of flooding the IPTV provider with many requests.
      void (async () => {
        for (const imported of syncedPlaylists) {
          if (StorageService.getPlaylistItems(imported.id).length ||
              autoRefreshAttemptedRef.current.has(imported.id)) continue;
          const persisted = await StorageService.loadPlaylistItemsPersistent(imported.id);
          if (persisted?.length) continue;
          autoRefreshAttemptedRef.current.add(imported.id);
          await handleRefreshPlaylist(imported.id);
        }
      })();
      const syncedFamily = FamilyProfilesService.get();
      setFamilyConfiguration(syncedFamily);
    };
    window.addEventListener('xiptv-cloud-data-changed', onCloudChange);
    return () => window.removeEventListener('xiptv-cloud-data-changed', onCloudChange);
  }, [historyProfileId]);
  const isChildProfile = activeFamilyProfile?.kind === 'child';
  const isAdminProfile = !familyConfiguration || historyProfileId === 'parent';
  const canAccessMedia = (item: MediaItem): boolean => !isChildProfile || FamilyProfilesService.allows(activeFamilyProfile, item);
  const activeFavoriteItems = historyProfileId === 'parent' ? favoriteItems : profileFavorites;
  useEffect(() => {
    setProfileFavorites(historyProfileId === 'parent' ? [] : readProfileFavorites(historyProfileId));
  }, [historyProfileId]);
  const childVisibleCatalog = useMemo(() => isChildProfile
    ? catalogItems.filter(item => FamilyProfilesService.allows(activeFamilyProfile, item))
    : catalogItems, [catalogItems, currentProfileId, familyConfiguration]);
  const selectFamilyProfile = (profile: FamilyProfile) => {
    setActivePlayerMedia(null);
    setSelectedSeriesItem(null);
    setTmdbInfoItem(null);
    setEpgGuideItem(null);
    setIsSearchOpen(false);
    setIsAddModalOpen(false);
    setIsProfileOpen(false);
    setAppMode('app');
    setCurrentScreen(profile.kind === 'child' ? 'catalog' : 'playlists');
    setCurrentProfileId(profile.id);
    setFamilyDialogMode(null);
  };
  const startFamilySetup = () => {
    if (!isAdminProfile) return;
    setIsProfileOpen(false);
    setFamilyDialogMode(familyConfiguration ? 'manage' : 'setup');
  };
  const safePlay = (item: MediaItem) => {
    if (canAccessMedia(item)) { setWatchHistory(WatchHistoryService.record(historyProfileId, item)); setActivePlayerMedia(item); }
    else showToast('Bu içerik çocuk profili için izinli değil.');
  };

  // Toast System
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3200);
  };

  // Android bildirim iznini iste; izin reddedilirse uygulama normal çalışmaya devam eder.
  useEffect(() => { void DownloadNotifications.requestPermission(); }, []);

  // Bildirimdeki tekil ✕: aktif transferi iptal et, kuyruktan ve listeden sil.
  // Tamamlanmis dosya icin depolamadaki kopyasini da sil.
  useEffect(() => {
    let listener: { remove: () => Promise<void> } | null = null;
    let mounted = true;
    void DownloadNotifications.onCancelItemRequested((id) => {
      void import('./services/downloadManager').then(dm => dm.cancelDownload(id));
      setDownloads(prev => {
        const target = prev.find(d => d.id === id);
        if (target?.offlinePath) {
          void (async () => {
            for (const directory of [Directory.Data, Directory.Documents]) {
              try {
                await Filesystem.deleteFile({ path: target.offlinePath!, directory });
                break;
              } catch { /* dosya diger dizinde olabilir veya zaten silinmis olabilir */ }
            }
          })();
        }
        return prev.filter(d => d.id !== id);
      });
      void DownloadNotifications.cancel(id);
    }).then(handle => {
      if (mounted) listener = handle;
      else if (handle) void handle.remove();
    });
    return () => {
      mounted = false;
      if (listener) void listener.remove();
    };
  }, []);

  // Bildirim panelindeki toplu iptal düğmesi kuyruktaki ve aktif indirmeleri gerçekten durdurur.
  useEffect(() => {
    let listener: { remove: () => Promise<void> } | null = null;
    let mounted = true;
    void DownloadNotifications.onCancelAllRequested(async () => {
      const dm = await import('./services/downloadManager');
      dm.cancelAllDownloads();
    }).then((handle) => {
      if (mounted) listener = handle;
      else if (handle) void handle.remove();
    });
    return () => {
      mounted = false;
      if (listener) void listener.remove();
    };
  }, []);



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

  // Every imported or selected playlist must be rebuilt on this device:
  // Drive sync intentionally copies credentials, NOT the enormous catalog.
  useEffect(() => {
    if (!activePlaylist) {
      setCatalogItems([]);
      setIsCatalogLoading(false);
      return;
    }
    const selectedId = activePlaylist.id;
    let cancelled = false;
    const cached = StorageService.getPlaylistItems(selectedId);
    setCatalogItems(cached);
    setIsCatalogLoading(cached.length === 0);
    void StorageService.loadPlaylistItemsPersistent(selectedId).then(persistent => {
      if(cancelled || activePlaylistRef.current?.id !== selectedId)return;
      const effective = persistent && persistent.length > cached.length ? persistent : cached;
      if(persistent && persistent.length > cached.length)setCatalogItems(persistent);
      if(effective.length) { setIsCatalogLoading(false); return; }
      if (!refreshingPlaylistIdsRef.current.has(selectedId) &&
          !autoRefreshAttemptedRef.current.has(selectedId)) {
        autoRefreshAttemptedRef.current.add(selectedId);
        void handleRefreshPlaylist(selectedId);
      } else if (!refreshingPlaylistIdsRef.current.has(selectedId)) {
        setIsCatalogLoading(false);
      }
    }).catch(() => {
      if(!cancelled && activePlaylistRef.current?.id === selectedId) {
        setIsCatalogLoading(false);
        if(!autoRefreshAttemptedRef.current.has(selectedId)){
          autoRefreshAttemptedRef.current.add(selectedId);
          void handleRefreshPlaylist(selectedId);
        }
      }
    });
    return () => { cancelled = true; };
  }, [activePlaylist?.id]);

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

  // New devices receive connection details from Drive, then rebuild the
  // actual live/movie/series catalog from the IPTV source. Do not mistake
  // empty API responses for successful 70,000-item imports.
  const handleRefreshPlaylist = async (id: string) => {
    if(refreshingPlaylistIdsRef.current.has(id))return;
    const target = playlistsRef.current.find(p=>p.id===id) || StorageService.getPlaylists().find(p=>p.id===id);
    if(!target)return;
    refreshingPlaylistIdsRef.current.add(id);
    // Only one bulk catalog fetch at a time, across all playlists/profiles.
    // Concurrent large Xtream requests can overwhelm IPTV servers or Android.
    const previousJob=catalogQueueRef.current;
    let releaseQueue:()=>void=()=>{};
    catalogQueueRef.current=new Promise<void>(resolve=>{releaseQueue=resolve;});
    await previousJob.catch(()=>{});
    const isSelected=()=>activePlaylistRef.current?.id===id;
    // Every catalog rebuild must end in success or a visible error. Network
    // stalls and a frozen WebView bridge must not leave "downloading" forever.
    let catalogStage = 'IPTV bağlantı kontrolü';
    const withDeadline = async <T,>(work:Promise<T>, timeoutMs:number):Promise<T> => {
      let deadline:ReturnType<typeof setTimeout>|undefined;
      try {
        return await Promise.race([
          work,
          new Promise<T>((_,reject)=>{
            deadline=setTimeout(()=>reject(new Error(catalogStage + ': süre sınırı aşıldı. Tekrar deneyin.')),timeoutMs);
          })
        ]);
      }finally{if(deadline)clearTimeout(deadline);}
    };
    if(isSelected())setIsCatalogLoading(true);
    setPlaylists(prev=>prev.map(p=>p.id===id?{...p,lastSync:'Yenileniyor',statusLabel:'Bağlantı kontrol ediliyor...',errorMessage:undefined}:p));
    try {
      let items:MediaItem[]=[];
      let counts:{live:number;movie:number;series:number};
      let workingServer=target.serverUrl;
      let expiryDays=target.expiryDays, expiryDateStr=target.expiryDateStr;
      let pingMs=target.pingMs, newM3uUrl=target.m3uUrl;

      if(target.type==='xtream'){
        if(!target.serverUrl || !target.username || !target.password)
          throw Error('Aktarılan Xtream bağlantısında sunucu adresi, kullanıcı adı veya parola eksik.');
        const verify=await withDeadline(XtreamClientService.verifyConnection(target.serverUrl,target.username,target.password),35000);
        if(!verify.success)
          throw Error('IPTV bağlantısı doğrulanamadı: '+(verify.error || 'Sunucu yanıt vermedi.'));
        const persistedCatalog = await StorageService.loadPlaylistItemsPersistent(id);
        let retainedCatalog = StorageService.getPlaylistItems(id);
        if(persistedCatalog && persistedCatalog.length > retainedCatalog.length) retainedCatalog = persistedCatalog;
        const result=await XtreamClientService.fetchCatalog(
          verify.effectiveServerUrl||target.serverUrl,target.username,target.password,target.id,
          stage => {
            catalogStage = stage;
            setPlaylists(prev=>prev.map(p=>p.id===id?{...p,statusLabel:stage+' alınıyor...'}:p));
          },
          (type, sectionItems) => {
            if(!StorageService.getPlaylists().some(p=>p.id===id))return;
            const previous = retainedCatalog;
            const merged = [...previous.filter(item=>item.type!==type), ...sectionItems];
            retainedCatalog = merged;
            StorageService.savePlaylistItems(id,merged);
            const sectionCounts = {
              liveCount: merged.filter(item=>item.type==='live').length,
              movieCount: merged.filter(item=>item.type==='movie').length,
              seriesCount: merged.filter(item=>item.type==='series').length
            };
            setPlaylists(prev=>prev.map(p=>p.id===id?{...p,...sectionCounts,isCached:true}:p));
            if(isSelected()){
              setCatalogItems(merged);
              setIsCatalogLoading(false);
              setActivePlaylist(prev=>prev?.id===id?{...prev,...sectionCounts,isCached:true}:prev);
            }
          });
        items=result.items;counts=result.counts;
        workingServer=result.workingServer || verify.effectiveServerUrl || target.serverUrl;
        expiryDays=verify.expiryDays??expiryDays;
        expiryDateStr=verify.expiryDateStr??expiryDateStr;
        pingMs=verify.pingMs??pingMs;
      }else if(target.type==='m3u'){
        catalogStage = 'M3U listesi';
        let content=target.m3uContent;
        if(target.m3uUrl){
          const fetched=await withDeadline(M3UParserService.fetchM3U(target.m3uUrl),90000);
          if(!fetched.success || !fetched.content)
            throw Error('M3U indirilemedi: '+(fetched.error||'Sunucu boş yanıt verdi.'));
          content=fetched.content;
          newM3uUrl=fetched.effectiveUrl||target.m3uUrl;
        }
        if(!content)throw Error('Bu M3U listesi dosyadan eklenmiş, URL bulunamadı. Büyük M3U dosyaları buluta yüklenmez; kaynak dosyayı bu telefona aktarman gerekiyor.');
        const parsed=M3UParserService.parse(content,target.id);
        items=parsed.items;counts=parsed.counts;
      }else throw Error('Playlist türü desteklenmiyor.');

      if(!items.length || (counts.live+counts.movie+counts.series)===0)
        throw Error('IPTV sunucusu boş katalog döndürdü. Eski kanal/film/dizi kayıtları korunuyor.');
      StorageService.savePlaylistItems(id,items);
      setPlaylists(prev=>{
        const updated=prev.map(p=>p.id===id?{
          ...p,status:'active' as const,statusLabel:'Bağlı (Aktif)',
          serverUrl:workingServer||p.serverUrl,m3uUrl:newM3uUrl,
          liveCount:counts.live,movieCount:counts.movie,seriesCount:counts.series,
          expiryDays,expiryDateStr,pingMs,lastSync:'Şimdi',errorMessage:undefined,
          isCached:true
        }:p);
        playlistsRef.current=updated;
        return updated;
      });
      if(isSelected()){
        setActivePlaylist(prev => prev?.id===id ? {
          ...prev,status:'active',statusLabel:'Bağlı (Aktif)',
          liveCount:counts.live,movieCount:counts.movie,seriesCount:counts.series,
          lastSync:'Şimdi',isCached:true,errorMessage:undefined
        } : prev);
        setCatalogItems(items);setIsCatalogLoading(false);
      }
      showToast(`"${target.name}" kataloğu yüklendi: ${counts.live} canlı, ${counts.movie} film, ${counts.series} dizi.`);
    }catch(e:any){
      const message=e?.message||'Katalog indirme hatası';
      setPlaylists(prev=>prev.map(p=>p.id===id?{
        ...p,status:'error' as const,statusLabel:'Katalog yüklenemedi',
        lastSync:'Hata',errorMessage:message
      }:p));
      if(isSelected()){
        setIsCatalogLoading(false);
        setActivePlaylist(prev=>prev?.id===id?{...prev,status:'error',statusLabel:'Katalog yüklenemedi',lastSync:'Hata',errorMessage:message}:prev);
      }
      showToast(`"${target.name}" katalog hatası: ${message}`);
    }finally{
      refreshingPlaylistIdsRef.current.delete(id);
      releaseQueue();
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
    const currentItem = catalogItems.find(item => item.id === mediaId);
    if (isChildProfile && (!currentItem || !canAccessMedia(currentItem))) return;
    const profileId = historyProfileId;
    const setter = profileId === 'parent' ? setFavoriteItems : setProfileFavorites;
    setter((prev) => {
      const exists = prev.find(item => item.id === mediaId);
      const next = exists 
        ? prev.filter((item) => item.id !== mediaId) 
        : [...prev, catalogItems.find(item => item.id === mediaId) || { id: mediaId, title: 'Bilinmiyor', category: 'Genel', type: 'movie', resolution: 'HD', poster: '', streamUrl: '' } as MediaItem];
      showToast(exists ? 'Favorilerden çıkarıldı' : 'Favorilere eklendi');
      if (profileId !== 'parent') localStorage.setItem('xiptvplay_profile_favorites_v1_' + profileId, JSON.stringify(next));
      return next;
    });
  };

  // Download Media Handler
  const handleScheduleEpisodes = (episodes: SeriesEpisode[], seriesItem: MediaItem) => {
    if (isChildProfile) return;
    const media = episodes.map(ep => {
      const ext = ep.containerExtension || 'mp4';
      const server = activePlaylist?.serverUrl;
      const directUrl = activePlaylist?.type === 'xtream' && server && activePlaylist.username && activePlaylist.password
        ? `${XtreamClientService.normalizeServerUrl(server)}/series/${activePlaylist.username}/${activePlaylist.password}/${ep.id}.${ext}`
        : ep.rawStreamUrl || ep.streamUrl;
      const season = String(ep.seasonNum).padStart(2, '0'), part = String(ep.episodeNum).padStart(2, '0');
      return {
        ...seriesItem,
        id: `ep-${seriesItem.id}-${ep.id}`,
        parentSeriesId: seriesItem.id,
        title: `${seriesItem.title} - S${season}E${part}: ${ep.title}`,
        streamUrl: directUrl, rawStreamUrl: directUrl, streamId: ep.id,
        seasonNumber: ep.seasonNum, episodeNumber: ep.episodeNum,
        seriesTitle: seriesItem.title, episodeTitle: ep.title,
      } as MediaItem;
    });
    setScheduleSelection(media);
  };

  const handleDownloadMedia = (item: MediaItem) => {
    if (isChildProfile) { showToast('Çocuk profilinde indirme kapalı.'); return; }
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
      source: 'manual',
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
                 // Native Android indirme motoru bildirimin tek ilerleme kaynagidir.
                 // Geciken JS olaylari daha eski yuzdeyle bildirimi ezmemeli.
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
                statusLabel: status === 'downloading' ? 'İniyor' : status === 'paused' ? 'Duraklatıldı' : 'Sırada bekliyor',
                queueOrder: status === 'queued' ? queueOrder : undefined,
                speedMbps: status !== 'downloading' ? 0 : d.speedMbps,
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
    if (!canAccessMedia(seriesItem)) return;
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
      parentSeriesId: seriesItem.id,
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
    setWatchHistory(WatchHistoryService.record(historyProfileId, episodeMedia));
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
    if (isChildProfile) return;
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
        // Offline dizilerde yalnizca ayni dizinin art arda gelen,
        // telefonda gercekten bulunan bolumlerini siraya ekle.
        const offlineNext: Array<{ uri: string; title: string }> = [];
        if (item.type === 'series' && item.seriesTitle &&
            typeof item.seasonNumber === 'number' &&
            typeof item.episodeNumber === 'number') {
          const available = downloads.filter(d =>
            d.id !== item.id && d.type === 'series' && d.status === 'completed' &&
            d.seriesTitle === item.seriesTitle &&
            d.playlistId === item.playlistId &&
            typeof d.seasonNumber === 'number' &&
            typeof d.episodeNumber === 'number' && !!d.offlinePath
          ).sort((a, b) =>
            (a.seasonNumber! - b.seasonNumber!) ||
            (a.episodeNumber! - b.episodeNumber!)
          );
          let expectedSeason = item.seasonNumber;
          let expectedEpisode = item.episodeNumber + 1;
          for (const next of available) {
            if (next.seasonNumber !== expectedSeason || next.episodeNumber !== expectedEpisode) continue;
            try {
              let nextDirectory = Directory.Data;
              try {
                await Filesystem.stat({ path: next.offlinePath!, directory: nextDirectory });
              } catch {
                nextDirectory = Directory.Documents;
                await Filesystem.stat({ path: next.offlinePath!, directory: nextDirectory });
              }
              const found = await Filesystem.getUri({ path: next.offlinePath!, directory: nextDirectory });
              if (!found.uri?.startsWith('file://')) break;
              offlineNext.push({ uri: found.uri, title: next.title });
              expectedEpisode++;
            } catch {
              break; // Siradaki bolum yoksa asla internete gecme.
            }
          }
        }
        setActivePlayerMedia({
          ...item,
          fileUri: localFileUri,
          localUrl,
          nextEpisodeUrl: offlineNext[0]?.uri,
          nextEpisodeTitle: offlineNext[0]?.title,
          nextNextEpisodeUrl: offlineNext[1]?.uri,
          nextNextEpisodeTitle: offlineNext[1]?.title,
          offlineEpisodeQueue: offlineNext,
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

  // Android 10+ scoped storage: videoyu Movies/XIPTVPlay icine yayinlayip
  // sistem dosya yoneticisinde konumunu goster. Genel dosya erisim izni gerekmez.
  const handleOpenDownloadedFile = async (item: DownloadItem) => {
    if (!item.offlinePath) {
      showToast('Önce video indirmesinin tamamlanması gerekiyor.');
      return;
    }
    if (!Capacitor.isNativePlatform()) {
      showToast(`Dosya yolu: ${item.offlinePath}`);
      return;
    }
    try {
      const DownloadFiles = registerPlugin<{ openLocation(options: { path: string }): Promise<void> }>('DownloadFiles');
      await DownloadFiles.openLocation({ path: item.offlinePath });
      showToast('Dosya Movies/XIPTVPlay klasörüne aktarıldı. Dosya yöneticisinden Movies → XIPTVPlay klasörünü aç.');
    } catch (err: any) {
      showToast(`Dosya konumu açılamadı: ${err?.message || 'Bilinmeyen hata'}`);
    }
  };

  // Duraklat/devam: gercek native akisi kontrol eder, dosyayi silmez.
  const handlePauseAll = () => {
    void import('./services/downloadManager').then(dm => dm.pauseAllDownloads());
  };

  const handleResumeAll = () => {
    void import('./services/downloadManager').then(dm => dm.resumeAllDownloads());
  };

  const handleClearCompleted = () => {
    setDownloads((prev) => prev.filter((d) => d.status !== 'completed'));
    showToast('Tamamlanan indirme bildirimleri temizlendi.');
  };

  const handleTogglePauseItem = (id: string) => {
    const item = downloads.find(d => d.id === id);
    if (!item || item.status === 'completed') return;
    void import('./services/downloadManager').then(async dm => {
      const success = item.status === 'paused'
        ? await dm.resumeDownload(id)
        : await dm.pauseDownload(id);
      if (!success) showToast('İndirme durumu değiştirilemedi. Tekrar deneyin.');
    });
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
    return isChildProfile
      ? activeFavoriteItems.filter(item => FamilyProfilesService.allows(activeFamilyProfile, item))
      : activeFavoriteItems;
  }, [isChildProfile, activeFavoriteItems, familyConfiguration]);
  const activeDownloadsCount = downloads.filter(
    (d) => d.status === 'downloading' || d.status === 'queued'
  ).length;

  if (familyConfiguration && currentProfileId === null) {
    return <FamilyProfilesModal
      mode="choose"
      configuration={familyConfiguration}
      catalog={[]}
      onCreate={() => {}}
      onSave={() => {}}
      onSelect={selectFamilyProfile}
    />;
  }

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

      {/* Children only see a restricted header without global search or settings. */}
      {isChildProfile && <header className="fixed inset-x-0 top-0 z-40 bg-[#1d1d20] border-b border-white/10 px-4 h-14 flex items-center justify-between">
        <span className="font-bold text-sm text-[#00f0ff]">XIPTV Play · {activeFamilyProfile?.name}</span>
        <button onClick={() => { setActivePlayerMedia(null); setCurrentProfileId(null); }} className="bg-[#29292c] rounded-xl border border-white/10 px-3 py-2 text-xs">Profil Değiştir</button>
      </header>}
      {!isChildProfile && <Header
        currentScreen={currentScreen}
        appMode={appMode}
        setAppMode={setAppMode}
        onOpenSearch={() => setIsSearchOpen(true)}
        onOpenCast={() => setIsCastOpen(true)}
        isCastConnected={isCastConnected}
        userEmail={userEmail}
        onOpenProfile={() => setIsProfileOpen(true)}
      />}

      {/* Main View Port */}
      <main className="flex-1 w-full pt-16 flex flex-col">
        {appMode === 'prd' && !isChildProfile ? (
          <PrdHub onBackToApp={() => setAppMode('app')} />
        ) : (
          <>
            {!isChildProfile && currentScreen === 'onboarding' && (
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

            {!isChildProfile && currentScreen === 'playlists' && (
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
                catalog={childVisibleCatalog.map((c) => ({
                  ...c,
                  isFavorite: activeFavoriteItems.some(f => f.id === c.id),
                }))}
                isChildMode={Boolean(isChildProfile)}
                continueWatching={watchHistory.filter(e => e.media.type !== 'live' && e.durationSeconds > 0 && e.positionSeconds > 0 && !e.completed && (!isChildProfile || FamilyProfilesService.allows(activeFamilyProfile, e.media as MediaItem)))}
                activePlaylist={activePlaylist}
                onBackToPlaylists={() => { if (!isChildProfile) setCurrentScreen('playlists'); }}
                onRetryCatalog={() => { if(activePlaylist)void handleRefreshPlaylist(activePlaylist.id); }}
                onPlayMedia={safePlay}
                onDownloadMedia={handleDownloadMedia}
                onScheduleMedia={(item) => { if (!isChildProfile) setScheduleSelection([item]); }}
                onToggleFavorite={handleToggleFavorite}
                onOpenSeriesDetail={(item) => { if (canAccessMedia(item)) { setCatalogTargetSeason(undefined); setSelectedSeriesItem(item); } }}
                onOpenTmdbInfo={(item) => { if (canAccessMedia(item)) setTmdbInfoItem(item); }}
                onOpenEpgGuide={(item) => { if (canAccessMedia(item)) setEpgGuideItem(item); }}
                isCatalogLoading={isCatalogLoading}
              />
            )}

            {!isChildProfile && currentScreen === 'downloads' && (
              <DownloadsScreen
                downloads={downloads}
                scheduledDownloads={scheduledDownloads}
                onRefreshScheduled={() => void refreshScheduled()}
                onCancelScheduled={(id) => { void ScheduleService.cancel(id).then(() => refreshScheduled()).catch(err => showToast(String(err))); }}
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

            {!isChildProfile && currentScreen === 'favorites' && (
              <FavoritesScreen
                favorites={allFavoritesList}
                onPlayMedia={(item) => {
                  setWatchHistory(WatchHistoryService.record(historyProfileId, item));
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

            {currentScreen === 'history' && (
              <WatchHistoryScreen
                entries={watchHistory.filter(e => !isChildProfile || FamilyProfilesService.allows(activeFamilyProfile, e.media as MediaItem))}
                isChildMode={Boolean(isChildProfile)}
                onPlay={(item) => {
                  if (isChildProfile && !FamilyProfilesService.allows(activeFamilyProfile, item as MediaItem)) { showToast('Bu içerik çocuk profili için izinli değil.'); return; }
                  setWatchHistory(WatchHistoryService.record(historyProfileId, item));
                  setActivePlayerMedia(item);
                }}
                onRemove={(id) => setWatchHistory(WatchHistoryService.remove(historyProfileId, id))}
                onComplete={(id) => setWatchHistory(WatchHistoryService.complete(historyProfileId, id))}
                onClear={() => setWatchHistory(WatchHistoryService.clear(historyProfileId))}
                onBack={() => setCurrentScreen('catalog')}
              />
            )}
            {isAdminProfile && currentScreen === 'settings' && (
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
      {appMode === 'app' && !isChildProfile && currentScreen !== 'onboarding' && (
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

      {isChildProfile && <button onClick={() => setCurrentScreen(currentScreen === 'history' ? 'catalog' : 'history')}
        className="fixed bottom-5 right-5 z-40 rounded-full bg-[#00f0ff] text-[#00363a] px-4 py-3 text-xs font-bold shadow-xl">
        {currentScreen === 'history' ? 'Kataloğa Dön' : '🕘 Geçmiş'}
      </button>}

      {/* Add Playlist Modal */}
      {isAdminProfile && <AddPlaylistModal
        initialType={addModalType}
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onAddPlaylist={handleAddPlaylist}
      />}

      <EpgGuideModal
        channel={epgGuideItem}
        playlist={activePlaylist}
        onClose={() => setEpgGuideItem(null)}
        onPlay={safePlay}
      />

      <TmdbInfoModal
        media={tmdbInfoItem}
        onClose={() => setTmdbInfoItem(null)}
        onPlay={safePlay}
        onDownload={handleDownloadMedia}
        onOpenSeries={(item) => { setCatalogTargetSeason(undefined); setSelectedSeriesItem(item); }}
      />

      {/* Series Detail & Episodes Selection Modal */}
      <SeriesDetailModal
        seriesItem={selectedSeriesItem}
        activePlaylist={activePlaylist}
        isOpen={!!selectedSeriesItem}
        onClose={() => { setSelectedSeriesItem(null); setCatalogTargetSeason(undefined); }}
        onPlayEpisode={(episode, seriesItem, nextEpisode, nextNextEpisode) => { if (canAccessMedia(seriesItem)) handlePlayEpisode(episode, seriesItem, nextEpisode, nextNextEpisode); }}
        onDownloadEpisode={handleDownloadEpisode}
        onScheduleEpisodes={handleScheduleEpisodes}
        initialSeason={catalogTargetSeason}
      />

      {scheduleSelection.length > 0 && !isChildProfile && <ScheduleDownloadModal
        items={scheduleSelection}
        onClose={() => setScheduleSelection([])}
        onSaved={() => {
          setScheduleSelection([]);
          void refreshScheduled();
          setCurrentScreen('downloads');
          showToast('Zamanlanmış indirme kuyruğuna eklendi.');
        }}
      />}

      {/* Real Video Player Modal */}
      <VideoPlayerModal
        media={activePlayerMedia}
        isOpen={!!activePlayerMedia}
        onClose={() => setActivePlayerMedia(null)}
        onProgress={(media, positionSeconds, durationSeconds, completed) => {
          setWatchHistory(WatchHistoryService.record(profileRef.current, media, positionSeconds, durationSeconds, completed));
        }}
      />

      {familyDialogMode && isAdminProfile && <FamilyProfilesModal
        mode={familyDialogMode}
        configuration={familyConfiguration}
        catalog={catalogItems}
        activePlaylistName={activePlaylist?.name}
        onCreate={(config) => { setFamilyConfiguration(config); setCurrentProfileId('parent'); setFamilyDialogMode('manage'); showToast('Çocuk profili hazır. Şimdi erişim kategorilerini seç.'); }}
        onSave={(config) => { FamilyProfilesService.save(config); setFamilyConfiguration(config); setFamilyDialogMode(null); showToast('Profil ayarları kaydedildi.'); }}
        onSelect={selectFamilyProfile}
        onClose={() => setFamilyDialogMode(null)}
      />}

      {isCloudBackupOpen && isAdminProfile && <CloudBackupModal
        onClose={() => setIsCloudBackupOpen(false)}
        onRestored={() => {
          setIsCloudBackupOpen(false);
          window.location.reload();
        }}
      />}

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
      {isProfileOpen && !isChildProfile && (
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
              {isAdminProfile && <button onClick={() => { setIsProfileOpen(false); setIsCloudBackupOpen(true); }}
                className="w-full py-3 rounded-xl bg-[#28333a] text-[#bafaff] border border-[#00f0ff]/20 text-sm font-bold">
                ☁️ Google Drive · Yedekle ve Geri Yükle
              </button>}
              {isAdminProfile && <button onClick={startFamilySetup}
                className="w-full py-3 rounded-xl bg-[#00f0ff] text-[#00363a] text-sm font-bold">
                {familyConfiguration ? 'Aile Profillerini Yönet' : 'Çocuk Profili ve PIN Oluştur'}
              </button>}
              {familyConfiguration && <button onClick={() => { setIsProfileOpen(false); setActivePlayerMedia(null); setCurrentProfileId(null); }}
                className="w-full py-2.5 rounded-xl bg-[#26262a] text-white text-xs font-semibold border border-white/10">
                Profil Değiştir
              </button>}
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
