/**
 * Refresh Token Queries
 * Manages refresh tokens for JWT rotation
 */

import { query } from '../../config/database.js';

const REFRESH_TOKEN_EXPIRY_DAYS = 30;

const refreshTokenQueries = {
  /**
   * Create new refresh token
   * @param {number} userId - User ID
   * @param {string} tokenHash - SHA-256 hash of the token
   * @returns {Promise<Object>} Created token record
   */
  async create(userId, tokenHash) {
    const result = await query(
      `INSERT INTO refresh_tokens (user_id, token_hash, expires_at)
       VALUES ($1, $2, NOW() + INTERVAL '1 day' * $3)
       RETURNING id, user_id, expires_at, created_at`,
      [userId, tokenHash, REFRESH_TOKEN_EXPIRY_DAYS]
    );
    return result.rows[0];
  },

  /**
   * Find valid (non-revoked, non-expired) token by hash
   * @param {string} tokenHash - SHA-256 hash of the token
   * @returns {Promise<Object|null>} Token record or null
   */
  async findValidByHash(tokenHash) {
    const result = await query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.created_at,
              u.telegram_id, u.username
       FROM refresh_tokens rt
       JOIN users u ON u.id = rt.user_id
       WHERE rt.token_hash = $1
         AND rt.revoked_at IS NULL
         AND rt.expires_at > NOW()`,
      [tokenHash]
    );
    return result.rows[0] || null;
  },

  /**
   * Revoke a specific token
   * @param {string} tokenHash - SHA-256 hash of the token
   * @returns {Promise<boolean>} True if token was revoked
   */
  async revoke(tokenHash) {
    const result = await query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE token_hash = $1 AND revoked_at IS NULL
       RETURNING id`,
      [tokenHash]
    );
    return result.rowCount > 0;
  },

  /**
   * Revoke all tokens for a user (logout everywhere)
   * @param {number} userId - User ID
   * @returns {Promise<number>} Number of tokens revoked
   */
  async revokeAllForUser(userId) {
    const result = await query(
      `UPDATE refresh_tokens
       SET revoked_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL
       RETURNING id`,
      [userId]
    );
    return result.rowCount;
  },

  /**
   * Clean up expired tokens (for periodic maintenance)
   * @returns {Promise<number>} Number of tokens deleted
   */
  async deleteExpired() {
    const result = await query(
      `DELETE FROM refresh_tokens
       WHERE expires_at < NOW() - INTERVAL '7 days'
       RETURNING id`
    );
    return result.rowCount;
  },
};

export default refreshTokenQueries;
