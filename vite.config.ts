import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { readFileSync } from 'node:fs';
import {defineConfig} from 'vite';

const gradle = readFileSync(path.resolve(process.cwd(), 'android/app/build.gradle'), 'utf8');
const androidVersion = gradle.match(/versionName\s+"([^"]+)"/)?.[1] || 'bilinmiyor';
const androidBuild = gradle.match(/versionCode\s+(\d+)/)?.[1] || 'bilinmiyor';

export default defineConfig(() => {
  return {
    base: './',
    define: {
      __XIPTV_ANDROID_VERSION__: JSON.stringify(androidVersion),
      __XIPTV_ANDROID_BUILD__: JSON.stringify(androidBuild),
    },
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(import.meta.dirname || process.cwd(), '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
