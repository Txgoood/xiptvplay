import type { MediaItem } from '../types';
import type { WatchHistoryEntry } from './watchHistory';

export const SORT_OPTIONS = [
  ['added-desc', 'Yeni eklenenler önce'], ['added-asc', 'Eski eklenenler önce'],
  ['year-desc', 'Yapım yılı: yeni → eski'], ['year-asc', 'Yapım yılı: eski → yeni'],
  ['rating-desc', 'Puan: yüksek → düşük'], ['rating-asc', 'Puan: düşük → yüksek'],
  ['title-asc', 'İsim: A → Z'], ['title-desc', 'İsim: Z → A'],
] as const;
export type CatalogSort = typeof SORT_OPTIONS[number][0];
export type CatalogView = 'large' | 'medium' | 'small' | 'list' | 'details';
export const VIEW_OPTIONS: [CatalogView, string][] = [
  ['large', 'Büyük kartlar · 2 sütun'], ['medium', 'Orta kartlar · 3 sütun'],
  ['small', 'Küçük kartlar · 4 sütun'], ['list', 'Liste'], ['details', 'Ayrıntılı liste'],
];
export interface CatalogPreferences { sort: CatalogSort; view: CatalogView }
const preferenceKey = (profileId: string) => 'xiptvplay_catalog_preferences_v1_' + profileId;
export function readCatalogPreferences(profileId: string): CatalogPreferences {
  let saved: Partial<CatalogPreferences> = {};
  try { saved = JSON.parse(localStorage.getItem(preferenceKey(profileId)) || '{}') || {}; } catch {}
  return {
    sort: SORT_OPTIONS.some(([key]) => key === saved.sort) ? saved.sort! : 'added-desc',
    view: VIEW_OPTIONS.some(([key]) => key === saved.view) ? saved.view! : 'medium',
  };
}
export function saveCatalogPreferences(profileId: string, preferences: CatalogPreferences) {
  try { localStorage.setItem(preferenceKey(profileId), JSON.stringify(preferences)); } catch { /* Dolu depoda oturum tercihi korunur. */ }
}

// Sunucu zamanları saniye veya milisaniye olabilir. Eksik tarih uydurulmaz.
export function catalogTimestamp(value: unknown): number | undefined {
  if (value == null || value === '') return undefined;
  const numeric = Number(value);
  const date = Number.isFinite(numeric) ? numeric * (numeric < 1e11 ? 1000 : 1) : Date.parse(String(value));
  return Number.isFinite(date) && date >= 946684800000 && date <= 4102444800000 ? date : undefined;
}
export function catalogRating(value: unknown, fiveBased = false): string | undefined {
  const rating = Number(String(value ?? '').trim().replace(',', '.'));
  const normalized = fiveBased ? rating * 2 : rating;
  return Number.isFinite(normalized) && normalized > 0 && normalized <= 10 ? String(Math.round(normalized * 10) / 10) : undefined;
}
export function catalogReleaseDate(value: unknown): string | undefined {
  const text = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(text)) return undefined;
  const date = text.slice(0, 10);
  const parsed = new Date(date + 'T12:00:00Z');
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : undefined;
}
function year(item: MediaItem) {
  const value = item.year || Number(item.releaseDate?.slice(0, 4)) || Number(item.title.match(/\b((?:19|20)\d{2})\b/)?.[1]);
  return value >= 1900 && value <= 2100 ? value : undefined;
}
function compareKnown(a: number | undefined, b: number | undefined, ascending: boolean): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  return ascending ? a - b : b - a;
}
const titleCollator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
export function sortCatalog(items: MediaItem[], sort: CatalogSort): MediaItem[] {
  if (sort === 'title-asc' || sort === 'title-desc') return [...items].sort((a,b)=>titleCollator.compare(a.title,b.title)*(sort==='title-desc'?-1:1));
  const ascending=sort.endsWith('-asc');
  // Yıl / puan ayıklaması karşılaştırma başına değil, içerik başına bir kez yapılır.
  return items.map(item=>({item,value:sort.startsWith('added-')?item.addedAt:sort.startsWith('year-')?year(item):Number(catalogRating(item.rating))||undefined}))
    .sort((a,b)=>compareKnown(a.value,b.value,ascending)).map(row=>row.item);
}

export interface DiscoveryShelf { title: string; subtitle: string; items: MediaItem[]; badge?: string }
export function buildDiscoveryShelves(items: MediaItem[], history: WatchHistoryEntry[], now = new Date()): DiscoveryShelf[] {
  const media = items.filter(item => item.type !== 'live');
  const monday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  monday.setDate(monday.getDate() - (monday.getDay() + 6) % 7);
  const dayKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  const weekStart = dayKey(monday), today = dayKey(now);
  const released = media.filter(item => item.releaseDate && item.releaseDate >= weekStart && item.releaseDate <= today)
    .sort((a, b) => b.releaseDate!.localeCompare(a.releaseDate!)).slice(0, 16);
  const added = sortCatalog(media.filter(item => item.addedAt && item.addedAt >= now.getTime() - 7 * 86400000 && item.addedAt <= now.getTime()), 'added-desc').slice(0, 16);
  const watched = new Set(history.map(entry => entry.media.id));
  const affinity = new Map<string, number>();
  for (const entry of history.slice(0, 80)) {
    const category = entry.media.type + ':' + ('category' in entry.media ? entry.media.category : '');
    affinity.set(category, (affinity.get(category) || 0) + (entry.completed ? 2 : 1));
  }
  for (const item of media) if (item.isFavorite) {
    const category = item.type + ':' + item.category;
    affinity.set(category, (affinity.get(category) || 0) + 3);
  }
  const score = (item: MediaItem) => (affinity.get(item.type + ':' + item.category) || 0) * 4 + Number(catalogRating(item.rating) || 0);
  const recommended = media.filter(item => !watched.has(item.id) && !item.isFavorite &&
    (affinity.has(item.type + ':' + item.category) || Boolean(catalogRating(item.rating))))
    .map(item=>({item,score:score(item)})).sort((a,b)=>b.score-a.score||(b.item.addedAt||0)-(a.item.addedAt||0)).slice(0,16).map(row=>row.item);
  const shelves: DiscoveryShelf[] = [];
  if (released.length) shelves.push({ title: 'Bu hafta çıkanlar', subtitle: 'Sağlayıcının bildirdiği vizyon / ilk yayın tarihine göre', items: released, badge: 'Bu hafta' });
  if (added.length) shelves.push({ title: 'Bu hafta eklenenler', subtitle: 'Son 7 günde kataloğa eklenen film ve diziler', items: added, badge: 'Yeni eklendi' });
  if (recommended.length) shelves.push({ title: affinity.size ? 'Senin için seçtiklerimiz' : 'Yüksek puanlı keşifler',
    subtitle: affinity.size ? 'Bu profildeki izleme geçmişine ve favori kategorilerine göre' : 'Kataloğundaki sağlayıcı puanlarına göre', items: recommended });
  return shelves;
}
