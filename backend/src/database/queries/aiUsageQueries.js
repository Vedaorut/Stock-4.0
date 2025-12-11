import { query } from '../../config/database.js';

/**
 * AI Usage database queries
 * Tracks AI API usage and cost per user
 */
export const aiUsageQueries = {
  /**
   * Log AI usage
   * @param {Object} data - Usage data
   * @returns {Promise<Object>} Created log entry
   */
  logUsage: async ({ userId, shopId, model, promptTokens, completionTokens, totalTokens, costUsd, requestType }) => {
    const result = await query(
      `INSERT INTO ai_usage_log
       (user_id, shop_id, model, prompt_tokens, completion_tokens, total_tokens, cost_usd, request_type)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING *`,
      [userId, shopId || null, model, promptTokens, completionTokens, totalTokens, costUsd, requestType || 'product_ai']
    );
    return result.rows[0];
  },

  /**
   * Get daily cost for a user (UTC day)
   * @param {number} userId - User ID
   * @param {Date} date - Date to check (defaults to today)
   * @returns {Promise<number>} Total cost in USD for the day
   */
  getDailyCost: async (userId, date = new Date()) => {
    // Get start and end of day in UTC
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const result = await query(
      `SELECT COALESCE(SUM(cost_usd), 0) as total_cost
       FROM ai_usage_log
       WHERE user_id = $1
       AND created_at >= $2
       AND created_at <= $3`,
      [userId, startOfDay.toISOString(), endOfDay.toISOString()]
    );
    return parseFloat(result.rows[0]?.total_cost || 0);
  },

  /**
   * Get daily token usage for a user
   * @param {number} userId - User ID
   * @param {Date} date - Date to check
   * @returns {Promise<Object>} Token counts
   */
  getDailyTokens: async (userId, date = new Date()) => {
    const startOfDay = new Date(date);
    startOfDay.setUTCHours(0, 0, 0, 0);

    const endOfDay = new Date(date);
    endOfDay.setUTCHours(23, 59, 59, 999);

    const result = await query(
      `SELECT
        COALESCE(SUM(prompt_tokens), 0) as prompt_tokens,
        COALESCE(SUM(completion_tokens), 0) as completion_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COUNT(*) as request_count
       FROM ai_usage_log
       WHERE user_id = $1
       AND created_at >= $2
       AND created_at <= $3`,
      [userId, startOfDay.toISOString(), endOfDay.toISOString()]
    );
    return {
      promptTokens: parseInt(result.rows[0]?.prompt_tokens || 0),
      completionTokens: parseInt(result.rows[0]?.completion_tokens || 0),
      totalTokens: parseInt(result.rows[0]?.total_tokens || 0),
      requestCount: parseInt(result.rows[0]?.request_count || 0),
    };
  },

  /**
   * Get user's AI settings (daily limit, etc.)
   * @param {number} userId - User ID
   * @returns {Promise<Object|null>} User settings or null
   */
  getUserSettings: async (userId) => {
    const result = await query(
      `SELECT * FROM ai_user_settings WHERE user_id = $1`,
      [userId]
    );
    return result.rows[0] || null;
  },

  /**
   * Create or update user AI settings
   * @param {number} userId - User ID
   * @param {Object} settings - Settings to update
   * @returns {Promise<Object>} Updated settings
   */
  upsertUserSettings: async (userId, { dailyLimitUsd, isUnlimited }) => {
    const result = await query(
      `INSERT INTO ai_user_settings (user_id, daily_limit_usd, is_unlimited)
       VALUES ($1, $2, $3)
       ON CONFLICT (user_id) DO UPDATE SET
         daily_limit_usd = COALESCE($2, ai_user_settings.daily_limit_usd),
         is_unlimited = COALESCE($3, ai_user_settings.is_unlimited),
         updated_at = NOW()
       RETURNING *`,
      [userId, dailyLimitUsd, isUnlimited]
    );
    return result.rows[0];
  },

  /**
   * Get usage statistics for a user over a period
   * @param {number} userId - User ID
   * @param {number} days - Number of days to look back
   * @returns {Promise<Array>} Daily stats
   */
  getUsageStats: async (userId, days = 7) => {
    const result = await query(
      `SELECT
        DATE(created_at) as date,
        SUM(prompt_tokens) as prompt_tokens,
        SUM(completion_tokens) as completion_tokens,
        SUM(total_tokens) as total_tokens,
        SUM(cost_usd) as total_cost,
        COUNT(*) as request_count
       FROM ai_usage_log
       WHERE user_id = $1
       AND created_at >= NOW() - INTERVAL '${days} days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`,
      [userId]
    );
    return result.rows;
  },

  /**
   * Clean up old usage logs (older than 90 days)
   * @returns {Promise<number>} Number of deleted rows
   */
  cleanupOldLogs: async () => {
    const result = await query(
      `DELETE FROM ai_usage_log WHERE created_at < NOW() - INTERVAL '90 days'`
    );
    return result.rowCount;
  },
};

export default aiUsageQueries;
