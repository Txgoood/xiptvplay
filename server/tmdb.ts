import type { Request, Response } from 'express';
import { rankTmdbCandidates, tmdbTitleQueries, tmdbTitleScore, type TmdbCandidate } from '../src/services/tmdbTitle';

export class TmdbLookupError extends Error {
  constructor(public status: number, public code: string, message: string, public candidates?: unknown[]) { super(message); }
}
type FetchTmdb = (endpoint: string, language?: string) => Promise<any>;
const presentCandidate = (item: TmdbCandidate) => ({ id: item.id, title: item.title || item.name || '',
  originalTitle: item.original_title || item.original_name || '', releaseDate: item.release_date || item.first_air_date || '',
  poster: item.poster_path ? 'https://image.tmdb.org/t/p/w185' + item.poster_path : null });

export async function resolveTmdbDetails(input: { type: string; title: string; year?: number; tmdbId?: number; imdbId?: string; searchOnly?: boolean }, get: FetchTmdb) {
  const type = input.type === 'series' ? 'tv' : 'movie';
  const { queries, year: titleYear } = tmdbTitleQueries(input.title);
  const year = input.year || titleYear;
  let id = input.tmdbId;
  if (!id && input.imdbId && /^tt\d{5,12}$/.test(input.imdbId)) {
    const found = await get('/find/' + input.imdbId + '?external_source=imdb_id');
    const result = (type === 'tv' ? found.tv_results : found.movie_results)?.find((item: any) => item.adult !== true);
    id = result?.id;
  }
  if (!id) {
    if (!queries.length) throw new TmdbLookupError(400, 'INVALID_TITLE', 'Aramak için en az iki harflik bir ad yaz.');
    // İki dildeki ad aynı anda aranır; ilk rastgele sonuç otomatik seçilmez.
    const responses = await Promise.allSettled(queries.slice(0, 2).map(query => get('/search/' + type + '?query=' + encodeURIComponent(query) + '&include_adult=false')));
    const completed = responses.filter((result): result is PromiseFulfilledResult<any> => result.status === 'fulfilled');
    if (!completed.length) throw (responses[0] as PromiseRejectedResult).reason;
    const candidates = rankTmdbCandidates(completed.flatMap(result => Array.isArray(result.value.results) ? result.value.results : []), queries, year);
    if (input.searchOnly) return { candidates: candidates.slice(0, 8).map(presentCandidate) };
    const best = candidates[0], second = candidates[1];
    if (!best) throw new TmdbLookupError(404, 'NOT_FOUND', 'Bu adla eşleşme bulunamadı. Türkçe veya orijinal adını yazarak arayabilirsin.');
    const score = tmdbTitleScore(best, queries, year);
    if (score < 0.72 || (second && score - tmdbTitleScore(second, queries, year) < 0.04)) {
      throw new TmdbLookupError(409, 'AMBIGUOUS_MATCH', 'Birden fazla olası eşleşme var. Doğru film veya diziyi seç.', candidates.slice(0, 6).map(presentCandidate));
    }
    id = best.id;
  }
  const details = await get('/' + type + '/' + id + '?append_to_response=credits,videos');
  if (details.adult === true) throw new TmdbLookupError(404, 'NOT_FOUND', 'Bu içerik için bilgi gösterilemiyor.');
  // İsteğe bağlı İngilizce bilgi / fragman hatası başarılı ana yanıtı bozmaz.
  if (!details.overview) {
    try {
      const english = await get('/' + type + '/' + id + '?append_to_response=videos', 'en-US');
      details.overview = english.overview || '';
      if (!details.videos?.results?.length) details.videos = english.videos;
    } catch { /* Türkçe temel bilgi yine gösterilir. */ }
  }
  const videos = Array.isArray(details.videos?.results) ? details.videos.results : [];
  const video = videos.find((item: any) => item.site === 'YouTube' && item.type === 'Trailer') || videos.find((item: any) => item.site === 'YouTube');
  return {
    id: details.id, title: details.title || details.name || '', overview: details.overview || '',
    poster: details.poster_path ? 'https://image.tmdb.org/t/p/w500' + details.poster_path : null,
    backdrop: details.backdrop_path ? 'https://image.tmdb.org/t/p/w780' + details.backdrop_path : null,
    rating: Number(details.vote_average) || 0, releaseDate: details.release_date || details.first_air_date,
    genres: (details.genres || []).map((item: any) => item.name),
    cast: (details.credits?.cast || []).slice(0, 12).map((person: any) => ({ name: person.name, character: person.character,
      photo: person.profile_path ? 'https://image.tmdb.org/t/p/w185' + person.profile_path : null })),
    trailerKey: video?.key || null,
  };
}

export function createTmdbDetailsHandler(fetcher: typeof fetch = fetch) {
  const cache = new Map<string, { until: number; status: number; body: unknown }>();
  const pending = new Map<string, Promise<{ status: number; body: unknown }>>();
  return async (req: Request, res: Response) => {
    const token = (process.env.TMDB_API_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY || '').trim().replace(/^['"]|['"]$/g, '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(503).json({ code: 'TMDB_NOT_CONFIGURED', error: 'Film bilgi servisi sunucuda yapılandırılmamış. İzleme ve indirme kullanılabilir.' });
    const title = typeof req.query.title === 'string' ? req.query.title.slice(0, 300) : '';
    const input = { type: req.query.type === 'series' ? 'series' : 'movie', title,
      year: Number(req.query.year) >= 1900 && Number(req.query.year) <= 2100 ? Number(req.query.year) : undefined,
      tmdbId: /^\d{1,10}$/.test(String(req.query.tmdbId || '')) && Number(req.query.tmdbId) > 0 ? Number(req.query.tmdbId) : undefined,
      imdbId: /^tt\d{5,12}$/.test(String(req.query.imdbId || '')) ? String(req.query.imdbId) : undefined,
      searchOnly: req.query.searchOnly === '1' };
    const key = JSON.stringify(input);
    const hit = cache.get(key);
    if (hit && hit.until > Date.now()) { res.setHeader('X-TMDB-Cache', 'HIT'); return res.status(hit.status).json(hit.body); }
    let work = pending.get(key);
    if (!work) {
      work = (async () => {
        try {
          const total = AbortSignal.timeout(14000);
          const get: FetchTmdb = async (endpoint, language = 'tr-TR') => {
            const url = new URL('https://api.themoviedb.org/3' + endpoint);
            url.searchParams.set('language', language);
            const headers: Record<string, string> = { Accept: 'application/json' };
            if (/^[a-f0-9]{32}$/i.test(token)) url.searchParams.set('api_key', token);
            else headers.Authorization = 'Bearer ' + token;
            const response = await fetcher(url, { headers, signal: AbortSignal.any([total, AbortSignal.timeout(6000)]) });
            if (response.status === 401 || response.status === 403) throw new TmdbLookupError(503, 'TMDB_AUTH_ERROR', 'TMDB sunucu erişim anahtarı kabul edilmedi. Sunucu ayarının düzeltilmesi gerekiyor.');
            if (response.status === 429) throw new TmdbLookupError(429, 'TMDB_RATE_LIMIT', 'Film bilgi servisi yoğun. Biraz sonra tekrar dene.');
            if (response.status === 404) throw new TmdbLookupError(404, 'NOT_FOUND', 'Seçilen TMDB kaydı artık bulunamıyor. Adıyla yeniden arayabilirsin.');
            if (!response.ok) throw new TmdbLookupError(502, 'TMDB_UPSTREAM_ERROR', 'Film bilgi servisi şu anda yanıt veremiyor.');
            return response.json();
          };
          const body = await resolveTmdbDetails(input, get);
          return { status: 200, body };
        } catch (error) {
          if (error instanceof TmdbLookupError) return { status: error.status, body: { code: error.code, error: error.message, ...(error.candidates ? { candidates: error.candidates } : {}) } };
          const timeout = error instanceof Error && /abort|timeout/i.test(error.name + error.message);
          return { status: timeout ? 504 : 502, body: { code: timeout ? 'TMDB_TIMEOUT' : 'TMDB_CONNECTION_ERROR',
            error: timeout ? 'Film bilgi servisi zamanında yanıt vermedi. Yeniden deneyebilirsin.' : 'Film bilgi servisine bağlantı kurulamadı. İzleme ve indirme kullanılabilir.' } };
        }
      })();
      pending.set(key, work);
    }
    const result = await work;
    if (pending.get(key) === work) {
      pending.delete(key);
      // Geçici servis hataları bulunamadı diye önbelleğe alınmaz.
      if (result.status === 200 || result.status === 404 || result.status === 409) {
        cache.delete(key); cache.set(key, { ...result, until: Date.now() + (result.status === 200 ? 86400000 : 300000) });
        if (cache.size > 1500) cache.delete(cache.keys().next().value!);
      }
    }
    return res.status(result.status).json(result.body);
  };
}
