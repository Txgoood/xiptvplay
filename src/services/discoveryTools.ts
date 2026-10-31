import type { MediaItem } from '../types';
import type { WatchHistoryEntry } from './watchHistory';
import { peekTmdbDetails } from './tmdbClient';

// Arama indeksi her katalog sürümünde bir kez oluşturulur; yazarken tekrar normalleştirilmez.
export const normalizeSearch = (text: string) => text.toLocaleLowerCase('tr-TR').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/ı/g, 'i');
export function durationMinutes(value?: string): number | undefined {
  if (!value) return undefined;
  const clock = value.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]) + Number(clock[3] || 0) / 60;
  const minutes = value.match(/^(\d+(?:\.\d+)?)\s*(?:dk|min|minutes?|dakika)?$/i);
  if (minutes) return Number(minutes[1]) > 0 ? Number(minutes[1]) : undefined;
  const hours = value.match(/(\d+)\s*(?:saat|sa|h)(?:\s*(\d+)\s*(?:dk|min))?/i);
  return hours ? Number(hours[1]) * 60 + Number(hours[2] || 0) : undefined;
}
const generic = /^(tr|en|film|filmler|dizi|diziler|movie|movies|series|yabanci|turk|netflix|amazon|disney|sinema|genel|uhd|fhd|hd|4k|turkce)$/;
export function discoveryTags(item: MediaItem, extraGenres: string[] = []): string[] {
  const cached = peekTmdbDetails(item);
  const genres = [...(item.genres || []), ...(cached?.genres || []), ...extraGenres];
  if (genres.length) return [...new Set(genres.map(normalizeSearch))];
  return [...new Set(normalizeSearch(item.category).split(/[|,;/·]+/).map(x => x.trim()).filter(x => x && !generic.test(x)))];
}
export interface DecisionFilters { type: 'movie' | 'series'; tag: string; maxMinutes: number; minRating: number; hideWatched: boolean }
export function eligibleDecisions(catalog: MediaItem[], filters: DecisionFilters, history: WatchHistoryEntry[]): MediaItem[] {
  const watched = new Set(history.filter(e => e.completed || e.positionSeconds > 60).map(e => e.media.id));
  return catalog.filter(item => {
    if (item.type !== filters.type || (filters.hideWatched && watched.has(item.id))) return false;
    const cached = peekTmdbDetails(item);
    const minutes = cached?.runtimeMinutes || durationMinutes(item.duration);
    const rating = cached?.rating || Number(item.rating?.replace(',', '.')) || 0;
    if (filters.maxMinutes && (!minutes || minutes > filters.maxMinutes)) return false;
    if (filters.minRating && rating < filters.minRating) return false;
    return !filters.tag || discoveryTags(item).includes(filters.tag);
  });
}
export function pickDecisions(items: MediaItem[], excluded: Set<string>, random = Math.random): MediaItem[] {
  const unseen = items.filter(item => !excluded.has(item.id));
  const pool = [...(unseen.length ? unseen : items)];
  // İlk üç kaydı sürekli sunmamak için kısmi Fisher–Yates.
  for (let i = 0; i < Math.min(3, pool.length); i++) {
    const j = i + Math.floor(random() * (pool.length - i));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool.slice(0, 3);
}
export function similarMedia(current: MediaItem, catalog: MediaItem[], genres: string[] = []): Array<{item: MediaItem; reason: string}> {
  const tags = new Set(discoveryTags(current, genres));
  const category = normalizeSearch(current.category);
  return catalog.filter(item => item.id !== current.id && item.type === current.type).map(item => {
    const common = discoveryTags(item).filter(tag => tags.has(tag));
    const sameCategory = category && normalizeSearch(item.category) === category;
    return { item, score: common.length * 3 + (sameCategory ? 1 : 0), reason: common.length ? 'Ortak tür / tema: ' + common.slice(0, 2).join(', ') : 'Aynı katalog kategorisinde' };
  }).filter(row => row.score > 0).sort((a,b) => b.score-a.score || (Number(b.item.rating)||0)-(Number(a.item.rating)||0)).slice(0,12);
}
