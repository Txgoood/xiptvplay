import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTmdbCollection, resolveTmdbDetails } from '../server/tmdb';
import { matchCollectionParts } from '../src/services/movieCollections';
import type { MovieCollectionPart } from '../src/services/tmdbClient';
import type { MediaItem } from '../src/types';

const parts: MovieCollectionPart[] = [
  { id: 1726, title: 'Demir Adam', originalTitle: 'Iron Man', releaseDate: '2008-04-30', poster: null },
  { id: 10138, title: 'Demir Adam 2', originalTitle: 'Iron Man 2', releaseDate: '2010-04-28', poster: null },
  { id: 68721, title: 'Demir Adam 3', originalTitle: 'Iron Man 3', releaseDate: '2013-04-18', poster: null },
];
const media = (id: string, title: string, extra: Partial<MediaItem> = {}): MediaItem => ({ id, title, type: 'movie', category: 'TR Filmler',
  resolution: 'HD', poster: '', streamUrl: 'https://example.invalid/' + id, audioTracks: [], subtitles: [], ...extra });

test('filmde koleksiyon kimliği döner, dizi yanlışlıkla film serisi sayılmaz', async () => {
  const get = async () => ({ id: 1726, title: 'Demir Adam', overview: 'Özet', belongs_to_collection: { id: 131292, name: 'Demir Adam Koleksiyonu' } });
  const film = await resolveTmdbDetails({ type: 'movie', title: 'Demir Adam', tmdbId: 1726 }, get);
  assert.deepEqual(film.collection, { id: 131292, name: 'Demir Adam Koleksiyonu' });
  const series = await resolveTmdbDetails({ type: 'series', title: 'Test', tmdbId: 1726 }, get);
  assert.equal(series.collection, null);
});
test('koleksiyon filmleri çıkış sırasındadır; tekrar ve yetişkin kayıtları çıkarılır, tarihsiz en sona gider', async () => {
  const result = await resolveTmdbCollection(131292, async () => ({ id: 131292, name: 'Demir Adam Koleksiyonu', parts: [
    { id: 3, title: 'Üç', release_date: '2013-01-01' }, { id: 1, title: 'Bir', release_date: '2008-01-01' },
    { id: 2, title: 'İki', release_date: '2010-01-01' }, { id: 1, title: 'Tekrar' }, { id: 4, title: 'Henüz tarihsiz' }, { id: 5, title: 'Yetişkin', adult: true },
  ] }));
  assert.deepEqual(result.parts.map((part: any) => part.id), [1, 2, 3, 4]);
});
test('ilk filme bakarken ikinci film Türkçe veya İngilizce adıyla bulunur; katalogda olmayan üçüncü oynatılamaz', () => {
  const catalog = [media('first', 'Demir Adam (2008) TR'), media('second', 'Iron Man 2 (2010) FHD TR')];
  const result = matchCollectionParts(parts, catalog, { media: catalog[0], tmdbId: 1726 }, {});
  assert.equal(result[0].media?.id, 'first');
  assert.equal(result[1].media?.id, 'second');
  assert.equal(result[2].media, undefined);
});
test('film isminde 2 olması koleksiyon üyeliği yerine kullanılmaz; yanlış TMDB kaydı eşleştirilmez', () => {
  const catalog = [media('wrong', 'Demir Adam 2 (2010) TR', { tmdbId: 999 })];
  assert.equal(matchCollectionParts(parts, catalog, undefined, {})[1].media, undefined);
});
test('çocuk profiline verilen izinli katalog dışında hiçbir devam filmi açılır duruma gelmez', () => {
  const allowed = [media('child-first', 'Demir Adam', { tmdbId: 1726 })];
  const result = matchCollectionParts(parts, allowed, { media: allowed[0], tmdbId: 1726 }, {});
  assert.deepEqual(result.filter(item => item.media).map(item => item.part.id), [1726]);
});
test('yeniden çevrimler ve ilk film / ikinci film birbirine karıştırılmaz', () => {
  const catalog = [media('remake', 'Demir Adam (2020) TR'), media('first', 'Demir Adam (2008) TR')];
  assert.equal(matchCollectionParts(parts, catalog, undefined, {})[0].media?.id, 'first');
  assert.equal(matchCollectionParts(parts, [catalog[0]], undefined, {})[0].media, undefined);
  assert.equal(matchCollectionParts(parts, [catalog[1]], undefined, {})[1].media, undefined);
});
test('kullanıcının doğruladığı TMDB kimliği sağlayıcıdaki farklı adı aşar; yayın adresi korunur', () => {
  const item = media('custom-name', 'Sağlayıcının tamamen farklı adı', { tmdbId: 999 });
  const result = matchCollectionParts(parts, [item], undefined, { 'custom-name': 10138 });
  assert.equal(result[1].media, item);
  assert.equal(result[1].media?.streamUrl, item.streamUrl);
});
