import { MediaItem } from '../types';
import { XtreamClientService } from './xtreamClient';
import { isNative, httpGetText, fetchWithProtocolFallback } from './net';

export interface M3UParseResult {
  items: MediaItem[];
  categories: string[];
  counts: {
    live: number;
    movie: number;
    series: number;
    total: number;
  };
  epgUrl?: string;
  detectedXtreamConfig?: {
    serverUrl: string;
    username: string;
    password: string;
  };
}

export interface M3UFetchResult {
  success: boolean;
  content?: string;
  effectiveUrl?: string;
  error?: string;
}

/**
 * Repairs corrupted Turkish characters resulting from incorrect decoding
 * (e.g. UTF-8 decoded as Windows-1252/ISO-8859-1 or ISO-8859-9 single-byte confusion).
 */
export function repairTurkishEncoding(text: string): string {
  if (!text) return '';

  let cleaned = text;

  // 1. Double UTF-8 Mojibake (UTF-8 -> Latin1 -> UTF-8 -> Latin1)
  const doubleMojibake: [RegExp, string][] = [
    [/Ã„Â±/g, 'ı'],
    [/Ã„Â°/g, 'İ'],
    [/Ã…ÂŸ/g, 'ş'],
    [/Ã…Âž/g, 'Ş'],
    [/Ã„ÂŸ/g, 'ğ'],
    [/Ã„Âž/g, 'Ğ'],
    [/ÃƒÂ§/g, 'ç'],
    [/ÃƒÂ‡/g, 'Ç'],
    [/ÃƒÂ¶/g, 'ö'],
    [/ÃƒÂ–/g, 'Ö'],
    [/ÃƒÂ¼/g, 'ü'],
    [/ÃƒÂœ/g, 'Ü'],
  ];

  for (const [pattern, repl] of doubleMojibake) {
    cleaned = cleaned.replace(pattern, repl);
  }

  // 2. Direct Mojibake mapping table for UTF-8 read as ISO-8859-1 / Windows-1252
  const utf8Mojibake: [RegExp, string][] = [
    [/Ä±/g, 'ı'],
    [/Ä°/g, 'İ'],
    [/ÅŸ/g, 'ş'],
    [/Åž/g, 'Ş'],
    [/ÄŸ/g, 'ğ'],
    [/Äž/g, 'Ğ'],
    [/Ã§/g, 'ç'],
    [/Ã‡/g, 'Ç'],
    [/Ã¶/g, 'ö'],
    [/Ã–/g, 'Ö'],
    [/Ã¼/g, 'ü'],
    [/Ãœ/g, 'Ü'],
    [/Â/g, ' '], // Stray Latin-1 control / non-breaking space
    [/â€“/g, '–'],
    [/â€”/g, '—'],
    [/â€™/g, "'"],
    [/â€˜/g, "'"],
    [/â€œ/g, '"'],
    [/â€/g, '"'],
    [/â€/g, '"'],
    [/&quot;/g, '"'],
    [/&apos;/g, "'"],
    [/&#39;/g, "'"],
    [/&amp;/g, '&'],
    [/&lt;/g, '<'],
    [/&gt;/g, '>'],
  ];

  for (const [pattern, repl] of utf8Mojibake) {
    cleaned = cleaned.replace(pattern, repl);
  }

  // 3. ISO-8859-9 Turkish characters read as Latin-1
  cleaned = cleaned
    .replace(/ý/g, 'ı')
    .replace(/Ý/g, 'İ')
    .replace(/þ/g, 'ş')
    .replace(/Þ/g, 'Ş')
    .replace(/ð/g, 'ğ')
    .replace(/Ð/g, 'Ğ');

  return cleaned.trim();
}

/**
 * Extracts attribute values from #EXTINF tag lines.
 * Handles double-quotes (tvg-logo="url"), single-quotes (tvg-logo='url'),
 * and unquoted parameters (tvg-logo=http://site.com/logo.png group-title=Ulusal).
 */
export function extractExtinfAttr(infoPart: string, attrName: string): string | undefined {
  if (!infoPart) return undefined;

  // 1. Double quoted: attr="value"
  const dqRegex = new RegExp(`${attrName}\\s*=\\s*"([^"]*)"`, 'i');
  const dqMatch = infoPart.match(dqRegex);
  if (dqMatch && dqMatch[1] !== undefined) {
    return repairTurkishEncoding(dqMatch[1].trim());
  }

  // 2. Single quoted: attr='value'
  const sqRegex = new RegExp(`${attrName}\\s*=\\s*'([^']*)'`, 'i');
  const sqMatch = infoPart.match(sqRegex);
  if (sqMatch && sqMatch[1] !== undefined) {
    return repairTurkishEncoding(sqMatch[1].trim());
  }

  // 3. Unquoted: attr=value (stops at next attribute key= or comma or end of line)
  const uqRegex = new RegExp(
    `${attrName}\\s*=\\s*([^"'\\s,][^,]*?)(?=\\s+[a-zA-Z0-9_-]+\\s*=|\\s*,|$)`,
    'i'
  );
  const uqMatch = infoPart.match(uqRegex);
  if (uqMatch && uqMatch[1] !== undefined) {
    return repairTurkishEncoding(uqMatch[1].trim());
  }

  return undefined;
}

export class M3UParserService {
  /**
   * Fetches M3U or M3U8 playlist content from remote URL via backend proxy.
   * Eliminates browser-level Mixed Content and CORS blocking with VLC User-Agent and redirect following.
   */
  static async fetchM3U(url: string): Promise<M3UFetchResult> {
    let cleanUrl = url.trim();
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `http://${cleanUrl}`;
    }

    if (isNative()) {
      const res = await fetchWithProtocolFallback(cleanUrl);
      if (res.status >= 200 && res.status < 300) {
        return { success: true, content: res.text, effectiveUrl: cleanUrl };
      }
      return { success: false, error: `HTTP ${res.status} hatası.` };
    }

    // Web fallback via backend
    try {
      const resp = await fetch('/api/iptv/m3u/fetch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: cleanUrl }),
      });
      const data = await resp.json().catch(() => null);

      if (resp.ok && data?.content) {
        return {
          success: true,
          content: data.content,
          effectiveUrl: data.effectiveUrl || cleanUrl,
        };
      }

      // Secondary fallback via proxy
      const proxyResp = await fetch(`/api/iptv/proxy?url=${encodeURIComponent(cleanUrl)}`);
      if (proxyResp.ok) {
        const proxyText = await proxyResp.text();
        return { success: true, content: proxyText, effectiveUrl: cleanUrl };
      }

      return { success: false, error: data?.error || `HTTP ${resp.status} hatası` };
    } catch (networkErr: any) {
      return {
        success: false,
        error: `M3U servisine ulaşılamadı (${networkErr.message || 'Ağ hatası'}).`,
      };
    }
  }

  /**
   * Parses raw M3U / M3U8 string content into normalized MediaItem list.
   * - Extracts unquoted or quoted tvg-logo, group-title, tvg-name parameters.
   * - Automatically repairs Turkish character encoding.
   * - Formats stream URLs into safe proxy endpoints.
   */
  static parse(content: string, playlistId: string): M3UParseResult {
    // Clean raw text with Turkish encoding repair first
    const repairedContent = repairTurkishEncoding(content);
    const lines = repairedContent.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const items: MediaItem[] = [];
    const categoriesSet = new Set<string>();

    let currentExtinf: {
      title?: string;
      tvgId?: string;
      tvgName?: string;
      tvgLogo?: string;
      groupTitle?: string;
    } | null = null;

    let epgUrl: string | undefined = undefined;
    let detectedXtreamConfig: M3UParseResult['detectedXtreamConfig'] = undefined;
    let liveCount = 0;
    let movieCount = 0;
    let seriesCount = 0;
    let channelNumber = 1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      if (line.startsWith('#EXTM3U')) {
        const match = line.match(/(?:url-tvg|x-tvg-url)="?([^"\s]+)"?/i);
        if (match && match[1]) {
          epgUrl = match[1];
        }
        continue;
      }

      if (line.startsWith('#EXTINF:')) {
        const infoPart = line.substring(8);
        const commaIndex = infoPart.lastIndexOf(',');
        const rawTitle = commaIndex >= 0 ? infoPart.substring(commaIndex + 1).trim() : '';
        const attrSection = commaIndex >= 0 ? infoPart.substring(0, commaIndex) : infoPart;

        const groupTitle = extractExtinfAttr(attrSection, 'group-title') || 'Genel';
        const tvgLogo = extractExtinfAttr(attrSection, 'tvg-logo') || '';
        const tvgId = extractExtinfAttr(attrSection, 'tvg-id') || '';
        const tvgName = extractExtinfAttr(attrSection, 'tvg-name') || rawTitle;

        currentExtinf = {
          title: repairTurkishEncoding(rawTitle || tvgName || 'Bilinmeyen Kanal'),
          tvgId,
          tvgName: repairTurkishEncoding(tvgName),
          tvgLogo,
          groupTitle: repairTurkishEncoding(groupTitle),
        };
        continue;
      }

      // Check if this line is the URL (non-comment line after #EXTINF)
      if (!line.startsWith('#') && currentExtinf) {
        const streamLine = line;
        const itemTitle = currentExtinf.title || 'Bilinmeyen Kanal';
        const resolution: MediaItem['resolution'] = 'HD';
        const group = currentExtinf.groupTitle || 'Genel';
        categoriesSet.add(group);

        const lowerUrl = streamLine.toLowerCase();
        const lowerGroup = group.toLowerCase();

        let type: 'live' | 'movie' | 'series' = 'live';
        if (
          lowerGroup.includes('movie') ||
          lowerGroup.includes('film') ||
          lowerGroup.includes('vod') ||
          lowerGroup.includes('sinema') ||
          lowerUrl.endsWith('.mp4') ||
          lowerUrl.endsWith('.mkv') ||
          lowerUrl.endsWith('.avi')
        ) {
          type = 'movie';
        } else if (
          lowerGroup.includes('series') ||
          lowerGroup.includes('dizi') ||
          lowerGroup.includes('season') ||
          lowerGroup.includes('episode') ||
          lowerGroup.includes('sezon') ||
          lowerGroup.includes('bölüm')
        ) {
          type = 'series';
        } else {
          type = 'live';
        }

        // 1. Extract genuine raw IPTV stream URL if the line was already proxied
        let genuineRawUrl = streamLine;
        if (streamLine.includes('/api/iptv/proxy?url=')) {
          try {
            const urlParam = streamLine.split('/api/iptv/proxy?url=')[1].split('&')[0];
            genuineRawUrl = decodeURIComponent(urlParam);
          } catch {
            genuineRawUrl = streamLine;
          }
        }

        // 2. Xtream Codes & M3U Data Bridging (Smart Series/VOD ID and Credentials extraction):
        let streamId: string | number | undefined = undefined;
        let containerExtension: string | undefined = undefined;

        // Try extracting from Xtream Codes stream URL format: /(series|movie|live)/USER/PASS/ID.ext
        const xtreamMatch = genuineRawUrl.match(
          /\/(series|movie|live)\/([^/]+)\/([^/]+)\/(\d+)(?:\.([a-zA-Z0-9]+))?/i
        );
        if (xtreamMatch) {
          const matchedType = xtreamMatch[1].toLowerCase();
          const matchedUser = xtreamMatch[2];
          const matchedPass = xtreamMatch[3];
          streamId = xtreamMatch[4];
          containerExtension = xtreamMatch[5] || (matchedType === 'live' ? 'm3u8' : 'mp4');

          if (matchedType === 'series') type = 'series';
          else if (matchedType === 'movie') type = 'movie';
          else if (matchedType === 'live') type = 'live';

          // Capture detected Xtream credentials for the entire playlist
          if (!detectedXtreamConfig && genuineRawUrl.startsWith('http')) {
            try {
              const parsed = new URL(genuineRawUrl);
              detectedXtreamConfig = {
                serverUrl: parsed.origin,
                username: matchedUser,
                password: matchedPass,
              };
            } catch {
              // ignore
            }
          }
        }

        // Fallback ID extraction for M3U streams
        if (!streamId) {
          if (currentExtinf.tvgId && /^\d+$/.test(currentExtinf.tvgId)) {
            streamId = currentExtinf.tvgId;
          } else {
            const numMatch = genuineRawUrl.match(/\/(\d+)\.(mp4|mkv|avi|m3u8|ts)/i);
            if (numMatch) {
              streamId = numMatch[1];
              containerExtension = numMatch[2];
            }
          }
        }

        if (!containerExtension) {
          const extMatch = genuineRawUrl.match(/\.([a-zA-Z0-9]{2,4})(?:[?#]|$)/);
          containerExtension = extMatch
            ? extMatch[1].toLowerCase()
            : type === 'live'
            ? 'ts'
            : 'mp4';
        }

        if (type === 'movie') movieCount++;
        else if (type === 'series') seriesCount++;
        else liveCount++;

        items.push({
          id: `m3u-${playlistId}-${items.length + 1}`,
          playlistId,
          title: itemTitle,
          category: group,
          type,
          resolution,
          poster:
            currentExtinf.tvgLogo ||
            'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&auto=format&fit=crop&q=80',
          streamUrl: XtreamClientService.getSafeStreamUrl(streamLine),
          rawStreamUrl: genuineRawUrl,
          streamId,
          containerExtension,
          channelNumber: channelNumber++,
          audioTracks: ['Varsayılan Ses İzi'],
          subtitles: ['Kapalı'],
          epgCurrent: `Yayın Akışı (${itemTitle})`,
        });

        currentExtinf = null;
      }
    }

    return {
      items,
      categories: Array.from(categoriesSet),
      counts: {
        live: liveCount,
        movie: movieCount,
        series: seriesCount,
        total: items.length,
      },
      epgUrl,
      detectedXtreamConfig,
    };
  }
}
