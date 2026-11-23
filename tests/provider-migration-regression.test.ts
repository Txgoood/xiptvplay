import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('provider changes must validate a replacement catalog before saving credentials', () => {
  const app = read('src/App.tsx');
  const begin = app.indexOf('const handleUpdatePlaylist = async');
  const end = app.indexOf('// New devices receive connection details from Drive', begin);
  assert.ok(begin > 0 && end > begin);
  const handler = app.slice(begin, end);
  const verified = handler.indexOf('verifyConnection(');
  const fetched = handler.indexOf('fetchCatalog(');
  const save = handler.indexOf('StorageService.upsertPlaylist(verified)');
  assert.ok(verified >= 0 && fetched > verified && save > fetched);
  assert.match(handler, /if \(!items\.length/);
  assert.match(handler, /StorageService\.savePlaylistItems\(updated\.id, items\)/);
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
