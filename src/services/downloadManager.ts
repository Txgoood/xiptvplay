import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { DownloadItem, MediaItem } from '../types';

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

    const progressHandler = (progress: any) => {
      const bytes = Number(progress.bytes ?? progress.receivedBytes ?? 0);
      const contentLength = Number(progress.contentLength ?? progress.totalBytes ?? 0);
      const percent = contentLength > 0 ? Math.round((bytes / contentLength) * 100) : 0;
      const downloadedGb = bytes / 1e9;

      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      const deltaBytes = Math.max(0, bytes - lastBytes);
      const instantaneousBps = dt > 0 ? deltaBytes / dt : 0;
      // ETA tek bir yavaş/hızlı ölçümle zıplamasın diye son ölçümleri yumuşat.
      smoothedBytesPerSecond = smoothedBytesPerSecond === 0
        ? instantaneousBps
        : (smoothedBytesPerSecond * 0.72) + (instantaneousBps * 0.28);
      const speedMbps = (smoothedBytesPerSecond * 8) / 1e6;
      lastBytes = Math.max(lastBytes, bytes);
      lastTime = now;

      const remainingBytes = contentLength > 0 ? Math.max(0, contentLength - bytes) : 0;
      const etaSec = smoothedBytesPerSecond > 0 && remainingBytes > 0 ? remainingBytes / smoothedBytesPerSecond : 0;
      const eta = contentLength <= 0 ? 'Boyut bekleniyor' : (etaSec > 0 ? formatEta(etaSec) : (percent >= 100 ? 'Tamamlanıyor' : 'Hesaplanıyor'));

      onProgress(Math.min(percent, 100), downloadedGb, Math.round(speedMbps * 10) / 10, eta, contentLength > 0 ? contentLength / 1_000_000_000 : undefined);
    };

    let progressListener: any = null;
    try {
      // ENOENT önlemek için hedef klasörü indirmeden önce oluştur.
      await Filesystem.mkdir({
        path: 'downloads',
        directory: Directory.Data,
        recursive: true,
      }).catch(async (mkdirError: any) => {
        // Bazı sürümlerde klasör zaten varsa mkdir hata verebilir; varlığını kontrol et.
        try {
          await Filesystem.stat({ path: 'downloads', directory: Directory.Data });
        } catch {
          throw mkdirError;
        }
      });

      progressListener = await Filesystem.addListener('progress', progressHandler);

      const result = await Filesystem.downloadFile({
        url: rawUrl,
        path: fullPath,
        directory: Directory.Data,
        recursive: true,
        progress: true,
      });

      if (progressListener) { try { await progressListener.remove(); } catch {} }

      // Use the requested relative path, not result.path: on some Capacitor versions
      // result.path can be an absolute native path that Filesystem.stat/getUri cannot
      // resolve relative to Directory.Data.
      const savedPath = fullPath;
      const fileInfo = await Filesystem.stat({ path: savedPath, directory: Directory.Data });
      const actualBytes = Number(fileInfo.size || 0);
      if (!Number.isFinite(actualBytes) || actualBytes <= 0) {
        throw new Error('İndirilen dosya boş görünüyor; dosya doğrulanamadı.');
      }
      const uri = await Filesystem.getUri({ path: savedPath, directory: Directory.Data });
      if (!uri.uri || !uri.uri.startsWith('file://')) {
        throw new Error('Yerel dosya adresi doğrulanamadı.');
      }
      const localUrl = Capacitor.convertFileSrc(uri.uri);
      onDone(localUrl, savedPath, uri.uri);
    } catch (err: any) {
      if (progressListener) { try { await progressListener.remove(); } catch {} }
      const message = err?.message || String(err) || 'İndirme başarısız';
      onError(`İndirme başarısız: ${message}`);
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
let queueRunning = false;

export function startDownload(
  item: DownloadItem | MediaItem,
  onProgress: DownloadTask['onProgress'],
  onDone: DownloadTask['onDone'],
  onError: DownloadTask['onError'],
  onState?: DownloadTask['onState']
): void {
  const id = item.id;
  // İptal isteği startDownload'dan hemen önce geldiyse görevi hiç kuyruğa alma.
  if (cancelledDownloadIds.has(id)) return;
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

/** Kuyrukta bekleyen indirmeyi gerçekten kaldırır; henüz başlamamış görev ağ kullanmaz. */
export function cancelDownload(id: string): void {
  cancelledDownloadIds.add(id);
  for (let i = downloadQueue.length - 1; i >= 0; i--) {
    if (downloadQueue[i].id === id) downloadQueue.splice(i, 1);
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
      }
    }
  } finally {
    queueRunning = false;
    if (downloadQueue.length) void processDownloadQueue();
  }
}
