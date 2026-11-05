import { useEffect, useRef, useState } from 'react';
import { Clock, Layers3 } from 'lucide-react';
import type { MediaItem } from '../types';
import { playedDuration, subscribePlayedDurations } from '../services/playedDuration';
import { formatRuntimeMinutes } from '../services/episodeDuration';
import { catalogProviderRuntime, ensureCatalogDetails, movieCollectionStatus, subscribeMovieCollection } from '../services/movieCollections';

export function MovieCollectionBadge({ media, showRuntime = false }: { media: MediaItem; showRuntime?: boolean }) {
  const target = useRef<HTMLSpanElement>(null);
  const [, update] = useState(0);
  const entry = movieCollectionStatus(media);
  useEffect(() => {
    const refresh = () => update(revision => revision + 1);
    const unsubscribe = subscribeMovieCollection(media.id, refresh);
    const unsubscribeDurations = subscribePlayedDurations(refresh);
    const element = target.current;
    if (!element || media.type === 'live' || (media.type === 'series' && (!showRuntime || media.duration))) return () => { unsubscribe(); unsubscribeDurations(); };
    const observer = new IntersectionObserver(records => {
      if (records.some(record => record.isIntersecting)) { void ensureCatalogDetails(media); observer.disconnect(); }
    }, { rootMargin: '80px' });
    observer.observe(element);
    return () => { observer.disconnect(); unsubscribe(); unsubscribeDurations(); };
  }, [media.id, media.title, media.year, media.tmdbId, media.imdbId, media.type, media.duration, showRuntime]);
  if (media.type === 'live' || (media.type === 'series' && !showRuntime)) return null;
  const collection = media.type === 'movie' ? entry?.collection : null;
  const providerRuntime = formatRuntimeMinutes(media.duration || catalogProviderRuntime(media));
  const measuredRuntime = media.type === 'movie' || media.id.startsWith('m3u-') ? formatRuntimeMinutes((playedDuration(media.id) || 0) / 60) : undefined;
  const runtime = providerRuntime || measuredRuntime || formatRuntimeMinutes(entry?.runtimeMinutes);
  const approximate = media.type === 'series' && !((providerRuntime || measuredRuntime) && (media.episodeNumber || media.id.startsWith('m3u-')));
  return <><span ref={target} role={collection ? 'img' : undefined} aria-label={collection ? `Film serisi: ${collection.name}` : undefined} aria-hidden={!collection}
    title={collection ? `Bu film bir seriye ait · ${collection.name}` : undefined}
    className="absolute top-2 left-2 h-6 min-w-6 max-w-[calc(100%-3.5rem)] pointer-events-none z-[1]">
    {collection && <span className="inline-flex items-center gap-1 rounded-md border border-[#00f0ff]/40 bg-[#071b24]/95 text-[#7df4ff] px-1.5 py-1 text-[9px] font-bold leading-none shadow-lg">
      <Layers3 size={12} className="shrink-0"/><span className="hidden min-[400px]:inline">SERİ</span>
    </span>}
  </span>
    {showRuntime && <span className="absolute bottom-8 left-2 max-w-[calc(100%-1rem)] inline-flex items-center gap-1 rounded bg-black/80 px-1.5 py-0.5 text-[10px] text-white pointer-events-none"
      title={runtime ? (approximate ? 'Yaklaşık bölüm süresi' : 'Video süresi') : 'Süre bilgisi yok'}>
      <Clock size={11} className="shrink-0" />{runtime ? (approximate ? '~' + runtime : runtime) : '—'}
    </span>}
  </>;
}
