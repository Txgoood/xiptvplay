import type { MediaItem } from '../types';

export type ChildAge = 3 | 7 | 13 | 16;
export interface FamilyProfile {
  id: string;
  name: string;
  kind: 'adult' | 'child';
  ageLimit?: ChildAge;
  allowedCategories: string[];
  allowedItemIds: string[];
}
export interface FamilyConfiguration {
  version: 1;
  profiles: FamilyProfile[];
  pinSalt: string;
  pinHash: string;
}

const CONFIG_KEY = 'xiptvplay_family_profiles_v1';
const ATTEMPTS_KEY = 'xiptvplay_family_pin_attempts_v1';

const hex = (array: Uint8Array) => Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
const bytes = (hexString: string) => new Uint8Array((hexString.match(/.{2}/g) || []).map(part => parseInt(part, 16)));

async function hashPin(pin: string, salt: string): Promise<string> {
  const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({
    name: 'PBKDF2', salt: bytes(salt) as BufferSource, iterations: 180000, hash: 'SHA-256',
  }, material, 256);
  return hex(new Uint8Array(bits));
}

export const FamilyProfilesService = {
  get(): FamilyConfiguration | null {
    try {
      const value = localStorage.getItem(CONFIG_KEY);
      if (!value) return null;
      const config = JSON.parse(value) as FamilyConfiguration;
      return config?.version === 1 && Array.isArray(config.profiles) && config.profiles.length >= 2
        && typeof config.pinSalt === 'string' && typeof config.pinHash === 'string' ? config : null;
    } catch { return null; }
  },
  async create(pin: string, childName: string, ageLimit: ChildAge): Promise<FamilyConfiguration> {
    if (!/^\d{4,6}$/.test(pin)) throw new Error('PIN 4-6 rakam olmalı.');
    const salt = hex(crypto.getRandomValues(new Uint8Array(16)));
    const config: FamilyConfiguration = {
      version: 1,
      pinSalt: salt,
      pinHash: await hashPin(pin, salt),
      profiles: [
        { id: 'parent', name: 'Ana Profil', kind: 'adult', allowedCategories: [], allowedItemIds: [] },
        { id: 'child', name: childName.trim() || 'Çocuk', kind: 'child', ageLimit, allowedCategories: [], allowedItemIds: [] },
      ],
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return config;
  },
  save(config: FamilyConfiguration): void {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  },
  async verifyPin(pin: string, config: FamilyConfiguration): Promise<boolean> {
    let guard: { count: number; until: number } = { count: 0, until: 0 };
    try { guard = JSON.parse(localStorage.getItem(ATTEMPTS_KEY) || '{}'); } catch {}
    if ((guard.until || 0) > Date.now()) {
      throw new Error('Çok sayıda hatalı deneme. 30 saniye sonra yeniden deneyin.');
    }
    if (!/^\d{4,6}$/.test(pin)) return false;
    const actual = await hashPin(pin, config.pinSalt);
    const valid = actual.length === config.pinHash.length && actual.split('').reduce((v, char, i) => v | (char.charCodeAt(0) ^ config.pinHash.charCodeAt(i)), 0) === 0;
    if (valid) {
      localStorage.removeItem(ATTEMPTS_KEY);
    } else {
      const count = (guard.count || 0) + 1;
      localStorage.setItem(ATTEMPTS_KEY, JSON.stringify({ count: count >= 5 ? 0 : count, until: count >= 5 ? Date.now() + 30000 : 0 }));
    }
    return valid;
  },
  categoryKey(item: MediaItem): string {
    return `${item.playlistId || ''}::${item.type}::${(item.category || 'Genel').trim()}`;
  },
  allows(profile: FamilyProfile | null, item: MediaItem): boolean {
    if (!profile || profile.kind === 'adult') return true;
    return profile.allowedItemIds.includes(item.id) || profile.allowedCategories.includes(this.categoryKey(item));
  },
};
