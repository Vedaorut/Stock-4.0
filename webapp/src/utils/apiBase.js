// Resolve API base URL for the WebApp
// 1) Prefer build-time env VITE_API_URL (e.g., ngrok/production)
// 2) Fallback to current origin (works when webapp is served by backend/ngrok)
// 3) Final fallback to localhost for local development
export function getApiBaseUrl() {
  const envUrl = import.meta.env.VITE_API_URL?.trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  if (typeof window !== 'undefined' && window.location?.origin) {
    return `${window.location.origin}/api`;
  }

  return 'http://localhost:3000/api';
}

// Build WebSocket URL from API base
export function getWebSocketUrl(apiBase = getApiBaseUrl()) {
  const sanitized = apiBase.replace(/\/$/, '');
  return sanitized.replace(/^http/, 'ws').replace(/\/api$/, '');
}
