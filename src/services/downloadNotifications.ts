import { registerPlugin, Capacitor } from '@capacitor/core';

type NativeNotificationsPlugin = {
  requestPermission(): Promise<void>;
  showProgress(options: { id: string; title: string; progress: number; detail: string }): Promise<void>;
  complete(options: { id: string; title: string }): Promise<void>;
  cancel(options: { id: string }): Promise<void>;
  startForegroundDownload(options: { title: string }): Promise<void>;
  stopForegroundDownload(): Promise<void>;
};

const NativeNotifications = registerPlugin<NativeNotificationsPlugin>('NativeNotifications');

export const DownloadNotifications = {
  async requestPermission(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try { await NativeNotifications.requestPermission(); }
    catch (error) { console.warn('[Notifications] Permission unavailable:', error); }
  },
  async progress(id: string, title: string, progress: number, detail: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try { await NativeNotifications.showProgress({ id, title, progress, detail }); }
    catch (error) { console.warn('[Notifications] Progress notification failed:', error); }
  },
  async complete(id: string, title: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try { await NativeNotifications.complete({ id, title }); }
    catch (error) { console.warn('[Notifications] Completion notification failed:', error); }
  },
  async startForegroundDownload(title: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try { await NativeNotifications.startForegroundDownload({ title }); }
    catch (error) { console.warn('[Notifications] Foreground download service failed:', error); }
  },
  async stopForegroundDownload(): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try { await NativeNotifications.stopForegroundDownload(); }
    catch (error) { console.warn('[Notifications] Foreground download service stop failed:', error); }
  },
  async cancel(id: string): Promise<void> {
    if (!Capacitor.isNativePlatform()) return;
    try { await NativeNotifications.cancel({ id }); }
    catch (error) { console.warn('[Notifications] Cancel notification failed:', error); }
  },
};
