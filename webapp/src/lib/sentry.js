/**
 * Sentry Error Tracking Configuration
 *
 * Initializes Sentry for React error tracking in production.
 * Uses the same Sentry project as backend (shared DSN pattern).
 *
 * Environment variables:
 * - VITE_SENTRY_DSN: Sentry DSN (required for Sentry to work)
 *
 * Features:
 * - React Error Boundary integration
 * - Session replay for debugging
 * - Performance tracing
 * - User context from Telegram WebApp
 */
import * as Sentry from '@sentry/react';

const isProd = import.meta.env.PROD;
const dsn = import.meta.env.VITE_SENTRY_DSN;

/**
 * Initialize Sentry SDK
 * Only runs in production when DSN is configured
 */
export function initSentry() {
  // Skip initialization if no DSN or in development
  if (!dsn) {
    if (isProd) {
      // eslint-disable-next-line no-console
      console.warn('[Sentry] VITE_SENTRY_DSN not configured - error tracking disabled');
    }
    return;
  }

  if (!isProd) {
    // eslint-disable-next-line no-console
    console.info('[Sentry] Skipping initialization in development mode');
    return;
  }

  Sentry.init({
    dsn,
    environment: import.meta.env.MODE,
    release: import.meta.env.VITE_APP_VERSION || '1.0.0',

    // Performance Monitoring
    tracesSampleRate: 0.1, // 10% of transactions in production

    // Session Replay (captures user interactions for debugging)
    replaysSessionSampleRate: 0.01, // 1% of sessions
    replaysOnErrorSampleRate: 1.0, // 100% of sessions with errors

    integrations: [
      // React Router integration (if using react-router in future)
      Sentry.browserTracingIntegration(),
      // Session Replay
      Sentry.replayIntegration({
        // Mask all text and inputs for privacy
        maskAllText: true,
        maskAllInputs: true,
        blockAllMedia: true,
      }),
    ],

    // Filter out noisy errors
    beforeSend(event, hint) {
      const error = hint.originalException;

      // Ignore network errors (user's connection issues)
      if (error?.message?.includes('Network Error')) {
        return null;
      }

      // Ignore user cancellation
      if (error?.message?.includes('canceled')) {
        return null;
      }

      // Ignore Telegram WebApp bridge errors (handled separately)
      if (error?.message?.includes('Telegram')) {
        return null;
      }

      return event;
    },

    // Don't send PII
    beforeSendTransaction(event) {
      // Remove sensitive query params
      if (event.request?.url) {
        const url = new URL(event.request.url);
        url.searchParams.delete('token');
        url.searchParams.delete('initData');
        event.request.url = url.toString();
      }
      return event;
    },
  });

  // eslint-disable-next-line no-console
  console.info('[Sentry] Initialized for error tracking');
}

/**
 * Set user context from Telegram WebApp
 * Call this after Telegram WebApp is initialized
 */
export function setSentryUser(user) {
  if (!dsn || !isProd) return;

  if (user) {
    Sentry.setUser({
      id: String(user.id),
      username: user.username,
      // Don't send full name for privacy
    });
  }
}

/**
 * Clear user context (on logout)
 */
export function clearSentryUser() {
  if (!dsn || !isProd) return;
  Sentry.setUser(null);
}

/**
 * Manually capture an exception
 * Use for caught errors that should still be tracked
 */
export function captureException(error, context = {}) {
  if (!dsn || !isProd) {
    console.error('[Sentry] Would capture:', error, context);
    return;
  }

  Sentry.captureException(error, {
    extra: context,
  });
}

/**
 * Capture a message (for non-error events)
 */
export function captureMessage(message, level = 'info', context = {}) {
  if (!dsn || !isProd) {
    // eslint-disable-next-line no-console
    console.info('[Sentry] Would log:', message, context);
    return;
  }

  Sentry.captureMessage(message, {
    level,
    extra: context,
  });
}

/**
 * Add breadcrumb for debugging
 */
export function addBreadcrumb(breadcrumb) {
  if (!dsn || !isProd) return;
  Sentry.addBreadcrumb(breadcrumb);
}

// Re-export Sentry ErrorBoundary for use in components
export const SentryErrorBoundary = Sentry.ErrorBoundary;

// Export Sentry instance for advanced usage
export { Sentry };
