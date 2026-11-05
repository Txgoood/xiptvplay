import test from 'node:test';
import assert from 'node:assert/strict';
import { formatRuntimeMinutes, normalizeEpisodeDuration } from '../src/services/episodeDuration';

test('zero Xtream runtimes are ignored and seconds fallback is used', () => {
  assert.equal(normalizeEpisodeDuration({ value: '00:00:00' }, { value: 2820, unit: 'seconds' }), '47:00');
  assert.equal(normalizeEpisodeDuration({ value: '0' }, { value: 3600, unit: 'seconds' }), '1:00:00');
  assert.equal(normalizeEpisodeDuration({ value: '00:00:00' }, { value: 0, unit: 'seconds' }), undefined);
});

test('valid time strings and minute values are normalized', () => {
  assert.equal(normalizeEpisodeDuration({ value: '01:23:05' }), '1:23:05');
  assert.equal(normalizeEpisodeDuration({ value: '45:30' }), '45:30');
  assert.equal(normalizeEpisodeDuration({ value: 52 }), '52:00');
  assert.equal(normalizeEpisodeDuration({ value: '44 dk' }), '44:00');
});

test('invalid runtime values are not guessed', () => {
  assert.equal(normalizeEpisodeDuration({ value: null }, { value: 'unknown' }), undefined);
  assert.equal(normalizeEpisodeDuration({ value: '-1' }), undefined);
  assert.equal(normalizeEpisodeDuration({ value: '00:61:00' }), undefined);
});

test('series episode_run_time can recover missing per-episode runtime', () => {
  assert.equal(normalizeEpisodeDuration(
    { value: '00:00:00' },
    { value: undefined },
    { value: '45' },
  ), '45:00');
  assert.equal(normalizeEpisodeDuration(
    { value: '00:00:00' },
    { value: '00:49:18' },
    { value: '45' },
  ), '49:18');
  assert.equal(normalizeEpisodeDuration(
    { value: '00:00:00' },
    { value: '00:00:00' },
    { value: undefined },
  ), undefined);
});

test('catalog runtime displays minutes and skips unavailable metadata', () => {
  assert.equal(formatRuntimeMinutes('01:47:12'), '107 dk');
  assert.equal(formatRuntimeMinutes('46:55'), '47 dk');
  assert.equal(formatRuntimeMinutes(48), '48 dk');
  assert.equal(formatRuntimeMinutes('00:00:00'), undefined);
  assert.equal(formatRuntimeMinutes('unknown'), undefined);
});
