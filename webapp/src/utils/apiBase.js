const FALLBACK_API = 'http://localhost:3000/api';
let loggedApiBase = false;

const isLocalhost = (url) => {
  try {
    const { hostname } = new URL(url);
    return hostname === 'localhost' || hostname === '127.0.0.1';
  } catch {
    return false;
  }
};

const isValidHttpUrl = (url) => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
};

const ensureApiSuffix = (url) => {
  if (!url) return '';
  const trimmed = url.replace(/\/+$/, '');
  return trimmed.endsWith('/api') ? trimmed : `${trimmed}/api`;
};

const getOriginApiBase = () => {
  if (typeof window === 'undefined' || !window.location?.origin) return '';
  return ensureApiSuffix(window.location.origin);
};

// Resolve API base URL for the WebApp
// 1) Prefer build-time env VITE_API_URL (normalized with /api suffix)
// 2) If env points to localhost but app is served from a different origin (e.g. ngrok), prefer window.origin
// 3) Fallback to current origin (works when webapp is served by backend/ngrok)
// 4) Final fallback to localhost for local development
export function getApiBaseUrl() {
  const envRaw = import.meta.env.VITE_API_URL?.trim();
  const normalizedEnv = ensureApiSuffix(envRaw || '');
  const envUrl = normalizedEnv && isValidHttpUrl(normalizedEnv) ? normalizedEnv : '';
  const originUrl = getOriginApiBase();

  const shouldIgnoreEnv =
    import.meta.env.PROD && envUrl && isLocalhost(envUrl) && originUrl && !isLocalhost(originUrl);

  let resolved =
    (!shouldIgnoreEnv && envUrl) ||
    originUrl ||
    FALLBACK_API;

  if (envRaw && !envUrl) {
    console.warn(`[apiBase] Invalid VITE_API_URL "${envRaw}", falling back to origin/fallback`);
  }

  if (shouldIgnoreEnv) {
    console.warn(
      `[apiBase] Ignoring localhost VITE_API_URL (${envUrl}) because app origin is ${originUrl}`
    );
  }

  if (!loggedApiBase) {
    const source = envUrl && !shouldIgnoreEnv ? 'env' : originUrl ? 'origin' : 'fallback';
    console.log(`[apiBase] Resolved API base: ${resolved} (source: ${source})`, {
      envRaw: envRaw || null,
      origin: originUrl || null,
    });
    loggedApiBase = true;
  }

  return resolved;
}

// Build WebSocket URL from API base
export function getWebSocketUrl(apiBase = getApiBaseUrl()) {
  const sanitized = apiBase.replace(/\/$/, '');
  return sanitized.replace(/^http/, 'ws').replace(/\/api$/, '');
}
