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
