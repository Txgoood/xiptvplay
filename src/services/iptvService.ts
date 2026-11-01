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
    let seriesId: string | number | undefined = activePlaylist?.type === 'xtream' ? seriesItem.streamId : undefined;

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
      // A /series/ URL contains an episode stream ID, not a series ID.
      // Never use the episode ID with get_series_info.
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

    // Never borrow credentials from another playlist or treat episode file IDs as series IDs.
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
    // M3U exports commonly contain one item per episode, rather than a series ID.
    // Reconstruct seasons from the actual saved playlist items, never from guessed Xtream IDs.
    if (activePlaylist?.type === 'm3u') {
      const allItems = StorageService.getPlaylistItems(activePlaylist.id);
      const parseEpisode = (item: MediaItem) => {
        const title = item.title || '';
        const match = title.match(/^(.*?)[\\s._-]*(?:S(\\d{1,2})[\\s._-]*E(\\d{1,3})|(?:sezon|season)[\\s._-]*(\\d{1,2})[\\s._-]*(?:bölüm|bolum|episode|ep)[\\s._-]*(\\d{1,3}))/i);
        if (!match) return null;
        const name = match[1].replace(/[\\s._|:-]+$/g, '').replace(/\\s*\\(\\d{4}\\)\\s*$/, '').trim();
        return { name, season: Number(match[2] || match[4]), episode: Number(match[3] || match[5]) };
      };
      const normalize = (value: string) => value.toLocaleLowerCase('tr-TR').replace(/[^a-z0-9çğıöşü]/g, '');
      const selectedParsed = parseEpisode(seriesItem);
      const baseName = selectedParsed?.name || seriesItem.title.replace(/\\s*\\(\\d{4}\\).*$/, '').trim();
      const matches = allItems.map((item) => ({ item, parsed: parseEpisode(item) }))
        .filter((entry) => entry.item.type === 'series' && entry.parsed &&
          normalize(entry.parsed.name) === normalize(baseName));
      if (matches.length > 0) {
        const episodes: Record<string, SeriesEpisode[]> = {};
        for (const { item, parsed } of matches) {
          const season = String(parsed!.season);
          (episodes[season] ||= []).push({
            id: item.id,
            episodeNum: parsed!.episode,
            seasonNum: parsed!.season,
            title: item.title,
            containerExtension: item.containerExtension || 'mp4',
            image: item.poster,
            rating: item.rating,
            streamUrl: XtreamClientService.getSafeStreamUrl(item.rawStreamUrl || item.streamUrl),
            rawStreamUrl: item.rawStreamUrl || item.streamUrl,
          });
        }
        for (const list of Object.values(episodes)) list.sort((a, b) => a.episodeNum - b.episodeNum);
        return {
          success: true,
          seriesDetail: {
            name: baseName, cover: seriesItem.poster, genre: seriesItem.category,
            rating: seriesItem.rating, backdrop: seriesItem.backdrop || seriesItem.poster,
            seasons: Object.keys(episodes).map((key) => ({
              seasonNumber: Number(key), name: `Sezon ${key}`, episodeCount: episodes[key].length,
            })).sort((a, b) => a.seasonNumber - b.seasonNumber),
            episodes,
          },
        };
      }
      return { success: false, seriesDetail: { seasons: [], episodes: {} },
        error: 'M3U listesindeki bu dizi için sezon/bölüm bilgisi bulunamadı. Playlist yenilemeyi deneyin.' };
    }

    const config = this.resolveSeriesConfig(seriesItem, activePlaylist);
    if (!config) {
      return { success: false, seriesDetail: { seasons: [], episodes: {} },
        error: 'Diziye ait geçerli Xtream kimliği bulunamadı.' };
    }
    try {
      const result = await XtreamClientService.fetchSeriesInfo(
        config.serverUrl, config.username, config.password, config.seriesId
      );
      if (result.success && result.seriesDetail &&
          Object.values(result.seriesDetail.episodes).some((list) => list.length > 0)) {
        return { success: true, seriesDetail: result.seriesDetail };
      }
      return { success: false, seriesDetail: { seasons: [], episodes: {} },
        error: result.error || 'Sunucu bu dizi için bölüm listesi döndürmedi.' };
    } catch (error: any) {
      return { success: false, seriesDetail: { seasons: [], episodes: {} },
        error: error?.message || 'Dizi bilgileri yüklenemedi.' };
    }
  }
}
