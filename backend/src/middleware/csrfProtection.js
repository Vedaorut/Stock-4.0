import logger from '../utils/logger.js';
import { config } from '../config/env.js';

/**
 * CSRF Protection Middleware
 *
 * Security: P0-SEC-5
 * Prevents Cross-Site Request Forgery attacks by validating Origin/Referer headers
 *
 * How it works:
 * - GET, HEAD, OPTIONS requests are allowed (safe methods)
 * - POST, PUT, DELETE, PATCH require valid Origin or Referer header
 * - Requests with valid JWT Authorization header are exempted (JWT is sufficient CSRF protection)
 * - Webhook endpoints are exempted (they don't send Origin headers)
 * - Origin must match one of the allowed origins (FRONTEND_URL, localhost)
 *
 * B3 FIX: Removed User-Agent based bypass - it was trivially spoofable!
 * Now uses JWT Authorization header as CSRF protection for bot requests.
 *
 * Attack prevented:
 * ```html
 * <!-- Evil site cannot do this: -->
 * <form action="https://status-stock.com/api/shops" method="POST">
 *   <input name="name" value="Hacked Shop">
 * </form>
 * ```
 */

/**
 * Validate Origin or Referer header to prevent CSRF attacks
 *
 * @param {object} req - Express request
 * @param {object} res - Express response
 * @param {function} next - Express next middleware
 */
export const validateOrigin = (req, res, next) => {
  const originalUrl = req.originalUrl || '';

  // Skip for safe HTTP methods (read-only)
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip for webhook endpoints (external services don't send Origin)
  if (req.path.startsWith('/webhooks/')) {
    return next();
  }

  // Skip for health check
  if (req.path === '/health') {
    return next();
  }

  // Skip for bot authentication endpoints (no JWT token on initial auth)
  // These endpoints are secured by other means (rate limiting, input validation)
  // Using startsWith to handle all auth routes regardless of prefix
  if (req.path.startsWith('/api/auth/') || req.path.startsWith('/auth/') || req.path.includes('/auth/register')) {
    logger.debug('CSRF bypassed for auth endpoint', { path: req.path, method: req.method });
    return next();
  }

  // Skip for internal API endpoints (protected by x-internal-secret header)
  // These are bot-to-backend trusted calls that don't send Origin headers
  if (req.path.startsWith('/api/internal/') || req.path.startsWith('/internal/')) {
    logger.debug('CSRF bypassed for internal API endpoint', { path: req.path, method: req.method });
    return next();
  }

  // Also bypass when originalUrl still contains the /api/internal prefix (defensive)
  if (originalUrl.startsWith('/api/internal/') || originalUrl.startsWith('/internal/')) {
    logger.debug('CSRF bypassed for internal API endpoint (originalUrl)', {
      path: req.path,
      originalUrl,
      method: req.method,
    });
    return next();
  }

  // Skip CSRF validation in test environment
  if (process.env.NODE_ENV === 'test') {
    return next();
  }

  // B3 FIX: Skip CSRF for requests with JWT Authorization header
  // JWT token is a secret that cannot be sent by malicious sites (no cookies involved)
  // This is secure because:
  // 1. Attacker cannot read the JWT from another origin (Same-Origin Policy)
  // 2. JWT is sent via Authorization header, not cookies (no automatic inclusion)
  // 3. Bot uses JWT for all API calls, so this allows bot-to-backend communication
  const authHeader = req.headers['authorization'];
  if (authHeader && authHeader.startsWith('Bearer ')) {
    logger.debug('CSRF check bypassed for JWT authenticated request', {
      path: req.path,
      method: req.method,
    });
    return next();
  }

  const origin = req.get('origin');
  const referer = req.get('referer');

  // Build allowed origins list
  const allowedOrigins = [
    config.frontendUrl,
    'http://localhost:5173',
    'http://localhost:3000',
    'https://localhost:3000',
  ].filter(Boolean);

  // Add ngrok URLs if present in environment
  if (process.env.NGROK_URL) {
    allowedOrigins.push(process.env.NGROK_URL);
  }

  // Check if origin matches any allowed origin
  const isValidOrigin =
    origin &&
    allowedOrigins.some((allowed) => {
      // Exact match or starts with (to handle subdomains)
      return origin === allowed || origin.startsWith(allowed);
    });

  // Check if referer matches any allowed origin
  const isValidReferer =
    referer &&
    allowedOrigins.some((allowed) => {
      return referer.startsWith(allowed);
    });

  // At least one of Origin or Referer must be valid
  if (!isValidOrigin && !isValidReferer) {
    logger.warn('CSRF protection: Invalid origin/referer', {
      method: req.method,
      path: req.path,
      origin: origin || 'none',
      referer: referer || 'none',
      ip: req.ip,
      userAgent: req.get('user-agent'),
    });

    return res.status(403).json({
      success: false,
      error: 'Invalid origin - possible CSRF attack detected',
    });
  }

  // Origin is valid, proceed
  next();
};

/**
 * Export middleware
 */
export default {
  validateOrigin,
};
