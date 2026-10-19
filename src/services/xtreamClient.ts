import { MediaItem, XtreamUserInfo, XtreamServerInfo } from '../types';

export interface XtreamVerifyResult {
  success: boolean;
  userInfo?: XtreamUserInfo;
  serverInfo?: XtreamServerInfo;
  expiryDays?: number;
  expiryDateStr?: string;
  pingMs?: number;
  effectiveServerUrl?: string;
  error?: string;
}

export interface XtreamCatalogResult {
  items: MediaItem[];
  counts: {
    live: number;
    movie: number;
    series: number;
  };
}

export class XtreamClientService {
  /**
   * Helper to format expiry timestamp or date string into readable date and remaining days
   */
  static formatExpiry(expDate: string | number | undefined): { expiryDays: number; expiryDateStr: string } {
    if (!expDate || expDate === 'null' || expDate === '0' || expDate === 0) {
      return { expiryDays: 365, expiryDateStr: 'Süresiz (Ömür Boyu)' };
    }

    try {
      let expTimestamp = 0;
      if (typeof expDate === 'number') {
        expTimestamp = expDate > 1e11 ? expDate : expDate * 1000;
      } else {
        const parsedNum = parseInt(expDate, 10);
        if (!isNaN(parsedNum) && parsedNum > 0) {
          expTimestamp = parsedNum > 1e11 ? parsedNum : parsedNum * 1000;
        } else {
          const parsedDate = new Date(expDate).getTime();
          if (!isNaN(parsedDate)) expTimestamp = parsedDate;
        }
      }

      if (expTimestamp > 0) {
        const now = Date.now();
        const diffMs = expTimestamp - now;
        const days = Math.max(0, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        const d = new Date(expTimestamp);
        const dateStr = d.toLocaleDateString('tr-TR', {
          day: 'numeric',
          month: 'long',
          year: 'numeric',
        });
        return { expiryDays: days, expiryDateStr: dateStr };
      }
    } catch {
      // ignore
    }

    return { expiryDays: 30, expiryDateStr: 'Bilinmiyor' };
  }

  /**
   * Verifies Xtream Codes credentials via internal backend proxy with HTTP/HTTPS fallback
   */
  static async verifyConnection(
    serverUrl: string,
    username: string,
    password: string
  ): Promise<XtreamVerifyResult> {
    try {
      const resp = await fetch('/api/iptv/xtream/verify', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverUrl: serverUrl.trim(),
          username: username.trim(),
          password: password.trim(),
        }),
      });

      const text = await resp.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        return {
          success: false,
          error: `Sunucu geçerli bir JSON yanıtı vermedi (HTTP ${resp.status}). Sunucu adresini ve port numarasını kontrol edin.`,
        };
      }

      if (!data.success) {
        return {
          success: false,
          error: data.error || `Kimlik doğrulama başarısız oldu (HTTP ${resp.status})`,
          pingMs: data.pingMs,
        };
      }

      const { expiryDays, expiryDateStr } = this.formatExpiry(data.userInfo?.exp_date);

      return {
        success: true,
        userInfo: data.userInfo,
        serverInfo: data.serverInfo,
        expiryDays,
        expiryDateStr,
        pingMs: data.pingMs,
        effectiveServerUrl: data.effectiveServerUrl || serverUrl,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `Bağlantı kurulamadı: ${err.message || 'Ağ hatası veya bağlantı zaman aşımı'}`,
      };
    }
  }

  /**
   * Fetches full categories and media catalog (Live, Movies, Series) from Xtream API
   */
  static async fetchCatalog(
    serverUrl: string,
    username: string,
    password: string,
    playlistId: string
  ): Promise<XtreamCatalogResult> {
    try {
      const resp = await fetch('/api/iptv/xtream/catalog', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          serverUrl: serverUrl.trim(),
          username: username.trim(),
          password: password.trim(),
        }),
      });

      const text = await resp.text();
      let data: any = {};
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error(`Katalog verisi okunamadı (HTTP ${resp.status}). Sunucu adresi veya portu kontrol edin.`);
      }

      if (data.success === false) {
        throw new Error(data.error || 'Katalog verisi alınamadı.');
      }

      const workingServer = data.workingServer || serverUrl.trim().replace(/\/+$/, '');

      // Create category lookups
      const liveCatMap: Record<string, string> = {};
      if (Array.isArray(data.liveCategories)) {
        data.liveCategories.forEach((c: any) => {
          if (c.category_id && c.category_name) {
            liveCatMap[c.category_id] = c.category_name;
          }
        });
      }

      const vodCatMap: Record<string, string> = {};
      if (Array.isArray(data.vodCategories)) {
        data.vodCategories.forEach((c: any) => {
          if (c.category_id && c.category_name) {
            vodCatMap[c.category_id] = c.category_name;
          }
        });
      }

      const seriesCatMap: Record<string, string> = {};
      if (Array.isArray(data.seriesCategories)) {
        data.seriesCategories.forEach((c: any) => {
          if (c.category_id && c.category_name) {
            seriesCatMap[c.category_id] = c.category_name;
          }
        });
      }

      const items: MediaItem[] = [];

      // Process Live Streams
      if (Array.isArray(data.liveStreams)) {
        data.liveStreams.forEach((stream: any, idx: number) => {
          const directStreamUrl = `${workingServer}/live/${encodeURIComponent(username)}/${encodeURIComponent(
            password
          )}/${stream.stream_id}.ts`;
          const proxiedUrl = `/api/iptv/proxy?url=${encodeURIComponent(directStreamUrl)}`;

          items.push({
            id: `${playlistId}-live-${stream.stream_id || idx}`,
            playlistId,
            title: stream.name || `Kanal ${idx + 1}`,
            category: liveCatMap[stream.category_id] || 'Canlı TV',
            type: 'live',
            resolution: 'FHD',
            poster:
              stream.stream_icon && stream.stream_icon.startsWith('http')
                ? `/api/iptv/proxy?url=${encodeURIComponent(stream.stream_icon)}`
                : 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&auto=format&fit=crop&q=80',
            streamUrl: proxiedUrl,
            channelNumber: idx + 1,
            streamId: stream.stream_id,
          });
        });
      }

      // Process VOD Movies
      if (Array.isArray(data.vodStreams)) {
        data.vodStreams.forEach((vod: any, idx: number) => {
          const ext = vod.container_extension || 'mp4';
          const directStreamUrl = `${workingServer}/movie/${encodeURIComponent(username)}/${encodeURIComponent(
            password
          )}/${vod.stream_id}.${ext}`;
          const proxiedUrl = `/api/iptv/proxy?url=${encodeURIComponent(directStreamUrl)}`;

          items.push({
            id: `${playlistId}-vod-${vod.stream_id || idx}`,
            playlistId,
            title: vod.name || `Film ${idx + 1}`,
            category: vodCatMap[vod.category_id] || 'Filmler',
            type: 'movie',
            resolution: '4K UHD',
            poster:
              vod.stream_icon && vod.stream_icon.startsWith('http')
                ? `/api/iptv/proxy?url=${encodeURIComponent(vod.stream_icon)}`
                : 'https://images.unsplash.com/photo-1536440136628-849c177e76a1?w=400&auto=format&fit=crop&q=80',
            streamUrl: proxiedUrl,
            year: vod.year ? parseInt(vod.year, 10) : undefined,
            rating: vod.rating_5based ? `${vod.rating_5based}/5` : '4.6',
            streamId: vod.stream_id,
            containerExtension: ext,
            fileSizeGb: 2.1,
          });
        });
      }

      // Process Series
      if (Array.isArray(data.seriesList)) {
        data.seriesList.forEach((ser: any, idx: number) => {
          const directStreamUrl = `${workingServer}/series/${encodeURIComponent(username)}/${encodeURIComponent(
            password
          )}/${ser.series_id}.mp4`;
          const proxiedUrl = `/api/iptv/proxy?url=${encodeURIComponent(directStreamUrl)}`;

          items.push({
            id: `${playlistId}-series-${ser.series_id || idx}`,
            playlistId,
            title: ser.name || `Dizi ${idx + 1}`,
            category: seriesCatMap[ser.category_id] || 'Diziler',
            type: 'series',
            resolution: 'FHD',
            poster:
              ser.cover && ser.cover.startsWith('http')
                ? `/api/iptv/proxy?url=${encodeURIComponent(ser.cover)}`
                : 'https://images.unsplash.com/photo-1574375927938-d5a98e8ffe85?w=400&auto=format&fit=crop&q=80',
            streamUrl: proxiedUrl,
            year: ser.year ? parseInt(ser.year, 10) : undefined,
            rating: ser.rating ? `${ser.rating}/10` : '8.5',
            streamId: ser.series_id,
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
    } catch (err: any) {
      console.error('[XtreamClient] Fetch catalog failed:', err);
      return {
        items: [],
        counts: { live: 0, movie: 0, series: 0 },
      };
    }
  }

  /**
   * Fetches detailed series info with season and episode listings
   */
  static async fetchSeriesInfo(
    serverUrl: string,
    username: string,
    password: string,
    seriesId: string | number
  ): Promise<any> {
    try {
      const resp = await fetch('/api/iptv/xtream/series_info', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          serverUrl: serverUrl.trim(),
          username: username.trim(),
          password: password.trim(),
          seriesId,
        }),
      });
      const text = await resp.text();
      try {
        return JSON.parse(text);
      } catch {
        return { success: false, error: 'Dizi bilgisi ayrıştırılamadı (Geçersiz yanıt).' };
      }
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  }
}
