import { query } from '../../config/database.js';
import { generateInviteCode } from '../../utils/inviteCodeGenerator.js';

/**
 * Shop database queries
 */
export const shopQueries = {
  // Check if shop name is already taken (case-insensitive)
  isNameTaken: async (name, excludeShopId = null) => {
    let queryText = 'SELECT EXISTS(SELECT 1 FROM shops WHERE LOWER(name) = LOWER($1)';
    const params = [name];

    if (excludeShopId) {
      queryText += ' AND id != $2';
      params.push(excludeShopId);
    }

    queryText += ')';

    const result = await query(queryText, params);
    return result.rows[0].exists;
  },

  // Create new shop
  create: async (shopData) => {
    const ownerId = shopData.ownerId ?? shopData.owner_id;
    const tier = shopData.tier ?? shopData.subscription_tier ?? 'pro';
    const { name, description = null, logo = null } = shopData;

    if (!ownerId) {
      throw new Error('ownerId is required to create a shop');
    }

    const result = await query(
      `INSERT INTO shops (owner_id, name, description, logo, tier)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, owner_id, name, description, logo, tier, is_active, is_trial, trial_ends_at, subscription_status, next_payment_due, grace_period_until, registration_paid, wallet_btc, wallet_eth, wallet_usdt, wallet_ltc, invite_code, created_at, updated_at`,
      [ownerId, name, description, logo, tier]
    );
    return result.rows[0];
  },

  // Find shop by ID
  findById: async (id) => {
    const result = await query(
      `SELECT s.*, u.username as seller_username, u.first_name as seller_first_name
       FROM shops s
       JOIN users u ON s.owner_id = u.id
       WHERE s.id = $1`,
      [id]
    );
    return result.rows[0];
  },

  // Find shops by owner ID
  // Active shops only by default, unless includeInactive=true
  findByOwnerId: async (ownerId, { includeInactive = false } = {}) => {
    const baseQuery = [
      'SELECT id, owner_id, name, description, logo, tier, is_active, is_trial, trial_ends_at, subscription_status, next_payment_due, grace_period_until, registration_paid, wallet_btc, wallet_eth, wallet_usdt, wallet_ltc, invite_code, created_at, updated_at',
      'FROM shops',
      'WHERE owner_id = $1',
    ];

    if (!includeInactive) {
      baseQuery.push('AND is_active = true');
    }

    baseQuery.push('ORDER BY created_at DESC');

    const result = await query(baseQuery.join(' '), [ownerId]);
    return result.rows;
  },

  // Search active shops by name with optional subscription context
  searchByName: async (name, limit = 10, userId = null) => {
    // Escape special ILIKE characters to prevent SQL injection
    const escapedName = name
      .replace(/\\/g, '\\\\')  // Escape backslashes first
      .replace(/%/g, '\\%')    // Escape percent signs
      .replace(/_/g, '\\_');   // Escape underscores

    const params = [`%${escapedName}%`, limit];
    const paramIndex = params.length + 1;

    // FIX: Use shop_subscribers table instead of subscriptions
    // subscriptions = seller payment subscriptions (PRO/MAX)
    // shop_subscribers = buyer follows shops
    const queryText = `
      SELECT
        s.*,
        u.username as seller_username,
        u.first_name as seller_first_name,
        u.last_name as seller_last_name,
        ${
          userId
            ? `EXISTS(
          SELECT 1 FROM shop_subscribers ss
          WHERE ss.shop_id = s.id AND ss.user_id = $${paramIndex}
        )`
            : 'false'
        } as is_subscribed
      FROM shops s
      JOIN users u ON s.owner_id = u.id
      WHERE s.is_active = true
        AND (s.name ILIKE $1 OR u.username ILIKE $1)
      ORDER BY s.created_at DESC
      LIMIT $2
    `;

    if (userId) {
      params.push(userId);
    }

    const result = await query(queryText, params);
    return result.rows;
  },

  // Update shop
  update: async (id, shopData) => {
    const { name, description, logo, isActive, channelUrl } = shopData;
    const result = await query(
      `UPDATE shops
       SET name = COALESCE($2, name),
           description = COALESCE($3, description),
           logo = COALESCE($4, logo),
           is_active = COALESCE($5, is_active),
           channel_url = COALESCE($6, channel_url),
           updated_at = NOW()
       WHERE id = $1
       RETURNING id, owner_id, name, description, logo, channel_url, tier, is_active, is_trial, trial_ends_at, subscription_status, next_payment_due, grace_period_until, registration_paid, wallet_btc, wallet_eth, wallet_usdt, wallet_ltc, invite_code, created_at, updated_at`,
      [id, name, description, logo, isActive, channelUrl]
    );
    return result.rows[0];
  },

  // Delete shop (soft delete to preserve order history)
  // BUG-SHOP-003 FIX: Set is_active=false instead of hard delete to preserve FK relationships
  delete: async (id) => {
    const result = await query(
      `UPDATE shops
       SET is_active = false, updated_at = NOW()
       WHERE id = $1
       RETURNING id, owner_id, name`,
      [id]
    );
    return result.rows[0];
  },

  // List all active shops
  listActive: async (limit = 50, offset = 0) => {
    const result = await query(
      `SELECT s.*, u.username as seller_username
       FROM shops s
       JOIN users u ON s.owner_id = u.id
       WHERE s.is_active = true
       ORDER BY s.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );
    return result.rows;
  },

  // Find shop by invite code
  findByInviteCode: async (inviteCode) => {
    const result = await query(
      `SELECT s.*, u.username as seller_username, u.first_name as seller_first_name
       FROM shops s
       JOIN users u ON s.owner_id = u.id
       WHERE s.invite_code = $1`,
      [inviteCode]
    );
    return result.rows[0];
  },

  // Get all existing invite codes (for collision checking)
  getAllInviteCodes: async () => {
    const result = await query('SELECT invite_code FROM shops WHERE invite_code IS NOT NULL');
    return result.rows.map((row) => row.invite_code);
  },

  // Update shop invite code with retry on conflict
  // BUG-SHOP-005 FIX: Handle race condition with unique constraint
  updateInviteCode: async (id, shopName) => {
    const maxRetries = 5;
    let lastError;

    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        // Generate fresh code on each attempt
        const existingCodes = await shopQueries.getAllInviteCodes();
        const inviteCode = generateInviteCode(shopName, existingCodes);

        const result = await query(
          `UPDATE shops
           SET invite_code = $2, updated_at = NOW()
           WHERE id = $1
           RETURNING id, invite_code`,
          [id, inviteCode]
        );
        return result.rows[0];
      } catch (error) {
        // Check if it's a unique constraint violation on invite_code
        if (error.code === '23505' && error.constraint === 'idx_shops_invite_code') {
          lastError = error;
          // Retry with new code
          continue;
        }
        // Other errors - throw immediately
        throw error;
      }
    }

    // If all retries failed, throw the last error
    throw lastError || new Error('Failed to generate unique invite code after maximum retries');
  },

  // Update shop wallets
  updateWallets: async (id, walletData) => {
    const allowedFields = ['wallet_btc', 'wallet_eth', 'wallet_usdt', 'wallet_ltc'];
    const setClauses = [];
    const params = [id];
    let paramIndex = 2;

    allowedFields.forEach((field) => {
      if (Object.prototype.hasOwnProperty.call(walletData, field)) {
        setClauses.push(`${field} = $${paramIndex}`);
        params.push(walletData[field]);
        paramIndex += 1;
      }
    });

    if (setClauses.length === 0) {
      // Nothing to update, return current record for consistency
      const existing = await query(
        `SELECT id, owner_id, name, description, logo, channel_url, tier, is_active, is_trial, trial_ends_at, subscription_status, next_payment_due, grace_period_until, registration_paid, wallet_btc, wallet_eth, wallet_usdt, wallet_ltc, invite_code, created_at, updated_at
         FROM shops
         WHERE id = $1`,
        [id]
      );
      return existing.rows[0] || null;
    }

    setClauses.push('updated_at = NOW()');

    const result = await query(
      `UPDATE shops
       SET ${setClauses.join(', ')}
       WHERE id = $1
       RETURNING id, owner_id, name, description, logo, channel_url, tier, is_active, is_trial, trial_ends_at, subscription_status, next_payment_due, grace_period_until, registration_paid, wallet_btc, wallet_eth, wallet_usdt, wallet_ltc, invite_code, created_at, updated_at`,
      params
    );
    return result.rows[0];
  },
};

export default shopQueries;
