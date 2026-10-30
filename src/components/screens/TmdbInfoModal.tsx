import React, { useEffect, useState } from 'react';
import { X, Play, Download, Star, Film, Loader2, ExternalLink } from 'lucide-react';
import { MediaItem } from '../../types';
import { getTmdbDetails, rememberTmdbChoice, searchTmdbChoices, TmdbClientError, type TmdbChoice, type TmdbDetails } from '../../services/tmdbClient';
import { tmdbTitleQueries } from '../../services/tmdbTitle';

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
  const [retry, setRetry] = useState(0);
  const [selection, setSelection] = useState<{ mediaId: string; id: number } | undefined>();
  const selectedId = selection?.mediaId === media?.id ? selection?.id : undefined;
  const [query, setQuery] = useState('');
  const [choices, setChoices] = useState<TmdbChoice[]>([]);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState('');
  const searchGeneration = React.useRef(0);
  useEffect(() => {
    setSelection(undefined); setChoices([]); setSearchOpen(false); setSearchError(''); setSearching(false);
    setQuery(media ? tmdbTitleQueries(media.title).queries[0] || media.title : '');
    searchGeneration.current++;
  }, [media?.id]);
  useEffect(() => {
    if (!media) return;
    let active = true;
    setDetails(null); setError(null); setLoading(true);
    getTmdbDetails(media, selectedId)
      .then(data => { if (active) setDetails(data); })
      .catch(err => { if (active) {
        setError(err.message || 'Bağlantı hatası');
        if (err instanceof TmdbClientError && err.candidates.length) { setChoices(err.candidates); setSearchOpen(true); }
      } })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [media?.id, media?.title, selectedId, retry]);
  const search = async () => {
    if (!media || query.trim().length < 2) return;
    const generation = ++searchGeneration.current;
    setSearching(true); setSearchError(''); setChoices([]);
    try {
      const results = await searchTmdbChoices(media, query.trim());
      if (generation !== searchGeneration.current) return;
      setChoices(results); if (!results.length) setSearchError('Bu adla sonuç bulunamadı. Orijinal adını da deneyebilirsin.');
    } catch (error) { if (generation === searchGeneration.current) setSearchError(error instanceof Error ? error.message : 'Arama yapılamadı.'); }
    finally { if (generation === searchGeneration.current) setSearching(false); }
  };

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
          {error && <div role="alert" className="text-sm text-amber-200 bg-amber-500/10 rounded-xl p-3 space-y-2"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="min-h-10 px-3 rounded-xl bg-white/10 font-semibold">Yeniden dene</button></div>}
          {!loading && <button type="button" onClick={() => setSearchOpen(value => !value)} className="text-xs text-[#00f0ff] underline min-h-10">{details ? 'Eşleşme yanlış mı? Düzelt' : 'Adıyla ara / Eşleşme seç'}</button>}
          {searchOpen && <div className="rounded-xl border border-white/10 p-3 space-y-3">
            <form onSubmit={event => { event.preventDefault(); void search(); }} className="flex gap-2">
              <input aria-label="TMDB film veya dizi adı" value={query} maxLength={160} onChange={event => setQuery(event.target.value)} placeholder="Türkçe veya orijinal adı" className="min-w-0 flex-1 bg-[#28282b] rounded-xl px-3 py-2 text-sm"/>
              <button type="submit" disabled={searching || query.trim().length < 2} className="rounded-xl bg-[#00f0ff] text-[#00363a] font-bold px-3 min-h-11 disabled:opacity-50">{searching ? 'Aranıyor…' : 'Ara'}</button>
            </form>
            {searchError && <p role="status" className="text-xs text-amber-200">{searchError}</p>}
            <div className="max-h-64 overflow-y-auto space-y-2">{choices.map(choice => <button type="button" key={choice.id} onClick={() => { rememberTmdbChoice(media, choice.id); setSelection({ mediaId: media.id, id: choice.id }); setRetry(value => value + 1); setChoices([]); setSearchOpen(false); }} className="w-full text-left flex items-center gap-3 rounded-xl bg-white/5 p-2 hover:bg-white/10">
              {choice.poster && <img src={choice.poster} alt="" loading="lazy" className="w-10 h-14 rounded object-cover"/>}
              <span className="min-w-0"><span className="block text-sm font-semibold">{choice.title} {choice.releaseDate?.slice(0, 4)}</span><span className="block text-xs text-[#b9cacb] truncate">{choice.originalTitle}</span></span>
            </button>)}</div>
            <p className="text-[10px] text-[#849495]">Seçtiğin eşleşme bu içerik için hatırlanır. İzlenecek yayın değişmez.</p>
          </div>}
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

