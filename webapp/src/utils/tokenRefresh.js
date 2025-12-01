/**
 * Token Refresh Callback Module
 *
 * Breaks circular dependency between useApi and useStore:
 * - useApi needs to refresh tokens without importing useStore
 * - App.jsx initializes the callback on mount
 *
 * Pattern: Dependency Injection via callback registration
 */

let tokenRefreshCallback = null;

/**
 * Set the token refresh callback (called from App.jsx on mount)
 * @param {Function} callback - Function that returns Promise<void>
 */
export function setTokenRefreshCallback(callback) {
  if (typeof callback !== 'function') {
    if (import.meta.env.DEV) {
      console.error('[tokenRefresh] Invalid callback - must be a function');
    }
    return;
  }

  tokenRefreshCallback = callback;
}

/**
 * Refresh authentication token
 * @returns {Promise<void>}
 * @throws {Error} If callback not initialized
 */
export async function refreshAuthToken() {
  if (!tokenRefreshCallback) {
    const error = 'Token refresh callback not initialized. Call setTokenRefreshCallback() first.';
    if (import.meta.env.DEV) {
      console.error('[tokenRefresh]', error);
    }
    throw new Error(error);
  }

  try {
    await tokenRefreshCallback();
  } catch (error) {
    if (import.meta.env.DEV) {
      console.error('[tokenRefresh] Failed to refresh token:', error);
    }
    throw error;
  }
}

/**
 * Check if token refresh callback is initialized
 * @returns {boolean}
 */
export function isTokenRefreshInitialized() {
  return tokenRefreshCallback !== null;
}
