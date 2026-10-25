import type { MediaItem, DownloadItem } from '../types';

export interface WatchHistoryEntry {
  id: string;
  media: MediaItem | DownloadItem;
  profileId: string;
  watchedAt: number;
  positionSeconds: number;
  durationSeconds: number;
  completed: boolean;
}
const PREFIX = 'xiptvplay_watch_history_v1_';
const MAX_ITEMS = 350;
export const WatchHistoryService = {
  read(profileId: string): WatchHistoryEntry[] {
    try {
      const entries = JSON.parse(localStorage.getItem(PREFIX + profileId) || '[]');
      return Array.isArray(entries) ? entries.filter(e => e?.media?.id && e.profileId === profileId).slice(0, MAX_ITEMS) : [];
    } catch { return []; }
  },
  write(profileId: string, entries: WatchHistoryEntry[]): WatchHistoryEntry[] {
    const safe = entries.sort((a,b) => b.watchedAt - a.watchedAt).slice(0, MAX_ITEMS);
    try { localStorage.setItem(PREFIX + profileId, JSON.stringify(safe)); } catch { /* history optional on low storage */ }
    return safe;
  },
  record(profileId: string, media: MediaItem | DownloadItem, positionSeconds = 0, durationSeconds = 0, finished = false): WatchHistoryEntry[] {
    const entries = this.read(profileId);
    const existing = entries.find(e => e.id === media.id);
    const duration = Number.isFinite(durationSeconds) && durationSeconds > 0 ? durationSeconds : existing?.durationSeconds || 0;
    const position = Number.isFinite(positionSeconds) && positionSeconds >= 0 ? positionSeconds : existing?.positionSeconds || 0;
    const completed = finished || (duration > 60 && position / duration >= 0.95);
    const next: WatchHistoryEntry = {
      id: media.id, profileId, media,
      watchedAt: Date.now(),
      positionSeconds: completed ? duration || position : position,
      durationSeconds: duration,
      completed,
    };
    return this.write(profileId, [next, ...entries.filter(e => e.id !== media.id)]);
  },
  remove(profileId: string, id: string) { return this.write(profileId, this.read(profileId).filter(e => e.id !== id)); },
  clear(profileId: string) { return this.write(profileId, []); },
  complete(profileId: string, id: string) {
    const entries = this.read(profileId).map(e => e.id === id ? { ...e, completed: true, positionSeconds: e.durationSeconds || e.positionSeconds } : e);
    return this.write(profileId, entries);
  },
};
