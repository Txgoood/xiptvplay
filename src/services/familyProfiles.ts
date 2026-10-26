import type { MediaItem } from '../types';

export type ChildAge = 3 | 7 | 13 | 16;
export interface FamilyProfile {
  id: string;
  name: string;
  kind: 'adult' | 'child';
  role?: 'admin' | 'member';
  ageLimit?: ChildAge;
  icon?: string;
  pinSalt?: string;
  pinHash?: string;
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
      return config?.version === 1 && Array.isArray(config.profiles) && config.profiles.length >= 1
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
        { id: 'parent', name: 'Ana Profil', kind: 'adult', role: 'admin', allowedCategories: [], allowedItemIds: [] },
        { id: 'child', name: childName.trim() || 'Çocuk', kind: 'child', ageLimit, allowedCategories: [], allowedItemIds: [] },
      ],
    };
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    return config;
  },
  save(config: FamilyConfiguration): void {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
  },
  async add(config: FamilyConfiguration, options: { name: string; kind: 'adult' | 'child'; ageLimit?: ChildAge; pin?: string; copyFromId?: string }): Promise<FamilyConfiguration> {
    const name = options.name.trim().slice(0, 32);
    if (!name) throw new Error('Profil adı gerekli.');
    if (config.profiles.length >= 100) throw new Error('Cihaz güvenliği için 100 profil sınırı uygulandı.');
    if (options.pin && !/^\\d{4,6}$/.test(options.pin)) throw new Error('PIN 4–6 rakam olmalı.');
    const template = options.copyFromId ? config.profiles.find(p => p.id === options.copyFromId && p.kind === 'child') : null;
    const profile: FamilyProfile = {
      id: 'profile-' + crypto.randomUUID(), name, kind: options.kind, role: 'member',
      ageLimit: options.kind === 'child' ? (options.ageLimit || 7) : undefined,
      allowedCategories: options.kind === 'child' && template ? [...template.allowedCategories] : [],
      allowedItemIds: options.kind === 'child' && template ? [...template.allowedItemIds] : [],
    };
    if (options.kind === 'adult' && options.pin) {
      profile.pinSalt = hex(crypto.getRandomValues(new Uint8Array(16)));
      profile.pinHash = await hashPin(options.pin, profile.pinSalt);
    }
    const next = { ...config, profiles: [...config.profiles, profile] };
    this.save(next);
    return next;
  },
  delete(config: FamilyConfiguration, id: string): FamilyConfiguration {
    if (id === 'parent') throw new Error('Ana Profil silinemez.');
    const next = { ...config, profiles: config.profiles.filter(p => p.id !== id) };
    this.save(next);
    return next;
  },
  async verifyProfilePin(pin: string, profile: FamilyProfile, config: FamilyConfiguration): Promise<boolean> {
    if (profile.id === 'parent') return this.verifyPin(pin, config);
    if (!profile.pinHash || !profile.pinSalt) return true;
    return this.verifyPin(pin, { ...config, pinHash: profile.pinHash, pinSalt: profile.pinSalt });
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
    return profile.allowedItemIds.includes(item.id) || (Boolean(item.parentSeriesId) && profile.allowedItemIds.includes(item.parentSeriesId!)) || profile.allowedCategories.includes(this.categoryKey(item));
  },
};
