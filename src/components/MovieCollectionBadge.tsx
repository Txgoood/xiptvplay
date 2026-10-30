import { useEffect, useRef, useState } from 'react';
import { Layers3 } from 'lucide-react';
import type { MediaItem } from '../types';
import { ensureMovieCollection, movieCollectionStatus, subscribeMovieCollection } from '../services/movieCollections';

export function MovieCollectionBadge({ media }: { media: MediaItem }) {
  const target = useRef<HTMLSpanElement>(null);
  const [entry, setEntry] = useState(() => movieCollectionStatus(media));
  useEffect(() => {
    const refresh = () => setEntry(movieCollectionStatus(media)); refresh();
    const unsubscribe = subscribeMovieCollection(media.id, refresh);
    const element = target.current;
    if (!element || media.type !== 'movie') return unsubscribe;
    const observer = new IntersectionObserver(records => {
      if (records.some(record => record.isIntersecting)) { void ensureMovieCollection(media); observer.disconnect(); }
    }, { rootMargin: '80px' });
    observer.observe(element);
    return () => { observer.disconnect(); unsubscribe(); };
  }, [media.id, media.title, media.year, media.tmdbId]);
  if (media.type !== 'movie') return null;
  const collection = entry?.collection;
  return <span ref={target} role={collection ? 'img' : undefined} aria-label={collection ? `Film serisi: ${collection.name}` : undefined} aria-hidden={!collection}
    title={collection ? `Bu film bir seriye ait · ${collection.name}` : undefined}
    className="absolute top-2 left-2 h-6 min-w-6 max-w-[calc(100%-3.5rem)] pointer-events-none z-[1]">
    {collection && <span className="inline-flex items-center gap-1 rounded-md border border-[#00f0ff]/40 bg-[#071b24]/95 text-[#7df4ff] px-1.5 py-1 text-[9px] font-bold leading-none shadow-lg">
      <Layers3 size={12} className="shrink-0"/><span className="hidden min-[400px]:inline">SERİ</span>
    </span>}
  </span>;
}
