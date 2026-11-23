import { Capacitor } from '@capacitor/core';
import { CapacitorHttp } from '@capacitor/core';

export const isNative = (): boolean => {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
};

export const IPTV_UA = 'IPTVSmartersPro';

export function providerUrl(input: string): URL {
  const value = input.trim();
  const url = new URL(/^[a-z][a-z\d+.-]*:\/\//i.test(value) ? value : `http://${value}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Geçerli bir HTTP veya HTTPS sunucu adresi girin.');
  }
  url.hash = '';
  return url;
}

export function detectProviderInput(input: string, fallback: 'xtream' | 'm3u') {
  const url = providerUrl(input);
  const endpoint = url.pathname.replace(/\/+$/, '');
  if (/\/(?:get\.php|[^/]+\.m3u8?)$/i.test(endpoint)) {
    return { type: 'm3u' as const, m3uUrl: url.href };
  }
  if (/\/player_api\.php$/i.test(endpoint) || fallback === 'xtream') {
    return {
      type: 'xtream' as const,
      serverUrl: url.origin + endpoint.replace(/\/player_api\.php$/i, ''),
      username: url.searchParams.get('username'),
      password: url.searchParams.get('password'),
    };
  }
  return { type: 'm3u' as const, m3uUrl: url.href };
}

export async function getProviderResponse(
  input: string,
  timeoutMs = 25000,
  request: (options: Parameters<typeof CapacitorHttp.get>[0]) => Promise<{
    status: number; headers: Record<string, string>; data?: unknown;
  }> = options => CapacitorHttp.get(options)
) {
  let url = providerUrl(input);
  let canUpgrade = url.protocol === 'http:';
  const deadline = Date.now() + timeoutMs;
  for (let hop = 0; hop <= 5; hop += 1) {
    const remaining = deadline - Date.now();
    if (remaining <= 0) break;
    const response = await request({
      url: url.href,
      headers: { 'User-Agent': IPTV_UA, Accept: '*/*' },
      responseType: 'text',
      disableRedirects: true,
      readTimeout: remaining,
      connectTimeout: Math.min(remaining, 15000),
    });
    if (response.status === 404 && canUpgrade && hop === 0) {
      url.protocol = 'https:';
      canUpgrade = false;
      continue;
    }
    if (![301, 302, 303, 307, 308].includes(response.status)) {
      return { ...response, url: url.href };
    }
    const location = Object.entries(response.headers).find(([name]) => name.toLowerCase() === 'location')?.[1];
    if (!location) throw new Error('Sunucu geçersiz yönlendirme döndürdü.');
    const next = providerUrl(new URL(location, url).href);
    if (url.protocol === 'https:' && next.protocol !== 'https:') {
      throw new Error('Sunucu güvenli bağlantıdan HTTP adresine yönlendirdi.');
    }
    url = next;
  }
  throw new Error('Sunucu yönlendirme veya süre sınırını aştı.');
}

export async function httpGetText(
  url: string,
  timeoutMs = 25000
): Promise<{ status: number; text: string }> {
  if (isNative()) {
    try {
      const response = await CapacitorHttp.get({
        url,
        headers: { 'User-Agent': IPTV_UA, Accept: '*/*' },
        // Keep large catalogs as text across the native bridge; parse once in JS.
        responseType: 'text',
        readTimeout: timeoutMs,
        connectTimeout: timeoutMs,
      });

      let data = response.data;
      if (typeof data !== 'string') {
        data = JSON.stringify(data);
      }
      return { status: response.status, text: data };
    } catch (err: any) {
      return { status: 500, text: err.message || 'Native network error' };
    }
  } else {
    // Web fallback via internal proxy
    const resp = await fetch(`/api/iptv/proxy?url=${encodeURIComponent(url)}`);
    const text = await resp.text();
    return { status: resp.status, text };
  }
}

export async function httpGetJson(url: string) {
  const result = await httpGetText(url);
  try {
    return JSON.parse(result.text);
  } catch {
    return null;
  }
}

/** Strict catalog requests report safe errors without exposing URLs or credentials. */
export async function httpGetCatalogJson(url: string, timeoutMs = 60000): Promise<any> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      isNative()
        ? getProviderResponse(url, timeoutMs).catch((error: any) => {
            // Native exceptions may contain the credential-bearing URL.
            throw new Error(/timeout|timed out/i.test(String(error?.message))
              ? 'İstek zaman aşımına uğradı.'
              : 'Android ağ bağlantısı kurulamadı (DNS, bağlantı veya TLS hatası).');
          })
        : httpGetText(url, timeoutMs).then(result => ({ status: result.status, data: result.text })),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('İstek zaman aşımına uğradı.')), timeoutMs);
      }),
    ]);
    if (result.status < 200 || result.status >= 300) {
      if (result.status === 500 && /timeout|timed out/i.test(String(result.data))) {
        throw new Error('İstek zaman aşımına uğradı.');
      }
      throw new Error(`Sunucuya erişilemedi (HTTP ${result.status}).`);
    }
    try {
      // Capacitor may auto-parse application/json even with responseType text.
      // Reuse that object instead of stringify -> parse for a 70k-item archive.
      return typeof result.data === 'string' ? JSON.parse(result.data) : result.data;
    } catch {
      throw new Error('Sunucu geçerli JSON yerine boş veya farklı biçimde yanıt verdi.');
    }
  } finally {
    if (timer) clearTimeout(timer);
  }
}
