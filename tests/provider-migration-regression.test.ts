import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { detectProviderInput, getProviderResponse } from '../src/services/net';
import { M3UParserService } from '../src/services/m3uParser';
import { StorageService } from '../src/services/storage';
import type { MediaItem, Playlist } from '../src/types';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('provider changes must validate a replacement catalog before saving credentials', () => {
  const app = read('src/App.tsx');
  const begin = app.indexOf('const handleUpdatePlaylist = async');
  const end = app.indexOf('// New devices receive connection details from Drive', begin);
  assert.ok(begin > 0 && end > begin);
  const handler = app.slice(begin, end);
  const verified = handler.indexOf('verifyConnection(');
  const fetched = handler.indexOf('fetchCatalog(');
  const save = handler.indexOf('StorageService.commitProviderChange(old, verified, items)');
  assert.ok(verified >= 0 && fetched > verified && save > fetched);
  assert.match(handler, /if \(!items\.length/);
  assert.match(handler, /isolateProviderItems\(verified, items\)/);
  assert.doesNotMatch(handler, /StorageService\.deletePlaylist\(/);
  assert.doesNotMatch(handler, /setDownloads\(/);
});

test('playlist edit dialog waits for validation and keeps data on failure', () => {
  const dialog = read('src/components/screens/EditPlaylistModal.tsx');
  assert.match(dialog, /const saved = await onSave\(updated\)/);
  assert.match(dialog, /if \(saved\) onClose\(\)/);
  assert.match(dialog, /disabled=\{validating\}/);
});

test('HLS and direct HTTP downloads remain available after provider change', () => {
  const native = read('android/app/src/main/java/com/xiptvplay/app/NativeDownloadPlugin.java');
  assert.match(native, /HlsSegmentDownload\.download\(/);
  assert.match(native, /DownloadRedirects\.open\(/);
  const app = read('src/App.tsx');
  assert.match(app, /StorageService\.getDownloads\(\)/);
});


test('detects URL formats and extracts encoded Xtream credentials', () => {
  assert.deepEqual(detectProviderInput('https://example.test:8443/iptv/player_api.php?username=one&password=a%26b', 'm3u'), {
    type: 'xtream', serverUrl: 'https://example.test:8443/iptv', username: 'one', password: 'a&b',
  });
  assert.equal(detectProviderInput('example.test/get.php?type=m3u_plus', 'xtream').type, 'm3u');
  assert.throws(() => detectProviderInput('ftp://example.test/list.m3u', 'm3u'));
});

test('resolves native redirects without forwarding the old query and upgrades HTTP 404 once', async t => {
  const requests: string[] = [];
  const request = t.mock.fn(async ({ url, disableRedirects }: { url: string; disableRedirects?: boolean }): Promise<{ status: number; headers: Record<string, string>; data?: string }> => {
    assert.equal(disableRedirects, true);
    requests.push(url);
    if (requests.length === 1) return { status: 404, headers: {} };
    if (requests.length === 2) return { status: 302, headers: { Location: 'https://cdn.example.test/lists/index.m3u' } };
    return { status: 200, headers: {}, data: '#EXTM3U' };
  });
  const result = await getProviderResponse('http://example.test/get.php?password=secret', 25000, request);
  assert.deepEqual(requests, [
    'http://example.test/get.php?password=secret',
    'https://example.test/get.php?password=secret',
    'https://cdn.example.test/lists/index.m3u',
  ]);
  assert.equal(result.url, requests[2]);
  const parsed = M3UParserService.parse('#EXTM3U\n#EXTINF:-1,Test\n../channel.m3u8', 'p', result.url);
  assert.equal(parsed.items.length, 1);
  assert.match(parsed.items[0].streamUrl, /channel\.m3u8/);
});

test('rejects redirects from HTTPS to HTTP', async t => {
  const request = t.mock.fn(async () => ({
    status: 302, headers: { location: 'http://example.test/get.php' },
  }));
  await assert.rejects(getProviderResponse('https://example.test/get.php', 25000, request), /güvenli bağlantı/);
  assert.equal(request.mock.callCount(), 1);
});

test('provider commit leaves the old catalog reachable after a failed write or a concurrent deletion', async t => {
  const previous = { id: 'playlist', name: 'Test', serverUrl: 'https://old.example.test' } as Playlist;
  const replacement = { ...previous, serverUrl: 'https://new.example.test', catalogRevision: 'new' };
  const items = [{ id: 'new-item' }] as MediaItem[];
  const storage = StorageService as unknown as { writePersistentCatalog: (...args: unknown[]) => Promise<void> };
  let current = [previous];
  t.mock.method(StorageService, 'getPlaylists', () => current.slice());
  const save = t.mock.method(StorageService, 'savePlaylists', () => true);
  const cleanup = t.mock.method(StorageService, 'deletePlaylistItemsPersistent', async () => {});
  const write = t.mock.method(storage, 'writePersistentCatalog', async () => { throw new Error('Disk full'); });
  await assert.rejects(StorageService.commitProviderChange(previous, replacement, items), /Disk full/);
  assert.equal(save.mock.callCount(), 0);
  assert.deepEqual(current, [previous]);
  write.mock.mockImplementation(async () => { current = []; });
  assert.equal(await StorageService.commitProviderChange(previous, replacement, items), false);
  assert.equal(save.mock.callCount(), 0);
  assert.deepEqual(cleanup.mock.calls.map(call => call.arguments[0]), ['playlist:new', 'playlist:new']);
});
