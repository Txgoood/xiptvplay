import type { MediaItem } from '../types';
import { buildApiUrl } from '../config/api';
import type { ChildAge } from './familyProfiles';
import { FamilyProfilesService } from './familyProfiles';

export interface AutoChildScan {
  suggestedCategoryKeys: string[];
  suggestedItemIds: string[];
  scannedItemIds: string[];
  checkedMovies: number;
  acceptedMovies: number;
  unknownMovies: number;
  unscannedMovies: number;
  suggestedChannelCount: number;
  scannedChannels: number;
  rejectedChannels: number;
}

const isTr = (name: string) => /^TR(?:$|[^A-Za-z0-9])/i.test(name.trim());
const isChildCategory = (name: string) => /(?:^|[^a-zğüşöçı0-9])(çocuk|cocuk|kids?|junior|baby|çizgi|cizgi|cartoon|animasyon|animation)(?:$|[^a-zğüşöçı0-9])/i.test(name);
const isSensitiveCategory = (name: string) => /(?:xxx|adult|18\s*\+|erotik|erotic|porn|porno|korku|horror|aksiyon|action|savaş|war|suç|crime)/i.test(name);

// TMDB lookups run only for potential child movies/series and are capped per scan.
// For larger libraries the next eligible batch is picked on subsequent scans.
const SCAN_BATCH_LIMIT = 200;
const CHECK_BATCH_SIZE = 15;

export class ChildAutoScanService {
  static async analyze(
    items: MediaItem[], ageLimit: ChildAge, onProgress?: (message: string) => void,
    alreadyCheckedIds: string[] = [],
    scopeCategoryKey?: string,
  ): Promise<AutoChildScan> {
    const result: AutoChildScan = {
      suggestedCategoryKeys: [], suggestedItemIds: [], scannedItemIds: [],
      checkedMovies: 0, acceptedMovies: 0, unknownMovies: 0, unscannedMovies: 0,
      suggestedChannelCount: 0, scannedChannels: 0, rejectedChannels: 0,
    };
    const allTr = items.filter(item => isTr(item.category || '') && (!scopeCategoryKey || FamilyProfilesService.categoryKey(item) === scopeCategoryKey));
    const live = allTr.filter(item => item.type === 'live');
    result.scannedChannels = live.length;
    const trustedChannels = live.filter(item => isChildCategory(item.category || '') && !isSensitiveCategory(item.category || ''));
    result.suggestedCategoryKeys = [...new Set(trustedChannels.map(FamilyProfilesService.categoryKey))];
    result.suggestedChannelCount = trustedChannels.length;
    result.rejectedChannels = live.length - trustedChannels.length;
    onProgress?.(`${live.length} TR canlı kanal değerlendirildi. Film ve diziler kontrol ediliyor...`);

    const alreadyChecked = new Set(alreadyCheckedIds);
    const candidates = allTr.filter(item => item.type !== 'live'
      && !isSensitiveCategory(item.category || '')
      && !alreadyChecked.has(item.id));
    const scan = candidates.slice(0, SCAN_BATCH_LIMIT);
    result.scannedItemIds = scan.map(item => item.id);
    result.unscannedMovies = Math.max(0, candidates.length - scan.length);
    for (let i = 0; i < scan.length; i += CHECK_BATCH_SIZE) {
      const batch = scan.slice(i, i + CHECK_BATCH_SIZE);
      try {
        const response = await fetch(buildApiUrl('/api/tmdb/age-check'), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: batch.map(item => ({ id: item.id, title: item.title, type: item.type, year: item.year })) }),
        });
        if (!response.ok) throw new Error('TMDB yaş kontrolü kullanılamıyor (HTTP ' + response.status + ').');
        const data = await response.json();
        if (!Array.isArray(data.results)) throw new Error('TMDB yaş kontrolü geçersiz yanıt verdi.');
        for (const entry of data.results) {
          result.checkedMovies++;
          if (typeof entry.minimumAge === 'number' && entry.minimumAge <= ageLimit && entry.confident === true) {
            result.suggestedItemIds.push(entry.id);
            result.acceptedMovies++;
          } else result.unknownMovies++;
        }
      } catch (error: any) {
        // Fail closed: incomplete batches must not be approved.
        result.unknownMovies += batch.length;
        result.checkedMovies += batch.length;
        onProgress?.(error?.message || 'TMDB doğrulama hatası; bu içerikler engellendi.');
      }
      onProgress?.(`Yaş kontrolü: ${Math.min(i + batch.length, scan.length)}/${scan.length} · uygun ${result.acceptedMovies}`);
    }
    return result;
  }
}
