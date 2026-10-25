import { Playlist, MediaItem } from '../types';
import { httpGetJson } from './net';

export interface EpgProgramme {
  id: string;
  title: string;
  description: string;
  start: number;
  end: number;
}

function decodeLabel(value: unknown): string {
  const raw = typeof value === 'string' ? value : '';
  if (!raw) return '';
  // Xtream portals commonly return base64-encoded program names/descriptions.
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(raw) || raw.length % 4 !== 0) return raw;
  try {
    const bytes = Uint8Array.from(atob(raw), c => c.charCodeAt(0));
    const decoded = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    return decoded && !/[\x00-\x08\x0E-\x1F]/.test(decoded) ? decoded : raw;
  } catch { return raw; }
}

function parseEpgTime(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === 'number') return value < 1e11 ? value * 1000 : value;
  const text = String(value).trim();
  if (/^\d{10,13}$/.test(text)) return Number(text) < 1e11 ? Number(text) * 1000 : Number(text);
  // Xtream textual timestamps are usually supplied in the IPTV server's timezone.
  const result = Date.parse(text.replace(' ', 'T'));
  return Number.isFinite(result) ? result : 0;
}

function credentialsFromStream(item: MediaItem): { serverUrl: string; username: string; password: string; streamId: string } | null {
  const url = item.rawStreamUrl || item.streamUrl;
  try {
    const parsed = new URL(url);
    const match = parsed.pathname.match(/^\/(?:live|movie|series)\/([^/]+)\/([^/]+)\/(\d+)(?:\.[^/]+)?$/i);
    if (!match) return null;
    return {
      serverUrl: parsed.origin, username: decodeURIComponent(match[1]),
      password: decodeURIComponent(match[2]), streamId: match[3],
    };
  } catch { return null; }
}

export class EpgService {
  static async fetchChannelProgrammes(item: MediaItem, playlist: Playlist | null): Promise<EpgProgramme[]> {
    if (item.type !== 'live') return [];
    const extracted = credentialsFromStream(item);
    const serverUrl = playlist?.type === 'xtream' && playlist.serverUrl ? playlist.serverUrl : extracted?.serverUrl;
    const username = playlist?.type === 'xtream' && playlist.username ? playlist.username : extracted?.username;
    const password = playlist?.type === 'xtream' && playlist.password ? playlist.password : extracted?.password;
    const streamId = item.streamId ?? extracted?.streamId;
    if (!serverUrl || !username || !password || !streamId) {
      throw new Error('Bu playlist için EPG bağlantısı bulunamadı.');
    }
    const base = serverUrl.replace(/\/+$/, '');
    const url = `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_simple_data_table&stream_id=${encodeURIComponent(String(streamId))}`;
    let data: any = await httpGetJson(url);
    let rows = Array.isArray(data?.epg_listings) ? data.epg_listings : [];
    if (!rows.length) {
      const shortUrl = `${base}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}&action=get_short_epg&stream_id=${encodeURIComponent(String(streamId))}&limit=100`;
      data = await httpGetJson(shortUrl);
      rows = Array.isArray(data?.epg_listings) ? data.epg_listings : [];
    }
    return rows.map((row: any, index: number) => {
      const start = parseEpgTime(row.start_timestamp ?? row.start);
      const end = parseEpgTime(row.stop_timestamp ?? row.end_timestamp ?? row.end);
      return {
        id: String(row.id ?? index) + '-' + start,
        title: decodeLabel(row.title) || 'İsimsiz program',
        description: decodeLabel(row.description || row.desc),
        start, end,
      };
    }).filter((p: EpgProgramme) => p.start > 0 && p.end > p.start)
      .sort((a: EpgProgramme, b: EpgProgramme) => a.start - b.start);
  }
}
