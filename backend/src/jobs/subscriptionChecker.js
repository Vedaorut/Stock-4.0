/**
 * Subscription Checker Cron Jobs
 * 
 * Automated tasks for subscription management:
 * 1. Check expired subscriptions every hour
 * 2. Send expiration reminders daily
 */

import * as subscriptionService from '../services/subscriptionService.js';
import logger from '../utils/logger.js';

let expirationCheckInterval = null;
let reminderInterval = null;

/**
 * Start subscription expiration checker (runs every hour)
 */
export function startExpirationChecker() {
  if (expirationCheckInterval) {
    logger.warn('Expiration checker already running');
    return;
  }

  // Run immediately on start
  checkExpiredSubscriptions().catch(err => 
    logger.error('Initial expiration check failed:', err)
  );

  // Schedule hourly checks
  expirationCheckInterval = setInterval(async () => {
    try {
      logger.info('Running hourly expiration check...');
      await checkExpiredSubscriptions();
    } catch (error) {
      logger.error('Expiration check failed:', error);
    }
  }, 60 * 60 * 1000); // Every hour

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
    sendExpirationReminders().catch(err => 
      logger.error('Reminder send failed:', err)
    );

    // Then run daily at 10:00 AM
    reminderInterval = setInterval(async () => {
      try {
        logger.info('Running daily reminder send...');
        await sendExpirationReminders();
      } catch (error) {
        logger.error('Reminder send failed:', error);
      }
    }, 24 * 60 * 60 * 1000); // Every 24 hours

    logger.info('Subscription reminder sender started (daily at 10:00 AM)');
  }, msUntil10AM);

  logger.info(`Subscription reminder sender scheduled (first run in ${Math.round(msUntil10AM / 1000 / 60)} minutes)`);
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
 * Check and process expired subscriptions
 */
async function checkExpiredSubscriptions() {
  try {
    const result = await subscriptionService.checkExpiredSubscriptions();

    logger.info('[SubscriptionChecker] Expiration check completed', {
      totalExpired: result.totalExpired,
      movedToGrace: result.movedToGrace,
      deactivated: result.deactivated
    });

    return result;
  } catch (error) {
    logger.error('[SubscriptionChecker] Error checking expirations:', error);
    throw error;
  }
}

/**
 * Send expiration reminders via Telegram
 */
async function sendExpirationReminders() {
  try {
    // Check if bot instance is available
    if (!global.botInstance) {
      logger.warn('[SubscriptionChecker] Bot instance not available, skipping reminders');
      return { sent: 0, failed: 0 };
    }

    const result = await subscriptionService.sendExpirationReminders(global.botInstance);

    logger.info('[SubscriptionChecker] Reminders sent', {
      sent: result.sent,
      failed: result.failed
    });

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
export {
  checkExpiredSubscriptions,
  sendExpirationReminders
};
