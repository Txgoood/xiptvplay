import test from 'node:test';
import assert from 'node:assert/strict';
import type { DownloadItem } from '../src/types';
import type { WatchHistoryEntry } from '../src/services/watchHistory';
import { formatWatchTime, getDownloadedWatchProgress } from '../src/services/downloadWatchProgress';

const downloaded = { id: 'download-episode-42', type: 'series', status: 'completed', progressPercent: 100 } as DownloadItem;
const watch = (positionSeconds: number, durationSeconds: number, completed = false): WatchHistoryEntry => ({
  id: downloaded.id,
  media: downloaded,
  profileId: 'parent',
  positionSeconds,
  durationSeconds,
  completed,
  watchedAt: Date.now(),
});

test('half-watched downloaded episode uses viewing position, not download percentage', () => {
  const result = getDownloadedWatchProgress(downloaded, watch(1200, 2400));
  assert.equal(result?.completed, false);
  assert.equal(result?.percent, 50);
  assert.equal(formatWatchTime(result?.positionSeconds ?? 0), '20:00');
});

test('completed downloaded item is marked watched even with no duration', () => {
  assert.deepEqual(getDownloadedWatchProgress(downloaded, watch(50, 0, true)), {
    positionSeconds: 50, durationSeconds: 0, percent: 100, completed: true,
  });
  assert.equal(getDownloadedWatchProgress(downloaded, watch(2330, 2400))?.completed, true);
});

test('unwatched, unmeasured, mismatched and unfinished downloads show no viewing bar', () => {
  assert.equal(getDownloadedWatchProgress(downloaded, undefined), null);
  assert.equal(getDownloadedWatchProgress(downloaded, watch(0, 2400)), null);
  assert.equal(getDownloadedWatchProgress(downloaded, watch(120, 0)), null);
  assert.equal(getDownloadedWatchProgress(downloaded, { ...watch(600, 2400), id: 'unrelated-file' }), null);
  assert.equal(getDownloadedWatchProgress({ ...downloaded, status: 'queued' }, watch(400, 1000)), null);
});

test('clock correctly formats short, long and invalid playback positions', () => {
  assert.equal(formatWatchTime(86), '01:26');
  assert.equal(formatWatchTime(4805), '1:20:05');
  assert.equal(formatWatchTime(-1), '00:00');
});
