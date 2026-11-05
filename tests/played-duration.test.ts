import test from 'node:test';
import assert from 'node:assert/strict';

const values = new Map<string, string>();
Object.assign(globalThis, { localStorage: {
  getItem: (key: string) => values.get(key) ?? null,
  setItem: (key: string, value: string) => { values.set(key, value); },
} });
const { rememberPlayedDuration, playedDuration, subscribePlayedDurations } = await import('../src/services/playedDuration');

test('duration is stored once for the correct film or downloaded episode', async () => {
  let updates = 0;
  const unsubscribe = subscribePlayedDurations(() => { updates++; });
  const movie = { id: 'film-1', type: 'movie' } as any;
  const download = { id: 'download-1', mediaId: 'ep-series-2', type: 'series' } as any;
  rememberPlayedDuration(movie, 2800);
  rememberPlayedDuration(movie, 2800);
  rememberPlayedDuration(download, 2400);
  rememberPlayedDuration({ id: 'live', type: 'live' } as any, 9000);
  rememberPlayedDuration(movie, Infinity);
  assert.equal(playedDuration('film-1'), 2800);
  assert.equal(playedDuration('ep-series-2'), 2400);
  assert.equal(playedDuration('download-1'), undefined);
  assert.equal(playedDuration('live'), undefined);
  assert.equal(updates, 2);
  unsubscribe();
  await new Promise(resolve => setTimeout(resolve, 600));
  assert.equal(JSON.parse(values.get('xiptvplay_played_durations_v1') || '{}')['film-1'], 2800);
});
