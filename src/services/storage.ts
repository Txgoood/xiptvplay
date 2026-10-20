import { Playlist, MediaItem, DownloadItem } from '../types';

const STORAGE_KEYS = {
  PLAYLISTS: 'xiptvplay_playlists_v3',
  PLAYLIST_ITEMS_PREFIX: 'xiptvplay_items_v3_',
  DOWNLOADS: 'xiptvplay_downloads_v3',
  FAVORITES: 'xiptvplay_favorites_v3',
  FAVORITE_ITEMS: 'xiptvplay_favorite_items_v1',
  ACTIVE_PLAYLIST_ID: 'xiptvplay_active_playlist_v1',
  SETTINGS: 'xiptvplay_settings_v3',
};

// Safe localStorage wrapper for xiptvplay
export class StorageService {
  static getActivePlaylistId(): string | null {
    return localStorage.getItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID);
  }

  static setActivePlaylistId(id: string | null): void {
    if (id) {
      localStorage.setItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID, id);
    } else {
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID);
    }
  }

  static getFavoriteItems(): MediaItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.FAVORITE_ITEMS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  static saveFavoriteItems(items: MediaItem[]): boolean {
    try {
      localStorage.setItem(STORAGE_KEYS.FAVORITE_ITEMS, JSON.stringify(items));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves all saved user playlists. Returns empty array if none exist.
   */
  static getPlaylists(): Playlist[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.PLAYLISTS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch (err) {
      console.error('[StorageService] Failed to load playlists:', err);
      return [];
    }
  }

  /**
   * Persists the entire playlist array to localStorage.
   */
  static savePlaylists(playlists: Playlist[]): boolean {
    try {
      localStorage.setItem(STORAGE_KEYS.PLAYLISTS, JSON.stringify(playlists));
      return true;
    } catch (err) {
      console.error('[StorageService] Failed to save playlists:', err);
      return false;
    }
  }

  /**
   * Adds or updates a playlist.
   */
  static upsertPlaylist(playlist: Playlist): boolean {
    const list = this.getPlaylists();
    const index = list.findIndex((p) => p.id === playlist.id);
    if (index >= 0) {
      list[index] = playlist;
    } else {
      list.unshift(playlist);
    }
    return this.savePlaylists(list);
  }

  private static getDB = (): Promise<IDBDatabase> => {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('xiptvplay-db', 1);
      request.onupgradeneeded = (event: any) => {
        const db = event.target.result;
        if (!db.objectStoreNames.contains('playlistItems')) {
          db.createObjectStore('playlistItems', { keyPath: 'playlistId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  };

  static async savePlaylistItemsPersistent(playlistId: string, items: MediaItem[]): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('playlistItems', 'readwrite');
      tx.objectStore('playlistItems').put({ playlistId, items, savedAt: Date.now() });
    } catch (err) {
      console.warn('[StorageService] Persistent storage failed:', err);
    }
  }

  static async loadPlaylistItemsPersistent(playlistId: string): Promise<MediaItem[] | null> {
    try {
      const db = await this.getDB();
      return new Promise((resolve) => {
        const tx = db.transaction('playlistItems', 'readonly');
        const request = tx.objectStore('playlistItems').get(playlistId);
        request.onsuccess = () => resolve(request.result ? request.result.items : null);
        request.onerror = () => resolve(null);
      });
    } catch (err) {
      console.warn('[StorageService] Persistent load failed:', err);
      return null;
    }
  }

  static async deletePlaylistItemsPersistent(playlistId: string): Promise<void> {
    try {
      const db = await this.getDB();
      const tx = db.transaction('playlistItems', 'readwrite');
      tx.objectStore('playlistItems').delete(playlistId);
    } catch (err) {
      console.warn('[StorageService] Persistent delete failed:', err);
    }
  }

  /**
   * Permanently deletes a playlist and its cached items.
   */
  static deletePlaylist(id: string): boolean {
    try {
      const list = this.getPlaylists().filter((p) => p.id !== id);
      this.savePlaylists(list);
      localStorage.removeItem(`${STORAGE_KEYS.PLAYLIST_ITEMS_PREFIX}${id}`);
      this.deletePlaylistItemsPersistent(id); // Added
      return true;
    } catch (err) {
      console.error('[StorageService] Failed to delete playlist:', err);
      return false;
    }
  }

  private static inMemoryPlaylistItems = new Map<string, MediaItem[]>();

  /**
   * Retrieves cached media items for a specific playlist. Returns empty array if none.
   */
  static getPlaylistItems(playlistId: string): MediaItem[] {
    // 1. Check in-memory session cache first (holds full 72,000+ catalog)
    if (this.inMemoryPlaylistItems.has(playlistId)) {
      return this.inMemoryPlaylistItems.get(playlistId)!;
    }

    // 2. Fallback to localStorage cache
    try {
      const raw = localStorage.getItem(`${STORAGE_KEYS.PLAYLIST_ITEMS_PREFIX}${playlistId}`);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        this.inMemoryPlaylistItems.set(playlistId, parsed);
        return parsed;
      }
      return [];
    } catch (err) {
      console.error('[StorageService] Failed to get playlist items:', err);
      return [];
    }
  }

  /**
   * Saves cached media items for a specific playlist.
   */
  static savePlaylistItems(playlistId: string, items: MediaItem[]): boolean {
    // Store complete unfiltered catalog in-memory
    this.inMemoryPlaylistItems.set(playlistId, items);

    // Persist as many as possible safely in localStorage (compacted)
    try {
      const trimmed = items.slice(0, 3000);
      localStorage.setItem(
        `${STORAGE_KEYS.PLAYLIST_ITEMS_PREFIX}${playlistId}`,
        JSON.stringify(trimmed)
      );
    } catch (err) {
      console.warn('[StorageService] LocalStorage quota exceeded, kept in memory cache:', err);
    }
    
    // Asynchronously persist full catalog
    this.savePlaylistItemsPersistent(playlistId, items);
    
    return true;
  }

  /**
   * Retrieves downloads from storage. Returns empty array if none.
   */
  static getDownloads(): DownloadItem[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.DOWNLOADS);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Saves downloads to storage.
   */
  static saveDownloads(downloads: DownloadItem[]): boolean {
    try {
      localStorage.setItem(STORAGE_KEYS.DOWNLOADS, JSON.stringify(downloads));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves app settings from storage.
   */
  static getSettings(): Record<string, any> {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (!raw) return {};
      const parsed = JSON.parse(raw);
      return typeof parsed === 'object' && parsed !== null ? parsed : {};
    } catch {
      return {};
    }
  }

  /**
   * Saves app settings to storage.
   */
  static saveSettings(settings: Record<string, any>): boolean {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Retrieves favorites media IDs. Returns empty array if none.
   */
  static getFavorites(): string[] {
    try {
      const raw = localStorage.getItem(STORAGE_KEYS.FAVORITES);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  /**
   * Saves favorites media IDs.
   */
  static saveFavorites(ids: string[]): boolean {
    try {
      localStorage.setItem(STORAGE_KEYS.FAVORITES, JSON.stringify(ids));
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Completely clears user data.
   */
  static clearAll(): void {
    try {
      const playlists = this.getPlaylists();
      playlists.forEach((p) => {
        localStorage.removeItem(`${STORAGE_KEYS.PLAYLIST_ITEMS_PREFIX}${p.id}`);
        this.deletePlaylistItemsPersistent(p.id); // Added
      });
      localStorage.removeItem(STORAGE_KEYS.PLAYLISTS);
      localStorage.removeItem(STORAGE_KEYS.DOWNLOADS);
      localStorage.removeItem(STORAGE_KEYS.FAVORITES);
      localStorage.removeItem(STORAGE_KEYS.FAVORITE_ITEMS);
      localStorage.removeItem(STORAGE_KEYS.ACTIVE_PLAYLIST_ID);
      localStorage.removeItem(STORAGE_KEYS.SETTINGS);
      // Also clear old version keys if present
      localStorage.removeItem('xiptvplay_playlists_v1');
      localStorage.removeItem('xiptvplay_downloads_v1');
      localStorage.removeItem('xiptvplay_favorites_v1');
      localStorage.removeItem('xiptv_playlists_v2');
      localStorage.removeItem('xiptv_downloads_v2');
      localStorage.removeItem('xiptv_favorites_v2');
      indexedDB.deleteDatabase('xiptvplay-db'); // Added
    } catch (err) {
      console.error('[StorageService] Error clearing all data:', err);
    }
  }
}

