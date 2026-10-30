import test from 'node:test';
import assert from 'node:assert/strict';
import { tmdbTitleQueries, normalizeTmdbTitle, rankTmdbCandidates } from '../src/services/tmdbTitle';
import { createTmdbDetailsHandler, resolveTmdbDetails, TmdbLookupError } from '../server/tmdb';

const details = { id: 7, title: 'Apocalypse Z: New World', overview: 'Özet', vote_average: 7.2, genres: [], credits: { cast: [] }, videos: { results: [] } };
test('çift dilli başlık, yayın etiketleri ve sezon/bölüm son eki temizlenir', () => {
  const input = tmdbTitleQueries('Kıyamet Z: Yeni Dünya - Apocalypse Z: New World (2026) TR 1080p');
  assert.deepEqual(input.queries.slice(0, 2), ['Kıyamet Z: Yeni Dünya', 'Apocalypse Z: New World']);
  assert.equal(input.year, 2026);
  assert.deepEqual(tmdbTitleQueries('The Blacklist (2013) TR - S01E02: The Freelancer').queries, ['The Blacklist']);
  assert.equal(tmdbTitleQueries('2001: A Space Odyssey (1968)').queries[0], '2001: A Space Odyssey');
  assert.equal(tmdbTitleQueries('En Güzel Gün (2024) TR').queries[0], 'En Güzel Gün');
  assert.equal(tmdbTitleQueries('Dead-End Job (2026) TR').queries[0], 'Dead-End Job');
  assert.equal(normalizeTmdbTitle('Çarpışma Anı'), normalizeTmdbTitle('Carpisma Ani'));
});
test('yanlış sağlayıcı yılı birebir ad eşleşmesini engellemez; ilgisiz popüler sonuç seçilmez', async () => {
  const calls: string[] = [];
  const result = await resolveTmdbDetails({ type: 'movie', title: 'Kıyamet Z: Yeni Dünya - Apocalypse Z: New World (2026) TR' }, async endpoint => {
    calls.push(endpoint);
    return endpoint.startsWith('/search/') ? { results: [{ id: 2, title: 'Another World', popularity: 10000 }, { id: 7, title: 'Apocalypse Z: New World', release_date: '2024-10-31' }] } : details;
  });
  assert.equal(result.id, 7);
  assert.equal(calls.filter(path => path.startsWith('/search/')).length, 2);
});
test('orijinal ad eşleşir; benzer isimde birden fazla film varsa seçim istenir', async () => {
  const ranked = rankTmdbCandidates([{ id: 1, title: 'Bırak Gitsin', original_title: 'To Let Go' }], ['To Let Go']);
  assert.equal(ranked[0].id, 1);
  await assert.rejects(resolveTmdbDetails({ type: 'movie', title: 'Test' }, async () => ({ results: [{ id: 1, title: 'Test' }, { id: 2, title: 'Test' }] })), error => error instanceof TmdbLookupError && error.code === 'AMBIGUOUS_MATCH');
});
test('doğrudan TMDB kimliği aramayı atlar; IMDb kimliği doğru kayıtla çözülür', async () => {
  const paths: string[] = [];
  await resolveTmdbDetails({ type: 'movie', title: 'Yanlış sağlayıcı adı', tmdbId: 7 }, async endpoint => { paths.push(endpoint); return details; });
  assert.equal(paths.some(path => path.startsWith('/search')), false);
  paths.length = 0;
  await resolveTmdbDetails({ type: 'movie', title: 'Ad', imdbId: 'tt1234567' }, async endpoint => { paths.push(endpoint); return endpoint.startsWith('/find') ? { movie_results: [{ id: 7 }] } : details; });
  assert.ok(paths[0].includes('/find/tt1234567'));
});
test('isteğe bağlı İngilizce istek hatası Türkçe temel bilgiyi yok etmez; dil yalnız bir kez gönderilir', async () => {
  const calls: Array<[string, string | undefined]> = [];
  const result = await resolveTmdbDetails({ type: 'movie', title: 'Film', tmdbId: 7 }, async (endpoint, language) => {
    calls.push([endpoint, language]);
    if (language === 'en-US') throw new Error('temporary timeout');
    return { ...details, overview: '' };
  });
  assert.equal(result.id, 7);
  assert.equal(calls[1][1], 'en-US');
  assert.equal(calls[1][0].includes('language='), false);
});
test('bir dilde arama kesilirse başarılı diğer arama korunur', async () => {
  const result = await resolveTmdbDetails({ type: 'movie', title: 'Türkçe Ad - English Name' }, async endpoint => {
    if (endpoint.startsWith('/search/') && decodeURIComponent(endpoint).includes('Türkçe')) throw new Error('timeout');
    return endpoint.startsWith('/search/') ? { results: [{ id: 7, title: 'English Name' }] } : details;
  });
  assert.equal(result.id, 7);
});
function response() {
  const result = { statusCode: 200, body: null as any, headers: {} as Record<string, string>, status(code: number) { this.statusCode = code; return this; }, json(body: unknown) { this.body = body; return this; }, setHeader(key: string, value: string) { this.headers[key] = value; } };
  return result;
}
test('sunucu önbelleği ve eşzamanlı istek birleştirme gereksiz TMDB çağrısını kaldırır', async () => {
  const previous = process.env.TMDB_API_READ_ACCESS_TOKEN; process.env.TMDB_API_READ_ACCESS_TOKEN = 'unit-test-token';
  try {
    let calls = 0;
    const handler = createTmdbDetailsHandler((async () => { calls++; await new Promise(resolve => setTimeout(resolve, 5)); return Response.json(details); }) as typeof fetch);
    const req = { query: { type: 'movie', title: 'Film', tmdbId: '7' } } as any;
    const a = response(), b = response();
    await Promise.all([handler(req, a as any), handler(req, b as any)]);
    assert.equal(calls, 1); assert.equal(a.statusCode, 200); assert.equal(b.statusCode, 200);
    const cached = response(); await handler(req, cached as any);
    assert.equal(calls, 1); assert.equal(cached.headers['X-TMDB-Cache'], 'HIT');
  } finally { if (previous === undefined) delete process.env.TMDB_API_READ_ACCESS_TOKEN; else process.env.TMDB_API_READ_ACCESS_TOKEN = previous; }
});
test('401 anahtar hatası bulunamadı olarak etiketlenmez ve önbelleğe alınmaz; sır yanıt içine sızmaz', async () => {
  const previous = process.env.TMDB_API_READ_ACCESS_TOKEN; process.env.TMDB_API_READ_ACCESS_TOKEN = 'Bearer unit-test-secret';
  try {
    let calls = 0;
    const handler = createTmdbDetailsHandler((async (url, options) => { calls++; assert.equal(new URL(String(url)).searchParams.getAll('language').length, 1); assert.equal((options!.headers as any).Authorization, 'Bearer unit-test-secret'); return new Response('', { status: 401 }); }) as typeof fetch);
    const req = { query: { type: 'movie', title: 'Film', tmdbId: '7' } } as any;
    const a = response(), b = response(); await handler(req, a as any); await handler(req, b as any);
    assert.equal(a.statusCode, 503); assert.equal(a.body.code, 'TMDB_AUTH_ERROR'); assert.equal(calls, 2);
    assert.equal(JSON.stringify(a.body).includes('unit-test-secret'), false);
  } finally { if (previous === undefined) delete process.env.TMDB_API_READ_ACCESS_TOKEN; else process.env.TMDB_API_READ_ACCESS_TOKEN = previous; }
});
