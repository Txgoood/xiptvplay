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

export async function fetchWithProtocolFallback(url: string) {
  // Try original URL
  let result = await httpGetText(url);
  if (result.status >= 200 && result.status < 300) return result;

  // Try fallback protocol
  const fallbackUrl = url.startsWith('http://')
    ? url.replace('http://', 'https://')
    : url.replace('https://', 'http://');

  return await httpGetText(fallbackUrl);
}

/** Strict catalog requests report safe errors without exposing URLs or credentials. */
export async function httpGetCatalogJson(url: string, timeoutMs = 60000): Promise<any> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const result = await Promise.race([
      isNative()
        ? CapacitorHttp.get({
            url,
            headers: { 'User-Agent': IPTV_UA, Accept: '*/*' },
            responseType: 'text',
            readTimeout: timeoutMs,
            connectTimeout: Math.min(timeoutMs, 15000),
          }).catch((error: any) => {
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
