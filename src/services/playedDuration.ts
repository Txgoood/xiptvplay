import type { DownloadItem, MediaItem } from '../types';

const STORAGE_KEY = 'xiptvplay_played_durations_v1';
const MAX_ENTRIES = 1000;
let cache: Record<string, number> | undefined;
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const listeners = new Set<() => void>();

function entries(): Record<string, number> {
  if (!cache) {
    try {
      const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      cache = stored && typeof stored === 'object' && !Array.isArray(stored) ? stored : {};
    } catch {
      cache = {};
    }
  }
  return cache!;
}

export function playedDuration(id: string): number | undefined {
  const duration = entries()[id];
  return Number.isFinite(duration) && duration > 0 ? duration : undefined;
}

export function rememberPlayedDuration(media: MediaItem | DownloadItem, seconds: number) {
  if (media.type === 'live' || !Number.isFinite(seconds) || seconds <= 0 || seconds > 7 * 86400) return;
  const id = 'mediaId' in media ? media.mediaId : media.id;
  if (!id) return;
  const rounded = Math.round(seconds);
  if (playedDuration(id) === rounded) return;
  const data = entries();
  delete data[id];
  data[id] = rounded;
  if (Object.keys(data).length > MAX_ENTRIES) delete data[Object.keys(data)[0]];
  listeners.forEach(listener => listener());
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = undefined;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries())); } catch { /* Bellekteki süre korunur. */ }
  }, 500);
}

export function subscribePlayedDurations(listener: () => void) {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = undefined;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(entries())); } catch { /* Depo dolu olabilir. */ }
  });
}
