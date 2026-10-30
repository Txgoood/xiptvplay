import type { MediaItem } from '../types';
import { buildApiUrl } from '../config/api';
import { tmdbTitleQueries } from './tmdbTitle';

export interface MovieCollectionPart { id: number; title: string; originalTitle: string; releaseDate: string; poster: string | null }
export interface MovieCollection { id: number; name: string; parts: MovieCollectionPart[] }
export interface TmdbDetails {
  id: number; title: string; overview: string; poster: string | null; backdrop: string | null;
  rating: number; releaseDate?: string; genres: string[];
  collection?: { id: number; name: string } | null;
  cast: Array<{ name: string; character?: string; photo: string | null }>; trailerKey: string | null;
}
export interface TmdbChoice { id: number; title: string; originalTitle?: string; releaseDate?: string; poster: string | null }
export class TmdbClientError extends Error {
  constructor(message: string, public code = 'TMDB_CONNECTION_ERROR', public candidates: TmdbChoice[] = []) { super(message); }
}
const CACHE_KEY = 'xiptvplay_tmdb_details_v3', CHOICE_KEY = 'xiptvplay_tmdb_choices_v1';
// Önceki şemadaki koleksiyon alanı olmayan kayıtlar yer kaplamasın.
try { localStorage.removeItem('xiptvplay_tmdb_details_v2'); } catch {}
type CacheEntry = { until: number; data: TmdbDetails };
const memory = new Map<string, CacheEntry>();
const pending = new Map<string, Promise<TmdbDetails>>();
export function savedChoices(): Record<string, number> {
  try { return JSON.parse(localStorage.getItem(CHOICE_KEY) || '{}') || {}; } catch { return {}; }
}
export function rememberTmdbChoice(media: MediaItem, id: number) {
  try {
    const choices = savedChoices(); delete choices[media.id]; choices[media.id] = id;
    localStorage.setItem(CHOICE_KEY, JSON.stringify(Object.fromEntries(Object.entries(choices).slice(-400))));
  } catch { /* Depo doluyken de seçilen bilgi açılabilir. */ }
}
function cacheKey(media: MediaItem, id?: number) {
  const actualId = id || savedChoices()[media.id] || media.tmdbId;
  return JSON.stringify(actualId ? [media.type, actualId] : [media.type, media.imdbId || null, tmdbTitleQueries(media.title).queries, media.year || null]);
}
function readCache(key: string): TmdbDetails | undefined {
  let entry = memory.get(key);
  if (!entry) {
    try { entry = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}')[key]; } catch {}
  }
  if (entry?.until && entry.until > Date.now() && Number.isInteger(entry.data?.id)) { memory.set(key, entry); return entry.data; }
  return undefined;
}
function writeCache(key: string, data: TmdbDetails) {
  const entry = { until: Date.now() + 7 * 86400000, data };
  memory.delete(key); memory.set(key, entry);
  if (memory.size > 120) memory.delete(memory.keys().next().value!);
  try {
    const saved: Record<string, CacheEntry> = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}');
    delete saved[key]; saved[key] = entry;
    const entries = Object.entries(saved).filter(([, value]) => value?.until > Date.now()).slice(-120);
    localStorage.setItem(CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch { /* Bellek önbelleği kullanılmaya devam eder. */ }
}
async function request(media: MediaItem, options: { tmdbId?: number; query?: string; searchOnly?: boolean } = {}) {
  const params = new URLSearchParams({ type: media.type, title: options.query || media.title });
  const id = options.tmdbId || (!options.searchOnly && (savedChoices()[media.id] || media.tmdbId));
  if (id) params.set('tmdbId', String(id));
  if (!options.searchOnly && !id && media.imdbId) params.set('imdbId', media.imdbId);
  if (media.year) params.set('year', String(media.year));
  if (options.searchOnly) params.set('searchOnly', '1');
  let response: Response;
  try {
    response = await fetch(buildApiUrl('/api/tmdb/details?' + params), { signal: AbortSignal.timeout(16000) });
  } catch (error) {
    throw new TmdbClientError(error instanceof Error && /abort|timeout/i.test(error.name) ? 'Film bilgi servisi zamanında yanıt vermedi. Yeniden deneyebilirsin.' : 'Film bilgi servisine bağlanılamadı. İnternet bağlantısını kontrol et.');
  }
  if (!(response.headers.get('content-type') || '').includes('application/json')) throw new TmdbClientError('Film bilgi servisine ulaşılamadı. Daha sonra tekrar dene.');
  const payload = await response.json();
  if (!response.ok) throw new TmdbClientError(payload.error || 'Film bilgi servisi şu anda kullanılamıyor.', payload.code || 'TMDB_SERVICE_ERROR', Array.isArray(payload.candidates) ? payload.candidates : []);
  return payload;
}
export function getTmdbDetails(media: MediaItem, id?: number): Promise<TmdbDetails> {
  const key = cacheKey(media, id), cached = readCache(key);
  if (cached) return Promise.resolve(cached);
  let work = pending.get(key);
  if (!work) {
    work = request(media, { tmdbId: id }).then(data => {
      if (!Number.isInteger(data.id) || typeof data.title !== 'string') throw new TmdbClientError('Film bilgi servisinden geçersiz yanıt alındı.');
      writeCache(key, data);
      return data as TmdbDetails;
    }).finally(() => pending.delete(key));
    pending.set(key, work);
  }
  return work;
}
export async function searchTmdbChoices(media: MediaItem, query: string): Promise<TmdbChoice[]> {
  const data = await request(media, { query, searchOnly: true });
  return Array.isArray(data.candidates) ? data.candidates : [];
}

const collectionCache = new Map<number, { until: number; data: MovieCollection }>();
const collectionRequests = new Map<number, Promise<MovieCollection>>();
export function getTmdbCollection(id: number): Promise<MovieCollection> {
  const key = 'xiptvplay_tmdb_collection_v1_' + id;
  let cached = collectionCache.get(id);
  if (!cached) { try { cached = JSON.parse(localStorage.getItem(key) || 'null'); } catch {} }
  if (cached && cached.until > Date.now() && cached.data?.id === id) return Promise.resolve(cached.data);
  const running = collectionRequests.get(id); if (running) return running;
  const work = (async () => {
    const response = await fetch(buildApiUrl('/api/tmdb/details?collectionId=' + id), { signal: AbortSignal.timeout(16000) });
    if (!(response.headers.get('content-type') || '').includes('application/json')) throw new Error('Seri bilgisi şu anda alınamıyor.');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || 'Seri bilgisi alınamadı.');
    if (data.id !== id || !Array.isArray(data.parts)) throw new Error('Seri bilgisi geçersiz.');
    const entry = { until: Date.now() + 7 * 86400000, data: data as MovieCollection };
    collectionCache.set(id, entry);
    if (collectionCache.size > 80) collectionCache.delete(collectionCache.keys().next().value!);
    try {
      // Diskteki seri önbelleği de sınırlı tutulur.
      const prefix = 'xiptvplay_tmdb_collection_v1_';
      const keys = Object.keys(localStorage).filter(item => item.startsWith(prefix) && item !== key);
      for (const old of keys.slice(0, Math.max(0, keys.length - 79))) localStorage.removeItem(old);
      localStorage.setItem(key, JSON.stringify(entry));
    } catch { /* Depo doluyken bellek önbelleği kullanılır. */ }
    return data as MovieCollection;
  })().finally(() => collectionRequests.delete(id));
  collectionRequests.set(id, work); return work;
}
