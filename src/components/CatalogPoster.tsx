import { useEffect, useRef, useState } from 'react';
import { Film, Tv } from 'lucide-react';
import type { MediaItem } from '../types';
import { ensureCatalogDetails, movieCollectionStatus, subscribeMovieCollection } from '../services/movieCollections';

const PLACEHOLDER = '/brand/xiptvplay-icon.svg';
const GENERIC_XTREAM_POSTERS = {
  movie: 'images.unsplash.com/photo-1489599849927-2ee91cede3ba',
  series: 'images.unsplash.com/photo-1574375927938-d5a98e8ffe85',
};

export function CatalogPoster({ media, className }: { media: MediaItem; className: string }) {
  return <PosterImage key={JSON.stringify([media.id, media.poster])} media={media} className={className} />;
}

function PosterImage({ media, className }: { media: MediaItem; className: string }) {
  const target = useRef<HTMLSpanElement>(null);
  const [failedSources, setFailedSources] = useState<string[]>([]);
  const [, refresh] = useState(0);
  const providerPoster = media.poster?.trim();
  const isVideo = media.type === 'movie' || media.type === 'series';
  const genericPoster = media.type === 'live' ? undefined : GENERIC_XTREAM_POSTERS[media.type];
  const providerUsable = Boolean(providerPoster && !failedSources.includes(providerPoster)
    && (!isVideo || (providerPoster !== PLACEHOLDER && !(genericPoster && providerPoster.includes(genericPoster)))));
  const needsPoster = isVideo && !providerUsable;
  const PlaceholderIcon = media.type === 'movie' ? Film : Tv;
  const details = needsPoster ? movieCollectionStatus(media) : undefined;
  const source = providerUsable ? providerPoster : [details?.poster, details?.backdrop]
    .find(url => url && !failedSources.includes(url));

  useEffect(() => {
    const element = target.current;
    if (!needsPoster || !element) return;
    const unsubscribe = subscribeMovieCollection(media.id, () => refresh(value => value + 1));
    let retry: ReturnType<typeof setTimeout> | undefined;
    const requestPoster = () => {
      if (ensureCatalogDetails(media, true)) observer.disconnect();
      else retry = setTimeout(requestPoster, 1200);
    };
    const observer = new IntersectionObserver(records => {
      clearTimeout(retry);
      if (records.some(record => record.isIntersecting)) requestPoster();
    }, { rootMargin: '80px' });
    observer.observe(element);
    return () => { observer.disconnect(); clearTimeout(retry); unsubscribe(); };
  }, [needsPoster, media.id, media.title, media.year, media.tmdbId, media.imdbId]);

  return <span ref={target} className="relative block w-full h-full">
    {source || !isVideo
      ? <img key={source || PLACEHOLDER} src={source || PLACEHOLDER} alt="" loading="lazy" decoding="async" className={className}
          onError={source ? () => setFailedSources(previous => [...previous, source]) : undefined} />
      : <span aria-hidden="true" className="w-full h-full min-h-12 flex flex-col items-center justify-center gap-2 p-2 bg-gradient-to-br from-[#193747] to-[#1c1b1d] text-[#b9cacb]">
          <PlaceholderIcon size={24} className="shrink-0 text-[#00f0ff]" />
          <span className="text-center text-[11px] font-semibold line-clamp-2">{media.title}</span>
        </span>}
  </span>;
}
