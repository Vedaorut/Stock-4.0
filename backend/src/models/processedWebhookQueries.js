import pool from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Processed Webhooks Queries
 * For replay attack prevention
 */
export const processedWebhookQueries = {
  /**
   * Check if webhook was already processed
   * @param {string} webhookId - Unique webhook identifier (tx_hash + source)
   * @returns {Promise<boolean>}
   */
  async isProcessed(webhookId) {
    const query = `
      SELECT 1 FROM processed_webhooks
      WHERE webhook_id = $1
      LIMIT 1
    `;

    try {
      const result = await pool.query(query, [webhookId]);
      return result.rowCount > 0;
    } catch (error) {
      logger.error('[ProcessedWebhookQueries] Error checking if processed', {
        error: error.message,
        webhookId
      });
      throw error;
    }
  },

  /**
   * Mark webhook as processed
   * @param {Object} data - Webhook data
   * @param {string} data.webhookId - Unique identifier
   * @param {string} data.source - blockcypher, etherscan, or trongrid
   * @param {string} data.txHash - Transaction hash
   * @param {Object} data.payload - Original webhook payload
   * @returns {Promise<Object>}
   */
  async markAsProcessed({ webhookId, source, txHash, payload = null }) {
    const query = `
      INSERT INTO processed_webhooks (webhook_id, source, tx_hash, payload)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (webhook_id) DO NOTHING
      RETURNING *
    `;

    try {
      const result = await pool.query(query, [
        webhookId,
        source,
        txHash,
        payload ? JSON.stringify(payload) : null
      ]);

      return result.rows[0] || null;
    } catch (error) {
      logger.error('[ProcessedWebhookQueries] Error marking as processed', {
        error: error.message,
        webhookId,
        source,
        txHash
      });
      throw error;
    }
  },

  /**
   * Find processed webhook by transaction hash
   * @param {string} txHash - Transaction hash
   * @returns {Promise<Array>}
   */
  async findByTxHash(txHash) {
    const query = `
      SELECT * FROM processed_webhooks
      WHERE tx_hash = $1
      ORDER BY processed_at DESC
    `;

    try {
      const result = await pool.query(query, [txHash]);
      return result.rows;
    } catch (error) {
      logger.error('[ProcessedWebhookQueries] Error finding by tx hash', {
        error: error.message,
        txHash
      });
      throw error;
    }
  },

  /**
   * Cleanup old processed webhooks (older than 7 days)
   * @returns {Promise<number>} Number of deleted records
   */
  async cleanupOld() {
    const query = `SELECT cleanup_old_webhooks()`;

    try {
      const result = await pool.query(query);
      const deletedCount = result.rows[0]?.cleanup_old_webhooks || 0;

      logger.info('[ProcessedWebhookQueries] Cleaned up old webhooks', {
        deletedCount
      });

      return deletedCount;
    } catch (error) {
      logger.error('[ProcessedWebhookQueries] Error cleaning up old webhooks', {
        error: error.message
      });
      throw error;
    }
  }
};

export default processedWebhookQueries;
