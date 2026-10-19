import { Playlist, DownloadItem, MediaItem } from '../types';
import { INITIAL_PLAYLISTS, INITIAL_DOWNLOADS, MEDIA_CATALOG } from '../data/mockData';

const PLAYLISTS_KEY = 'xiptv_playlists_v2';
const DOWNLOADS_KEY = 'xiptv_downloads_v2';
const FAVORITES_KEY = 'xiptv_favorites_v2';
const ITEMS_PREFIX = 'xiptv_items_';

export class StorageService {
  static getPlaylists(): Playlist[] {
    try {
      const raw = localStorage.getItem(PLAYLISTS_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static savePlaylists(playlists: Playlist[]): void {
    try {
      localStorage.setItem(PLAYLISTS_KEY, JSON.stringify(playlists));
    } catch (err) {
      console.warn('[StorageService] Failed to save playlists:', err);
    }
  }

  static upsertPlaylist(playlist: Playlist): void {
    const list = this.getPlaylists();
    const idx = list.findIndex((p) => p.id === playlist.id);
    if (idx >= 0) {
      list[idx] = playlist;
    } else {
      list.unshift(playlist);
    }
    this.savePlaylists(list);
  }

  static deletePlaylist(id: string): void {
    const list = this.getPlaylists().filter((p) => p.id !== id);
    this.savePlaylists(list);
    try {
      localStorage.removeItem(`${ITEMS_PREFIX}${id}`);
    } catch {
      // ignore
    }
  }

  static getPlaylistItems(playlistId: string): MediaItem[] {
    try {
      const raw = localStorage.getItem(`${ITEMS_PREFIX}${playlistId}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    // Fallback for demo playlists
    if (playlistId.startsWith('demo-')) {
      return MEDIA_CATALOG.filter((item) => item.playlistId === playlistId || item.playlistId === 'demo-xtream-1');
    }
    return [];
  }

  static savePlaylistItems(playlistId: string, items: MediaItem[]): void {
    try {
      localStorage.setItem(`${ITEMS_PREFIX}${playlistId}`, JSON.stringify(items));
    } catch (err) {
      console.warn('[StorageService] Failed to cache playlist items:', err);
    }
  }

  static getDownloads(): DownloadItem[] {
    try {
      const raw = localStorage.getItem(DOWNLOADS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore
    }
    return INITIAL_DOWNLOADS;
  }

  static saveDownloads(downloads: DownloadItem[]): void {
    try {
      localStorage.setItem(DOWNLOADS_KEY, JSON.stringify(downloads));
    } catch (err) {
      console.warn('[StorageService] Failed to save downloads:', err);
    }
  }

  static getFavorites(): string[] {
    try {
      const raw = localStorage.getItem(FAVORITES_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {
      // ignore
    }
    return ['cat-1', 'cat-2'];
  }

  static saveFavorites(ids: string[]): void {
    try {
      localStorage.setItem(FAVORITES_KEY, JSON.stringify(ids));
    } catch (err) {
      console.warn('[StorageService] Failed to save favorites:', err);
    }
  }

  static loadDemoPlaylists(): Playlist[] {
    this.savePlaylists(INITIAL_PLAYLISTS);
    this.savePlaylistItems(INITIAL_PLAYLISTS[0].id, MEDIA_CATALOG);
    this.saveDownloads(INITIAL_DOWNLOADS);
    return INITIAL_PLAYLISTS;
  }

  static clearAll(): void {
    try {
      const playlists = this.getPlaylists();
      playlists.forEach((p) => {
        localStorage.removeItem(`${ITEMS_PREFIX}${p.id}`);
      });
      localStorage.removeItem(PLAYLISTS_KEY);
      localStorage.removeItem(DOWNLOADS_KEY);
      localStorage.removeItem(FAVORITES_KEY);
    } catch (err) {
      console.warn('[StorageService] Failed to clear storage:', err);
    }
  }
}
