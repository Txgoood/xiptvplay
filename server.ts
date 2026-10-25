// Disable strict TLS certificate rejection for IPTV servers that use self-signed or expired SSL certs
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import { Readable } from 'stream';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// IPTV Server Compatible User-Agent (VLC/3.0.18 / TiviMate/4.7.0) to bypass server-side blocks
const STANDARD_USER_AGENT = 'VLC/3.0.18';

function getUrlVariants(rawUrl: string): string[] {
  let trimmed = rawUrl.trim();
  if (!trimmed.startsWith('http://') && !trimmed.startsWith('https://')) {
    return [`http://${trimmed}`, `https://${trimmed}`];
  }
  if (trimmed.startsWith('http://')) {
    return [trimmed, trimmed.replace(/^http:\/\//i, 'https://')];
  }
  return [trimmed, trimmed.replace(/^https:\/\//i, 'http://')];
}

function formatNetworkError(err: any, url: string): string {
  const msg = err.message || '';
  const code = err.code || err.cause?.code || '';
  if (err.name === 'AbortError') {
    return `Zaman aşımı (25s): "${url}" sunucusu yanıt vermedi. Port numarası ve sunucunun açık olduğunu kontrol edin.`;
  }
  if (code === 'ECONNREFUSED' || msg.includes('ECONNREFUSED')) {
    return `Bağlantı reddedildi (ECONNREFUSED): Hedef sunucuda port kapalı veya IPTV servisi yanıt vermiyor.`;
  }
  if (code === 'ENOTFOUND' || msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
    return `Alan adı çözülemedi (DNS Hatası): Sunucu adresinin ("${url}") doğru yazıldığından emin olun.`;
  }
  if (code === 'ETIMEDOUT' || msg.includes('ETIMEDOUT')) {
    return `Ağ zaman aşımı (ETIMEDOUT): Sunucu güvenlik duvarı (Firewall) bağlantıyı engelliyor olabilir.`;
  }
  if (msg.includes('certificate') || msg.includes('SSL') || msg.includes('TLS')) {
    return `SSL/TLS Hatası: Sunucu güvenli bağlantı desteklemiyor olabilir (HTTP protokolü denenmeli).`;
  }
  return `Sunucuya bağlanılamadı (${code || 'Hata'}): ${msg}`;
}

/**
 * Robust redirect follower (handles 301, 302, 303, 307, 308) while preserving
 * custom headers (VLC User-Agent, Range) and upstream session cookies.
 */
async function fetchWithFollowRedirects(
  targetUrl: string,
  options: RequestInit = {},
  maxRedirects = 10
): Promise<{ response: globalThis.Response; finalUrl: string }> {
  let currentUrl = targetUrl;
  let redirectsCount = 0;
  const cookieJar = new Map<string, string>();

  while (redirectsCount < maxRedirects) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('User-Agent')) {
      headers.set('User-Agent', STANDARD_USER_AGENT);
    }

    if (cookieJar.size > 0) {
      const cookieHeader = Array.from(cookieJar.entries())
        .map(([k, v]) => `${k}=${v}`)
        .join('; ');
      headers.set('Cookie', cookieHeader);
    }

    const resp = await fetch(currentUrl, {
      ...options,
      headers,
      redirect: 'manual', // Manually capture redirects to maintain headers & cookies
    });

    // Capture cookies sent on redirect
    const setCookie = resp.headers.get('set-cookie');
    if (setCookie) {
      setCookie.split(',').forEach((c) => {
        const parts = c.trim().split(';')[0].split('=');
        if (parts.length >= 2) {
          cookieJar.set(parts[0].trim(), parts.slice(1).join('=').trim());
        }
      });
    }

    // Check for HTTP redirect status codes (301, 302, 303, 307, 308)
    if ([301, 302, 303, 307, 308].includes(resp.status)) {
      const location = resp.headers.get('location');
      if (location) {
        redirectsCount++;
        currentUrl = new URL(location.trim(), currentUrl).toString();
        // 301, 302, 303 redirect switches method to GET
        if ([301, 302, 303].includes(resp.status)) {
          options = { ...options, method: 'GET', body: undefined };
        }
        continue;
      }
    }

    return { response: resp, finalUrl: currentUrl };
  }

  throw new Error(`Yönlendirme döngüsü: ${maxRedirects} adımdan fazla HTTP yönlendirme tespit edildi.`);
}

/**
 * Wraps stream URLs located under #EXTINF tags in M3U files with /api/iptv/proxy?url=...
 * to protect against browser Mixed Content (HTTP/HTTPS) and CORS blocking.
 */
function wrapM3UStreamUrls(rawM3u: string, baseUrl: string): string {
  const lines = rawM3u.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  let expectStreamUrl = false;

  const rewrittenLines = lines.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;

    // Recognize #EXTINF directive (with or without colon)
    if (/^#EXTINF[:\s]/i.test(trimmed)) {
      expectStreamUrl = true;
      return line;
    }

    // Ignore other M3U directives (#EXTGRP, #EXTVLCOPT, comments, etc.) without losing expectStreamUrl
    if (trimmed.startsWith('#')) {
      return line;
    }

    // This line is a media stream URL
    if (
      expectStreamUrl ||
      /^(https?|rtmp|rtsp|mms):\/\//i.test(trimmed) ||
      (!trimmed.startsWith('#') && (trimmed.includes('/') || trimmed.includes('.')))
    ) {
      expectStreamUrl = false;
      // Avoid double wrapping
      if (trimmed.startsWith('/api/iptv/proxy') || trimmed.includes('/api/iptv/proxy?url=')) {
        return line;
      }
      try {
        const abs = new URL(trimmed, baseUrl).toString();
        return `/api/iptv/proxy?url=${encodeURIComponent(abs)}`;
      } catch {
        return line;
      }
    }

    return line;
  });

  return rewrittenLines.join('\n');
}

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT || '3000', 10);

  app.use(express.json({ limit: '100mb' }));
  app.use(express.urlencoded({ extended: true, limit: '100mb' }));

  // Global CORS headers for all API requests
  app.use('/api', (req, res, next) => {
    res.header('Access-Control-Allow-Origin', '*');
    res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Range, X-Requested-With');
    res.header('Access-Control-Expose-Headers', 'Content-Range, Content-Length, Accept-Ranges');
    if (req.method === 'OPTIONS') {
      return res.sendStatus(200);
    }
    next();
  });

  // Health check endpoint
  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Real Latency Ping endpoint with protocol fallback
  app.post('/api/iptv/ping', async (req: Request, res: Response) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'URL parametresi gerekli' });
    }

    const variants = getUrlVariants(url);
    let lastError = '';

    for (const target of variants) {
      try {
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);

        await fetch(target, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': STANDARD_USER_AGENT,
          },
        }).catch(() => {
          return fetch(target, {
            method: 'GET',
            signal: controller.signal,
            headers: {
              'User-Agent': STANDARD_USER_AGENT,
            },
          });
        });

        clearTimeout(timeoutId);
        const pingMs = Math.max(12, Date.now() - startTime);
        return res.json({ pingMs, reachable: true, activeProtocol: target.startsWith('https') ? 'https' : 'http' });
      } catch (err: any) {
        lastError = formatNetworkError(err, target);
      }
    }

    return res.json({
      pingMs: null,
      reachable: false,
      error: lastError || 'Sunucuya ulaşılamadı. Port ve adresi kontrol edin.',
    });
  });

  // Generic IPTV Proxy endpoint (bypasses browser CORS & Mixed Content with full 206 Range, Accept-Ranges, & M3U8 rewriting)
  app.all('/api/iptv/proxy', async (req: Request, res: Response) => {
    // Handle CORS preflight OPTIONS request immediately
    if (req.method === 'OPTIONS') {
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Range, Authorization, X-Requested-With, If-Range, Accept'
      );
      res.setHeader(
        'Access-Control-Expose-Headers',
        'Content-Range, Content-Length, Accept-Ranges, Content-Type, Content-Disposition, ETag, Last-Modified'
      );
      return res.status(204).end();
    }

    const targetUrl = (req.query.url as string) || req.body?.url;
    if (!targetUrl) {
      return res.status(400).json({ error: 'Hedef IPTV URL parametresi belirtilmedi.' });
    }

    const controller = new AbortController();
    // Cancel upstream connection if client browser closes socket / seeks
    req.on('close', () => {
      controller.abort();
    });

    try {
      const headers: Record<string, string> = {
        'User-Agent': STANDARD_USER_AGENT,
        'Accept': '*/*',
        'Accept-Encoding': 'identity', // Ensure raw byte streams are not gzipped when seeking byte ranges
      };

      if (req.headers.range) {
        headers['Range'] = req.headers.range as string;
      }
      if (req.headers['if-range']) {
        headers['If-Range'] = req.headers['if-range'] as string;
      }

      // Initial connection timeout (20s for handshake)
      const connectTimeout = setTimeout(() => controller.abort(), 20000);

      const USER_AGENTS = [
        'IPTVSmartersPro',
        STANDARD_USER_AGENT,
        'okhttp/4.9.3',
        'Lavf/60.3.100',
        'ExoPlayerLib/2.18.7',
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      ];

      let response: any = null;
      let finalUrl = targetUrl;
      let lastErrorResponse: any = null;

      for (const ua of USER_AGENTS) {
        headers['User-Agent'] = ua;
        try {
          const res = await fetchWithFollowRedirects(targetUrl, {
            method: req.method === 'POST' ? 'POST' : req.method === 'HEAD' ? 'HEAD' : 'GET',
            headers,
            signal: controller.signal,
          });
          response = res.response;
          finalUrl = res.finalUrl;
          if (response && response.status < 400) break;
          lastErrorResponse = response;
        } catch (err) {
          console.warn(`[Proxy] UA ${ua} failed:`, err);
        }
      }
      
      if (!response && lastErrorResponse) {
          response = lastErrorResponse;
      }
      
      if (!response) {
         throw new Error('All User-Agents failed to connect.');
      }

      clearTimeout(connectTimeout);

      const upstreamType = (response.headers.get('content-type') || '').toLowerCase();
      let pathname = '';
      try {
        pathname = new URL(finalUrl).pathname.toLowerCase();
      } catch {
        pathname = finalUrl.toLowerCase();
      }

      if (response.status >= 400) {
        return res.status(response.status).json({
          error: `IPTV sunucusu HTTP ${response.status} döndürdü. Hesap/abonelik, kullanıcı adı-şifre veya yayın ID'sini kontrol edin (bazı sağlayıcılar bulut/sunucu IP'lerini engeller).`,
        });
      }

      let isM3u8 = upstreamType.includes('mpegurl') || pathname.endsWith('.m3u8') || pathname.endsWith('.m3u');
      let m3u8Text: string | undefined = undefined;

      if (!isM3u8 && req.method !== 'HEAD' && (upstreamType.includes('text/') || !upstreamType || upstreamType.includes('octet-stream')) && !pathname.endsWith('.ts') && !pathname.endsWith('.mp4') && !pathname.endsWith('.mkv')) {
        try {
          const arrayBuf = await response.arrayBuffer();
          const firstBytes = Buffer.from(arrayBuf.slice(0, 16)).toString('utf8');
          if (firstBytes.includes('#EXTM3U') || firstBytes.includes('#EXTINF')) {
            isM3u8 = true;
            m3u8Text = Buffer.from(arrayBuf).toString('utf8');
          } else {
            const status = response.status;
            res.status(status);
            res.setHeader('Content-Type', upstreamType || 'application/octet-stream');
            res.setHeader('Access-Control-Allow-Origin', '*');
            res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
            return res.send(Buffer.from(arrayBuf));
          }
        } catch {
          // fallback
        }
      }

      let contentType = 'video/mp4';
      if (isM3u8) {
        contentType = 'application/vnd.apple.mpegurl; charset=utf-8';
      } else if (pathname.endsWith('.ts')) {
        contentType = 'video/mp2t';
      } else if (pathname.endsWith('.mkv')) {
        contentType = 'video/x-matroska';
      } else if (upstreamType.startsWith('video/') || upstreamType.startsWith('audio/')) {
        contentType = upstreamType;
      } else {
        contentType = 'video/mp4';
      }

      const status = response.status;

      res.status(status);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader(
        'Access-Control-Allow-Headers',
        'Content-Type, Range, Authorization, X-Requested-With, If-Range'
      );
      res.setHeader(
        'Access-Control-Expose-Headers',
        'Content-Range, Content-Length, Accept-Ranges, Content-Type, Content-Disposition, ETag, Last-Modified'
      );

      // Pass forward Range and partial content streaming headers
      const contentRange = response.headers.get('content-range');
      if (contentRange) {
        res.setHeader('Content-Range', contentRange);
      }

      // Ensure Accept-Ranges is advertised as 'bytes' to enable scrubbing/seeking
      const acceptRanges = response.headers.get('accept-ranges') || 'bytes';
      res.setHeader('Accept-Ranges', acceptRanges);

      // Do NOT set upstream Content-Length for M3U8 playlists because the rewritten text length will differ!
      const contentLength = response.headers.get('content-length');
      if (contentLength && !isM3u8) {
        res.setHeader('Content-Length', contentLength);
      }

      const lastModified = response.headers.get('last-modified');
      if (lastModified) {
        res.setHeader('Last-Modified', lastModified);
      }

      const etag = response.headers.get('etag');
      if (etag) {
        res.setHeader('ETag', etag);
      }

      if (req.method === 'HEAD') {
        return res.end();
      }

      if (contentType.includes('application/json')) {
        const json = await response.json();
        return res.json(json);
      }

      // If it is an M3U8 or M3U playlist, rewrite relative URLs and sub-playlists so they route through proxy
      if (isM3u8) {
        const text = m3u8Text ?? (await response.text());
        const effectiveBaseUrl = finalUrl || response.url || targetUrl;

        const rewritten = text
          .split('\n')
          .map((line: string) => {
            const trimmed = line.trim();
            if (!trimmed) return line;

            // Handle HLS tags with URIs (like #EXT-X-KEY, #EXT-X-MEDIA, #EXT-X-MAP)
            if (trimmed.startsWith('#')) {
              if (trimmed.includes('URI=')) {
                return trimmed.replace(/URI=(["'])(.*?)\1/g, (match: string, quote: string, uri: string) => {
                  try {
                    const abs = new URL(uri, effectiveBaseUrl).toString();
                    return `URI="${quote ? '' : ''}/api/iptv/proxy?url=${encodeURIComponent(abs)}"`;
                  } catch {
                    return match;
                  }
                });
              }
              return line;
            }

            // Segment or sub-variant playlist URL
            try {
              const abs = new URL(trimmed, effectiveBaseUrl).toString();
              return `/api/iptv/proxy?url=${encodeURIComponent(abs)}`;
            } catch {
              return line;
            }
          })
          .join('\n');

        res.removeHeader('Content-Length');
        res.setHeader('Content-Type', 'application/vnd.apple.mpegurl; charset=utf-8');
        return res.send(rewritten);
      }

      if (contentType.includes('text/')) {
        const text = await response.text();
        return res.send(text);
      }

      // Stream binary chunks & video partial content directly
      if (response.body) {
        // @ts-ignore Node Readable from web stream
        const nodeStream = Readable.fromWeb(response.body as any);
        nodeStream.on('error', (_err) => {
          if (!res.headersSent) {
            res.status(502).end();
          } else {
            res.end();
          }
        });
        return nodeStream.pipe(res);
      } else {
        const arrayBuf = await response.arrayBuffer();
        return res.send(Buffer.from(arrayBuf));
      }
    } catch (err: any) {
      if (controller.signal.aborted) {
        return; // Client disconnected or seeked, normal behavior
      }
      return res.status(502).json({
        error: formatNetworkError(err, targetUrl),
      });
    }
  });

  // Xtream Codes Verification Endpoint with Protocol Fallback (HTTP / HTTPS)
  app.post('/api/iptv/xtream/verify', async (req: Request, res: Response) => {
    const { serverUrl, username, password } = req.body;
    if (!serverUrl || !username || !password) {
      return res.status(400).json({
        success: false,
        error: 'Sunucu URL, kullanıcı adı ve şifre zorunludur.',
      });
    }

    const variants = getUrlVariants(serverUrl.replace(/\/+$/, ''));
    let lastError = '';

    for (const baseServer of variants) {
      const apiUrl = `${baseServer}/player_api.php?username=${encodeURIComponent(
        username
      )}&password=${encodeURIComponent(password)}`;

      try {
        const startTime = Date.now();
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 12000);

        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': STANDARD_USER_AGENT,
            'Accept': 'application/json, text/plain, */*',
          },
          signal: controller.signal,
          redirect: 'follow',
        });

        clearTimeout(timeoutId);
        const pingMs = Date.now() - startTime;

        if (!response.ok) {
          lastError = `Sunucu HTTP ${response.status} hatası (${response.statusText}).`;
          continue;
        }

        const text = await response.text();
        let data: any;
        try {
          data = JSON.parse(text);
        } catch {
          lastError = 'Sunucu geçerli bir Xtream JSON yanıtı vermedi. URL veya portu kontrol edin.';
          continue;
        }

        const userInfo = data.user_info;
        const serverInfo = data.server_info;

        if (!userInfo || userInfo.auth !== 1) {
          return res.status(401).json({
            success: false,
            error: 'Kimlik doğrulama başarısız! Kullanıcı adı veya şifre hatalı.',
            pingMs,
          });
        }

        if (userInfo.status && userInfo.status !== 'Active') {
          return res.status(403).json({
            success: false,
            error: `Hesap aktif değil veya süresi dolmuş. Durum: ${userInfo.status}`,
            userInfo,
            serverInfo,
            pingMs,
          });
        }

        return res.json({
          success: true,
          userInfo,
          serverInfo,
          pingMs,
          effectiveServerUrl: baseServer,
        });
      } catch (err: any) {
        lastError = formatNetworkError(err, baseServer);
      }
    }

    return res.status(502).json({
      success: false,
      error: lastError || 'Xtream sunucusuna bağlanılamadı. Sunucu URL ve portunu kontrol edin.',
    });
  });

  // Xtream Codes Full Content Fetcher (Categories & Streams) with Protocol Fallback
  app.post('/api/iptv/xtream/catalog', async (req: Request, res: Response) => {
    const { serverUrl, username, password } = req.body;
    if (!serverUrl || !username || !password) {
      return res.status(400).json({ error: 'Eksik kimlik bilgileri' });
    }

    const variants = getUrlVariants(serverUrl.replace(/\/+$/, ''));
    let workingServer = variants[0];

    // Detect working server variant
    for (const candidate of variants) {
      try {
        const testRes = await fetch(
          `${candidate}/player_api.php?username=${encodeURIComponent(username)}&password=${encodeURIComponent(password)}`,
          { method: 'HEAD', signal: AbortSignal.timeout(5000), redirect: 'follow' }
        );
        if (testRes.ok) {
          workingServer = candidate;
          break;
        }
      } catch {
        // continue
      }
    }

    const baseApi = `${workingServer}/player_api.php?username=${encodeURIComponent(
      username
    )}&password=${encodeURIComponent(password)}`;

    try {
      const fetchWithTimeout = async (action: string, timeoutMs = 18000) => {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), timeoutMs);
        try {
          const resp = await fetch(`${baseApi}&action=${action}`, {
            headers: { 'User-Agent': STANDARD_USER_AGENT },
            signal: controller.signal,
            redirect: 'follow',
          });
          clearTimeout(timeout);
          if (!resp.ok) return [];
          const json = await resp.json();
          return Array.isArray(json) ? json : [];
        } catch {
          clearTimeout(timeout);
          return [];
        }
      };

      const [liveCats, liveStreams, vodCats, vodStreams, seriesCats, seriesList] =
        await Promise.all([
          fetchWithTimeout('get_live_categories', 12000),
          fetchWithTimeout('get_live_streams', 22000),
          fetchWithTimeout('get_vod_categories', 12000),
          fetchWithTimeout('get_vod_streams', 22000),
          fetchWithTimeout('get_series_categories', 12000),
          fetchWithTimeout('get_series', 22000),
        ]);

      // Compact streams to keep transmission lightweight and ultra-fast for 72,000+ items
      const compactLive = (Array.isArray(liveStreams) ? liveStreams : []).map((s: any) => ({
        stream_id: s.stream_id,
        name: s.name,
        stream_icon: s.stream_icon,
        category_id: s.category_id,
        epg_channel_id: s.epg_channel_id,
      }));

      const compactVod = (Array.isArray(vodStreams) ? vodStreams : []).map((s: any) => ({
        stream_id: s.stream_id,
        name: s.name,
        stream_icon: s.stream_icon,
        category_id: s.category_id,
        container_extension: s.container_extension || 'mp4',
        rating_5based: s.rating_5based,
        year: s.year,
        custom_sid: s.custom_sid,
      }));

      const compactSeries = (Array.isArray(seriesList) ? seriesList : []).map((s: any) => ({
        series_id: s.series_id,
        name: s.name,
        cover: s.cover,
        category_id: s.category_id,
        rating: s.rating,
        year: s.year,
      }));

      return res.json({
        workingServer,
        counts: {
          live: liveStreams.length,
          movie: vodStreams.length,
          series: seriesList.length,
        },
        liveCategories: liveCats,
        liveStreams: compactLive,
        vodCategories: vodCats,
        vodStreams: compactVod,
        seriesCategories: seriesCats,
        seriesList: compactSeries,
      });
    } catch (err: any) {
      return res.status(502).json({
        error: formatNetworkError(err, workingServer),
      });
    }
  });

  // Xtream Codes Series Info & Episodes Fetcher
  app.post('/api/iptv/xtream/series_info', async (req: Request, res: Response) => {
    const { serverUrl, username, password, seriesId } = req.body;
    if (!serverUrl || !username || !password || !seriesId) {
      return res.status(400).json({
        success: false,
        error: 'Eksik parametreler (serverUrl, username, password, seriesId).',
      });
    }

    const variants = getUrlVariants(serverUrl.replace(/\/+$/, ''));
    let lastError = '';

    for (const baseServer of variants) {
      const apiUrl = `${baseServer}/player_api.php?username=${encodeURIComponent(
        username
      )}&password=${encodeURIComponent(password)}&action=get_series_info&series_id=${encodeURIComponent(seriesId)}`;

      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 20000);

        const response = await fetch(apiUrl, {
          headers: {
            'User-Agent': STANDARD_USER_AGENT,
            'Accept': 'application/json, text/plain, */*',
          },
          signal: controller.signal,
          redirect: 'follow',
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          lastError = `Sunucu HTTP ${response.status} hatası (${response.statusText}).`;
          continue;
        }

        const data = await response.json();
        return res.json({
          success: true,
          workingServer: baseServer,
          info: data.info || {},
          seasons: data.seasons || [],
          episodes: data.episodes || {},
        });
      } catch (err: any) {
        lastError = formatNetworkError(err, baseServer);
      }
    }

    return res.status(502).json({
      success: false,
      error: lastError || 'Dizi bölümleri ve sezon bilgisi alınamadı.',
    });
  });

  // M3U URL Fetcher with Protocol Fallback, Robust Redirect Following, and Stream Proxy Wrapping
  app.post('/api/iptv/m3u/fetch', async (req: Request, res: Response) => {
    const { url } = req.body;
    if (!url) {
      return res.status(400).json({ error: 'M3U URL belirtilmedi.' });
    }

    const variants = getUrlVariants(url);
    let lastError = '';

    for (const target of variants) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 35000);

        const { response, finalUrl } = await fetchWithFollowRedirects(target, {
          headers: {
            'User-Agent': STANDARD_USER_AGENT,
            'Accept': '*/*',
          },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          lastError = `M3U sunucusu HTTP ${response.status} hatası (${response.statusText}).`;
          continue;
        }

        // Read arrayBuffer to support multiple character encodings (UTF-8 / ISO-8859-9 / Windows-1254)
        const arrayBuf = await response.arrayBuffer();
        const contentType = (response.headers.get('content-type') || '').toLowerCase();
        let content = '';

        if (
          contentType.includes('windows-1254') ||
          contentType.includes('iso-8859-9') ||
          contentType.includes('iso-8859-1')
        ) {
          try {
            content = new TextDecoder('windows-1254').decode(arrayBuf);
          } catch {
            content = new TextDecoder('utf-8').decode(arrayBuf);
          }
        } else {
          content = new TextDecoder('utf-8').decode(arrayBuf);
        }

        if (!content || (!content.includes('#EXT') && !content.includes('http'))) {
          lastError = 'Belirtilen URL geçerli bir M3U veya M3U8 oynatma listesi içermiyor.';
          continue;
        }

        // Yüklenen M3U dosyası içindeki #EXTINF altındaki akış URL'lerini /api/iptv/proxy?url=... şeklinde güvenli proxy ile sarmala
        const proxiedContent = wrapM3UStreamUrls(content, finalUrl);

        return res.json({
          success: true,
          contentLength: proxiedContent.length,
          content: proxiedContent,
          effectiveUrl: finalUrl,
        });
      } catch (err: any) {
        lastError = formatNetworkError(err, target);
      }
    }

    return res.status(502).json({
      error: lastError || 'M3U adresi yüklenemedi. URL adresini veya sunucu bağlantısını kontrol edin.',
    });
  });

  // TMDB credentials live only on Render; never embed them into the APK.
  app.get('/api/tmdb/details', async (req: Request, res: Response) => {
    const token = process.env.TMDB_API_READ_ACCESS_TOKEN || process.env.TMDB_API_KEY;
    if (!token) return res.status(503).json({ error: 'TMDB anahtarı sunucuda henüz tanımlanmadı.' });
    const mediaType = req.query.type === 'series' ? 'tv' : 'movie';
    const rawTitle = typeof req.query.title === 'string' ? req.query.title : '';
    const title = rawTitle.replace(/\b(19|20)\d{2}\b/g, '').replace(/\b(4k|uhd|1080p|720p|fhd|hdr|hevc|x265|x264|multi|dual|tr dublaj|altyazılı)\b/gi, '').replace(/[\[\]{}()|._-]+/g, ' ').replace(/\bTR\b/gi, ' ').replace(/\s+/g, ' ').trim().slice(0, 130);
    if (!title || title.length < 2) return res.status(400).json({ error: 'Geçerli bir film veya dizi adı bulunamadı.' });
    const authHeaders = token.startsWith('eyJ') ? { Authorization: 'Bearer ' + token } : {};
    const keyParam = token.startsWith('eyJ') ? '' : '&api_key=' + encodeURIComponent(token);
    const fetchTmdb = async (endpoint: string) => {
      const response = await fetch('https://api.themoviedb.org/3' + endpoint + (endpoint.includes('?') ? '&' : '?') + 'language=tr-TR' + keyParam, {
        headers: { Accept: 'application/json', ...authHeaders },
        signal: AbortSignal.timeout(10000),
      });
      if (!response.ok) throw new Error('TMDB yanıtı: ' + response.status);
      return response.json() as Promise<any>;
    };
    try {
      const search = await fetchTmdb('/search/' + mediaType + '?query=' + encodeURIComponent(title) + '&include_adult=false');
      const matches = (search.results || []).filter((item: any) => {
        const name = String(item.title || item.name || '').toLocaleLowerCase('tr');
        return name.length > 0;
      });
      const requestedYear = Number(req.query.year) || 0;
      const result = matches.find((item: any) => requestedYear && String(item.release_date || item.first_air_date || '').startsWith(String(requestedYear))) || matches[0];
      if (!result) return res.status(404).json({ error: 'TMDB üzerinde eşleşen içerik bulunamadı.' });
      let details = await fetchTmdb('/' + mediaType + '/' + result.id + '?append_to_response=credits,videos');
      if (!details.overview || !(details.videos?.results || []).length) {
        const english = await fetchTmdb('/' + mediaType + '/' + result.id + '?append_to_response=videos&language=en-US');
        if (!details.overview) details.overview = english.overview;
        if (!(details.videos?.results || []).length) details.videos = english.videos;
      }
      const video = (details.videos?.results || []).find((v: any) => v.site === 'YouTube' && v.type === 'Trailer')
        || (details.videos?.results || []).find((v: any) => v.site === 'YouTube');
      res.json({
        id: details.id,
        title: details.title || details.name,
        overview: details.overview || '',
        poster: details.poster_path ? 'https://image.tmdb.org/t/p/w500' + details.poster_path : null,
        backdrop: details.backdrop_path ? 'https://image.tmdb.org/t/p/w780' + details.backdrop_path : null,
        rating: details.vote_average,
        releaseDate: details.release_date || details.first_air_date,
        genres: (details.genres || []).map((g: any) => g.name),
        cast: (details.credits?.cast || []).slice(0, 12).map((person: any) => ({
          name: person.name, character: person.character,
          photo: person.profile_path ? 'https://image.tmdb.org/t/p/w185' + person.profile_path : null,
        })),
        trailerKey: video?.key || null,
      });
    } catch (err) {
      console.error('[TMDB] Lookup failed:', err);
      return res.status(502).json({ error: 'TMDB bilgileri alınamadı. Daha sonra tekrar deneyin.' });
    }
  });

  // Vite middleware in dev or static serving in prod
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[xiptvplay Engine] Server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('[xiptvplay Engine] Failed to start server:', err);
  process.exit(1);
});
