import { MediaItem, Playlist, SeriesDetail, SeriesEpisode, SeriesSeason } from '../types';
import { XtreamClientService } from './xtreamClient';
import { StorageService } from './storage';

export interface ResolvedXtreamConfig {
  serverUrl: string;
  username: string;
  password: string;
  seriesId: string | number;
}

export class IptvService {
  /**
   * Intelligently resolves Xtream Codes credentials (serverUrl, username, password, seriesId)
   * from an M3U or Xtream media item and active playlist.
   */
  static resolveSeriesConfig(
    seriesItem: MediaItem,
    activePlaylist: Playlist | null
  ): ResolvedXtreamConfig | null {
    let serverUrl: string | undefined = undefined;
    let username: string | undefined = undefined;
    let password: string | undefined = undefined;
    let seriesId: string | number | undefined = seriesItem.streamId;

    // 1. Check active playlist direct credentials
    if (activePlaylist?.serverUrl && activePlaylist?.username && activePlaylist?.password) {
      serverUrl = activePlaylist.serverUrl;
      username = activePlaylist.username;
      password = activePlaylist.password;
    }

    // 2. Try extracting credentials and series ID from stream URL
    // Format: http(s)://host:port/series/username/password/12345.mp4
    const urlToCheck = seriesItem.rawStreamUrl || seriesItem.streamUrl || '';
    const seriesUrlRegex = /^(https?:\/\/[^/]+)\/series\/([^/]+)\/([^/]+)\/(\d+)(?:\.([a-zA-Z0-9]+))?/i;
    const match = urlToCheck.match(seriesUrlRegex);

    if (match) {
      if (!serverUrl) serverUrl = match[1];
      if (!username) username = match[2];
      if (!password) password = match[3];
      if (!seriesId) seriesId = match[4];
    }

    // 3. Check M3U URL for embedded Xtream credentials
    // Format: http(s)://host:port/get.php?username=XXX&password=YYY...
    if ((!serverUrl || !username || !password) && activePlaylist?.m3uUrl) {
      try {
        const parsedUrl = new URL(activePlaylist.m3uUrl);
        const u = parsedUrl.searchParams.get('username');
        const p = parsedUrl.searchParams.get('password');
        if (u && p) {
          if (!serverUrl) serverUrl = parsedUrl.origin;
          if (!username) username = u;
          if (!password) password = p;
        }
      } catch {
        // ignore
      }
    }

    // 4. If seriesId is still missing, try extracting digits from stream filename or title
    if (!seriesId) {
      const idMatch = urlToCheck.match(/\/(\d+)\.(mp4|mkv|avi|m3u8|ts)/i);
      if (idMatch) {
        seriesId = idMatch[1];
      }
    }

    // 5. Check if any other stored playlist has active Xtream credentials
    if (!serverUrl || !username || !password) {
      const allPlaylists = StorageService.getPlaylists();
      const xtreamPl = allPlaylists.find(
        (p) => p.type === 'xtream' && p.serverUrl && p.username && p.password
      );
      if (xtreamPl) {
        serverUrl = xtreamPl.serverUrl;
        username = xtreamPl.username;
        password = xtreamPl.password;
      }
    }

    if (serverUrl && username && password && seriesId) {
      return {
        serverUrl: XtreamClientService.normalizeServerUrl(serverUrl),
        username,
        password,
        seriesId,
      };
    }

    return null;
  }

  /**
   * Fetches series detail and episodes with graceful fallback for M3U playlists:
   * 1. If Xtream API config is found, queries Xtream Codes API (/api/iptv/xtream/series_info).
   * 2. If Xtream API is unavailable or returns an error, synthesizes a valid SeriesDetail
   *    from the M3U seriesItem so the user can immediately play/download without 'Dizi Bilgisi Alınamadı' error.
   * 3. Guarantees all stream addresses are proxied via /api/iptv/proxy to bypass port blocks & CORS.
   */
  static async fetchSeriesDetail(
    seriesItem: MediaItem,
    activePlaylist: Playlist | null
  ): Promise<{
    success: boolean;
    seriesDetail: SeriesDetail;
    isFallback?: boolean;
    error?: string;
  }> {
    const config = this.resolveSeriesConfig(seriesItem, activePlaylist);

    if (config) {
      try {
        const xtreamRes = await XtreamClientService.fetchSeriesInfo(
          config.serverUrl,
          config.username,
          config.password,
          config.seriesId
        );

        if (xtreamRes.success && xtreamRes.seriesDetail && xtreamRes.seriesDetail.seasons.length > 0) {
          // Ensure all episode stream URLs pass through proxy to bypass port blocks
          const sanitizedEpisodes: Record<string | number, SeriesEpisode[]> = {};
          Object.keys(xtreamRes.seriesDetail.episodes).forEach((seasonKey) => {
            sanitizedEpisodes[seasonKey] = xtreamRes.seriesDetail!.episodes[seasonKey].map((ep) => ({
              ...ep,
              streamUrl: XtreamClientService.getSafeStreamUrl(ep.rawStreamUrl || ep.streamUrl),
            }));
          });

          return {
            success: true,
            seriesDetail: {
              ...xtreamRes.seriesDetail,
              episodes: sanitizedEpisodes,
            },
          };
        }
      } catch (err: any) {
        console.warn('[IptvService] Xtream series info fetch error, creating smooth fallback:', err);
      }
    }

    // Synthesize fallback SeriesDetail for M3U stream items to prevent "Dizi Bilgisi Alınamadı" error
    const safeStreamUrl = XtreamClientService.getSafeStreamUrl(
      seriesItem.rawStreamUrl || seriesItem.streamUrl
    );

    const fallbackEpisode: SeriesEpisode = {
      id: seriesItem.streamId ? String(seriesItem.streamId) : seriesItem.id,
      episodeNum: 1,
      seasonNum: 1,
      title: seriesItem.title,
      containerExtension: seriesItem.containerExtension || 'mp4',
      duration: seriesItem.duration || 'Bölüm Yayını',
      plot: `${seriesItem.title} - M3U akış bağlantısı hazır.`,
      rating: seriesItem.rating || '8.5',
      image: seriesItem.poster,
      streamUrl: safeStreamUrl,
      rawStreamUrl: seriesItem.rawStreamUrl || seriesItem.streamUrl,
    };

    const fallbackSeason: SeriesSeason = {
      seasonNumber: 1,
      name: 'Sezon 1',
      episodeCount: 1,
      cover: seriesItem.poster,
    };

    const fallbackDetail: SeriesDetail = {
      name: seriesItem.title,
      cover: seriesItem.poster,
      plot: `${seriesItem.title} (${seriesItem.category}). Akış adresi tünellenerek oynatmaya hazırlandı.`,
      genre: seriesItem.category,
      rating: seriesItem.rating || '8.5',
      releaseDate: seriesItem.year ? String(seriesItem.year) : undefined,
      backdrop: seriesItem.backdrop || seriesItem.poster,
      seasons: [fallbackSeason],
      episodes: {
        1: [fallbackEpisode],
      },
    };

    return {
      success: true,
      seriesDetail: fallbackDetail,
      isFallback: true,
    };
  }
}
