import { Capacitor, registerPlugin } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { DownloadItem, MediaItem } from '../types';
import { DownloadNotifications } from './downloadNotifications';
type NativeDownloadBridge = {
  downloadFile(options: { id: string; url: string; path: string; title: string }): Promise<{ path: string; fileUri: string; bytes: number }>;
  cancelDownload(options: { id: string }): Promise<void>;
  pauseDownload(options: { id: string }): Promise<void>;
  resumeDownload(options: { id: string }): Promise<void>;
  addListener(eventName: 'downloadProgress', listenerFunc: (event: { id: string; bytes: number; contentLength: number }) => void): Promise<{ remove: () => Promise<void> }>;
};
const NativeDownload = registerPlugin<NativeDownloadBridge>('NativeDownload');


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
      // Android bildirimiyle ayni yuzde hesaplama kuralini kullan.
      const percent = contentLength > 0 ? Math.floor((bytes / contentLength) * 100) : 0;
      const downloadedGb = bytes / 1e9;

      const now = Date.now();
      const dt = (now - lastTime) / 1000;
      const deltaBytes = Math.max(0, bytes - lastBytes);
      const instantaneousBps = dt > 0 ? deltaBytes / dt : 0;
      // ETA tek bir yavaş/hızlı ölçümle zıplamasın diye son ölçümleri yumuşat.
      smoothedBytesPerSecond = smoothedBytesPerSecond === 0
        ? instantaneousBps
        : (smoothedBytesPerSecond * 0.72) + (instantaneousBps * 0.28);
      // Arayuzde MB/sn gosteriliyor: bit/saniye degil, bayt/saniye hesapla.
      const speedMbps = smoothedBytesPerSecond / 1e6;
      lastBytes = Math.max(lastBytes, bytes);
      lastTime = now;

      const remainingBytes = contentLength > 0 ? Math.max(0, contentLength - bytes) : 0;
      const etaSec = smoothedBytesPerSecond > 0 && remainingBytes > 0 ? remainingBytes / smoothedBytesPerSecond : 0;
      const eta = contentLength <= 0 ? 'Boyut bekleniyor' : (etaSec > 0 ? formatEta(etaSec) : (percent >= 100 ? 'Tamamlanıyor' : 'Hesaplanıyor'));

      onProgress(Math.min(percent, 100), downloadedGb, Math.round(speedMbps * 10) / 10, eta, contentLength > 0 ? contentLength / 1_000_000_000 : undefined);
    };

    let progressListener: any = null;
    await DownloadNotifications.startForegroundDownload(item.title);
    try {
      await Filesystem.mkdir({ path: 'downloads', directory: Directory.Data, recursive: true }).catch(async (mkdirError: any) => {
        try { await Filesystem.stat({ path: 'downloads', directory: Directory.Data }); }
        catch { throw mkdirError; }
      });

      progressListener = await NativeDownload.addListener('downloadProgress', (event) => {
        if (event.id !== item.id) return;
        progressHandler(event);
      });

      let result: any;
      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          result = await NativeDownload.downloadFile({ id: item.id, url: rawUrl, path: fullPath, title: item.title });
          break;
        } catch (downloadError: any) {
          const message = String(downloadError?.message || downloadError || '');
          const transient = /unable to resolve host|no address associated with hostname|unknownhostexception|connection abort|connection reset|software caused connection abort|timeout|timed out|network|failed to connect|unexpected end|(?:HTTP\s*|response code\s*|server returned\s*)?(?:429|500|502|503|504)/i.test(message);
          if (cancelledDownloadIds.has(item.id) || attempt >= 2 || !transient) throw downloadError;
          try { await Filesystem.deleteFile({ path: fullPath, directory: Directory.Data }); } catch {}
          const waitMs = 1200 * (attempt + 1);
          console.warn(`[DownloadManager] Temporary network error; retrying in ${waitMs}ms: `, message);
          await new Promise(resolve => setTimeout(resolve, waitMs));
        }
      }
      if (cancelledDownloadIds.has(item.id)) throw new Error('İndirme iptal edildi.');
      if (!result) throw new Error('İndirme tamamlanamadı; bağlantı hatası sonrası tekrar denendi.');
      if (progressListener) { try { await progressListener.remove(); } catch {} }
      const savedPath = result.path || fullPath;
      const fileInfo = await Filesystem.stat({ path: savedPath, directory: Directory.Data });
      const actualBytes = Number(fileInfo.size || result.bytes || 0);
      if (!Number.isFinite(actualBytes) || actualBytes <= 0) throw new Error('İndirilen dosya boş görünüyor; dosya doğrulanamadı.');
      const uri = result.fileUri ? { uri: result.fileUri } : await Filesystem.getUri({ path: savedPath, directory: Directory.Data });
      if (!uri.uri || !uri.uri.startsWith('file://')) throw new Error('Yerel dosya adresi doğrulanamadı.');
      const localUrl = Capacitor.convertFileSrc(uri.uri);
      onDone(localUrl, savedPath, uri.uri);
    } catch (err: any) {
      try { await NativeDownload.cancelDownload({ id: item.id }); } catch {}
      // Sirada baska bolum varsa foreground servisini burada kapatma.
      // Kuyruk tamamen bittiginde processDownloadQueue servisi durdurur.
      if (progressListener) { try { await progressListener.remove(); } catch {} }
      const message = String(err?.message || err || 'İndirme başarısız');
      if (/cancel(?:led|ed)?|canceled|user.?abort|aborted by user|iptal/i.test(message) || cancelledDownloadIds.has(item.id)) {
        try { await Filesystem.deleteFile({ path: fullPath, directory: Directory.Data }); } catch {}
        onError('İndirme iptal edildi.');
        return;
      }
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
  onState?: (status: 'queued' | 'downloading' | 'paused', queueOrder?: number) => void;
};
const downloadQueue: DownloadTask[] = [];
const cancelledDownloadIds = new Set<string>();
const activeDownloadIds = new Set<string>();
const activeTasks = new Map<string, DownloadTask>();
const pausedQueuedTasks = new Map<string, DownloadTask>();
const pausedActiveIds = new Set<string>();
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

/** Transfer pause: keep downloaded bytes and current native stream alive. */
export async function pauseDownload(id: string): Promise<boolean> {
  if (pausedActiveIds.has(id) || pausedQueuedTasks.has(id)) return true;
  const index = downloadQueue.findIndex(task => task.id === id);
  if (index >= 0) {
    const [task] = downloadQueue.splice(index, 1);
    pausedQueuedTasks.set(id, task);
    task.onState?.('paused');
    refreshQueuePositions();
    return true;
  }
  const task = activeTasks.get(id);
  if (!task || !isNative()) return false;
  try {
    await NativeDownload.pauseDownload({ id });
    pausedActiveIds.add(id);
    task.onState?.('paused');
    return true;
  } catch (error) {
    console.warn('[Downloads] Pause failed:', error);
    return false;
  }
}

export async function resumeDownload(id: string): Promise<boolean> {
  const queued = pausedQueuedTasks.get(id);
  if (queued) {
    pausedQueuedTasks.delete(id);
    downloadQueue.unshift(queued);
    queued.onState?.('queued', 1);
    refreshQueuePositions();
    void processDownloadQueue();
    return true;
  }
  const task = activeTasks.get(id);
  if (!task || !pausedActiveIds.has(id)) return false;
  try {
    await NativeDownload.resumeDownload({ id });
    pausedActiveIds.delete(id);
    task.onState?.('downloading');
    return true;
  } catch (error) {
    console.warn('[Downloads] Resume failed:', error);
    return false;
  }
}

export async function pauseAllDownloads(): Promise<void> {
  for (const id of [...downloadQueue.map(task => task.id), ...activeDownloadIds]) {
    await pauseDownload(id);
  }
}

export async function resumeAllDownloads(): Promise<void> {
  for (const id of [...pausedQueuedTasks.keys(), ...pausedActiveIds]) {
    await resumeDownload(id);
  }
}

/** Bekleyen görevi kuyruktan kaldırır; aktif indirmeyi durdurur. */
export function cancelDownload(id: string): void {
  const pausedQueued = pausedQueuedTasks.get(id);
  if (pausedQueued) {
    pausedQueuedTasks.delete(id);
    pausedQueued.onError('İndirme iptal edildi.');
  }
  pausedActiveIds.delete(id);
  let removedFromQueue = false;
  for (let i = downloadQueue.length - 1; i >= 0; i--) {
    if (downloadQueue[i].id === id) { downloadQueue.splice(i, 1); removedFromQueue = true; }
  }
  if (activeDownloadIds.has(id)) {
    cancelledDownloadIds.add(id);
    void NativeDownload.cancelDownload({ id }).catch(() => {});
    const activeTask = activeTasks.get(id);
    if (activeTask) activeTask.onError('İndirme iptal edildi.');
  } else if (removedFromQueue) {
    cancelledDownloadIds.delete(id);
  }
  refreshQueuePositions();
}

/** Bildirim panelindeki toplu iptal: kuyruktakileri kaldırır, aktif yerel indirmeyi durdurur. */
export function cancelAllDownloads(): void {
  const queued = downloadQueue.splice(0, downloadQueue.length);
  queued.push(...pausedQueuedTasks.values());
  pausedQueuedTasks.clear();
  queued.forEach((task) => {
    cancelledDownloadIds.delete(task.id);
    task.onError('İndirme iptal edildi.');
  });
  Array.from(activeDownloadIds).forEach((id) => cancelDownload(id));
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
      activeTasks.set(task.id, task);
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
        activeTasks.delete(task.id);
        pausedActiveIds.delete(task.id);
        cancelledDownloadIds.delete(task.id);
      }
      // Küçük bir ara, özellikle aynı Xtream sunucusundan art arda gelen
      // bölüm indirmelerinde bağlantı/ilerleme dinleyicilerinin kapanmasına fırsat verir.
      if (downloadQueue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 300));
      }
    }
  } finally {
    queueRunning = false;
    if (downloadQueue.length) {
      // Kuyrukta başka dosyalar varsa foreground servisini açık tut; uygulama arka plandayken sıradaki bölüm de başlasın.
      void processDownloadQueue();
    } else {
      // Foreground servisini yalnızca bütün kuyruk bittiğinde kapat.
      await DownloadNotifications.stopForegroundDownload();
    }
  }
}
