/**
 * Subscription Checker Cron Jobs
 *
 * Automated tasks for subscription management:
 * 1. Check expired subscriptions every hour
 * 2. Send expiration reminders daily
 *
 * SUB-BUG13 FIX: Uses PostgreSQL advisory locks to prevent concurrent runs
 * across multiple instances (horizontal scaling safety)
 */

import * as subscriptionService from '../services/subscriptionService.js';
import { getClient } from '../config/database.js';
import logger from '../utils/logger.js';

// Advisory lock IDs (must be unique across the application)
const LOCK_EXPIRATION_CHECK = 123456789;
const LOCK_REMINDER_SEND = 123456790;

let expirationCheckInterval = null;
let reminderInterval = null;

// BUG-FIX: Retry configuration for failed checks
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 5 * 60 * 1000; // 5 minutes

/**
 * SUB-BUG13 FIX: Execute callback with transaction-level advisory lock
 * Uses pg_try_advisory_xact_lock which auto-releases on transaction end
 * This ensures proper cleanup even if callback throws
 *
 * @param {number} lockId - Unique lock identifier
 * @param {Function} callback - Async function to execute while holding lock
 * @returns {Promise<{skipped: boolean} | any>} Callback result or {skipped: true}
 */
async function withAdvisoryLock(lockId, callback) {
  const client = await getClient();

  try {
    await client.query('BEGIN');

    // Try to acquire transaction-scoped lock (non-blocking)
    const lockResult = await client.query(
      'SELECT pg_try_advisory_xact_lock($1) as acquired',
      [lockId]
    );

    if (!lockResult.rows[0]?.acquired) {
      await client.query('ROLLBACK');
      return { skipped: true };
    }

    // Execute callback while holding lock
    const result = await callback();

    await client.query('COMMIT'); // Lock auto-releases here
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK'); // Lock auto-releases here too
    } catch (rollbackError) {
      logger.error('[SubscriptionChecker] Rollback error:', rollbackError.message);
    }
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Start subscription expiration checker (runs every hour)
 */
export function startExpirationChecker() {
  if (expirationCheckInterval) {
    logger.warn('Expiration checker already running');
    return;
  }

  // Run immediately on start
  checkExpiredSubscriptions().catch((err) => logger.error('Initial expiration check failed:', err));

  // Schedule hourly checks
  // BUG-FIX: Added retry mechanism - 3 retries with 5 minute delay before giving up
  expirationCheckInterval = setInterval(
    async () => {
      let retries = 0;
      while (retries <= MAX_RETRIES) {
        try {
          logger.info(`Running hourly expiration check${retries > 0 ? ` (retry ${retries}/${MAX_RETRIES})` : ''}...`);
          await checkExpiredSubscriptions();
          break; // Success - exit retry loop
        } catch (error) {
          retries++;
          if (retries <= MAX_RETRIES) {
            logger.warn(`Expiration check failed, retrying in ${RETRY_DELAY_MS / 1000 / 60} minutes (${retries}/${MAX_RETRIES}):`, error.message);
            await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS));
          } else {
            logger.error(`Expiration check failed after ${MAX_RETRIES} retries:`, error);
          }
        }
      }
    },
    60 * 60 * 1000
  ); // Every hour

  logger.info('Subscription expiration checker started (every 1 hour)');
}

/**
 * Start subscription reminder sender (runs daily at 10:00 AM)
 */
export function startReminderSender() {
  if (reminderInterval) {
    logger.warn('Reminder sender already running');
    return;
  }

  // Calculate time until next 10:00 AM
  const now = new Date();
  const next10AM = new Date();
  next10AM.setHours(10, 0, 0, 0);

  // If it's past 10 AM today, schedule for tomorrow
  if (now.getHours() >= 10) {
    next10AM.setDate(next10AM.getDate() + 1);
  }

  const msUntil10AM = next10AM.getTime() - now.getTime();

  // Schedule first run at 10:00 AM
  setTimeout(() => {
    sendExpirationReminders().catch((err) => logger.error('Reminder send failed:', err));

    // Then run daily at 10:00 AM
    reminderInterval = setInterval(
      async () => {
        try {
          logger.info('Running daily reminder send...');
          await sendExpirationReminders();
        } catch (error) {
          logger.error('Reminder send failed:', error);
        }
      },
      24 * 60 * 60 * 1000
    ); // Every 24 hours

    logger.info('Subscription reminder sender started (daily at 10:00 AM)');
  }, msUntil10AM);

  logger.info(
    `Subscription reminder sender scheduled (first run in ${Math.round(msUntil10AM / 1000 / 60)} minutes)`
  );
}

/**
 * Stop all subscription cron jobs
 */
export function stopSubscriptionJobs() {
  if (expirationCheckInterval) {
    clearInterval(expirationCheckInterval);
    expirationCheckInterval = null;
    logger.info('Expiration checker stopped');
  }

  if (reminderInterval) {
    clearInterval(reminderInterval);
    reminderInterval = null;
    logger.info('Reminder sender stopped');
  }
}

/**
 * Check and process expired trials
 */
async function checkExpiredTrials() {
  try {
    const result = await subscriptionService.checkExpiredTrials();

    if (result.transitioned > 0) {
      logger.info('[SubscriptionChecker] Trial check completed', {
        transitioned: result.transitioned,
      });
    }

    return result;
  } catch (error) {
    logger.error('[SubscriptionChecker] Error checking expired trials:', error);
    throw error;
  }
}

/**
 * Check and process expired subscriptions
 * SUB-BUG13 FIX: Uses transaction-level advisory lock to prevent concurrent runs
 */
async function checkExpiredSubscriptions() {
  try {
    const result = await withAdvisoryLock(LOCK_EXPIRATION_CHECK, async () => {
      // First check expired trials
      await checkExpiredTrials();

      // Then check expired subscriptions
      const serviceResult = await subscriptionService.checkExpiredSubscriptions();
      const totalExpired = serviceResult.totalExpired ?? serviceResult.expired ?? 0;
      const movedToGrace = serviceResult.movedToGrace ?? serviceResult.gracePeriod ?? 0;

      logger.info('[SubscriptionChecker] Expiration check completed', {
        totalExpired,
        movedToGrace,
        deactivated: serviceResult.deactivated ?? 0,
      });

      return serviceResult;
    });

    // Check if lock was not acquired
    if (result?.skipped) {
      logger.info('[SubscriptionChecker] Expiration check skipped - another instance is running');
    }

    return result;
  } catch (error) {
    logger.error('[SubscriptionChecker] Error checking expirations:', error);
    throw error;
  }
}

/**
 * Send expiration reminders via Telegram
 * SUB-BUG13 FIX: Uses transaction-level advisory lock to prevent concurrent runs
 */
async function sendExpirationReminders() {
  try {
    const result = await withAdvisoryLock(LOCK_REMINDER_SEND, async () => {
      // Check if bot instance is available
      if (!global.botInstance) {
        logger.warn('[SubscriptionChecker] Bot instance not available, skipping reminders');
        return { sent: 0, failed: 0 };
      }

      const serviceResult = await subscriptionService.sendExpirationReminders(global.botInstance);

      logger.info('[SubscriptionChecker] Reminders sent', {
        sent: serviceResult.sent ?? serviceResult.reminded ?? 0,
        failed: serviceResult.failed ?? 0,
      });

      return serviceResult;
    });

    // Check if lock was not acquired
    if (result?.skipped) {
      logger.info('[SubscriptionChecker] Reminder send skipped - another instance is running');
    }

    return result;
  } catch (error) {
    logger.error('[SubscriptionChecker] Error sending reminders:', error);
    throw error;
  }
}

/**
 * Start all subscription cron jobs
 */
export function startSubscriptionJobs() {
  startExpirationChecker();
  startReminderSender();
}

// Export individual checker functions for testing
export { checkExpiredSubscriptions, sendExpirationReminders };
