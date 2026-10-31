import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDiscoveryShelves, catalogRating, catalogReleaseDate, catalogTimestamp, readCatalogPreferences, saveCatalogPreferences, sortCatalog } from '../src/services/catalogDiscovery';
import { XtreamClientService } from '../src/services/xtreamClient';
import type { MediaItem } from '../src/types';
import type { WatchHistoryEntry } from '../src/services/watchHistory';

const media = (id: string, fields: Partial<MediaItem> = {}): MediaItem => ({ id, title: id, type: 'movie', category: 'TR Sinema',
  resolution: 'HD', poster: '', streamUrl: '', audioTracks: [], subtitles: [], ...fields });

test('eklenme tarihi ve yapım yılı birbirinden bağımsız sıralanır; kaynak dizi değişmez', () => {
  const items = [media('old', { year: 2026, addedAt: 100 }), media('new', { year: 1980, addedAt: 200 }), media('unknown')];
  assert.deepEqual(sortCatalog(items, 'added-desc').map(i => i.id), ['new', 'old', 'unknown']);
  assert.deepEqual(sortCatalog(items, 'added-asc').map(i => i.id), ['old', 'new', 'unknown']);
  assert.deepEqual(sortCatalog(items, 'year-desc').map(i => i.id), ['old', 'new', 'unknown']);
  assert.deepEqual(sortCatalog(items, 'year-asc').map(i => i.id), ['new', 'old', 'unknown']);
  assert.deepEqual(items.map(i => i.id), ['old', 'new', 'unknown']);
});
test('puan ölçeği normalize edilir; eksik ve sıfır puan her iki yönde sonda kalır', () => {
  assert.equal(catalogRating('4.5', true), '9');
  assert.equal(catalogRating('8,4'), '8.4');
  assert.equal(catalogRating(0), undefined);
  assert.equal(catalogRating(11), undefined);
  const items = [media('a', { rating: '7.5' }), media('b'), media('c', { rating: '9' }), media('d', { rating: '0' })];
  assert.deepEqual(sortCatalog(items, 'rating-desc').map(i => i.id), ['c', 'a', 'b', 'd']);
  assert.deepEqual(sortCatalog(items, 'rating-asc').map(i => i.id), ['a', 'c', 'b', 'd']);
});
test('sağlayıcı sırası tarih yokken korunur; Türkçe alfabetik sıralama çalışır', () => {
  const items = [media('z', { title: 'Zaman' }), media('c', { title: 'Çatı' }), media('s', { title: 'Şehir' })];
  assert.deepEqual(sortCatalog(items, 'added-desc'), items);
  assert.deepEqual(sortCatalog(items, 'title-asc').map(i => i.id), ['c', 's', 'z']);
});
test('saniye/milisaniye ve geçersiz tarihler; yıl tek başına yayın tarihi değildir', () => {
  assert.equal(catalogTimestamp('1793404800'), 1793404800000);
  assert.equal(catalogTimestamp(1793404800000), 1793404800000);
  assert.equal(catalogTimestamp(''), undefined);
  assert.equal(catalogTimestamp(0), undefined);
  assert.equal(catalogReleaseDate('2026'), undefined);
  assert.equal(catalogReleaseDate('2026-02-31'), undefined);
  assert.equal(catalogReleaseDate('2026-10-30'), '2026-10-30');
});
test('bu hafta çıkan ile yeni eklenen ayrılır; gelecek yayınlar ve canlı TV raflara girmez', () => {
  const now = new Date('2026-10-31T12:00:00+03:00');
  const items = [media('release', { releaseDate: '2026-10-27' }), media('old-release', { releaseDate: '2026-10-25', addedAt: now.getTime() - 1000 }),
    media('future', { releaseDate: '2026-11-01' }), media('year-only', { year: 2026 }), media('live', { type: 'live', releaseDate: '2026-10-30' })];
  const shelves = buildDiscoveryShelves(items, [], now);
  assert.deepEqual(shelves.find(s => s.title === 'Bu hafta çıkanlar')?.items.map(i => i.id), ['release']);
  assert.deepEqual(shelves.find(s => s.title === 'Bu hafta eklenenler')?.items.map(i => i.id), ['old-release']);
});
test('profil geçmişi öneriyi değiştirir; izlenen, favori ve katalog dışı içerik önerilmez', () => {
  const items = [media('watched', { category: 'TR Polisiye' }), media('crime', { category: 'TR Polisiye', rating: '7' }),
    media('comedy', { category: 'TR Komedi', rating: '9' }), media('favorite', { category: 'TR Komedi', isFavorite: true })];
  const entry = (item: MediaItem): WatchHistoryEntry => ({ id: item.id, media: item, profileId: 'test', watchedAt: 1, positionSeconds: 50, durationSeconds: 100, completed: false });
  const crime = buildDiscoveryShelves(items.filter(i => !i.isFavorite), [entry(items[0])]).find(s => s.title === 'Senin için seçtiklerimiz')!;
  assert.equal(crime.items[0].id, 'crime');
  assert.equal(crime.items.some(i => i.id === 'watched'), false);
  const child = buildDiscoveryShelves([items[2]], [entry(items[0])]);
  assert.equal(child.flatMap(s => s.items).every(i => i.id === 'comedy'), true);
});
test('görünüm ve sıralama profillere ayrı kaydedilir; bozuk kayıt varsayılana döner', () => {
  const values = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) } });
  saveCatalogPreferences('parent', { sort: 'rating-desc', view: 'small' });
  saveCatalogPreferences('spouse', { sort: 'added-asc', view: 'details' });
  assert.deepEqual(readCatalogPreferences('parent'), { sort: 'rating-desc', view: 'small' });
  assert.deepEqual(readCatalogPreferences('spouse'), { sort: 'added-asc', view: 'details' });
  values.set('xiptvplay_catalog_preferences_v1_child', '{broken');
  assert.deepEqual(readCatalogPreferences('child'), { sort: 'added-desc', view: 'medium' });
});
test('Xtream ham verisinde tarih ve gerçek puan kaybolmaz; dizi güncellemesi eklenme tarihi sayılmaz', () => {
  const result = (XtreamClientService as any).processCatalogData({ vodStreams: [{ stream_id: 1, name: 'Film', rating_5based: '4.5', added: '1793404800', releaseDate: '2026-10-30' }],
    seriesList: [{ series_id: 2, name: 'Dizi', rating: '8.2', last_modified: '1793404800' }] }, 'https://example.invalid', 'test', 'test', 'test');
  assert.equal(result.items[0].rating, '9');
  assert.equal(result.items[0].addedAt, 1793404800000);
  assert.equal(result.items[0].releaseDate, '2026-10-30');
  assert.equal(result.items[1].addedAt, undefined);
  assert.equal(result.items[1].updatedAt, 1793404800000);
});

test('dizide eklenme tarihi yoksa yeni/eski seçimi doğrulanmış güncellenme tarihine döner', async () => {
  const {resolveCatalogSort} = await import('../src/services/catalogDiscovery');
  const series=[media('old',{type:'series',updatedAt:100}),media('new',{type:'series',updatedAt:300}),media('middle',{type:'series',updatedAt:200}),media('unknown',{type:'series'})];
  const newest=resolveCatalogSort(series,'added-desc','series'),oldest=resolveCatalogSort(series,'added-asc','series');
  assert.equal(newest.usesUpdatedAt,true);assert.equal(newest.sort,'updated-desc');
  assert.deepEqual(sortCatalog(series,newest.sort).map(item=>item.id),['new','middle','old','unknown']);
  assert.deepEqual(sortCatalog(series,oldest.sort).map(item=>item.id),['old','middle','new','unknown']);
  assert.equal(series[0].addedAt,undefined);
});
test('dizide gerçek eklenme tarihi varsa korunur; filmde dizi güncelleme sırası uygulanmaz', async()=>{
  const {resolveCatalogSort} = await import('../src/services/catalogDiscovery');
  const items=[media('old',{type:'series',addedAt:100,updatedAt:300}),media('new',{type:'series',addedAt:200,updatedAt:100})];
  assert.equal(resolveCatalogSort(items,'added-desc','series').usesUpdatedAt,false);
  assert.equal(resolveCatalogSort(items,'updated-desc','movie').sort,'added-desc');
  assert.deepEqual(sortCatalog(items,'added-desc').map(item=>item.id),['new','old']);
  assert.deepEqual(sortCatalog(items,'updated-desc').map(item=>item.id),['old','new']);
});
