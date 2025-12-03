/**
 * Broadcast Service for Channel Migration
 *
 * Handles mass messaging to shop subscribers with Telegram rate limit compliance:
 * - 100ms delay between messages (max 10 msg/sec)
 * - Queue-based processing
 * - Error handling for blocked/deleted users
 * - Progress tracking in channel_migrations table
 * - Uses Telegram HTTP API directly (no bot instance required)
 */

import pool from '../config/database.js';
import logger from '../utils/logger.js';
import { config } from '../config/env.js';
import { t, DEFAULT_LANGUAGE } from '../i18n/index.js';

// Get bot token from config
const BOT_TOKEN = config.telegram?.botToken || process.env.TELEGRAM_BOT_TOKEN;

// Message delay to respect Telegram rate limits (100ms = 10 msg/sec)
const MESSAGE_DELAY_MS = 100;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second

/**
 * Send message via Telegram HTTP API directly (no bot instance required)
 * @param {string} chatId - Telegram chat/user ID
 * @param {string} text - Message text (HTML formatted)
 * @returns {Promise<object>} Telegram API response
 */
async function sendTelegramMessage(chatId, text) {
  if (!BOT_TOKEN) {
    throw new Error('TELEGRAM_BOT_TOKEN is not configured');
  }

  const url = `https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text: text,
      parse_mode: 'HTML',
      disable_web_page_preview: false,
    }),
  });

  const data = await response.json();

  if (!data.ok) {
    const error = new Error(data.description || 'Telegram API error');
    error.response = { error_code: data.error_code, description: data.description };
    throw error;
  }

  return data.result;
}

/**
 * Send message with exponential backoff retry logic
 * @param {Function} sendFn - Async function that sends the message
 * @param {number} maxRetries - Maximum number of retries
 * @returns {Promise<boolean>} Success status
 */
async function sendWithRetry(sendFn, maxRetries = MAX_RETRIES) {
  let lastError = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      await sendFn();
      return true; // Success
    } catch (error) {
      lastError = error;

      // Don't retry for permanent errors
      if (error.response?.error_code === 403 || error.response?.error_code === 400) {
        throw error; // User blocked bot or invalid chat - no point retrying
      }

      // Retry for rate limits (429) and temporary errors
      if (
        error.response?.error_code === 429 ||
        error.code === 'ETIMEDOUT' ||
        error.code === 'ECONNRESET'
      ) {
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          logger.warn(
            `[Broadcast] Rate limit/timeout, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }
      }

      // For other errors, throw immediately
      throw error;
    }
  }

  // All retries exhausted
  throw lastError;
}

/**
 * Get all subscribers for a shop with their telegram_id and language preference
 * FIX: Now queries BOTH old 'subscriptions' table AND new 'shop_subscribers' table
 * to ensure all subscribers (legacy and new invite-based) receive broadcasts
 * @param {number} shopId - Shop ID
 * @returns {Promise<Array<{user_id: number, telegram_id: string, language: string}>>}
 */
async function getShopSubscribers(shopId) {
  try {
    // UNION both tables to get all subscribers (legacy + new invite system)
    // DISTINCT to avoid sending duplicate messages if user is in both tables
    const result = await pool.query(
      `SELECT DISTINCT ON (u.telegram_id)
         sub.user_id,
         u.telegram_id,
         COALESCE(u.language, 'ru') as language
       FROM (
         -- Legacy subscriptions table
         SELECT user_id FROM subscriptions WHERE shop_id = $1
         UNION
         -- New shop_subscribers table (invite-based)
         SELECT user_id FROM shop_subscribers WHERE shop_id = $1
       ) sub
       JOIN users u ON u.id = sub.user_id
       WHERE u.telegram_id IS NOT NULL`,
      [shopId]
    );

    logger.info(`[Broadcast] Found ${result.rows.length} subscribers for shop ${shopId}`);
    return result.rows;
  } catch (error) {
    logger.error(`[Broadcast] Error fetching subscribers for shop ${shopId}:`, error);
    throw error;
  }
}

/**
 * Create a new migration record in the database
 * @param {number} shopId - Shop ID
 * @param {string} oldChannelUrl - Old channel URL (optional)
 * @param {string} newChannelUrl - New channel URL
 * @returns {Promise<number>} Migration ID
 */
async function createMigrationRecord(shopId, oldChannelUrl, newChannelUrl) {
  try {
    const result = await pool.query(
      `INSERT INTO channel_migrations (shop_id, old_channel_url, new_channel_url, status)
       VALUES ($1, $2, $3, 'pending')
       RETURNING id`,
      [shopId, oldChannelUrl, newChannelUrl]
    );

    const migrationId = result.rows[0].id;
    logger.info(`[Broadcast] Created migration record ${migrationId} for shop ${shopId}`);
    return migrationId;
  } catch (error) {
    logger.error(`[Broadcast] Error creating migration record:`, error);
    throw error;
  }
}

// Whitelist of allowed fields for migration updates (SQL injection prevention)
const ALLOWED_MIGRATION_UPDATE_FIELDS = ['sent_count', 'failed_count', 'started_at', 'completed_at'];

/**
 * Update migration status
 * @param {number} migrationId - Migration ID
 * @param {string} status - New status (pending, processing, completed, failed)
 * @param {object} updates - Additional fields to update
 */
async function updateMigrationStatus(migrationId, status, updates = {}) {
  try {
    const fields = ['status = $1'];
    const values = [status];
    let paramIndex = 2;

    // Add timestamp fields based on status
    if (status === 'processing' && !updates.started_at) {
      fields.push('started_at = NOW()');
    }
    if (status === 'completed' || status === 'failed') {
      fields.push('completed_at = NOW()');
    }

    // Add custom updates with whitelist validation (SQL injection prevention)
    for (const [key, value] of Object.entries(updates)) {
      if (!ALLOWED_MIGRATION_UPDATE_FIELDS.includes(key)) {
        logger.warn('[Broadcast] Rejected invalid field in migration update', { field: key, migrationId });
        continue; // Skip invalid field instead of throwing
      }
      fields.push(`${key} = $${paramIndex}`);
      values.push(value);
      paramIndex++;
    }

    values.push(migrationId);

    const query = `
      UPDATE channel_migrations
      SET ${fields.join(', ')}
      WHERE id = $${paramIndex}
    `;

    await pool.query(query, values);
    logger.info(`[Broadcast] Updated migration ${migrationId} status to ${status}`);
  } catch (error) {
    logger.error(`[Broadcast] Error updating migration status:`, error);
    throw error;
  }
}

/**
 * Increment sent/failed counters for a migration
 * @param {number} migrationId - Migration ID
 * @param {boolean} success - Whether the message was sent successfully
 */
async function incrementCounter(migrationId, success) {
  const field = success ? 'sent_count' : 'failed_count';

  try {
    await pool.query(
      `UPDATE channel_migrations
       SET ${field} = ${field} + 1
       WHERE id = $1`,
      [migrationId]
    );
  } catch (error) {
    logger.error(`[Broadcast] Error incrementing counter for migration ${migrationId}:`, error);
    // Don't throw - counter update is not critical
  }
}

/**
 * Send migration message to a single subscriber with retry logic
 * Uses Telegram HTTP API directly (no bot instance required)
 * @param {string} telegramId - Telegram user ID
 * @param {string} shopName - Shop name
 * @param {string} newChannelUrl - New channel URL
 * @param {string} oldChannelUrl - Old channel URL (optional)
 * @param {number} shopId - Shop ID (for cleanup on error)
 * @param {number} userId - User ID (for cleanup on error)
 * @param {string} lang - User language preference
 * @returns {Promise<boolean>} Success status
 */
async function sendMigrationMessage(
  telegramId,
  shopName,
  newChannelUrl,
  oldChannelUrl = null,
  shopId = null,
  userId = null,
  lang = DEFAULT_LANGUAGE
) {
  try {
    let message = `🔔 <b>${t('migration.title', { shopName }, lang)}</b>\n\n`;

    if (oldChannelUrl) {
      message += `⚠️ ${t('migration.oldChannelBlocked', {}, lang)}\n\n`;
    }

    message += `✅ ${t('migration.newChannel', { url: newChannelUrl }, lang)}\n\n`;
    message += t('migration.subscribe', {}, lang);

    // Send with retry logic using Telegram HTTP API
    await sendWithRetry(async () => {
      await sendTelegramMessage(telegramId, message);
    });

    logger.info(`[Broadcast] Message sent to ${telegramId}`);
    return true;
  } catch (error) {
    // Handle specific Telegram errors
    if (error.response?.error_code === 403) {
      logger.warn(`[Broadcast] User ${telegramId} blocked the bot`);
      if (shopId && userId) {
        await pool
          .query('DELETE FROM subscriptions WHERE shop_id = $1 AND user_id = $2', [shopId, userId])
          .catch((cleanupErr) =>
            logger.error('[Broadcast] Failed to cleanup blocked subscriber', {
              shopId,
              userId,
              error: cleanupErr.message,
            })
          );
      }
    } else if (error.response?.error_code === 400) {
      logger.warn(`[Broadcast] User ${telegramId} not found or chat invalid`);
      if (shopId && userId) {
        await pool
          .query('DELETE FROM subscriptions WHERE shop_id = $1 AND user_id = $2', [shopId, userId])
          .catch((cleanupErr) =>
            logger.error('[Broadcast] Failed to cleanup invalid subscriber', {
              shopId,
              userId,
              error: cleanupErr.message,
            })
          );
      }
    } else {
      logger.error(`[Broadcast] Error sending to ${telegramId}:`, error.message);
    }
    return false;
  }
}

/**
 * Broadcast channel migration to all shop subscribers
 * Uses Telegram HTTP API directly (no bot instance required)
 * @param {number} shopId - Shop ID
 * @param {string} shopName - Shop name
 * @param {string} newChannelUrl - New channel URL
 * @param {string} oldChannelUrl - Old channel URL (optional)
 * @param {function} progressCallback - Optional callback for progress updates (sent, failed, total)
 * @returns {Promise<{migrationId: number, sent: number, failed: number, total: number}>}
 */
async function broadcastMigration(
  shopId,
  shopName,
  newChannelUrl,
  oldChannelUrl = null,
  progressCallback = null
) {
  let migrationId = null;

  try {
    // Get subscribers
    const subscribers = await getShopSubscribers(shopId);
    const total = subscribers.length;

    if (total === 0) {
      logger.warn(`[Broadcast] No subscribers found for shop ${shopId}`);
      return { sent: 0, failed: 0, total: 0 };
    }

    // Create migration record
    migrationId = await createMigrationRecord(shopId, oldChannelUrl, newChannelUrl);
    await updateMigrationStatus(migrationId, 'processing');

    let sent = 0;
    let failed = 0;

    // Process queue with delay
    for (let i = 0; i < subscribers.length; i++) {
      const subscriber = subscribers[i];

      // Send message using Telegram HTTP API with user's language
      const success = await sendMigrationMessage(
        subscriber.telegram_id,
        shopName,
        newChannelUrl,
        oldChannelUrl,
        shopId,
        subscriber.user_id,
        subscriber.language || DEFAULT_LANGUAGE
      );

      // Update counters
      if (success) {
        sent++;
      } else {
        failed++;
      }

      await incrementCounter(migrationId, success);

      // Progress callback
      if (progressCallback) {
        progressCallback(sent, failed, total);
      }

      // Delay before next message (except for last one)
      if (i < subscribers.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, MESSAGE_DELAY_MS));
      }
    }

    // Mark as completed
    await updateMigrationStatus(migrationId, 'completed');

    logger.info(
      `[Broadcast] Migration ${migrationId} completed: ${sent} sent, ${failed} failed, ${total} total`
    );

    return {
      migrationId,
      sent,
      failed,
      total,
    };
  } catch (error) {
    logger.error(`[Broadcast] Broadcast failed:`, error);

    // Mark migration as failed
    if (migrationId) {
      await updateMigrationStatus(migrationId, 'failed').catch((err) => {
        logger.error(`[Broadcast] Failed to update migration status:`, err);
      });
    }

    throw error;
  }
}

/**
 * Get migration status
 * @param {number} migrationId - Migration ID
 * @returns {Promise<object>}
 */
async function getMigrationStatus(migrationId) {
  try {
    const result = await pool.query(
      `SELECT id, shop_id, old_channel_url, new_channel_url, 
              sent_count, failed_count, status, 
              created_at, started_at, completed_at
       FROM channel_migrations
       WHERE id = $1`,
      [migrationId]
    );

    if (result.rows.length === 0) {
      return null;
    }

    return result.rows[0];
  } catch (error) {
    logger.error(`[Broadcast] Error getting migration status:`, error);
    throw error;
  }
}

export {
  broadcastMigration,
  getShopSubscribers,
  createMigrationRecord,
  updateMigrationStatus,
  getMigrationStatus,
  sendMigrationMessage,
};
