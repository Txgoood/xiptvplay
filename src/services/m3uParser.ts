import { MediaItem } from '../types';
import { buildProxyUrl, safeFetchJson } from '../config/api';

export interface M3UFetchResult {
  success: boolean;
  content?: string;
  effectiveUrl?: string;
  error?: string;
}

export interface M3UParseResult {
  items: MediaItem[];
  counts: {
    live: number;
    movie: number;
    series: number;
  };
}

export class M3UParserService {
  /**
   * Fetches remote M3U/M3U8 playlist content via backend proxy to eliminate CORS & Mixed Content issues
   */
  static async fetchM3U(url: string): Promise<M3UFetchResult> {
    try {
      const result = await safeFetchJson<any>('/api/iptv/m3u/fetch', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ url: url.trim() }),
      });

      if (!result.success) {
        return {
          success: false,
          error: result.error || 'M3U sunucusu yanıt vermedi.',
        };
      }

      const data = result.data;
      if (!data || !data.success) {
        return {
          success: false,
          error: data?.error || 'M3U içeriği alınamadı.',
        };
      }

      return {
        success: true,
        content: data.content,
        effectiveUrl: data.effectiveUrl || url,
      };
    } catch (err: any) {
      return {
        success: false,
        error: `M3U indirme hatası: ${err.message || 'Ağ hatası veya CORS kısıtlaması'}`,
      };
    }
  }

  /**
   * Parses M3U / M3U8 string content and extracts standard MediaItems
   */
  static parse(content: string, playlistId: string): M3UParseResult {
    const items: MediaItem[] = [];
    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    let currentItem: Partial<MediaItem> | null = null;
    let counts = { live: 0, movie: 0, series: 0 };
    let itemIndex = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTINF:')) {
        currentItem = {};

        // Extract duration / channel number if present
        const commaIdx = line.indexOf(',');
        const infoPart = commaIdx !== -1 ? line.substring(0, commaIdx) : line;
        const titlePart = commaIdx !== -1 ? line.substring(commaIdx + 1).trim() : `Kanal ${itemIndex}`;

        // Extract title
        currentItem.title = titlePart || `Kanal ${itemIndex}`;

        // Extract group-title
        const groupMatch = infoPart.match(/group-title="([^"]*)"/i) || infoPart.match(/group-title=([^ ,]+)/i);
        currentItem.category = groupMatch ? groupMatch[1].trim() : 'Genel';

        // Extract tvg-logo
        const logoMatch = infoPart.match(/tvg-logo="([^"]*)"/i) || infoPart.match(/tvg-logo=([^ ,]+)/i);
        if (logoMatch && logoMatch[1].trim()) {
          const rawLogo = logoMatch[1].trim();
          currentItem.poster = rawLogo.startsWith('http')
            ? buildProxyUrl(rawLogo)
            : rawLogo;
        } else {
          currentItem.poster =
            'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&auto=format&fit=crop&q=80';
        }

        // Determine content type (live vs movie vs series)
        const catLower = (currentItem.category || '').toLowerCase();
        const titleLower = (currentItem.title || '').toLowerCase();

        if (
          catLower.includes('vod') ||
          catLower.includes('film') ||
          catLower.includes('movie') ||
          catLower.includes('sinema') ||
          titleLower.includes('1080p') ||
          titleLower.includes('720p') ||
          titleLower.includes('bluray')
        ) {
          currentItem.type = 'movie';
          currentItem.resolution = '1080p FHD';
          counts.movie++;
        } else if (
          catLower.includes('series') ||
          catLower.includes('dizi') ||
          catLower.includes('season') ||
          /s\d{1,2}e\d{1,2}/i.test(titleLower)
        ) {
          currentItem.type = 'series';
          currentItem.resolution = 'FHD';
          counts.series++;
        } else {
          currentItem.type = 'live';
          currentItem.resolution = 'HD';
          counts.live++;
        }

        currentItem.channelNumber = itemIndex;
      } else if (!line.startsWith('#') && currentItem) {
        // Line is the stream URL
        let streamUrl = line;

        // If not already proxied, wrap through backend proxy to bypass Mixed Content & CORS
        if (!streamUrl.includes('/api/iptv/proxy?url=')) {
          if (streamUrl.startsWith('http://') || streamUrl.startsWith('https://')) {
            streamUrl = buildProxyUrl(streamUrl);
          }
        }

        items.push({
          id: `${playlistId}-item-${itemIndex}`,
          playlistId,
          title: currentItem.title || `Yayın ${itemIndex}`,
          category: currentItem.category || 'Genel',
          type: currentItem.type || 'live',
          resolution: currentItem.resolution || 'HD',
          poster: currentItem.poster || 'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&auto=format&fit=crop&q=80',
          streamUrl,
          channelNumber: currentItem.channelNumber,
        });

        itemIndex++;
        currentItem = null;
      }
    }

    return {
      items,
      counts,
    };
  }
}
