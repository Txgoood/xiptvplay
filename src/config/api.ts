/**
 * Centralized API & Backend Configuration for XIPTV Play.
 * 
 * IMPORTANT:
 * - In Android APK (Capacitor), relative URLs like '/api/...' fail because they resolve to
 *   'capacitor://localhost/api/...' or 'http://localhost/api/...', returning index.html instead of backend data.
 * - Replace 'https://YOUR-REAL-RENDER-URL' below with your deployed Render backend service URL
 *   (e.g., 'https://xiptv-play-backend.onrender.com'), or set the VITE_API_BASE_URL environment variable.
 */

export const DEFAULT_API_BASE_URL = 'https://GERCEK-RENDER-BACKEND-URL';

/**
 * Returns the current active API base URL.
 * Prioritizes:
 * 1. VITE_API_BASE_URL environment variable (if defined)
 * 2. Window origin in web browser (when running fullstack web)
 * 3. DEFAULT_API_BASE_URL ('https://YOUR-REAL-RENDER-URL') for native Android Capacitor APK
 */
export function getApiBaseUrl(): string {
  const envUrl = import.meta.env.VITE_API_BASE_URL;
  if (envUrl && typeof envUrl === 'string' && envUrl.trim().length > 0) {
    return envUrl.trim().replace(/\/+$/, '');
  }

  if (typeof window !== 'undefined') {
    const isCapacitorNative =
      window.location.protocol === 'capacitor:' ||
      (window as any)?.Capacitor?.isNativePlatform?.();

    // Inside Android APK, we must always target the remote backend URL
    if (isCapacitorNative) {
      return DEFAULT_API_BASE_URL.replace(/\/+$/, '');
    }

    // In web browser preview/production served by Express backend
    if (
      window.location.origin &&
      !window.location.origin.includes('localhost:5173') &&
      !window.location.protocol.startsWith('capacitor')
    ) {
      return window.location.origin.replace(/\/+$/, '');
    }
  }

  return DEFAULT_API_BASE_URL.replace(/\/+$/, '');
}

/**
 * Builds a full absolute URL for a backend API route.
 * Example: buildApiUrl('/api/iptv/xtream/verify') -> 'https://YOUR-REAL-RENDER-URL/api/iptv/xtream/verify'
 */
export function buildApiUrl(path: string): string {
  const base = getApiBaseUrl();
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  return `${base}${cleanPath}`;
}

/**
 * Builds a backend proxy URL for IPTV stream chunks, video playlists, and channel posters.
 * Preserves the original external IPTV URL without modifying the provider's host.
 * Example: buildProxyUrl('http://iptv.server:8080/live/u/p/1.ts')
 * -> 'https://YOUR-REAL-RENDER-URL/api/iptv/proxy?url=http%3A%2F%2Fiptv.server%3A8080%2Flive%2Fu%2Fp%2F1.ts'
 */
export function buildProxyUrl(targetMediaUrl: string): string {
  if (!targetMediaUrl) return '';
  // Avoid double wrapping if already a proxy URL
  if (targetMediaUrl.includes('/api/iptv/proxy?url=')) {
    return targetMediaUrl;
  }
  return buildApiUrl(`/api/iptv/proxy?url=${encodeURIComponent(targetMediaUrl)}`);
}

/**
 * Robust JSON fetcher with HTML / Doctype detection.
 * Prevents "Unexpected token '<', '<!DOCTYPE...' is not valid JSON" errors
 * by checking HTTP status and Content-Type headers before parsing.
 */
export async function safeFetchJson<T = any>(
  endpointPath: string,
  options: RequestInit = {}
): Promise<{ success: boolean; data?: T; error?: string; statusCode: number }> {
  const fullUrl = buildApiUrl(endpointPath);
  const baseUrl = getApiBaseUrl();

  try {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Accept')) {
      headers.set('Accept', 'application/json, text/plain, */*');
    }

    const resp = await fetch(fullUrl, {
      ...options,
      headers,
    });

    const contentType = (resp.headers.get('content-type') || '').toLowerCase();
    const statusCode = resp.status;
    const rawText = await resp.text();
    const trimmedText = rawText.trim();

    // Check if response is HTML instead of JSON
    if (
      contentType.includes('text/html') ||
      trimmedText.startsWith('<!DOCTYPE') ||
      trimmedText.startsWith('<html')
    ) {
      const isPlaceholder = baseUrl.includes('YOUR-REAL-RENDER-URL');
      let friendlyError = `Backend sunucusundan JSON yerine HTML hata sayfası alındı (HTTP ${statusCode}).`;

      if (isPlaceholder) {
        friendlyError = `Android APK backend adresi henüz yapılandırılmadı! Varsayılan yer tutucu ('${DEFAULT_API_BASE_URL}') kullanılıyor. Lütfen src/config/api.ts dosyasındaki adresi veya VITE_API_BASE_URL değişkenini gerçek Render backend adresinizle değiştirin.`;
      } else {
        friendlyError = `Sunucu (${baseUrl}) geçerli bir JSON yanıtı döndürmedi (HTTP ${statusCode}). Backend servisinizin Render üzerinde aktif olduğunu ve /api/health endpoint'inin çalıştığını kontrol edin.`;
      }

      return {
        success: false,
        error: friendlyError,
        statusCode,
      };
    }

    let parsedJson: any;
    try {
      parsedJson = JSON.parse(trimmedText);
    } catch {
      return {
        success: false,
        error: `Sunucudan gelen veri JSON formatında çözümlenemedi (HTTP ${statusCode}). Backend URL adresini ('${baseUrl}') kontrol edin.`,
        statusCode,
      };
    }

    return {
      success: true,
      data: parsedJson,
      statusCode,
    };
  } catch (err: any) {
    const isNetworkAbort = err.name === 'AbortError';
    const isPlaceholder = baseUrl.includes('YOUR-REAL-RENDER-URL');
    
    let errMsg = err.message || 'Bilinmeyen ağ hatası';
    if (isPlaceholder) {
      errMsg = `Render backend adresi girilmedi ('${DEFAULT_API_BASE_URL}'). Lütfen gerçek Render backend URL adresinizi src/config/api.ts içinde tanımlayın.`;
    } else if (isNetworkAbort) {
      errMsg = `İstek zaman aşımına uğradı (${fullUrl}). Backend sunucusunun uyanık olduğunu teyit edin.`;
    }

    return {
      success: false,
      error: errMsg,
      statusCode: 0,
    };
  }
}
