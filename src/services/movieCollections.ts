import type { MediaItem } from '../types';
import { normalizeTmdbTitle, tmdbTitleQueries } from './tmdbTitle';
import { getTmdbDetails, savedChoices, type MovieCollectionPart, type TmdbDetails } from './tmdbClient';

type MovieIndexEntry = { signature: string; until: number; tmdbId: number; collection: { id: number; name: string } | null };
const KEY = 'xiptvplay_movie_collection_index_v1';
let index: Record<string, MovieIndexEntry> | undefined;
const listeners = new Map<string, Set<() => void>>();
const changeListeners = new Set<(tmdbId: number) => void>();
export function subscribeCollectionMatches(listener: (tmdbId: number) => void) { changeListeners.add(listener); return () => { changeListeners.delete(listener); }; }
const failedUntil = new Map<string, number>();
const jobs = new Map<string, Promise<void>>();
const queue: Array<() => Promise<void>> = [];
let active = 0, saveTimer: ReturnType<typeof setTimeout> | undefined;
const signature = (media: MediaItem) => JSON.stringify([media.title, media.year, media.tmdbId]);
function entries(): Record<string, MovieIndexEntry> {
  if (!index) { try { index = JSON.parse(localStorage.getItem(KEY) || '{}') || {}; } catch { index = {}; } }
  return index!;
}
export function movieCollectionStatus(media: MediaItem): MovieIndexEntry | undefined {
  const entry = entries()[media.id];
  const manual = savedChoices()[media.id];
  return entry?.until > Date.now() && entry.signature === signature(media) && (!manual || manual === entry.tmdbId) ? entry : undefined;
}
export function rememberMovieCollection(media: MediaItem, data: TmdbDetails) {
  if (media.type !== 'movie' || !Object.hasOwn(data, 'collection')) return;
  entries()[media.id] = { signature: signature(media), until: Date.now() + 7 * 86400000, tmdbId: data.id, collection: data.collection || null };
  listeners.get(media.id)?.forEach(listener => listener());
  changeListeners.forEach(listener => listener(data.id));
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      index = Object.fromEntries(Object.entries(entries()).filter(([, entry]) => entry.until > Date.now()).slice(-3000));
      localStorage.setItem(KEY, JSON.stringify(index));
    } catch { /* Bellekteki doğrulanmış kayıtlar korunur. */ }
  }, 400);
}
export function subscribeMovieCollection(id: string, listener: () => void) {
  const set = listeners.get(id) || new Set<() => void>(); set.add(listener); listeners.set(id, set);
  return () => { set.delete(listener); if (!set.size) listeners.delete(id); };
}
function pump() {
  while (active < 2 && queue.length) {
    const job = queue.shift()!; active++;
    void job().finally(() => { active--; pump(); });
  }
}
export function ensureMovieCollection(media: MediaItem): Promise<void> {
  if (media.type !== 'movie' || movieCollectionStatus(media) || (failedUntil.get(media.id) || 0) > Date.now()) return Promise.resolve();
  const existing = jobs.get(media.id); if (existing) return existing;
  // Hızlı kaydırmada görünmeyen afişler sınırsız arka plan kuyruğu oluşturmaz.
  if (queue.length >= 32) return Promise.resolve();
  // Büyük katalogda yalnızca ekranda görünen afişler kontrol edilir.
  const work = new Promise<void>(resolve => {
    queue.push(async () => {
      try { rememberMovieCollection(media, await getTmdbDetails(media)); }
      catch { failedUntil.set(media.id, Date.now() + 5 * 60000); if (failedUntil.size > 2000) failedUntil.delete(failedUntil.keys().next().value!); }
      finally { jobs.delete(media.id); resolve(); }
    });
  });
  jobs.set(media.id, work); pump(); return work;
}

export interface MatchedCollectionPart { part: MovieCollectionPart; media?: MediaItem }
export function matchCollectionParts(parts: MovieCollectionPart[], catalog: MediaItem[], current?: { media: MediaItem; tmdbId: number }, knownIds?: Record<string, number>): MatchedCollectionPart[] {
  if (!parts.length || !catalog.length) return parts.map(part => ({ part }));
  const partIds = new Set(parts.map(part => part.id));
  const names = new Set(parts.flatMap(part => [normalizeTmdbTitle(part.title), normalizeTmdbTitle(part.originalTitle)]));
  const byId = new Map<number, MediaItem[]>(), byTitle = new Map<string, MediaItem[]>();
  const manual = knownIds || savedChoices();
  const stored = knownIds ? {} : entries();
  for (const media of catalog) {
    if (media.type !== 'movie') continue;
    const cached = stored[media.id];
    const cachedId = cached?.until > Date.now() && cached.signature === signature(media) ? cached.tmdbId : undefined;
    const id = media.id === current?.media.id ? current.tmdbId : manual[media.id] || media.tmdbId || cachedId;
    if (id && partIds.has(id)) { const values = byId.get(id) || []; values.push(media); byId.set(id, values); }
    // Başka TMDB kaydıyla doğrulanmış film, benzer ad nedeniyle yanlış eşleştirilmez.
    if (!id) for (const title of tmdbTitleQueries(media.title).queries) {
      const key = normalizeTmdbTitle(title); if (!names.has(key)) continue;
      const values = byTitle.get(key) || [];
      values.push(media); byTitle.set(key, values);
    }
  }
  return parts.map(part => {
    const ids = byId.get(part.id);
    if (ids?.length) return { part, media: ids.find(media => media.id === current?.media.id) || ids[0] };
    const candidates = [...new Map([part.title, part.originalTitle].flatMap(title => byTitle.get(normalizeTmdbTitle(title)) || []).map(media => [media.id, media])).values()];
    const year = Number(part.releaseDate.slice(0, 4));
    const matchingYear = candidates.filter(media => (media.year || tmdbTitleQueries(media.title).year) === year);
    const safe = matchingYear.length ? matchingYear : candidates.filter(media => !year || !(media.year || tmdbTitleQueries(media.title).year));
    // Aynı ad/yıl için kalite kopyaları kabul edilir; farklı yıllı yeniden çevrimler karıştırılmaz.
    const years = new Set(safe.map(media => media.year || tmdbTitleQueries(media.title).year).filter(Boolean));
    return { part, media: years.size <= 1 ? safe[0] : undefined };
  });
}
