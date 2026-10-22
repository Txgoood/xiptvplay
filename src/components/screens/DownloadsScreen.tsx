import React, { useState } from 'react';
import { DownloadItem, SystemStats } from '../../types';
import {
  Gauge,
  Download,
  PauseCircle,
  Play,
  Trash2,
  Wifi,
  Check,
  CheckCircle2,
  ShieldCheck,
  Share2,
  FolderOpen,
  Zap,
  Clock,
  ArrowUpToLine,
  X,
  ArrowDown,
  Pause,
  ChevronDown,
} from 'lucide-react';

interface DownloadsScreenProps {
  downloads: DownloadItem[];
  stats: SystemStats;
  onPlayMedia: (download: DownloadItem) => void;
  onOpenDownloadedFile: (download: DownloadItem) => void;
  onPauseAll: () => void;
  onResumeAll: () => void;
  onClearCompleted: () => void;
  onTogglePauseItem: (id: string) => void;
  onCancelItem: (id: string) => void;
  onPromoteItem: (id: string) => void;
}

export const DownloadsScreen: React.FC<DownloadsScreenProps> = ({
  downloads,
  stats,
  onPlayMedia,
  onOpenDownloadedFile,
  onPauseAll,
  onResumeAll,
  onClearCompleted,
  onTogglePauseItem,
  onCancelItem,
  onPromoteItem,
}) => {
  const isAnyDownloading = downloads.some((d) => d.status === 'downloading');
  const liveSpeed = downloads.filter(d => d.status === 'downloading').reduce((sum, d) => sum + (d.speedMbps || 0), 0).toFixed(1);
  const [shareSuccess, setShareSuccess] = useState<string | null>(null);



  const handleExport = (item: DownloadItem) => {
    setShareSuccess(`"${item.title}" dışa aktarıldı: ${item.offlinePath || 'İndirilenler klasörü'}`);
    setTimeout(() => setShareSuccess(null), 3000);
  };

  const activeCount = downloads.filter((d) => d.status === 'downloading' || d.status === 'queued').length;
  const formatFileSize = (sizeGb: number) => {
    const sizeMb = Math.round((Number(sizeGb) || 0) * 1000);
    return sizeMb < 1000 ? `${sizeMb} MB` : `${(sizeMb / 1000).toFixed(2)} GB`;
  };

  const totalDownloadedGb = downloads.reduce((acc, curr) => acc + (curr.downloadedGb || 0), 0);
  const totalArchiveGb = parseFloat(totalDownloadedGb.toFixed(1));

  // Eski kayıtlar için başlıktaki S01E02 biçimini de okuyarak gruplamayı geriye dönük uyumlu tut.
  const getEpisodeGrouping = (item: DownloadItem) => {
    const match = item.title.match(/^(.*?)\s*-\s*S(\d{1,2})E(\d{1,2}):\s*(.*)$/i);
    const seriesTitle = item.seriesTitle || (match ? match[1].trim() : undefined);
    const seasonNumber = typeof item.seasonNumber === 'number' ? item.seasonNumber : (match ? Number(match[2]) : undefined);
    const episodeNumber = typeof item.episodeNumber === 'number' ? item.episodeNumber : (match ? Number(match[3]) : undefined);
    const episodeTitle = item.episodeTitle || (match ? match[4].trim() : item.title);
    return { seriesTitle, seasonNumber, episodeNumber, episodeTitle };
  };

  const groupedDownloads = (() => {
    const groups = new Map<string, { key: string; label: string; kind: 'series' | 'movies' | 'other'; seriesTitle?: string; seasonNumber?: number; items: DownloadItem[] }>();
    downloads.forEach((item) => {
      if (item.type === 'movie') {
        const key = '__movies__';
        if (!groups.has(key)) groups.set(key, { key, label: 'Filmler', kind: 'movies', items: [] });
        groups.get(key)!.items.push(item);
        return;
      }
      const episode = item.type === 'series' ? getEpisodeGrouping(item) : null;
      if (episode?.seriesTitle) {
        const season = episode.seasonNumber ?? 0;
        const key = `series:${episode.seriesTitle.toLocaleLowerCase('tr')}:${season}`;
        const label = season > 0 ? `Sezon ${season}` : 'Sezon bilgisi yok';
        if (!groups.has(key)) groups.set(key, { key, label, kind: 'series', seriesTitle: episode.seriesTitle, seasonNumber: season, items: [] });
        groups.get(key)!.items.push(item);
      } else {
        const key = '__other__';
        if (!groups.has(key)) groups.set(key, { key, label: 'Diğer indirmeler', kind: 'other', items: [] });
        groups.get(key)!.items.push(item);
      }
    });
    return Array.from(groups.values())
      .sort((a, b) => {
        const order = (g: typeof a) => g.kind === 'series' ? 0 : g.kind === 'movies' ? 1 : 2;
        const kindDiff = order(a) - order(b);
        if (kindDiff !== 0) return kindDiff;
        const seriesDiff = (a.seriesTitle || '').localeCompare(b.seriesTitle || '', 'tr');
        if (seriesDiff !== 0) return seriesDiff;
        return (a.seasonNumber || 0) - (b.seasonNumber || 0);
      })
      .map((group) => ({
        ...group,
        items: group.items.sort((a, b) => {
          const ea = getEpisodeGrouping(a);
          const eb = getEpisodeGrouping(b);
          return (ea.episodeNumber ?? 0) - (eb.episodeNumber ?? 0);
        }),
      }));
  })();

  return (
    <div className="flex flex-col w-full max-w-xl mx-auto px-4 pt-2 pb-28 gap-4 select-none">
      {/* Toast Notification Container */}
      {shareSuccess && (
        <div className="fixed top-20 inset-x-0 flex justify-center z-50 pointer-events-none px-4">
          <div className="px-4 py-2 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold shadow-2xl border border-white/20 pointer-events-auto">
            {shareSuccess}
          </div>
        </div>
      )}

      {/* Storage Telemetry & Engine Overview */}
      <div className="w-full bg-[#1c1b1d] rounded-2xl p-4 shadow-xl relative overflow-hidden border border-white/5">
        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-[#00f0ff]/10 blur-3xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-32 h-32 rounded-full bg-[#0566d9]/15 blur-2xl pointer-events-none"></div>
        <div className="flex items-center justify-between gap-2 mb-4 relative z-10">
          <div className="flex items-center gap-2">
            <Gauge className="w-5 h-5 text-[#00dbe9] shrink-0" />
            <span className="font-headline text-[15px] font-bold text-[#e5e1e4] tracking-normal">
              Hafıza &amp; İndirme Motoru
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#65f2b5]/15 text-[#4edea3] font-headline text-[11px] font-semibold shadow-sm">
            <span className={`w-2 h-2 rounded-full bg-[#4edea3] inline-block ${isAnyDownloading ? 'animate-ping' : ''}`}></span>
            <span>{isAnyDownloading ? 'Turbo Aktif' : 'Hazır'}</span>
          </div>
        </div>

        {/* Ring Widget + Storage Breakdown */}
        <div className="grid grid-cols-12 gap-2 items-center relative z-10">
          <div className="col-span-5 flex flex-col items-center justify-center relative">
            <div className="relative w-28 h-28 flex items-center justify-center">
              <svg className="w-full h-full -rotate-90" viewBox="0 0 100 100">
                <circle
                  className="text-[#353437]"
                  cx="50"
                  cy="50"
                  fill="none"
                  r="40"
                  stroke="currentColor"
                  strokeWidth="8"
                ></circle>
                <circle
                  className="text-[#adc6ff]/40"
                  cx="50"
                  cy="50"
                  fill="none"
                  r="40"
                  stroke="currentColor"
                  strokeDasharray="251.2"
                  strokeDashoffset="180.8"
                  strokeLinecap="round"
                  strokeWidth="8"
                ></circle>
                {totalArchiveGb > 0 && (
                  <circle
                    className="text-[#00f0ff] drop-shadow-[0_0_8px_rgba(0,240,255,0.7)]"
                    cx="50"
                    cy="50"
                    fill="none"
                    r="40"
                    stroke="currentColor"
                    strokeDasharray="251.2"
                    strokeDashoffset={`${251.2 - (251.2 * Math.min(totalArchiveGb / stats.totalStorageGb, 1))}`}
                    strokeLinecap="round"
                    strokeWidth="8.5"
                  ></circle>
                )}
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="font-headline text-[22px] text-[#7df4ff] font-bold leading-none">
                  {totalArchiveGb > 0 ? `${Math.round((totalArchiveGb / stats.totalStorageGb) * 100)}%` : '0%'}
                </span>
                <span className="font-headline text-[9px] text-[#b9cacb] uppercase tracking-wider mt-0.5 font-bold">
                  xiptvplay
                </span>
              </div>
            </div>
          </div>

          {/* Storage Metrics Data Grid */}
          <div className="col-span-7 flex flex-col gap-1.5 pl-1">
            <div className="bg-[#201f21]/70 rounded-xl p-2 flex items-center justify-between border border-white/5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[#00f0ff] shadow-[0_0_6px_#00f0ff] shrink-0"></span>
                <span className="text-[12px] text-[#b9cacb] truncate font-medium">IPTV Arşivi</span>
              </div>
              <span className="font-headline text-[13px] font-bold text-[#7df4ff] shrink-0">
                {totalArchiveGb} GB
              </span>
            </div>
            <div className="bg-[#201f21]/70 rounded-xl p-2 flex items-center justify-between border border-white/5">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-[#4edea3] shrink-0"></span>
                <span className="text-[12px] text-[#b9cacb] truncate font-medium">Kullanılabilir Boş</span>
              </div>
              <span className="font-headline text-[13px] font-bold text-[#4edea3] shrink-0">
                {parseFloat((stats.totalStorageGb - totalArchiveGb).toFixed(1))} GB
              </span>
            </div>
            <div className="bg-[#201f21]/40 rounded-xl px-2 py-1 flex items-center justify-between border border-white/5">
              <span className="text-[10px] text-[#849495]">Toplam Depolama</span>
              <span className="text-[10px] text-[#b9cacb] font-mono font-semibold">
                {stats.totalStorageGb} GB
              </span>
            </div>
          </div>
        </div>

        {/* Live Telemetry Stream Strip */}
        <div className="mt-4 pt-2.5 bg-[#0e0e10]/80 rounded-xl p-2.5 flex items-center justify-between gap-2 relative z-10 shadow-inner border border-white/5">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-8 h-8 rounded-full bg-[#0566d9]/20 flex items-center justify-center text-[#d8e2ff] shrink-0">
              <Download className="w-4 h-4 text-[#d8e2ff]" />
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex items-center gap-1">
                <span className="font-headline text-[14px] font-bold text-[#00f0ff]">
                  {liveSpeed} MB/s
                </span>
                <span className="text-[11px] text-[#b9cacb] truncate">(Turbo Motor)</span>
              </div>
              <span className="text-[11px] text-[#4edea3] flex items-center gap-1 truncate font-medium">
                <span className={`w-1.5 h-1.5 rounded-full ${isAnyDownloading ? 'bg-[#4edea3] animate-pulse' : 'bg-[#849495]'}`}></span>
                {isAnyDownloading ? `${stats.parallelSockets} paralel soket hattı stabil` : 'Kuyruk beklemede'}
              </span>
            </div>
          </div>
          <div className="flex items-center shrink-0">
            <span className="px-2 py-0.5 rounded-full bg-[#2a2a2c] text-[#e5e1e4] font-headline text-[10px] tracking-wider font-mono border border-white/5">
              P2P+CDN
            </span>
          </div>
        </div>
      </div>

      {/* Global Action Toolbar */}
      <div className="flex items-center justify-between gap-2 px-1">
        <div className="flex items-center gap-2">
          <button
            onClick={onPauseAll}
            disabled={downloads.length === 0}
            className="h-10 px-3.5 rounded-full bg-[#201f21] hover:bg-[#2a2a2c] text-[#e5e1e4] hover:text-[#00f0ff] transition-all flex items-center gap-1.5 border border-white/5 shadow-md active:scale-95 cursor-pointer text-xs font-semibold disabled:opacity-40"
          >
            <PauseCircle className="w-4 h-4 text-[#b9cacb]" />
            <span>Tümünü Duraklat</span>
          </button>
          <button
            onClick={onResumeAll}
            disabled={downloads.length === 0}
            className="h-10 px-4 rounded-full bg-[#00f0ff] text-[#00363a] hover:brightness-110 transition-all flex items-center gap-1.5 shadow-[0_0_12px_rgba(0,240,255,0.4)] active:scale-95 cursor-pointer font-headline text-xs font-bold disabled:opacity-40"
          >
            <Play className="w-4 h-4 fill-current" />
            <span>Devam Et</span>
          </button>
        </div>
        <button
          onClick={onClearCompleted}
          disabled={downloads.length === 0}
          className="h-10 px-3 rounded-full text-[#b9cacb] hover:text-[#ffb4ab] transition-colors flex items-center gap-1 active:scale-95 cursor-pointer text-xs font-medium disabled:opacity-40"
        >
          <Trash2 className="w-4 h-4" />
          <span>Temizle</span>
        </button>
      </div>

      {/* Queue Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-1.5">
          <span className="font-headline text-[15px] font-bold text-[#e5e1e4]">İndirme Sırası</span>
          <span className="w-5 h-5 rounded-full bg-[#0566d9] text-white font-headline text-[11px] flex items-center justify-center font-bold shadow">
            {activeCount}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[#b9cacb] font-headline text-[11px]">
          <Wifi className="w-3.5 h-3.5 text-[#4edea3]" />
          <span>Sadece Wi-Fi: Açık</span>
        </div>
      </div>

      {/* Download List Container */}
      <div className="flex flex-col gap-3">
        {downloads.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-8 bg-[#1c1b1d] rounded-2xl border border-white/5 text-center my-2 gap-3">
            <div className="w-14 h-14 rounded-full bg-[#201f21] flex items-center justify-center text-[#849495] shadow-inner border border-white/5">
              <Download className="w-6 h-6 text-[#849495]" />
            </div>
            <div className="flex flex-col gap-1">
              <h3 className="font-headline text-base font-bold text-[#e5e1e4]">
                Henüz İndirilen İçerik Yok
              </h3>
              <p className="text-xs text-[#b9cacb] max-w-sm leading-relaxed">
                Katalog ekranından canlı yayın harici film ve dizi bölümlerini çevrimdışı izlemek için indirebilirsiniz.
              </p>
            </div>
          </div>
        ) : (
          groupedDownloads.map((group) => (
            <details key={group.key} open className="rounded-2xl border border-white/5 bg-[#171719] overflow-hidden">
              <summary className="list-none cursor-pointer flex items-center justify-between gap-3 px-3.5 py-3 bg-[#201f21] hover:bg-[#252426]">
                <div className="flex flex-col min-w-0">
                  {group.kind === 'series' && <span className="text-[10px] text-[#00dbe9] font-semibold uppercase tracking-wider">Dizi</span>}
                  <span className="font-headline text-[13px] font-bold text-[#e5e1e4] truncate">{group.kind === 'series' ? group.seriesTitle : group.label}</span>
                  {group.kind === 'series' && <span className="text-[11px] text-[#b9cacb]">{group.label}</span>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="px-2 py-1 rounded-full bg-[#0566d9]/20 text-[#adc6ff] text-[10px] font-bold">{group.items.length} bölüm/öğe</span>
                  <ChevronDown className="w-4 h-4 text-[#b9cacb]" />
                </div>
              </summary>
              <div className="flex flex-col gap-3 p-2.5">
              {group.items.map((item) => {
            const isCompleted = item.status === 'completed';
            const isQueued = item.status === 'queued';
            const isPaused = item.status === 'paused';

            if (isCompleted) {
              return (
                <div
                  key={item.id}
                  className="w-full bg-[#1c1b1d] rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-md relative overflow-hidden border border-white/5"
                >
                  <div className="absolute left-0 inset-y-0 w-1 bg-[#4edea3]"></div>
                  <div className="flex gap-3 items-start pl-1">
                    <div className="relative w-16 h-16 rounded-xl bg-[#2a2a2c] overflow-hidden shrink-0 shadow border border-white/5">
                      <img
                        className="w-full h-full object-cover"
                        alt={item.title}
                        src={item.poster}
                      />
                      <div className="absolute bottom-1 right-1 w-4 h-4 rounded-full bg-[#65f2b5] flex items-center justify-center text-[#006d4a] shadow font-bold text-[10px]">
                        <Check className="w-3 h-3 text-[#006d4a]" />
                      </div>
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="px-1.5 py-0.5 rounded-full bg-[#65f2b5]/20 text-[#4edea3] font-headline text-[10px] font-bold flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-[#4edea3]" />
                          Tamamlandı ({formatFileSize(item.totalSizeGb)})
                        </span>
                        <span className="text-[11px] text-[#b9cacb] truncate">Çevrimdışı Hazır</span>
                      </div>
                      <h4 className="font-headline text-[14px] font-bold text-[#e5e1e4] mt-1 truncate">
                        {item.title}
                      </h4>
                      <span className="text-[11px] text-[#849495] truncate">{item.subtitle}</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-1 pt-1.5 pl-1 bg-[#201f21]/60 rounded-xl px-2.5 py-1.5 border border-white/5">
                    <div className="flex items-center gap-1 text-[#b9cacb] text-[11px] font-medium">
                      <ShieldCheck className="w-3.5 h-3.5 text-[#4edea3]" />
                      <span>MD5 Blok Onaylandı</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <button
                        onClick={() => handleExport(item)}
                        className="h-8 px-2.5 rounded-full bg-[#2a2a2c] text-[#b9cacb] hover:text-[#e5e1e4] transition-colors flex items-center gap-1 text-[11px] font-semibold cursor-pointer border border-white/5"
                        title="VLC veya Harici Oynatıcı ile Paylaş"
                      >
                        <Share2 className="w-3.5 h-3.5 text-[#b9cacb]" />
                        <span>Dışa Aktar</span>
                      </button>
                      <button
                        onClick={() => onOpenDownloadedFile(item)}
                        className="h-8 px-2.5 rounded-full bg-[#2a2a2c] text-[#b9cacb] hover:text-[#00f0ff] transition-colors flex items-center gap-1 text-[11px] font-semibold cursor-pointer border border-white/5"
                        title="Dosyanın kayıt yolunu göster"
                      >
                        <FolderOpen className="w-3.5 h-3.5" />
                        <span>Konumu Göster</span>
                      </button>
                      <button
                        onClick={() => onPlayMedia(item)}
                        className="h-8 px-3 rounded-full bg-[#00f0ff] text-[#00363a] hover:brightness-110 text-[11px] font-headline font-bold flex items-center gap-1 shadow-[0_0_8px_rgba(0,240,255,0.4)] active:scale-95 cursor-pointer"
                      >
                        <Play className="w-3.5 h-3.5 fill-current" />
                        <span>Uygulamada İzle</span>
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            if (isQueued) {
              return (
                <div
                  key={item.id}
                  className="w-full bg-[#1c1b1d] rounded-2xl p-3 flex flex-col gap-2 shadow-md opacity-90 hover:opacity-100 transition-opacity border border-white/5"
                >
                  <div className="flex gap-3 items-center">
                    <div className="relative w-14 h-20 rounded-xl bg-[#2a2a2c] overflow-hidden shrink-0 shadow border border-white/5">
                      <img
                        className="w-full h-full object-cover grayscale-[30%]"
                        alt={item.title}
                        src={item.poster}
                      />
                      <div className="absolute inset-0 bg-[#0e0e10]/40 flex items-center justify-center">
                        <Clock className="w-5 h-5 text-[#b9cacb]" />
                      </div>
                    </div>
                    <div className="flex flex-col flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="px-1.5 py-0.5 rounded-full bg-[#0566d9]/20 text-[#adc6ff] font-headline text-[10px] uppercase font-bold tracking-wider">
                          Sırada #{item.queueOrder || 3}
                        </span>
                        <span className="text-[11px] text-[#849495]">Bekliyor</span>
                      </div>
                      <h4 className="font-headline text-[14px] font-bold text-[#e5e1e4] truncate">
                        {item.title}
                      </h4>
                      <span className="text-[11px] text-[#b9cacb] truncate">{item.subtitle}</span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => onPromoteItem(item.id)}
                        className="w-8 h-8 rounded-full bg-[#201f21] hover:bg-[#2a2a2c] text-[#b9cacb] hover:text-[#00f0ff] transition-colors flex items-center justify-center cursor-pointer border border-white/5"
                        title="Önceliği Artır / Hemen Başlat"
                      >
                        <ArrowUpToLine className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => onCancelItem(item.id)}
                        className="w-8 h-8 rounded-full bg-[#201f21] hover:bg-[#93000a]/30 text-[#b9cacb] hover:text-[#ffb4ab] transition-colors flex items-center justify-center cursor-pointer border border-white/5"
                        title="İptal Et"
                      >
                        <X className="w-4 h-4 text-[#b9cacb]" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            }

            // Active or Paused item
            return (
              <div
                key={item.id}
                className="w-full bg-[#1c1b1d] rounded-2xl p-3.5 flex flex-col gap-2.5 shadow-lg relative overflow-hidden transition-all duration-300 border border-white/5"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-[#00f0ff]/5 via-transparent to-transparent pointer-events-none"></div>
                <div className="flex gap-3 items-start relative z-10">
                  <div className="relative w-16 h-24 rounded-xl bg-[#2a2a2c] overflow-hidden shrink-0 shadow-md border border-white/5">
                    <img
                      className="w-full h-full object-cover"
                      alt={item.title}
                      src={item.poster}
                    />
                    <div className="absolute top-1 left-1 px-1 py-0.5 rounded bg-[#0e0e10]/90 text-[#00f0ff] font-headline text-[9px] font-bold tracking-normal shadow">
                      {item.resolutionBadge}
                    </div>
                  </div>

                  <div className="flex flex-col flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-1">
                      <h3 className="font-headline text-[14px] font-bold text-[#e5e1e4] truncate">
                        {item.title}
                      </h3>
                      <span
                        className={`px-1.5 py-0.5 rounded-full text-[10px] font-headline font-bold shrink-0 ${
                          isPaused
                            ? 'bg-[#2a2a2c] text-[#849495]'
                            : 'bg-[#00f0ff]/20 text-[#7df4ff]'
                        }`}
                      >
                        {isPaused ? 'Duraklatıldı' : item.status === 'error' ? 'Hata' : item.statusLabel || 'İniyor'}
                      </span>
                    </div>
                    <span className="text-[11px] text-[#b9cacb] mt-0.5 truncate">{item.subtitle}</span>

                    <div className="flex items-center gap-1.5 mt-2 text-[#b9cacb] font-headline text-[11px] flex-wrap">
                      <span className="text-[#7df4ff] font-semibold">
                        {item.downloadedGb.toFixed(2)} GB / {item.totalSizeGb.toFixed(2)} GB
                      </span>
                      <span className="text-[#849495]">•</span>
                      <span className="text-[#4edea3] flex items-center gap-0.5">
                        <ArrowDown className="w-3 h-3 text-[#4edea3]" />
                        {isPaused || item.status === 'error' ? '0.0 MB/s' : `${item.speedMbps} MB/s`}
                      </span>
                      <span className="text-[#849495]">•</span>
                      <span>{isPaused ? 'Beklemede' : item.status === 'error' ? (item.errorMessage || 'İndirme başarısız') : `Kalan: ${item.eta}`}</span>
                    </div>

                    <div className="w-full h-2 rounded-full bg-[#2a2a2c] mt-2 overflow-hidden relative border border-white/5">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${
                          isPaused
                            ? 'bg-[#849495]'
                            : 'bg-gradient-to-r from-[#0566d9] via-[#00f0ff] to-[#7df4ff] shadow-[0_0_10px_rgba(0,240,255,0.7)]'
                        }`}
                        style={{ width: `${item.progressPercent}%` }}
                      ></div>
                    </div>
                  </div>

                  <div className="flex flex-col gap-1 shrink-0 z-10">
                    <button
                      onClick={() => onTogglePauseItem(item.id)}
                      className="w-9 h-9 rounded-full bg-[#201f21] hover:bg-[#2a2a2c] text-[#e5e1e4] hover:text-[#00f0ff] transition-all flex items-center justify-center active:scale-90 border border-white/5 cursor-pointer"
                      title={isPaused ? 'Devam Ettir' : 'Duraklat'}
                    >
                      {isPaused ? (
                        <Play className="w-4 h-4 fill-current text-[#00f0ff]" />
                      ) : (
                        <Pause className="w-4 h-4 text-[#e5e1e4]" />
                      )}
                    </button>
                    <button
                      onClick={() => onCancelItem(item.id)}
                      className="w-9 h-9 rounded-full bg-[#201f21] hover:bg-[#93000a]/30 text-[#b9cacb] hover:text-[#ffb4ab] transition-all flex items-center justify-center active:scale-90 border border-white/5 cursor-pointer"
                      title="İptal Et"
                    >
                      <X className="w-4 h-4 text-[#b9cacb]" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
              </div>
            </details>
          ))
        )}
      </div>
    </div>
  );
};
