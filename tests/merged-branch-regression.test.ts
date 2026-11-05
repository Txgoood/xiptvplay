import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('single branch retains native pinch-to-zoom', () => {
  const player = read('android/app/src/main/java/com/xiptvplay/app/NativePlayerActivity.java');
  assert.match(player, /pinchDistance\(MotionEvent event\)/);
  assert.match(player, /applyPinchZoom\(\)/);
  assert.match(player, /setScaleX\(videoZoom\)/);
});

test('single branch retains retry-resume and real Android storage telemetry', () => {
  const download = read('android/app/src/main/java/com/xiptvplay/app/NativeDownloadPlugin.java');
  assert.match(download, /setRequestProperty\("Range"/);
  assert.match(download, /for \(int attempt = 0; attempt < 5; attempt\+\+\)/);
  const files = read('android/app/src/main/java/com/xiptvplay/app/DownloadFilesPlugin.java');
  assert.match(files, /getStorageStats\(PluginCall call\)/);
  assert.match(files, /StatFs/);
  assert.match(read('src/App.tsx'), /getStorageStats\(\)/);
});

test('single branch retains series identification, M3U episodes and runtimes', () => {
  const iptv = read('src/services/iptvService.ts');
  assert.match(iptv, /activePlaylist\?\.type === 'm3u'/);
  assert.match(iptv, /duration: item\.duration/);
  assert.match(iptv, /Never borrow credentials from another playlist/);
  const xtream = read('src/services/xtreamClient.ts');
  assert.match(xtream, /rawInfo\.episode_run_time/);
  assert.match(xtream, /Global series lookup unavailable/);
});

test('single branch version matches the next update code and stable signing', () => {
  const gradle = read('android/app/build.gradle');
  const workflow = read('.github/workflows/main.yml');
  const versionCode = gradle.match(/versionCode (\d+)/)?.[1];
  const versionName = gradle.match(/versionName "([^"]+)"/)?.[1];
  assert.ok(versionCode && Number(versionCode) >= 21 && versionName);
  assert.ok(workflow.includes(`v${versionName} (${versionCode})`));
  assert.match(gradle, /signingConfig signingConfigs\.stableDebug/);
  assert.match(workflow, /tek-dal-birlestirme-xiptvplay-android/);
  assert.match(workflow, /ANDROID_DEBUG_KEYSTORE_BASE64/);
  assert.match(read('src/components/screens/SettingsScreen.tsx'), /__XIPTV_ANDROID_VERSION__/);
});
