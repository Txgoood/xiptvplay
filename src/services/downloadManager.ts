import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { registerPlugin } from '@capacitor/core';
import { DownloadItem, MediaItem } from '../types';

type NativeDownloadProgress = { id: string; bytes: number; contentLength: number };
type NativeDownloadResult = { path: string; fileUri: string; bytes: number };
type NativeDownloadPluginType = {
  downloadFile(options: { id: string; url: string; path: string }): Promise<NativeDownloadResult>;
  cancelDownload(options: { id: string }): Promise<void>;
  addListener(eventName: 'downloadProgress', listenerFunc: (event: NativeDownloadProgress) => void): Promise<{ remove: () => Promise<void> }>;
};
const NativeDownload = registerPlugin<NativeDownloadPluginType>('NativeDownload');

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
    let lastBytes = 0;
    let lastTime = Date.now();
    let smoothedBytesPerSecond = 0;
    let progressListener: { remove: () => Promise<void> } | null = null;
    try {
      const baseDir = 'downloads';
      await Filesystem.mkdir({ path: baseDir, directory: Directory.Data, recursive: true }).catch(async (mkdirError: any) => {
        try { await Filesystem.stat({ path: baseDir, directory: Directory.Data }); } catch { throw mkdirError; }
      });

      progressListener = await NativeDownload.addListener('downloadProgress', (event) => {
        if (event.id !== item.id) return;
        const bytes = Math.max(0, Number(event.bytes || 0));
        const contentLength = Math.max(0, Number(event.contentLength || 0));
        const percent = contentLength > 0 ? Math.min(100, Math.round((bytes / contentLength) * 100)) : 0;
        const now = Date.now();
        const dt = Math.max(0.001, (now - lastTime) / 1000);
        const instantaneousBps = Math.max(0, bytes - lastBytes) / dt;
        smoothedBytesPerSecond = smoothedBytesPerSecond === 0 ? instantaneousBps : smoothedBytesPerSecond * 0.72 + instantaneousBps * 0.28;
        const speedMbps = smoothedBytesPerSecond / 1e6;
        const remainingBytes = contentLength > 0 ? Math.max(0, contentLength - bytes) : 0;
        const etaSec = smoothedBytesPerSecond > 0 && remainingBytes > 0 ? remainingBytes / smoothedBytesPerSecond : 0;
        const eta = contentLength <= 0 ? 'Boyut bekleniyor' : etaSec > 0 ? formatEta(etaSec) : percent >= 100 ? 'Tamamlanıyor' : 'Hesaplanıyor';
        lastBytes = bytes;
        lastTime = now;
        onProgress(percent, bytes / 1e9, Math.round(speedMbps * 10) / 10, eta, contentLength > 0 ? contentLength / 1e9 : undefined);
      });

      // Kullanıcı, klasör hazırlanırken iptal etmiş olabilir.
      if (cancelledDownloadIds.has(item.id)) return;
      const result = await NativeDownload.downloadFile({ id: item.id, url: rawUrl, path: fullPath });
      if (progressListener) { try { await progressListener.remove(); } catch {} progressListener = null; }
      const savedPath = result.path || fullPath;
      const fileUri = result.fileUri;
      if (!fileUri || !fileUri.startsWith('file://') || !result.bytes || result.bytes <= 0) {
        throw new Error('İndirilen dosya doğrulanamadı.');
      }
      onProgress(100, result.bytes / 1e9, 0, 'Tamamlandı', result.bytes / 1e9);
      onDone(Capacitor.convertFileSrc(fileUri), savedPath, fileUri);
    } catch (err: any) {
      if (progressListener) { try { await progressListener.remove(); } catch {} }
      const message = err?.message || String(err) || 'İndirme başarısız';
      onError(message);
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

/** Bekleyen görevi kuyruktan kaldırır; aktif yerel indirme için native bağlantıyı da keser. */
export function cancelDownload(id: string): void {
  let removedFromQueue = false;
  for (let i = downloadQueue.length - 1; i >= 0; i--) {
    if (downloadQueue[i].id === id) {
      downloadQueue.splice(i, 1);
      removedFromQueue = true;
    }
  }
  if (activeDownloadIds.has(id)) {
    cancelledDownloadIds.add(id);
    void NativeDownload.cancelDownload({ id }).catch(() => {});
  } else if (removedFromQueue) {
    cancelledDownloadIds.delete(id);
  }
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
