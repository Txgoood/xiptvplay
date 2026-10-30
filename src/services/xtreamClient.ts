import { MediaItem, XtreamUserInfo, XtreamServerInfo, SeriesDetail, SeriesEpisode, SeriesSeason } from '../types';
import { isNative, httpGetJson, httpGetCatalogJson } from './net';
import { catalogTimestamp, catalogRating, catalogReleaseDate } from './catalogDiscovery';

export interface XtreamVerificationResult {
  success: boolean;
  userInfo?: XtreamUserInfo;
  serverInfo?: XtreamServerInfo;
  error?: string;
  pingMs?: number;
  expiryDays?: number;
  expiryDateStr?: string;
  effectiveServerUrl?: string;
}

export interface XtreamCatalogResult {
  items: MediaItem[];
  counts: {
    live: number;
    movie: number;
    series: number;
  };
  workingServer?: string;
}

export class XtreamClientService {
  private static partialCatalogs = new Map<string, Record<string, any>>();
  /**
   * Normalizes an IPTV URL ensuring a protocol exists and removing trailing slashes.
   */
  static normalizeServerUrl(rawUrl: string): string {
    let clean = rawUrl.trim().replace(/\/+$/, '');
    if (!clean.startsWith('http://') && !clean.startsWith('https://')) {
      clean = `http://${clean}`;
    }
    return clean;
  }

  /**
   * Transforms an external IPTV stream URL into a secured server-side proxy route (/api/iptv/proxy?url=...).
   * Completely bypasses browser Mixed Content (HTTP/HTTPS), restricted IPTV ports (e.g. :8080, :25461),
   * and cross-origin CORS barriers.
   */
  static getSafeStreamUrl(rawUrl: string): string {
    if (!rawUrl) return '';
    // Native APKs access IPTV streams directly to bypass proxy/api
    if (isNative()) return rawUrl;
    // If already routed through internal proxy or API, return as is
    if (rawUrl.startsWith('/api/')) return rawUrl;
    // Route any remote HTTP or HTTPS stream through the proxy layer
    if (rawUrl.startsWith('http://') || rawUrl.startsWith('https://')) {
      return `/api/iptv/proxy?url=${encodeURIComponent(rawUrl)}`;
    }
    return rawUrl;
  }

  static toHlsLiveUrl(rawUrl: string): string {
    if (!rawUrl) return rawUrl;
    return rawUrl.replace(
      /^(https?:\/\/[^/]+\/live\/[^/]+\/[^/]+\/\d+)(?:\.ts)?(\?.*)?$/i,
      '$1.m3u8$2'
    );
  }

  /**
   * Tests connection and verifies credentials against real Xtream Codes API via backend proxy.
   * Completely avoids browser direct-fetch to prevent Mixed Content (HTTP/HTTPS) and CORS errors.
   */
  static async verifyConnection(
    serverUrl: string,
    username: string,
    password: string
  ): Promise<XtreamVerificationResult> {
    const cleanUrl = this.normalizeServerUrl(serverUrl);
    
    if (isNative()) {
        try {
            const apiUrl = `${cleanUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`;
            const data = await httpGetJson(apiUrl);
            
            if (!data || !data.user_info || data.user_info.auth !== 1) {
                return { success: false, error: 'Kimlik doğrulama başarısız! Kullanıcı adı veya şifre hatalı.' };
            }
            
            const userInfo = data.user_info;
            const serverInfo = data.server_info;
            const { expiryDays, expiryDateStr } = this.calculateExpiry(userInfo?.exp_date);

            return {
                success: true,
                userInfo,
                serverInfo,
                pingMs: 35,
                expiryDays,
                expiryDateStr,
                effectiveServerUrl: cleanUrl,
            };
        } catch (err: any) {
            return { success: false, error: `Doğrudan bağlantı hatası: ${err.message}` };
        }
    }

    // Web fallback via backend
    try {
      const resp = await fetch('/api/iptv/xtream/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl: cleanUrl, username, password }),
      });
      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.success) {
        const errorDetail =
          data?.error ||
          (resp.status === 401
            ? 'Kullanıcı adı veya şifre hatalı (401 Yetkisiz).'
            : resp.status === 403
            ? 'Hesap pasif veya süresi dolmuş (403 Yasak).'
            : `Sunucu HTTP ${resp.status} hatası.`);
        return {
          success: false,
          error: errorDetail,
          pingMs: data?.pingMs,
        };
      }

      const userInfo = data.userInfo as XtreamUserInfo;
      const serverInfo = data.serverInfo as XtreamServerInfo;
      const effectiveServerUrl = data.effectiveServerUrl || cleanUrl;

      const { expiryDays, expiryDateStr } = this.calculateExpiry(userInfo?.exp_date);

      return {
        success: true,
        userInfo,
        serverInfo,
        pingMs: data.pingMs || 35,
        expiryDays,
        expiryDateStr,
        effectiveServerUrl,
      };
    } catch (networkErr: any) {
      return {
        success: false,
        error: `Yerel sunucu proxy servisine ulaşılamadı (${networkErr.message || 'Ağ hatası'}). Backend servisinin çalıştığını kontrol edin.`,
      };
    }
  }

  /**
   * Fetches real live channels, movies, and series from Xtream API via backend proxy.
   */
  /**
   * Fetches real live channels, movies, and series from Xtream API via backend proxy or directly (native).
   */
  static async fetchCatalog(
    serverUrl: string,
    username: string,
    password: string,
    playlistId: string,
    onProgress?: (stage: string) => void,
    onSection?: (type: 'live' | 'movie' | 'series', items: MediaItem[]) => void
  ): Promise<XtreamCatalogResult> {
    const cleanUrl = this.normalizeServerUrl(serverUrl);

    if (isNative()) {
      try {
        const fetchNativeAction = async (action: string, categoryId?: string): Promise<any[]> => {
          const url = `${cleanUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=${action}${categoryId === undefined ? '' : '&category_id=' + encodeURIComponent(categoryId)}`;
          const labels: Record<string, string> = {
            get_live_categories: 'Canlı TV kategorileri',
            get_live_streams: 'Canlı TV listesi',
            get_vod_categories: 'Film kategorileri',
            get_vod_streams: 'Film listesi',
            get_series_categories: 'Dizi kategorileri',
            get_series: 'Dizi listesi',
          };
          const stage = labels[action] || 'Katalog';
          onProgress?.(stage);
          let result: any;
          try {
            result = await httpGetCatalogJson(url);
          } catch (error: any) {
            throw new Error(`${stage}: ${error?.message || 'İstek başarısız oldu.'}`);
          }
          if (Array.isArray(result)) return result;
          if (result === null || result === undefined || (typeof result === 'object' && result?.error)) {
            throw new Error(`IPTV sunucusu ${action} isteğine geçerli yanıt vermedi.`);
          }
          throw new Error(`IPTV sunucusu ${action} için beklenmeyen veri döndürdü.`);
        };

        const cacheKey = JSON.stringify([playlistId, cleanUrl, username, password]);
        const data: Record<string, any> = this.partialCatalogs.get(cacheKey) || {};
        this.partialCatalogs.set(cacheKey, data);
        const errors: string[] = [];
        const sections = [
          { type: 'live', categories: 'liveCategories', list: 'liveStreams', catAction: 'get_live_categories', action: 'get_live_streams' },
          { type: 'movie', categories: 'vodCategories', list: 'vodStreams', catAction: 'get_vod_categories', action: 'get_vod_streams' },
          { type: 'series', categories: 'seriesCategories', list: 'seriesList', catAction: 'get_series_categories', action: 'get_series' },
        ] as const;
        for (const section of sections) {
          try {
            if (!data[section.list]) {
              const categories = await fetchNativeAction(section.catAction);
              let entries: any[];
              if (section.type !== 'live' && categories.length) {
                // Keep each bridge response small on older Android devices.
                const combined = new Map<string, any>();
                const deadline = Date.now() + 180000;
                for (const category of categories) {
                  if (Date.now() > deadline) throw new Error('Kategori listeleri için süre sınırı aşıldı; tekrar deneyin.');
                  const id = String(category.category_id ?? '');
                  if (!id) throw new Error('Sunucu geçersiz kategori kimliği döndürdü.');
                  const batch = await fetchNativeAction(section.action, id);
                  for (const entry of batch) {
                    const key = entry.stream_id ?? entry.series_id;
                    if (key == null) throw new Error('Sunucu eksik içerik kimliği döndürdü.');
                    combined.set(String(key), entry);
                  }
                }
                entries = [...combined.values()];
              } else {
                entries = await fetchNativeAction(section.action);
              }
              if (!entries.length) throw new Error('Sunucu boş içerik listesi döndürdü; mevcut kayıtlar korundu.');
              data[section.categories] = categories;
              data[section.list] = entries;
            }
            const sectionData = { [section.categories]: data[section.categories], [section.list]: data[section.list] };
            const parsed = this.processCatalogData(sectionData, cleanUrl, username, password, playlistId);
            onSection?.(section.type, parsed.items);
          } catch (error: any) {
            errors.push(section.type + ': ' + (error?.message || 'Liste alınamadı.'));
          }
        }
        if (errors.length) throw new Error(errors.join(' | '));
        this.partialCatalogs.delete(cacheKey);
        return this.processCatalogData(data, cleanUrl, username, password, playlistId);
      } catch (err: any) {
        console.warn('[XtreamClient] Native catalog fetch failed:', err?.message || 'unknown');
        throw new Error(err?.message || 'IPTV kataloğu alınamadı. Sunucu ya da ağ bağlantısını kontrol edin.');
      }
    }

    // Web fallback via backend
    try {
      const resp = await fetch('/api/iptv/xtream/catalog', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverUrl: cleanUrl, username, password }),
      });

      if (!resp.ok) {
        return { items: [], counts: { live: 0, movie: 0, series: 0 } };
      }

      const data = await resp.json();
      return this.processCatalogData(data, cleanUrl, username, password, playlistId);
    } catch (err) {
      console.warn('[XtreamClient] Catalog proxy failed:', err);
      return { items: [], counts: { live: 0, movie: 0, series: 0 } };
    }
  }

  private static processCatalogData(data: any, baseHost: string, username: string, password: string, playlistId: string): XtreamCatalogResult {
      const items: MediaItem[] = [];
      const catMap = new Map<string, string>();
      if (Array.isArray(data.liveCategories)) data.liveCategories.forEach((c: any) => catMap.set(String(c.category_id), c.category_name));
      if (Array.isArray(data.vodCategories)) data.vodCategories.forEach((c: any) => catMap.set(String(c.category_id), c.category_name));
      if (Array.isArray(data.seriesCategories)) data.seriesCategories.forEach((c: any) => catMap.set(String(c.category_id), c.category_name));

      // Map live streams
      if (Array.isArray(data.liveStreams)) {
        data.liveStreams.forEach((stream: any, idx: number) => {
          const streamId = stream.stream_id;
          const categoryName = catMap.get(String(stream.category_id)) || 'Canlı TV';
          const rawStreamUrl = `${baseHost}/live/${username}/${password}/${streamId}.m3u8`;

          items.push({
            id: `xtream-live-${playlistId}-${streamId || idx}`,
            playlistId,
            title: stream.name || 'İsimsiz Kanal',
            category: categoryName,
            type: 'live',
            resolution: stream.name?.toUpperCase().includes('4K') ? '4K UHD' : stream.name?.toUpperCase().includes('FHD') ? 'FHD 60P' : 'HD',
            poster: stream.stream_icon || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&auto=format&fit=crop&q=80',
            streamUrl: this.getSafeStreamUrl(rawStreamUrl),
            rawStreamUrl,
            // Actual EPG is fetched on demand by EpgService; no placeholder programme names.
            channelNumber: idx + 1,
            audioTracks: ['Ana Yayın'],
            subtitles: ['Kapalı'],
            streamId,
          });
        });
      }

      // Map VOD movies
      if (Array.isArray(data.vodStreams)) {
        data.vodStreams.forEach((vod: any, idx: number) => {
          const streamId = vod.stream_id;
          const categoryName = catMap.get(String(vod.category_id)) || 'Sinema';
          const ext = vod.container_extension || 'mp4';
          const rawStreamUrl = `${baseHost}/movie/${username}/${password}/${streamId}.${ext}`;

          items.push({
            id: `xtream-vod-${playlistId}-${streamId || idx}`,
            playlistId,
            title: vod.name || 'İsimsiz Film',
            category: categoryName,
            type: 'movie',
            resolution: vod.name?.toUpperCase().includes('4K') ? '4K UHD' : '1080p HEVC',
            year: vod.year ? parseInt(vod.year, 10) : undefined,
            rating: catalogRating(vod.rating) || catalogRating(vod.rating_5based, true),
            addedAt: catalogTimestamp(vod.added),
            tmdbId: /^\d+$/.test(String(vod.tmdb_id || vod.tmdb || '')) ? Number(vod.tmdb_id || vod.tmdb) : undefined,
            imdbId: /^tt\d+$/.test(String(vod.imdb_id || '')) ? String(vod.imdb_id) : undefined,
            releaseDate: catalogReleaseDate(vod.releaseDate || vod.release_date || vod.releasedate),
            genres: typeof vod.genre === 'string' ? vod.genre.split(/[,/]/).map((g: string) => g.trim()).filter(Boolean) : undefined,
            poster: vod.stream_icon || 'https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400&auto=format&fit=crop&q=80',
            streamUrl: this.getSafeStreamUrl(rawStreamUrl),
            rawStreamUrl,
            fileSizeGb: vod.custom_sid ? parseFloat(vod.custom_sid) : 2.8,
            audioTracks: ['Türkçe / Orijinal'],
            subtitles: ['Kapalı'],
            streamId,
            containerExtension: ext,
          });
        });
      }

      // Map Series
      if (Array.isArray(data.seriesList)) {
        data.seriesList.forEach((series: any, idx: number) => {
          const seriesId = series.series_id;
          const categoryName = catMap.get(String(series.category_id)) || 'Dizi';
          const rawStreamUrl = `${baseHost}/series/${username}/${password}/${seriesId}`;

          items.push({
            id: `xtream-series-${playlistId}-${seriesId || idx}`,
            playlistId,
            title: series.name || 'İsimsiz Dizi',
            category: categoryName,
            type: 'series',
            resolution: 'FHD 60P',
            rating: catalogRating(series.rating) || catalogRating(series.rating_5based, true),
            addedAt: catalogTimestamp(series.added),
            tmdbId: /^\d+$/.test(String(series.tmdb_id || series.tmdb || '')) ? Number(series.tmdb_id || series.tmdb) : undefined,
            imdbId: /^tt\d+$/.test(String(series.imdb_id || '')) ? String(series.imdb_id) : undefined,
            updatedAt: catalogTimestamp(series.last_modified),
            releaseDate: catalogReleaseDate(series.releaseDate || series.release_date || series.releasedate),
            year: series.year ? parseInt(series.year, 10) : undefined,
            genres: typeof series.genre === 'string' ? series.genre.split(/[,/]/).map((g: string) => g.trim()).filter(Boolean) : undefined,
            poster: series.cover || 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=400&auto=format&fit=crop&q=80',
            streamUrl: this.getSafeStreamUrl(rawStreamUrl),
            rawStreamUrl,
            audioTracks: ['Türkçe Dublaj', 'English'],
            subtitles: ['Türkçe', 'English'],
            streamId: seriesId,
          });
        });
      }

      return {
        items,
        counts: {
          live: data.counts?.live || data.liveStreams?.length || 0,
          movie: data.counts?.movie || data.vodStreams?.length || 0,
          series: data.counts?.series || data.seriesList?.length || 0,
        },
      };
  }

  /**
   * Fetches full series details, seasons, and episodes from Xtream API.
   * Builds safe stream URLs for each episode in Xtream format:
   * ${baseHost}/series/${username}/${password}/${episodeStreamId}.${containerExtension || 'mp4'}
   */
  static async fetchSeriesInfo(
    serverUrl: string,
    username: string,
    password: string,
    seriesId: string | number
  ): Promise<{
    success: boolean;
    seriesDetail?: SeriesDetail;
    workingServer?: string;
    error?: string;
  }> {
    const cleanUrl = this.normalizeServerUrl(serverUrl);
    
    if (isNative()) {
      try {
        const url = `${cleanUrl}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_series_info&series_id=${seriesId}`;
        const data = await httpGetJson(url);
        
        if (!data) return { success: false, error: 'Dizi bilgisi alınamadı.' };
        
        return this.processSeriesDetail(data, cleanUrl, username, password);
      } catch (err: any) {
        return { success: false, error: `Dizi bilgisi alınamadı: ${err.message}` };
      }
    }

    // Web fallback via backend
    try {
      const resp = await fetch('/api/iptv/xtream/series_info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl: cleanUrl,
          username,
          password,
          seriesId: String(seriesId),
        }),
      });

      const data = await resp.json().catch(() => null);
      if (!resp.ok || !data?.success) {
        return {
          success: false,
          error: data?.error || `HTTP ${resp.status} hatası`,
        };
      }
      return this.processSeriesDetail(data, cleanUrl, username, password);
    } catch (err: any) {
      return {
        success: false,
        error: `Dizi detay isteği başarısız oldu: ${err.message}`,
      };
    }
  }

  private static processSeriesDetail(data: any, baseHost: string, username: string, password: string): { success: boolean; seriesDetail?: SeriesDetail } {
      const rawInfo = data.info || {};
      const rawSeasons = data.seasons || [];
      const rawEpisodes = data.episodes || {};

      const seasonsList: SeriesSeason[] = [];
      if (Array.isArray(rawSeasons)) {
        rawSeasons.forEach((s: any) => {
          seasonsList.push({
            seasonNumber: s.season_number !== undefined ? Number(s.season_number) : 1,
            name: s.name || `Sezon ${s.season_number || 1}`,
            episodeCount: s.episode_count ? Number(s.episode_count) : undefined,
            airDate: s.air_date,
            cover: s.cover,
          });
        });
      }

      // Format episodes map
      const episodesMap: Record<string | number, SeriesEpisode[]> = {};

      if (rawEpisodes && typeof rawEpisodes === 'object') {
        Object.keys(rawEpisodes).forEach((seasonKey) => {
          const list = rawEpisodes[seasonKey];
          if (Array.isArray(list)) {
            const parsedList: SeriesEpisode[] = list.map((ep: any) => {
              const epId = ep.id !== undefined && ep.id !== null && ep.id !== '' ? ep.id : ep.stream_id !== undefined && ep.stream_id !== null && ep.stream_id !== '' ? ep.stream_id : ep.episode_num;
              const ext = ep.container_extension || ep.containerExtension || 'mp4';
              const directStreamUrl = `${baseHost}/series/${username}/${password}/${epId}.${ext}`;
              const safeUrl = this.getSafeStreamUrl(directStreamUrl);

              const info = ep.info || {};
              const epNum = Number(ep.episode_num || 1);
              const seasonNum = Number(ep.season || seasonKey || 1);

              return {
                id: epId,
                episodeNum: epNum,
                seasonNum: seasonNum,
                title: ep.title || info.name || `Bölüm ${epNum}`,
                containerExtension: ext,
                duration: info.duration || (info.duration_secs ? `${Math.round(info.duration_secs / 60)} dk` : undefined),
                plot: info.plot || info.description,
                rating: info.rating ? String(info.rating) : undefined,
                releaseDate: info.releasedate || info.release_date,
                image: info.movie_image || ep.cover || rawInfo.cover,
                streamUrl: safeUrl,
                rawStreamUrl: directStreamUrl,
              };
            });

            episodesMap[seasonKey] = parsedList;

            const seasonNum = Number(seasonKey);
            if (!seasonsList.some((s) => s.seasonNumber === seasonNum)) {
              seasonsList.push({
                seasonNumber: seasonNum,
                name: `Sezon ${seasonNum}`,
                episodeCount: parsedList.length,
              });
            }
          }
        });
      }

      seasonsList.sort((a, b) => a.seasonNumber - b.seasonNumber);

      const seriesDetail: SeriesDetail = {
        name: rawInfo.name || rawInfo.title,
        cover: rawInfo.cover,
        plot: rawInfo.plot || rawInfo.description || rawInfo.plot_tr,
        cast: rawInfo.cast,
        director: rawInfo.director,
        genre: rawInfo.genre,
        releaseDate: rawInfo.releaseDate || rawInfo.releasedate,
        rating: rawInfo.rating ? String(rawInfo.rating) : undefined,
        backdrop: Array.isArray(rawInfo.backdrop_path) && rawInfo.backdrop_path.length > 0 ? rawInfo.backdrop_path[0] : undefined,
        seasons: seasonsList,
        episodes: episodesMap,
      };

      return { success: true, seriesDetail };
  }

  /**
   * Helper to compute remaining subscription days from Xtream exp_date Unix timestamp.
   */
  private static calculateExpiry(expDateRaw?: string | number): {
    expiryDays: number;
    expiryDateStr: string;
  } {
    if (!expDateRaw || expDateRaw === 'null') {
      return { expiryDays: 365, expiryDateStr: 'Süresiz / Limitsiz' };
    }
    const timestampSec = typeof expDateRaw === 'string' ? parseInt(expDateRaw, 10) : expDateRaw;
    if (isNaN(timestampSec) || timestampSec <= 0) {
      return { expiryDays: 365, expiryDateStr: 'Süresiz' };
    }

    const expDate = new Date(timestampSec * 1000);
    const now = new Date();
    const diffMs = expDate.getTime() - now.getTime();
    const expiryDays = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
    const months = [
      'Ocak',
      'Şubat',
      'Mart',
      'Nisan',
      'Mayıs',
      'Haziran',
      'Temmuz',
      'Ağustos',
      'Eylül',
      'Ekim',
      'Kasım',
      'Aralık',
    ];
    const expiryDateStr = `${expDate.getDate()} ${months[expDate.getMonth()]} ${expDate.getFullYear()}`;
    return { expiryDays, expiryDateStr };
  }
}

