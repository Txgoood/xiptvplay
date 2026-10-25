import React, { useEffect, useState } from 'react';
import { X, Play, Download, Star, Film, Loader2, ExternalLink } from 'lucide-react';
import { MediaItem } from '../../types';
import { buildApiUrl } from '../../config/api';

type TmdbDetails = {
  id: number; title: string; overview: string; poster: string | null;
  backdrop: string | null; rating: number; releaseDate?: string; genres: string[];
  cast: Array<{ name: string; character?: string; photo: string | null }>;
  trailerKey: string | null;
};

interface Props {
  media: MediaItem | null;
  onClose: () => void;
  onPlay: (item: MediaItem) => void;
  onDownload: (item: MediaItem) => void;
  onOpenSeries: (item: MediaItem) => void;
}

export const TmdbInfoModal: React.FC<Props> = ({ media, onClose, onPlay, onDownload, onOpenSeries }) => {
  const [details, setDetails] = useState<TmdbDetails | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!media) return;
    const controller = new AbortController();
    setDetails(null); setError(null); setLoading(true);
    const params = new URLSearchParams({ type: media.type, title: media.title });
    if (media.year) params.set('year', String(media.year));
    fetch(buildApiUrl('/api/tmdb/details?' + params.toString()), { signal: controller.signal })
      .then(async response => {
        const contentType = response.headers.get('content-type') || '';
        if (!contentType.includes('application/json')) throw new Error('TMDB servisine ulaşılamadı.');
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || 'Film bilgisi bulunamadı.');
        return payload as TmdbDetails;
      })
      .then(data => setDetails(data))
      .catch(err => { if (!controller.signal.aborted) setError(err.message || 'Bağlantı hatası'); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [media?.id, media?.title]);

  if (!media) return null;
  return (
    <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center bg-black/85 p-0 sm:p-4" onClick={onClose}>
      <section role="dialog" aria-modal="true" aria-label={media.title + ' bilgileri'} onClick={event => event.stopPropagation()} className="relative w-full sm:max-w-xl max-h-[94dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl bg-[#171719] text-white border border-white/10">
        <button onClick={onClose} className="absolute top-3 right-3 z-10 rounded-full p-2 bg-black/75" aria-label="Bilgi ekranını kapat"><X size={20}/></button>
        <div className="relative h-48 sm:h-60 bg-[#242426]">
          <img src={details?.backdrop || media.backdrop || details?.poster || media.poster} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-t from-[#171719] to-transparent" />
        </div>
        <div className="p-5 -mt-10 relative space-y-4">
          <h2 className="text-xl font-bold">{details?.title || media.title}</h2>
          <div className="flex gap-3 items-center text-xs text-[#b9cacb]">
            {details && Number.isFinite(details.rating) && <span className="flex items-center gap-1 text-amber-300"><Star size={14}/> {details.rating.toFixed(1)} / 10 TMDB</span>}
            <span>{details?.releaseDate?.slice(0, 4) || media.year || ''}</span>
            <span>{details?.genres?.join(' • ')}</span>
          </div>
          {loading && <div className="flex items-center gap-2 text-[#00f0ff] text-sm"><Loader2 size={18} className="animate-spin"/> TMDB bilgileri yükleniyor...</div>}
          {error && <p className="text-sm text-amber-200 bg-amber-500/10 rounded-xl p-3">{error}</p>}
          {details?.overview && <p className="text-sm leading-relaxed text-[#d5d5d5]">{details.overview}</p>}
          <div className="flex flex-wrap gap-2">
            <button onClick={() => { onClose(); media.type === 'series' ? onOpenSeries(media) : onPlay(media); }} className="flex items-center gap-2 rounded-full px-5 py-2.5 bg-[#00f0ff] text-[#00363a] text-sm font-bold"><Play size={17}/>{media.type === 'series' ? 'Bölümler / İzle' : 'İzle'}</button>
            <button onClick={() => { onClose(); media.type === 'series' ? onOpenSeries(media) : onDownload(media); }} className="flex items-center gap-2 rounded-full px-5 py-2.5 bg-[#28282b] text-sm font-semibold"><Download size={17}/>{media.type === 'series' ? 'Bölüm İndir' : 'İndir'}</button>
            {details?.trailerKey && <a className="flex items-center gap-2 rounded-full px-4 py-2.5 bg-[#28282b] text-sm" href={'https://www.youtube.com/watch?v=' + encodeURIComponent(details.trailerKey)} target="_blank" rel="noopener noreferrer"><Film size={17}/> Fragman <ExternalLink size={12}/></a>}
          </div>
          {details?.cast && details.cast.length > 0 && <div>
            <h3 className="font-bold text-sm mb-2">Oyuncular</h3>
            <div className="flex gap-3 overflow-x-auto pb-3">
              {details.cast.map((actor, index) => <div key={index} className="w-24 shrink-0">
                <div className="h-28 rounded-lg overflow-hidden bg-[#28282b]">{actor.photo ? <img src={actor.photo} className="w-full h-full object-cover" alt={actor.name}/> : <div className="h-full flex items-center justify-center text-[#849495]">👤</div>}</div>
                <p className="mt-1 text-xs font-semibold">{actor.name}</p>
                {actor.character && <p className="text-[10px] text-[#b9cacb]">{actor.character}</p>}
              </div>)}
            </div>
          </div>}
          <p className="text-[10px] text-[#849495]">Film ve dizi bilgileri TMDB tarafından sağlanır. TMDB bu uygulamayı desteklemez veya onaylamaz.</p>
        </div>
      </section>
    </div>
  );
};
