import React, { useState, useEffect } from 'react';
import { MediaItem, Playlist, SeriesDetail, SeriesEpisode } from '../../types';
import { XtreamClientService } from '../../services/xtreamClient';
import { IptvService } from '../../services/iptvService';
import {
  X,
  Play,
  Download,
  Star,
  Calendar,
  Film,
  Layers,
  Clock,
  AlertCircle,
  Loader2,
  Tv,
  CheckCircle2,
} from 'lucide-react';

interface SeriesDetailModalProps {
  seriesItem: MediaItem | null;
  activePlaylist: Playlist | null;
  isOpen: boolean;
  onClose: () => void;
  onPlayEpisode: (episode: SeriesEpisode, seriesItem: MediaItem, nextEpisode?: SeriesEpisode) => void;
  onDownloadEpisode: (episode: SeriesEpisode, seriesItem: MediaItem) => void;
}

export const SeriesDetailModal: React.FC<SeriesDetailModalProps> = ({
  seriesItem,
  activePlaylist,
  isOpen,
  onClose,
  onPlayEpisode,
  onDownloadEpisode,
}) => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seriesDetail, setSeriesDetail] = useState<SeriesDetail | null>(null);
  const [selectedSeason, setSelectedSeason] = useState<number>(1);
  const [batchDownloadSuccess, setBatchDownloadSuccess] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !seriesItem) {
      setSeriesDetail(null);
      setError(null);
      return;
    }

    const loadSeriesInfo = async () => {
      setLoading(true);
      setError(null);

      // Use IptvService to intelligently bridge Xtream and M3U series info & bypass port blocks
      const res = await IptvService.fetchSeriesDetail(seriesItem, activePlaylist);

      if (res.success && res.seriesDetail) {
        setSeriesDetail(res.seriesDetail);
        if (res.seriesDetail.seasons.length > 0) {
          setSelectedSeason(res.seriesDetail.seasons[0].seasonNumber);
        } else {
          setSelectedSeason(1);
        }
      } else {
        setError(res.error || 'Dizi sezonları ve bölümleri sunucudan alınamadı.');
      }
      setLoading(false);
    };

    loadSeriesInfo();
  }, [isOpen, seriesItem, activePlaylist]);

  if (!isOpen || !seriesItem) return null;

  const currentEpisodes: SeriesEpisode[] =
    seriesDetail?.episodes[selectedSeason] ||
    seriesDetail?.episodes[String(selectedSeason)] ||
    [];

  const handleDownloadAllSeason = () => {
    if (currentEpisodes.length === 0) return;
    currentEpisodes.forEach((ep) => {
      onDownloadEpisode(ep, seriesItem);
    });
    setBatchDownloadSuccess(`Sezon ${selectedSeason} (${currentEpisodes.length} bölüm) indirme sırasına eklendi!`);
    setTimeout(() => setBatchDownloadSuccess(null), 3500);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/85 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-2xl bg-[#131315] border border-white/10 rounded-3xl shadow-2xl my-auto text-[#e5e1e4] flex flex-col max-h-[92vh] overflow-hidden">
        {/* Banner with Poster and Meta */}
        <div className="relative h-60 sm:h-72 w-full overflow-hidden shrink-0 bg-[#1c1b1d]">
          {/* Backdrop Image */}
          <img
            src={seriesDetail?.backdrop || seriesDetail?.cover || seriesItem.poster}
            alt={seriesItem.title}
            className="w-full h-full object-cover opacity-35 blur-xs scale-105"
            onError={(e) => {
              (e.target as HTMLImageElement).src = seriesItem.poster;
            }}
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#131315] via-[#131315]/70 to-transparent"></div>

          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-20 w-9 h-9 rounded-full bg-black/60 hover:bg-[#93000a]/60 text-white flex items-center justify-center transition-all cursor-pointer border border-white/10"
            title="Kapat"
          >
            <X className="w-5 h-5" />
          </button>

          {/* Header Content Overlay */}
          <div className="absolute bottom-4 left-4 right-4 flex gap-4 items-end z-10">
            {/* Poster Card */}
            <div className="w-24 sm:w-28 aspect-[2/3] rounded-2xl overflow-hidden shrink-0 shadow-2xl border border-white/15 bg-[#201f21]">
              <img
                src={seriesDetail?.cover || seriesItem.poster}
                alt={seriesItem.title}
                className="w-full h-full object-cover"
                onError={(e) => {
                  (e.target as HTMLImageElement).src =
                    'https://images.unsplash.com/photo-1594909122845-11baa439b7bf?w=400&auto=format&fit=crop&q=80';
                }}
              />
            </div>

            {/* Title & Metadata */}
            <div className="flex flex-col min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="px-2 py-0.5 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-[10px] font-bold uppercase tracking-wider">
                  Dizi (Series)
                </span>
                {seriesDetail?.rating && (
                  <span className="px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 font-headline text-[11px] font-bold flex items-center gap-1">
                    <Star className="w-3 h-3 fill-current" />
                    {seriesDetail.rating}
                  </span>
                )}
                {seriesDetail?.releaseDate && (
                  <span className="text-[11px] text-[#b9cacb] flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-[#b9cacb]" />
                    {seriesDetail.releaseDate}
                  </span>
                )}
              </div>

              <h2 className="font-headline text-lg sm:text-2xl font-bold text-white truncate leading-tight">
                {seriesDetail?.name || seriesItem.title}
              </h2>

              <p className="text-[11px] text-[#b9cacb] mt-1 line-clamp-2 leading-relaxed">
                {seriesDetail?.plot || 'Bölüm listesi ve sezon detayları aşağıda listelenmiştir.'}
              </p>

              {seriesDetail?.genre && (
                <span className="text-[10px] text-[#00f0ff] mt-1 font-mono truncate">
                  Tür: {seriesDetail.genre}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Batch download toast notification */}
        {batchDownloadSuccess && (
          <div className="mx-4 mt-3 p-2.5 rounded-xl bg-[#65f2b5]/20 border border-[#65f2b5]/30 text-[#4edea3] text-xs font-semibold flex items-center gap-2 shrink-0">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{batchDownloadSuccess}</span>
          </div>
        )}

        {/* Modal Body / Episodes Section */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 flex flex-col gap-4 no-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
              <Loader2 className="w-8 h-8 text-[#00f0ff] animate-spin" />
              <div className="flex flex-col">
                <span className="font-headline text-sm font-bold text-white">
                  Dizi Sezonları ve Bölümleri Yükleniyor...
                </span>
                <span className="text-xs text-[#b9cacb] mt-0.5 font-mono">
                  Xtream Codes get_series_info sorgulanıyor
                </span>
              </div>
            </div>
          ) : error ? (
            <div className="p-4 rounded-2xl bg-[#93000a]/25 border border-[#ffb4ab]/30 flex flex-col items-center text-center gap-2 text-[#ffb4ab]">
              <AlertCircle className="w-6 h-6 text-[#ffb4ab]" />
              <span className="font-headline text-sm font-bold">Dizi Bilgisi Alınamadı</span>
              <p className="text-xs max-w-md">{error}</p>
            </div>
          ) : (
            <>
              {/* Season Selection & Batch Actions */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                {/* Season tabs */}
                <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1">
                  <div className="flex items-center gap-1.5 text-xs text-[#b9cacb] font-headline font-semibold mr-1 shrink-0">
                    <Layers className="w-4 h-4 text-[#00f0ff]" />
                    <span>Sezonlar:</span>
                  </div>
                  {seriesDetail?.seasons && seriesDetail.seasons.length > 0 ? (
                    seriesDetail.seasons.map((season) => {
                      const isSelected = season.seasonNumber === selectedSeason;
                      return (
                        <button
                          key={season.seasonNumber}
                          onClick={() => setSelectedSeason(season.seasonNumber)}
                          className={`px-3.5 py-1.5 rounded-full text-xs font-headline font-bold transition-all shrink-0 cursor-pointer ${
                            isSelected
                              ? 'bg-[#00f0ff] text-[#00363a] shadow-[0_0_12px_rgba(0,240,255,0.4)]'
                              : 'bg-[#201f21] hover:bg-[#2a2a2c] text-[#b9cacb] border border-white/5'
                          }`}
                        >
                          {season.name || `Sezon ${season.seasonNumber}`}
                          {season.episodeCount ? ` (${season.episodeCount})` : ''}
                        </button>
                      );
                    })
                  ) : (
                    <button className="px-3.5 py-1.5 rounded-full text-xs font-headline font-bold bg-[#00f0ff] text-[#00363a]">
                      Sezon 1
                    </button>
                  )}
                </div>

                {/* Batch Download Button */}
                {currentEpisodes.length > 0 && (
                  <button
                    onClick={handleDownloadAllSeason}
                    className="flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-full bg-[#0566d9]/30 hover:bg-[#0566d9]/50 text-[#adc6ff] font-headline text-xs font-semibold border border-[#0566d9]/40 transition-all cursor-pointer shrink-0"
                    title={`Sezon ${selectedSeason}'in tüm bölümlerini indir`}
                  >
                    <Download className="w-3.5 h-3.5 text-[#adc6ff]" />
                    <span>Sezonu İndir ({currentEpisodes.length})</span>
                  </button>
                )}
              </div>

              {/* Episodes List */}
              <div className="flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-headline text-xs font-bold text-[#b9cacb] uppercase tracking-wider">
                    Sezon {selectedSeason} Bölümleri ({currentEpisodes.length} Bölüm)
                  </span>
                  <span className="text-[11px] text-[#4edea3] font-mono">
                    Xtream Doğrudan Akış Hazır
                  </span>
                </div>

                {currentEpisodes.length === 0 ? (
                  <div className="p-8 text-center text-xs text-[#849495] bg-[#1c1b1d] rounded-2xl border border-white/5 flex flex-col items-center gap-2">
                    <Tv className="w-6 h-6 text-[#849495]" />
                    <span>Bu sezona ait bölüm bulunamadı.</span>
                  </div>
                ) : (
                  currentEpisodes.map((episode) => {
                    const seasonStr = String(episode.seasonNum).padStart(2, '0');
                    const epStr = String(episode.episodeNum).padStart(2, '0');
                    const episodeCode = `S${seasonStr}E${epStr}`;

                    return (
                      <div
                        key={episode.id}
                        className="group flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-2xl bg-[#1c1b1d] hover:bg-[#201f21] border border-white/5 hover:border-[#00f0ff]/30 transition-all gap-3"
                      >
                        {/* Episode Info */}
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {/* Episode thumbnail */}
                          <div className="relative w-20 h-14 rounded-xl bg-[#2a2a2c] overflow-hidden shrink-0 border border-white/5">
                            <img
                              src={episode.image || seriesDetail?.cover || seriesItem.poster}
                              alt={episode.title}
                              className="w-full h-full object-cover"
                              onError={(e) => {
                                (e.target as HTMLImageElement).src = seriesItem.poster;
                              }}
                            />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <Play className="w-5 h-5 text-[#00f0ff] fill-[#00f0ff]" />
                            </div>
                          </div>

                          {/* Episode Text Details */}
                          <div className="flex flex-col min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="px-1.5 py-0.2 rounded bg-[#0566d9]/25 text-[#7df4ff] font-mono text-[10px] font-bold">
                                {episodeCode}
                              </span>
                              <h4 className="font-headline text-xs sm:text-sm font-bold text-white truncate">
                                {episode.title}
                              </h4>
                            </div>

                            {episode.plot && (
                              <p className="text-[11px] text-[#b9cacb] mt-0.5 line-clamp-1 leading-snug">
                                {episode.plot}
                              </p>
                            )}

                            <div className="flex items-center gap-2 mt-1 text-[10px] text-[#849495] font-mono">
                              {episode.duration && (
                                <span className="flex items-center gap-1">
                                  <Clock className="w-3 h-3 text-[#849495]" />
                                  {episode.duration}
                                </span>
                              )}
                              <span>•</span>
                              <span className="uppercase text-[#00f0ff]">
                                {episode.containerExtension || 'mp4'}
                              </span>
                              {episode.rating && (
                                <>
                                  <span>•</span>
                                  <span className="text-amber-300 font-bold">★ {episode.rating}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
                          <button
                            onClick={() => onDownloadEpisode(episode, seriesItem)}
                            className="h-8 px-3 rounded-full bg-[#2a2a2c] hover:bg-[#353437] text-[#adc6ff] text-xs font-semibold flex items-center gap-1.5 border border-white/5 transition-all cursor-pointer active:scale-95"
                            title="Bölümü İndir"
                          >
                            <Download className="w-3.5 h-3.5 text-[#00f0ff]" />
                            <span className="hidden sm:inline">İndir</span>
                          </button>
                          <button
                            onClick={() => {
                              const currentIndex = currentEpisodes.findIndex((item) => item.id === episode.id);
                              let nextEpisode = currentIndex >= 0 ? currentEpisodes[currentIndex + 1] : undefined;
                              if (!nextEpisode && seriesDetail?.seasons) {
                                const orderedSeasons = [...seriesDetail.seasons].sort((a, b) => a.seasonNumber - b.seasonNumber);
                                const currentSeasonIndex = orderedSeasons.findIndex((season) => season.seasonNumber === selectedSeason);
                                const nextSeason = currentSeasonIndex >= 0 ? orderedSeasons[currentSeasonIndex + 1] : undefined;
                                if (nextSeason) {
                                  nextEpisode = (seriesDetail.episodes[nextSeason.seasonNumber] ||
                                    seriesDetail.episodes[String(nextSeason.seasonNumber)] || [])[0];
                                }
                              }
                              onPlayEpisode(episode, seriesItem, nextEpisode);
                            }}
                            className="h-8 px-4 rounded-full bg-[#00f0ff] text-[#00363a] font-headline text-xs font-bold flex items-center gap-1.5 shadow-[0_0_10px_rgba(0,240,255,0.4)] hover:brightness-110 active:scale-95 transition-all cursor-pointer"
                          >
                            <Play className="w-3.5 h-3.5 fill-current" />
                            <span>İzle</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
