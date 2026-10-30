import { useEffect, useMemo, useState } from 'react';
import { Layers3, Loader2, Play } from 'lucide-react';
import type { MediaItem } from '../../types';
import { getTmdbCollection, type MovieCollection } from '../../services/tmdbClient';
import { matchCollectionParts, subscribeCollectionMatches } from '../../services/movieCollections';

interface Props {
  collection: { id: number; name: string };
  media: MediaItem;
  tmdbId: number;
  catalog: MediaItem[];
  isChildMode: boolean;
  onInfo: (item: MediaItem) => void;
  onPlay: (item: MediaItem) => void;
}
export function MovieCollectionSection({ collection, media, tmdbId, catalog, isChildMode, onInfo, onPlay }: Props) {
  const [data, setData] = useState<MovieCollection | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [revision, setRevision] = useState(0);
  useEffect(() => {
    const ids = new Set(data?.parts.map(part => part.id));
    return subscribeCollectionMatches(id => { if (ids.has(id)) setRevision(value => value + 1); });
  }, [data]);
  useEffect(() => {
    let active = true; setData(null); setError('');
    void getTmdbCollection(collection.id).then(result => { if (active) setData(result); })
      .catch(error => { if (active) setError(error instanceof Error ? error.message : 'Seri bilgisi alınamadı.'); });
    return () => { active = false; };
  }, [collection.id, retry]);
  const matched = useMemo(() => matchCollectionParts(data?.parts || [], catalog, { media, tmdbId }), [data, catalog, media, tmdbId, revision]);
  // Çocuk profiline katalogda izin verilmemiş devam filmlerinin afişi de gösterilmez.
  const visible = isChildMode ? matched.filter(item => item.media) : matched;
  const currentIndex = matched.findIndex(item => item.part.id === tmdbId);
  const next = currentIndex >= 0 ? matched[currentIndex + 1] : undefined;
  return <section className="rounded-2xl border border-[#00f0ff]/20 bg-[#112028] p-3 space-y-3" aria-label="Bu Serinin Filmleri">
    <div className="flex items-center gap-2 text-[#00f0ff]"><Layers3 size={18}/><h3 className="font-bold text-sm">Bu Serinin Filmleri</h3></div>
    <p className="text-xs text-[#b9cacb]">{data?.name || collection.name} · Çıkış sırasına göre</p>
    {!data && !error && <p role="status" className="text-xs text-[#b9cacb] flex items-center gap-2"><Loader2 size={15} className="animate-spin"/> Devam filmleri yükleniyor…</p>}
    {error && <div className="text-xs text-amber-200"><p>{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="min-h-10 underline">Seriyi yeniden yükle</button></div>}
    <div className="flex gap-3 overflow-x-auto pb-2">
      {visible.map(({ part, media: found }, position) => <article key={part.id} className={`w-28 sm:w-32 shrink-0 rounded-xl p-1.5 ${part.id === tmdbId ? 'bg-[#00f0ff]/10 ring-1 ring-[#00f0ff]/50' : 'bg-black/15'}`}>
        <button type="button" onClick={() => { if (found) onInfo(found); }} disabled={!found} aria-label={`${part.title} bilgileri`} className="relative block w-full aspect-[2/3] rounded-lg overflow-hidden bg-[#29292c] disabled:cursor-default">
          <img src={part.poster || found?.poster || '/brand/xiptvplay-icon.svg'} alt="" loading="lazy" className="w-full h-full object-cover" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = '/brand/xiptvplay-icon.svg'; }}/>
          <span className="absolute top-1 left-1 bg-black/75 rounded px-1.5 py-0.5 text-[10px]">{isChildMode ? matched.findIndex(item => item.part.id === part.id) + 1 : position + 1}</span>
        </button>
        <p className="text-xs font-semibold line-clamp-2 mt-2">{part.title}</p>
        <p className="text-[10px] text-[#849495] mt-1">{part.releaseDate.slice(0, 4) || 'Tarih yok'}</p>
        {part.id === tmdbId ? <p className="text-[10px] text-[#00f0ff] min-h-10 flex items-center">Şu an baktığın film</p>
          : found ? <button type="button" onClick={() => onPlay(found)} aria-label={`${part.title} izle`} className="mt-1 min-h-10 w-full rounded-lg bg-[#00f0ff] text-[#00363a] text-xs font-bold flex justify-center items-center gap-1"><Play size={13}/> İzle</button>
          : <p className="text-[10px] text-[#849495] min-h-10 flex items-center">Kataloğunda yok</p>}
      </article>)}
    </div>
    {next?.media && <button type="button" onClick={() => onPlay(next.media!)} className="min-h-11 w-full rounded-xl border border-[#00f0ff]/30 text-[#00f0ff] px-3 py-2 text-xs font-bold text-left flex items-center gap-2"><Play size={15} className="shrink-0"/> Sıradaki film: {next.part.title}</button>}
    {isChildMode && data && visible.length < 2 && <p className="text-[11px] text-[#849495]">Bu profilde açılabilecek başka seri filmi bulunmuyor.</p>}
  </section>;
}
