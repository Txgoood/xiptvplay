import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { DownloadItem, MediaItem } from '../types';

const NativeDownload = registerPlugin<any>('NativeDownload');

export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const sanitizeFileName = (name: string): string => {
  return name.replace(/[\\/:*?"<>|]/g, '_').replace(/\s+/g, '_').replace(/[. ]+$/g, '').slice(0, 160) || 'download';
};

function extractRawUrl(streamUrl?: string): string {
  if (!streamUrl) return '';
  if (streamUrl.includes('/api/iptv/proxy?url=')) {
    try {
      const m = streamUrl.match(/url=([^&]+)/);
      if (m && m[1]) return decodeURIComponent(m[1]);
    } catch { /* ignore */ }
  }
  return streamUrl;
}

function formatEta(totalSeconds: number): string {
  const s = Math.max(0, Math.round(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h} sa ${m} dk`;
  if (m > 0) return `${m} dk ${sec} sn`;
  return `${sec} sn`;
}

async function runSingleDownload(
  item: DownloadItem | MediaItem,
  onProgress: (progress: number, downloadedGb: number, speedMbps: number, eta: string, totalSizeGb?: number) => void,
  onDone: (localUrl: string, relativePath?: string, fileUri?: string) => void,
  onError: (error: string) => void
) {
  // Sadece Wi-Fi kontrolü
  if ((navigator as any).connection?.type === 'cellular') {
    onError('Sadece Wi-Fi üzerinden indirme izinli.');
    return;
  }

  // Ham kaynak URL (proxy'den ayıkla; native'de zaten ham)
  const rawUrl = (item as MediaItem).rawStreamUrl || extractRawUrl(item.streamUrl);
  if (!rawUrl) {
    onError('İndirilecek kaynak adresi bulunamadı.');
    return;
  }

  // Uzantıyı ham URL'den tespit et (.mp4 / .mkv)
  const extMatch = rawUrl.match(/\.([a-zA-Z0-9]{2,5})(?:\?|$)/);
  const extension = (item as MediaItem).containerExtension || (extMatch ? extMatch[1] : 'mp4');
  const fileName = sanitizeFileName(item.title);
  const safeExtension = String(extension || 'mp4').replace(/[^a-zA-Z0-9]/g, '').slice(0, 5) || 'mp4';
  const fullPath = `downloads/${fileName}.${safeExtension}`;

  if (isNative()) {
    try {
      await Filesystem.mkdir({
        path: 'downloads',
        directory: Directory.Data,
        recursive: true,
      }).catch(async (mkdirError: any) => {
        try { await Filesystem.stat({ path: 'downloads', directory: Directory.Data }); }
        catch { throw mkdirError; }
      });

      await new Promise<void>(async (resolve, reject) => {
        let lastBytes = 0;
        let lastTime = Date.now();
        let smoothedBytesPerSecond = 0;
        let settled = false;
        let listener: any;
        const finish = async (error?: Error) => {
          if (settled) return;
          settled = true;
          try { await listener?.remove(); } catch {}
          if (error) reject(error); else resolve();
        };
        try {
          listener = await NativeDownload.addListener('backgroundDownloadEvent', async (event: any) => {
            if (!event || (event.type !== 'cancelAll' && event.id !== item.id)) return;
            if (event.type === 'progress') {
              const bytes = Number(event.bytes || 0);
              const contentLength = Number(event.total || event.contentLength || 0);
              const percent = contentLength > 0 ? Math.round(bytes / contentLength * 100) : 0;
              const now = Date.now();
              const dt = (now - lastTime) / 1000;
              const delta = Math.max(0, bytes - lastBytes);
              const instantaneous = dt > 0 ? delta / dt : 0;
              smoothedBytesPerSecond = smoothedBytesPerSecond === 0 ? instantaneous : smoothedBytesPerSecond * 0.72 + instantaneous * 0.28;
              lastBytes = Math.max(lastBytes, bytes);
              lastTime = now;
              const speedMbps = smoothedBytesPerSecond * 8 / 1e6;
              const remaining = contentLength > 0 ? Math.max(0, contentLength - bytes) : 0;
              const etaSeconds = smoothedBytesPerSecond > 0 && remaining > 0 ? remaining / smoothedBytesPerSecond : 0;
              const eta = contentLength <= 0 ? 'Boyut bekleniyor' : etaSeconds > 0 ? formatEta(etaSeconds) : percent >= 100 ? 'Tamamlanıyor' : 'Hesaplanıyor';
              onProgress(Math.min(percent, 100), bytes / 1e9, Math.round(speedMbps * 10) / 10, eta, contentLength > 0 ? contentLength / 1e9 : undefined);
            } else if (event.type === 'done') {
              try {
                const savedPath = String(event.path || fullPath);
                const info = await Filesystem.stat({ path: savedPath, directory: Directory.Data });
                if (!Number(info.size || 0)) throw new Error('İndirilen dosya boş görünüyor.');
                const uri = await Filesystem.getUri({ path: savedPath, directory: Directory.Data });
                if (!uri.uri || !uri.uri.startsWith('file://')) throw new Error('Yerel dosya adresi doğrulanamadı.');
                onDone(Capacitor.convertFileSrc(uri.uri), savedPath, uri.uri);
                await finish();
              } catch (e: any) { await finish(new Error(e?.message || 'İndirilen dosya doğrulanamadı.')); }
            } else if (event.type === 'error') {
              await finish(new Error(event.extra || 'İndirme başarısız.'));
            } else if (event.type === 'cancelAll') {
              await finish(new Error('İndirme iptal edildi.'));
            }
          });
          await NativeDownload.enqueue({ id: item.id, url: rawUrl, path: fullPath, title: item.title });
        } catch (e: any) {
          await finish(new Error(e?.message || 'Arka plan indirmesi başlatılamadı.'));
        }
      });
    } catch (err: any) {
      onError(`İndirme başarısız: ${err?.message || String(err)}`);
    }
  } else {
    // WEB (localhost): tarayıcı indirmesi, proxy üzerinden
    const a = document.createElement('a');
    a.href = `/api/iptv/proxy?url=${encodeURIComponent(rawUrl)}`;
    a.download = `${fileName}.${extension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    onDone(''); // Web'de localUrl yok
  }
}


// Capacitor Filesystem'in progress olayı platform genelinde yayıldığından
// indirmeleri tek tek yürütüp ilerleme olaylarının karışmasını önler.
type DownloadTask = {
  id: string;
  item: DownloadItem | MediaItem;
  onProgress: (progress: number, downloadedGb: number, speedMbps: number, eta: string, totalSizeGb?: number) => void;
  onDone: (localUrl: string, relativePath?: string, fileUri?: string) => void;
  onError: (error: string) => void;
  onState?: (status: 'queued' | 'downloading', queueOrder?: number) => void;
};
const downloadQueue: DownloadTask[] = [];
const cancelledDownloadIds = new Set<string>();
const activeDownloadIds = new Set<string>();
let queueRunning = false;

// Bildirimdeki "Tüm indirmeleri iptal et" eylemi JS kuyruğunu da boşaltır.
if (isNative()) {
  void NativeDownload.addListener('backgroundDownloadEvent', (event: any) => {
    if (event?.type !== 'cancelAll') return;
    downloadQueue.splice(0, downloadQueue.length);
    for (const id of activeDownloadIds) cancelledDownloadIds.add(id);
  }).catch((error: any) => console.warn('[DownloadManager] Bildirim dinleyicisi kurulamadı.', error));
}

export function startDownload(
  item: DownloadItem | MediaItem,
  onProgress: DownloadTask['onProgress'],
  onDone: DownloadTask['onDone'],
  onError: DownloadTask['onError'],
  onState?: DownloadTask['onState']
): void {
  const id = item.id;
  // Aynı içerik için eski bir iptal işareti kalmışsa yeni indirmeyi engelleme.
  cancelledDownloadIds.delete(id);
  const task: DownloadTask = { id, item, onProgress, onDone, onError, onState };
  downloadQueue.push(task);
  onState?.('queued', downloadQueue.length + (queueRunning ? 1 : 0));
  refreshQueuePositions();
  void processDownloadQueue();
}

/** Kuyruk sırasını ekrandaki sırayla senkron tutar. */
function refreshQueuePositions(): void {
  downloadQueue.forEach((task, index) => task.onState?.('queued', index + 1));
}

/** Bekleyen görevi kuyruğun başına alır; aktif indirme kesilmez. */
export function promoteDownload(id: string): boolean {
  const index = downloadQueue.findIndex((task) => task.id === id);
  if (index < 0) return false;
  const [task] = downloadQueue.splice(index, 1);
  downloadQueue.unshift(task);
  refreshQueuePositions();
  return true;
}

/** Bildirim panelinden tüm indirmeler iptal edildiğinde JS kuyruğunu da temizler. */
export function cancelAllDownloads(): void {
  downloadQueue.splice(0, downloadQueue.length);
  for (const id of activeDownloadIds) cancelledDownloadIds.add(id);
  if (isNative()) void NativeDownload.cancelAll().catch(() => {});
  refreshQueuePositions();
}

/** Bekleyen görevi kuyruktan kaldırır; aktif Filesystem indirmesinde callback'ler bastırılır. */
export function cancelDownload(id: string): void {
  let removedFromQueue = false;
  for (let i = downloadQueue.length - 1; i >= 0; i--) {
    if (downloadQueue[i].id === id) { downloadQueue.splice(i, 1); removedFromQueue = true; }
  }
  if (activeDownloadIds.has(id)) {
    cancelledDownloadIds.add(id);
    if (isNative()) void NativeDownload.cancel({ id }).catch(() => {});
  }
  else if (removedFromQueue) cancelledDownloadIds.delete(id);
  refreshQueuePositions();
}

async function processDownloadQueue(): Promise<void> {
  if (queueRunning) return;
  queueRunning = true;
  try {
    while (downloadQueue.length) {
      const task = downloadQueue.shift()!;
      if (cancelledDownloadIds.has(task.id)) continue;
      task.onState?.('downloading');
      activeDownloadIds.add(task.id);
      refreshQueuePositions();
      try {
        await runSingleDownload(
          task.item,
          (...args) => { if (!cancelledDownloadIds.has(task.id)) task.onProgress(...args); },
          (...args) => { if (!cancelledDownloadIds.has(task.id)) task.onDone(...args); },
          (error) => { if (!cancelledDownloadIds.has(task.id)) task.onError(error); }
        );
      } catch (error: any) {
        if (!cancelledDownloadIds.has(task.id)) task.onError(error?.message || String(error) || 'İndirme başarısız');
      } finally {
        activeDownloadIds.delete(task.id);
        cancelledDownloadIds.delete(task.id);
      }
    }
  } finally {
    queueRunning = false;
    if (downloadQueue.length) void processDownloadQueue();
  }
}
