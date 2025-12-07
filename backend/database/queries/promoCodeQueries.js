/**
 * Promo Code Queries
 *
 * Database queries for promo code management system
 * Replaces hardcoded promo code with database-driven validation
 */

import pool from '../../src/config/database.js';
import logger from '../../src/utils/logger.js';

/**
 * Find promo code by code string (case-insensitive)
 *
 * @param {string} code - Promo code to find
 * @returns {Promise<Object|null>} Promo code object or null if not found
 */
export async function findByCode(code) {
  const query = `
    SELECT
      id,
      code,
      discount_percentage,
      tier,
      type,
      max_uses,
      used_count,
      expires_at,
      is_active,
      created_at,
      updated_at
    FROM promo_codes
    WHERE LOWER(code) = LOWER($1)
  `;

  try {
    const result = await pool.query(query, [code]);
    return result.rows[0] || null;
  } catch (error) {
    logger.error('[PromoCodeQueries] Error finding promo code:', {
      error: error.message,
      code,
    });
    throw error;
  }
}

/**
 * Validate promo code for usage
 * Checks: active status, expiry date, usage limits
 * NOTE: Promo code DETERMINES the tier, not the other way around
 *
 * @param {string} code - Promo code to validate
 * @returns {Promise<{valid: boolean, error?: string, promoCode?: Object, tier?: string}>}
 */
export async function validatePromoCode(code) {
  try {
    const promoCode = await findByCode(code);

    // Check if promo code exists
    if (!promoCode) {
      return {
        valid: false,
        error: 'Invalid promo code',
      };
    }

    // Check if promo code is active
    if (!promoCode.is_active) {
      return {
        valid: false,
        error: 'Promo code is no longer active',
      };
    }

    // Check if promo code has expired
    if (promoCode.expires_at) {
      const now = new Date();
      const expiresAt = new Date(promoCode.expires_at);

      if (now > expiresAt) {
        return {
          valid: false,
          error: 'Promo code has expired',
        };
      }
    }

    // Check usage limits
    if (promoCode.max_uses !== null && promoCode.used_count >= promoCode.max_uses) {
      return {
        valid: false,
        error: 'Promo code has reached maximum usage limit',
      };
    }

    // All checks passed - promo code determines the tier
    return {
      valid: true,
      promoCode,
      tier: promoCode.tier, // Return the tier from promo code
      isPermanent: promoCode.type === 'permanent_subscription',
    };
  } catch (error) {
    logger.error('[PromoCodeQueries] Error validating promo code:', {
      error: error.message,
      code,
    });
    throw error;
  }
}

/**
 * Increment usage count for promo code
 * P0 FIX: Added max_uses check in WHERE clause to prevent race condition
 *
 * @param {number} promoCodeId - Promo code ID
 * @returns {Promise<Object|null>} Updated promo code or null if limit exceeded
 */
export async function incrementUsageCount(promoCodeId) {
  const query = `
    UPDATE promo_codes
    SET used_count = used_count + 1,
        updated_at = NOW()
    WHERE id = $1
      AND (max_uses IS NULL OR used_count < max_uses)
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [promoCodeId]);
    // If no rows returned, max_uses limit was exceeded (race condition prevented)
    if (result.rows.length === 0) {
      logger.warn('[PromoCodeQueries] Promo code usage limit exceeded (race prevented):', {
        promoCodeId,
      });
      return null;
    }
    return result.rows[0];
  } catch (error) {
    logger.error('[PromoCodeQueries] Error incrementing usage count:', {
      error: error.message,
      promoCodeId,
    });
    throw error;
  }
}

/**
 * Create new promo code
 *
 * @param {Object} data - Promo code data
 * @returns {Promise<Object>} Created promo code
 */
export async function create(data) {
  const {
    code,
    discountPercentage,
    tier,
    maxUses = null,
    expiresAt = null,
    isActive = true,
  } = data;

  const query = `
    INSERT INTO promo_codes (
      code,
      discount_percentage,
      tier,
      max_uses,
      expires_at,
      is_active
    ) VALUES ($1, $2, $3, $4, $5, $6)
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [
      code,
      discountPercentage,
      tier,
      maxUses,
      expiresAt,
      isActive,
    ]);

    return result.rows[0];
  } catch (error) {
    logger.error('[PromoCodeQueries] Error creating promo code:', {
      error: error.message,
      code,
    });
    throw error;
  }
}

/**
 * Update promo code
 *
 * @param {number} id - Promo code ID
 * @param {Object} updates - Fields to update
 * @returns {Promise<Object>} Updated promo code
 */
export async function update(id, updates) {
  const fields = [];
  const values = [];
  let paramIndex = 1;

  // Build dynamic UPDATE query
  const allowedFields = ['discount_percentage', 'tier', 'max_uses', 'expires_at', 'is_active'];

  for (const field of allowedFields) {
    if (updates[field] !== undefined) {
      fields.push(`${field} = $${paramIndex}`);
      values.push(updates[field]);
      paramIndex++;
    }
  }

  if (fields.length === 0) {
    throw new Error('No valid fields to update');
  }

  values.push(id);
  const query = `
    UPDATE promo_codes
    SET ${fields.join(', ')}, updated_at = NOW()
    WHERE id = $${paramIndex}
    RETURNING *
  `;

  try {
    const result = await pool.query(query, values);

    if (result.rows.length === 0) {
      throw new Error('Promo code not found');
    }

    return result.rows[0];
  } catch (error) {
    logger.error('[PromoCodeQueries] Error updating promo code:', {
      error: error.message,
      id,
      updates,
    });
    throw error;
  }
}

/**
 * List all promo codes with optional filters
 *
 * @param {Object} filters - Optional filters (isActive, tier)
 * @returns {Promise<Array>} List of promo codes
 */
export async function list(filters = {}) {
  let query = 'SELECT * FROM promo_codes WHERE 1=1';
  const values = [];
  let paramIndex = 1;

  if (filters.isActive !== undefined) {
    query += ` AND is_active = $${paramIndex}`;
    values.push(filters.isActive);
    paramIndex++;
  }

  if (filters.tier) {
    query += ` AND tier = $${paramIndex}`;
    values.push(filters.tier);
    paramIndex++;
  }

  query += ' ORDER BY created_at DESC';

  try {
    const result = await pool.query(query, values);
    return result.rows;
  } catch (error) {
    logger.error('[PromoCodeQueries] Error listing promo codes:', {
      error: error.message,
      filters,
    });
    throw error;
  }
}

/**
 * Delete promo code (soft delete by setting is_active = false)
 *
 * @param {number} id - Promo code ID
 * @returns {Promise<Object>} Updated promo code
 */
export async function softDelete(id) {
  const query = `
    UPDATE promo_codes
    SET is_active = false, updated_at = NOW()
    WHERE id = $1
    RETURNING *
  `;

  try {
    const result = await pool.query(query, [id]);

    if (result.rows.length === 0) {
      throw new Error('Promo code not found');
    }

    return result.rows[0];
  } catch (error) {
    logger.error('[PromoCodeQueries] Error deleting promo code:', {
      error: error.message,
      id,
    });
    throw error;
  }
}

export default {
  findByCode,
  validatePromoCode,
  incrementUsageCount,
  create,
  update,
  list,
  softDelete,
};
