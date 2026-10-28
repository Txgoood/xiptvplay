import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.xiptvplay.tvtester',
  appName: 'XIPTV TV Test',
  webDir: 'dist',
  server: { androidScheme: 'http', cleartext: true },
  plugins: { CapacitorHttp: { enabled: true } }
};

export default config;
