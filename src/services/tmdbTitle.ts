export interface TmdbCandidate {
  id: number; title?: string; name?: string; original_title?: string; original_name?: string;
  release_date?: string; first_air_date?: string; poster_path?: string; overview?: string; adult?: boolean; popularity?: number;
}
export function normalizeTmdbTitle(value: string): string {
  return value.toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').normalize('NFKD').replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ').replace(/[^\p{L}\p{N}]+/gu, ' ').replace(/\s+/g, ' ').trim();
}
export function tmdbTitleQueries(raw: string): { queries: string[]; year?: number } {
  const source = raw.slice(0, 300);
  const markedYear = source.match(/[([{]((?:19|20)\d{2})[)\]}]/)?.[1];
  let title = source
    .replace(/\b(?:TRSub|TRDublaj|TUR|TR|ENG|MULTI|DUAL|DUBBED|SUBBED|4K|8K|UHD|FHD|HD|SD|HDR10?\+?|HEVC|WEB[- .]?DL|BluRay|BRRip|DVDRip|(?:1080|720|2160)p|[xh][ .]?26[45])\b/gi, ' ')
    .replace(/\b(?:Türkçe Dublaj|Turkce Dublaj|Türkçe Altyazılı|Turkce Altyazili|Altyazılı|Altyazili)\b/gi, ' ')
    .replace(/[([{](?:19|20)\d{2}[)\]}]/g, ' ')
    .replace(/\s*[-|:]?\s*S\d{1,3}\s*E\d{1,4}\b.*$/i, '')
    .replace(/\s*[|:]?\s*\d+\.?\s*(?:Sezon|Bölüm|Bolum)\b.*$/i, '')
    .replace(/[\[\]{}()]/g, ' ').replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  const trailingYear = title.match(/\s+((?:19|20)\d{2})\s*$/)?.[1];
  if (trailingYear) title = title.replace(/\s+(?:19|20)\d{2}\s*$/, '');
  title = title.replace(/^[\s|:.-]+|[\s|:.-]+$/g, '').trim();
  // Çift dilli başlıklar ayrı ayrı aranır; Dead-End gibi gerçek adlar bölünmez.
  const parts = title.split(/\s+[-–—|/]\s+/).map(value => value.trim()).filter(value => value.length >= 2);
  const ordered = parts.length > 1 ? [...parts.slice(0, 2), title] : [title];
  const seen = new Set<string>();
  const queries = ordered.filter(value => { const key = normalizeTmdbTitle(value); if (key.length < 2 || seen.has(key)) return false; seen.add(key); return true; }).slice(0, 3);
  return { queries, year: Number(markedYear || trailingYear) || undefined };
}
export function tmdbTitleScore(candidate: TmdbCandidate, queries: string[], requestedYear?: number): number {
  const names = [candidate.title, candidate.name, candidate.original_title, candidate.original_name].filter(Boolean).map(name => normalizeTmdbTitle(name!));
  let best = 0;
  for (const raw of queries) {
    const query = normalizeTmdbTitle(raw), tokens = new Set(query.split(' '));
    for (const name of names) {
      if (query === name) { best = 1; continue; }
      const other = new Set(name.split(' '));
      const common = [...tokens].filter(token => other.has(token)).length;
      best = Math.max(best, 2 * common / (tokens.size + other.size));
    }
  }
  const year = Number((candidate.release_date || candidate.first_air_date || '').slice(0, 4));
  // Sağlayıcıdaki yanlış yıl, adı birebir eşleşen bir filmi elememeli.
  return best + (requestedYear && year === requestedYear ? 0.08 : 0);
}
export function rankTmdbCandidates(candidates: TmdbCandidate[], queries: string[], year?: number): TmdbCandidate[] {
  const unique = new Map<number, TmdbCandidate>();
  for (const candidate of candidates) if (Number.isInteger(candidate.id) && candidate.id > 0 && candidate.adult !== true) unique.set(candidate.id, candidate);
  return [...unique.values()].sort((a, b) => tmdbTitleScore(b, queries, year) - tmdbTitleScore(a, queries, year) || (b.popularity || 0) - (a.popularity || 0));
}
