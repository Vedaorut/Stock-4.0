/**
 * Broadcast Service for Channel Migration
 * 
 * Handles mass messaging to shop subscribers with Telegram rate limit compliance:
 * - 100ms delay between messages (max 10 msg/sec)
 * - Queue-based processing
 * - Error handling for blocked/deleted users
 * - Progress tracking in channel_migrations table
 */

import pool from '../config/database.js';
import logger from '../utils/logger.js';

// Message delay to respect Telegram rate limits (100ms = 10 msg/sec)
const MESSAGE_DELAY_MS = 100;

// Retry configuration
const MAX_RETRIES = 3;
const INITIAL_RETRY_DELAY_MS = 1000; // 1 second

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
      if (error.response?.error_code === 429 || error.code === 'ETIMEDOUT' || error.code === 'ECONNRESET') {
        if (attempt < maxRetries) {
          // Exponential backoff: 1s, 2s, 4s
          const delay = INITIAL_RETRY_DELAY_MS * Math.pow(2, attempt);
          logger.warn(`[Broadcast] Rate limit/timeout, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})`);
          await new Promise(resolve => setTimeout(resolve, delay));
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
 * Get all subscribers for a shop with their telegram_id
 * @param {number} shopId - Shop ID
 * @returns {Promise<Array<{user_id: number, telegram_id: string}>>}
 */
async function getShopSubscribers(shopId) {
  try {
    const result = await pool.query(
      `SELECT user_id, telegram_id
       FROM subscriptions
       WHERE shop_id = $1
       AND telegram_id IS NOT NULL`,
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

    // Add custom updates
    for (const [key, value] of Object.entries(updates)) {
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
 * @param {object} bot - Telegram bot instance
 * @param {string} telegramId - Telegram user ID
 * @param {string} shopName - Shop name
 * @param {string} newChannelUrl - New channel URL
 * @param {string} oldChannelUrl - Old channel URL (optional)
 * @returns {Promise<boolean>} Success status
 */
async function sendMigrationMessage(bot, telegramId, shopName, newChannelUrl, oldChannelUrl = null) {
  try {
    let message = `🔔 <b>Важное обновление от магазина "${shopName}"</b>\n\n`;
    
    if (oldChannelUrl) {
      message += `⚠️ Наш старый канал был заблокирован.\n\n`;
    }
    
    message += `✅ Новый канал: ${newChannelUrl}\n\n`;
    message += `Подпишитесь, чтобы не пропустить важные обновления и новые товары!`;

    // Send with retry logic
    await sendWithRetry(async () => {
      await bot.telegram.sendMessage(telegramId, message, {
        parse_mode: 'HTML',
        disable_web_page_preview: false
      });
    });

    logger.info(`[Broadcast] Message sent to ${telegramId}`);
    return true;
  } catch (error) {
    // Handle specific Telegram errors
    if (error.response?.error_code === 403) {
      logger.warn(`[Broadcast] User ${telegramId} blocked the bot`);
    } else if (error.response?.error_code === 400) {
      logger.warn(`[Broadcast] User ${telegramId} not found or chat invalid`);
    } else {
      logger.error(`[Broadcast] Error sending to ${telegramId}:`, error.message);
    }
    return false;
  }
}

/**
 * Broadcast channel migration to all shop subscribers
 * @param {object} bot - Telegram bot instance
 * @param {number} shopId - Shop ID
 * @param {string} shopName - Shop name
 * @param {string} newChannelUrl - New channel URL
 * @param {string} oldChannelUrl - Old channel URL (optional)
 * @param {function} progressCallback - Optional callback for progress updates (sent, failed, total)
 * @returns {Promise<{migrationId: number, sent: number, failed: number, total: number}>}
 */
async function broadcastMigration(bot, shopId, shopName, newChannelUrl, oldChannelUrl = null, progressCallback = null) {
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
      
      // Send message
      const success = await sendMigrationMessage(
        bot,
        subscriber.telegram_id,
        shopName,
        newChannelUrl,
        oldChannelUrl
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
        await new Promise(resolve => setTimeout(resolve, MESSAGE_DELAY_MS));
      }
    }

    // Mark as completed
    await updateMigrationStatus(migrationId, 'completed');

    logger.info(`[Broadcast] Migration ${migrationId} completed: ${sent} sent, ${failed} failed, ${total} total`);

    return {
      migrationId,
      sent,
      failed,
      total
    };
  } catch (error) {
    logger.error(`[Broadcast] Broadcast failed:`, error);
    
    // Mark migration as failed
    if (migrationId) {
      await updateMigrationStatus(migrationId, 'failed').catch(err => {
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
  sendMigrationMessage
};
