import type { DownloadItem } from '../types';
import type { WatchHistoryEntry } from './watchHistory';

export interface DownloadedWatchProgress {
  positionSeconds: number;
  durationSeconds: number;
  percent: number;
  completed: boolean;
}

/**
 * Reading progress is independent of download progress.
 * Match by the downloaded item's stable ID: the native player records that ID
 * through WatchHistoryService and the active family profile.
 */
export function getDownloadedWatchProgress(
  download: DownloadItem,
  entry?: WatchHistoryEntry,
): DownloadedWatchProgress | null {
  if (download.status !== 'completed' || !entry || entry.id !== download.id) return null;

  const duration = Number.isFinite(entry.durationSeconds) ? Math.max(0, entry.durationSeconds) : 0;
  const position = Number.isFinite(entry.positionSeconds) ? Math.max(0, entry.positionSeconds) : 0;
  const completed = entry.completed || (duration > 60 && position / duration >= 0.95);
  if (!completed && (duration <= 0 || position <= 0)) return null;

  return {
    positionSeconds: completed && duration > 0 ? duration : position,
    durationSeconds: duration,
    percent: completed ? 100 : Math.max(0, Math.min(100, (position / duration) * 100)),
    completed,
  };
}

/** Compact readable player clock, including long movies. */
export function formatWatchTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const value = Math.floor(seconds);
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const secs = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}
