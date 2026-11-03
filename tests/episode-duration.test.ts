import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeEpisodeDuration } from '../src/services/episodeDuration';

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
