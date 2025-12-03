import { shopQueries } from '../database/queries/index.js';
import { dbErrorHandler, asyncHandler } from '../middleware/errorHandler.js';
import { NotFoundError, UnauthorizedError, ValidationError, ConflictError, PaymentRequiredError } from '../utils/errors.js';
import logger from '../utils/logger.js';
import { activatePromoSubscription } from '../services/subscriptionService.js';
import { validateAddress } from '../utils/addressValidation.js';
import * as promoCodeQueries from '../../database/queries/promoCodeQueries.js';
import { broadcast } from '../utils/websocket.js';
import { TRIAL_PERIOD_DAYS } from '../config/subscriptionPricing.js';

/**
 * Shop Controller
 */
export const shopController = {
  /**
   * Create new shop
   * Any user can create a shop - they become a seller by creating one
   */
  create: asyncHandler(async (req, res) => {
    try {
      const { name, description, logo, promoCode, tier = 'pro', subscriptionId, trial } = req.body;
      const normalizedPromo = promoCode?.trim().toLowerCase();
      const wantsMax = tier === 'max';

      logger.info('[ShopController] Creating shop:', {
        userId: req.user.id,
        name,
        tier,
        subscriptionId,
        trial: !!trial,
      });

      // Validate only ONE payment method allowed
      const paymentMethods = [trial, !!normalizedPromo, !!subscriptionId].filter(Boolean);
      if (paymentMethods.length > 1) {
        throw new ValidationError('Cannot use trial, promo code, and subscription together. Choose one.');
      }

      // Validate tier
      if (!['pro', 'max'].includes(tier)) {
        throw new ValidationError('Invalid tier. Must be "pro" or "max"');
      }

      // Check if user already has a shop
      const existingShops = await shopQueries.findByOwnerId(req.user.id, { includeInactive: true });
      if (existingShops.length > 0) {
        throw new ValidationError('User already has a shop');
      }

      // Validate shop name
      if (!name || name.trim().length < 3) {
        throw new ValidationError('Shop name must be at least 3 characters');
      }

      // Check if shop name is already taken
      const nameTaken = await shopQueries.isNameTaken(name);
      if (nameTaken) {
        throw new ConflictError('Shop name already taken. Try another one');
      }

      // Handle subscription-based creation
      if (subscriptionId) {
        const { getClient } = await import('../config/database.js');
        const client = await getClient();

        try {
          await client.query('BEGIN');

          // Verify subscription exists and belongs to user
          const subscriptionCheck = await client.query(
            `SELECT id, tier, status, user_id, shop_id
             FROM shop_subscriptions
             WHERE id = $1`,
            [subscriptionId]
          );

          if (subscriptionCheck.rows.length === 0) {
            await client.query('ROLLBACK');
            throw new NotFoundError('Subscription');
          }

          const subscription = subscriptionCheck.rows[0];

          // Verify subscription belongs to user
          if (subscription.user_id !== req.user.id) {
            await client.query('ROLLBACK');
            throw new UnauthorizedError('Subscription belongs to another user');
          }

          // Verify subscription is paid
          if (subscription.status !== 'paid') {
            await client.query('ROLLBACK');
            throw new ValidationError(`Subscription not paid yet (status: ${subscription.status})`);
          }

          // Verify subscription not already linked
          if (subscription.shop_id !== null) {
            await client.query('ROLLBACK');
            throw new ValidationError('Subscription already linked to a shop');
          }

          // Create shop
          const shopResult = await client.query(
            `INSERT INTO shops
             (owner_id, name, description, logo, tier, subscription_status, is_active, registration_paid)
             VALUES ($1, $2, $3, $4, $5, 'active', true, true)
             RETURNING *`,
            [req.user.id, name.trim(), description, logo, subscription.tier]
          );

          const shop = shopResult.rows[0];

          // Link subscription to shop
          await client.query(
            `UPDATE shop_subscriptions
             SET shop_id = $1
             WHERE id = $2`,
            [shop.id, subscriptionId]
          );

          await client.query('COMMIT');

          logger.info('[ShopController] Shop created and linked to subscription:', {
            shopId: shop.id,
            subscriptionId,
            userId: req.user.id,
          });

          return res.status(201).json({
            success: true,
            data: shop,
          });
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      // Handle FREE TRIAL - 7 days PRO for new sellers
      if (trial) {
        const trialTier = tier === 'max' ? 'max' : 'pro';
        const now = Date.now();
        const trialEndsAt = new Date(now + TRIAL_PERIOD_DAYS * 24 * 60 * 60 * 1000);

        // Check if user EVER had a trial (prevent abuse)
        const { getClient } = await import('../config/database.js');
        const client = await getClient();

        try {
          await client.query('BEGIN');

          // FIX H4: Check for previous trials INCLUDING deleted shops to prevent trial abuse
          const previousTrial = await client.query(
            `SELECT id FROM shops WHERE owner_id = $1 AND (is_trial = true OR trial_ends_at IS NOT NULL)`,
            [req.user.id]
          );

          if (previousTrial.rows.length > 0) {
            await client.query('ROLLBACK');
            throw new ValidationError('Free trial already used. Please subscribe to continue.');
          }

          // Create shop with trial fields in single transaction
          const shopResult = await client.query(
            `INSERT INTO shops (
               owner_id,
               name,
               description,
               logo,
               tier,
               is_trial,
               trial_ends_at,
               subscription_status,
               is_active,
               next_payment_due
             )
             VALUES ($1, $2, $3, $4, $5, true, $6, 'active', true, $7)
             RETURNING *`,
            [req.user.id, name.trim(), description, logo, trialTier, trialEndsAt, trialEndsAt]
          );

          await client.query('COMMIT');
          const shop = shopResult.rows[0];

          logger.info('[ShopController] Free trial activated:', {
            shopId: shop.id,
            userId: req.user.id,
            trialEndsAt: shop.trial_ends_at,
            tier: shop.tier,
          });

          return res.status(201).json({
            success: true,
            data: shop,
          });
        } catch (error) {
          await client.query('ROLLBACK');
          throw error;
        } finally {
          client.release();
        }
      }

      // Handle promo code - promo code DETERMINES the tier
      let promoValidation = null;
      let effectiveTier = tier; // Default to requested tier

      if (normalizedPromo) {
        // Validate promo code against database (no tier check - promo determines tier)
        promoValidation = await promoCodeQueries.validatePromoCode(normalizedPromo);

        if (!promoValidation.valid) {
          throw new ValidationError(promoValidation.error || 'Invalid promo code');
        }

        // Promo code determines the tier
        effectiveTier = promoValidation.tier;
        logger.info('[ShopController] Promo code validated, tier from promo:', {
          promoCode: normalizedPromo,
          promoTier: effectiveTier,
          requestedTier: tier,
        });
      } else if (wantsMax) {
        // MAX without promo code requires payment
        throw new PaymentRequiredError('MAX plan requires payment or valid promo code');
      }

      let shop = await shopQueries.create({
        ownerId: req.user.id,
        name,
        description,
        logo,
        tier: effectiveTier, // Use tier from promo code or request
      });

      // Activate promo subscription if promo code was used
      if (promoValidation && promoValidation.valid) {
        try {
          shop = await activatePromoSubscription(
            shop.id,
            req.user.id,
            normalizedPromo,
            promoValidation.tier
          );

          // Increment promo code usage count
          await promoCodeQueries.incrementUsageCount(promoValidation.promoCode.id);

          logger.info(`Promo code applied for shop ${shop.id} by user ${req.user.id}`, {
            promoCode: normalizedPromo,
            promoCodeId: promoValidation.promoCode.id,
            tier: promoValidation.tier,
          });
        } catch (promoError) {
          logger.error('Promo activation failed', {
            error: promoError.message,
            stack: promoError.stack,
          });

          // Check if it's idempotency error (promo already used)
          if (promoError.message === 'Promo code already used by this user') {
            throw new ConflictError('This promo code has already been used by your account');
          }

          try {
            await shopQueries.delete(shop.id);
          } catch (cleanupError) {
            logger.error('Failed to rollback shop after promo failure', {
              error: cleanupError.message,
              stack: cleanupError.stack,
            });
          }
          return res.status(500).json({
            success: false,
            error: 'Failed to apply promo code. Shop was not created.',
          });
        }
      }

      return res.status(201).json({
        success: true,
        data: shop,
      });
    } catch (error) {
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {}),
        });
      }

      logger.error('Create shop error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Get shop by ID
   * SECURITY FIX (P0-SEC-2): Filter sensitive data for non-owners
   */
  getById: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      const shop = await shopQueries.findById(id);

      if (!shop) {
        throw new NotFoundError('Shop');
      }

      // SECURITY: Filter sensitive data if not owner
      const isOwner = req.user && req.user.id === shop.owner_id;

      // Build list of available crypto currencies for ALL users (owners and buyers)
      const availableCryptos = [];
      if (shop.wallet_btc) {availableCryptos.push('BTC');}
      if (shop.wallet_eth) {availableCryptos.push('ETH');}
      if (shop.wallet_usdt) {availableCryptos.push('USDT_TRC20');}
      if (shop.wallet_ltc) {availableCryptos.push('LTC');}
      shop.availableCryptos = availableCryptos;

      if (!isOwner) {
        // Remove sensitive fields for non-owners (wallet addresses, subscription info)
        delete shop.wallet_btc;
        delete shop.wallet_eth;
        delete shop.wallet_usdt;
        delete shop.wallet_ltc;
        delete shop.subscription_status;
        delete shop.next_payment_due;
        delete shop.grace_period_until;
      }

      return res.status(200).json({
        success: true,
        data: shop,
      });
    } catch (error) {
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {}),
        });
      }

      logger.error('Get shop error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Get shops by seller (current user)
   * Any user can check if they have shops - having a shop makes them a seller
   */
  getMyShops: asyncHandler(async (req, res) => {
    try {
      const shops = await shopQueries.findByOwnerId(req.user.id, { includeInactive: true });

      // Add availableCryptos for each shop (owner can see which cryptos are configured)
      const shopsWithCryptos = shops.map((shop) => {
        const availableCryptos = [];
        if (shop.wallet_btc) {availableCryptos.push('BTC');}
        if (shop.wallet_eth) {availableCryptos.push('ETH');}
        if (shop.wallet_usdt) {availableCryptos.push('USDT_TRC20');}
        if (shop.wallet_ltc) {availableCryptos.push('LTC');}
        return { ...shop, availableCryptos };
      });

      return res.status(200).json({
        success: true,
        data: shopsWithCryptos,
      });
    } catch (error) {
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {}),
        });
      }

      logger.error('Get my shops error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Update shop
   */
  update: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { name, description, logo, isActive } = req.body;

      // Check if shop exists and belongs to user
      const existingShop = await shopQueries.findById(id);

      if (!existingShop) {
        throw new NotFoundError('Shop');
      }

      if (existingShop.owner_id !== req.user.id) {
        throw new UnauthorizedError('You can only update your own shops');
      }

      // Check if new name is already taken (if name is being updated)
      if (name && name !== existingShop.name) {
        const nameTaken = await shopQueries.isNameTaken(name, id);
        if (nameTaken) {
          throw new ConflictError('Shop name already taken. Try another one');
        }
      }

      const shop = await shopQueries.update(id, {
        name,
        description,
        logo,
        isActive,
      });

      // Emit WebSocket event for real-time updates
      broadcast('shop_updated', { shopId: parseInt(id, 10) });

      return res.status(200).json({
        success: true,
        data: shop,
      });
    } catch (error) {
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {}),
        });
      }

      logger.error('Update shop error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Delete shop
   */
  delete: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      // Check if shop exists and belongs to user
      const existingShop = await shopQueries.findById(id);

      if (!existingShop) {
        throw new NotFoundError('Shop');
      }

      if (existingShop.owner_id !== req.user.id) {
        throw new UnauthorizedError('You can only delete your own shops');
      }

      await shopQueries.delete(id);

      return res.status(200).json({
        success: true,
        message: 'Shop deleted successfully',
      });
    } catch (error) {
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {}),
        });
      }

      logger.error('Delete shop error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * List all active shops
   */
  listActive: asyncHandler(async (req, res) => {
    try {
      const page = Number.parseInt(req.query.page, 10) || 1;
      if (!Number.isInteger(page) || page <= 0) {
        throw new ValidationError('Invalid page parameter');
      }

      const limit = Number.parseInt(req.query.limit, 10) || 50;
      if (!Number.isInteger(limit) || limit <= 0 || limit > 1000) {
        throw new ValidationError('Invalid limit parameter (must be 1-1000)');
      }
      const offset = (page - 1) * limit;

      const shops = await shopQueries.listActive(limit, offset);

      return res.status(200).json({
        success: true,
        data: shops,
        pagination: {
          page,
          limit,
          total: shops.length,
        },
      });
    } catch (error) {
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {}),
        });
      }

      logger.error('List shops error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Search active shops by name
   */
  search: asyncHandler(async (req, res) => {
    try {
      const term = (req.query.q || req.query.query || '').trim();

      if (term.length < 2) {
        throw new ValidationError('Search query must be at least 2 characters long');
      }

      const limit = Number.parseInt(req.query.limit, 10) || 10;
      if (!Number.isInteger(limit) || limit <= 0 || limit > 100) {
        throw new ValidationError('Invalid limit parameter (must be 1-100)');
      }

      const shops = await shopQueries.searchByName(term, limit, req.user?.id ?? null);

      return res.status(200).json({
        success: true,
        data: shops,
      });
    } catch (error) {
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {}),
        });
      }

      logger.error('Search shops error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Get shop wallets
   * SECURITY FIX (#5): Only shop owner can view wallet addresses
   */
  getWallets: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;

      logger.info('[getWallets] Request received', { shopId: id, userId: req.user?.id });

      // Check if shop exists
      const shop = await shopQueries.findById(id);

      logger.info('[getWallets] Shop query result', { found: !!shop, shopId: id });

      if (!shop) {
        logger.warn('[getWallets] Shop not found', { shopId: id });
        throw new NotFoundError('Shop');
      }

      // FIX #5: Check ownership - only shop owner can view wallet addresses
      if (shop.owner_id !== req.user.id) {
        logger.warn('[getWallets] Unauthorized wallet access attempt', {
          userId: req.user.id,
          shopId: id,
          shopOwnerId: shop.owner_id,
        });

        throw new UnauthorizedError('Access denied. Only shop owner can view wallet addresses.');
      }

      // Return wallet data (only for owner)
      return res.status(200).json({
        success: true,
        data: {
          wallet_btc: shop.wallet_btc || null,
          wallet_eth: shop.wallet_eth || null,
          wallet_usdt: shop.wallet_usdt || null,
          wallet_ltc: shop.wallet_ltc || null,
          updated_at: shop.updated_at,
        },
      });
    } catch (error) {
      logger.error('Get wallets error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Update shop wallets
   * P0-DB-1 FIX: Check for wallet duplicates before updating
   * WALLET-VALIDATION: Validate all crypto addresses before database update
   */
  updateWallets: asyncHandler(async (req, res) => {
    try {
      const { id } = req.params;
      const { wallet_btc, wallet_eth, wallet_usdt, wallet_ltc } = req.body;

      // Check if shop exists and belongs to user
      const existingShop = await shopQueries.findById(id);

      if (!existingShop) {
        throw new NotFoundError('Shop');
      }

      if (existingShop.owner_id !== req.user.id) {
        throw new UnauthorizedError('You can only update your own shop wallets');
      }

      // WALLET-VALIDATION: Validate Bitcoin address
      if (wallet_btc !== undefined && wallet_btc && wallet_btc.trim()) {
        const isValid = validateAddress(wallet_btc.trim(), 'BTC');
        if (!isValid) {
          logger.warn(`[Wallet Validation] Invalid BTC address attempt`, {
            userId: req.user.id,
            shopId: id,
            address: wallet_btc.substring(0, 8) + '...',
          });
          throw new ValidationError(`Invalid Bitcoin address format: ${wallet_btc}`);
        }
      }

      // WALLET-VALIDATION: Validate Ethereum address
      if (wallet_eth !== undefined && wallet_eth && wallet_eth.trim()) {
        const isValid = validateAddress(wallet_eth.trim(), 'ETH');
        if (!isValid) {
          logger.warn(`[Wallet Validation] Invalid ETH address attempt`, {
            userId: req.user.id,
            shopId: id,
            address: wallet_eth.substring(0, 8) + '...',
          });
          throw new ValidationError(`Invalid Ethereum address format: ${wallet_eth}`);
        }
      }

      // WALLET-VALIDATION: Validate USDT address (ERC20 = Ethereum format)
      if (wallet_usdt !== undefined && wallet_usdt && wallet_usdt.trim()) {
        const isValid = validateAddress(wallet_usdt.trim(), 'ETH');
        if (!isValid) {
          logger.warn(`[Wallet Validation] Invalid USDT address attempt`, {
            userId: req.user.id,
            shopId: id,
            address: wallet_usdt.substring(0, 8) + '...',
          });
          throw new ValidationError(`Invalid USDT (ERC20) address format: ${wallet_usdt}`);
        }
      }

      // WALLET-VALIDATION: Validate Litecoin address
      if (wallet_ltc !== undefined && wallet_ltc && wallet_ltc.trim()) {
        const isValid = validateAddress(wallet_ltc.trim(), 'LTC');
        if (!isValid) {
          logger.warn(`[Wallet Validation] Invalid LTC address attempt`, {
            userId: req.user.id,
            shopId: id,
            address: wallet_ltc.substring(0, 8) + '...',
          });
          throw new ValidationError(`Invalid Litecoin address format: ${wallet_ltc}`);
        }
      }

      // Build update object (only include provided fields)
      const walletUpdates = {};
      if (wallet_btc !== undefined) {
        walletUpdates.wallet_btc = wallet_btc;
      }
      if (wallet_eth !== undefined) {
        walletUpdates.wallet_eth = wallet_eth;
      }
      if (wallet_usdt !== undefined) {
        walletUpdates.wallet_usdt = wallet_usdt;
      }
      if (wallet_ltc !== undefined) {
        walletUpdates.wallet_ltc = wallet_ltc;
      }

      // P0-DB-1 FIX: Check for duplicate wallets before updating
      // Only check wallets that are being updated and are not empty
      const pool = (await import('../config/database.js')).default;

      for (const [field, value] of Object.entries(walletUpdates)) {
        // Skip empty/null values (allowed)
        if (!value || value.trim() === '') {
          continue;
        }

        const normalizedValue = value.trim();

        // Check if this wallet address is already used by another shop
        const duplicateCheck = await pool.query(
          `SELECT id, name FROM shops WHERE ${field} = $1 AND id != $2`,
          [normalizedValue, id]
        );

        if (duplicateCheck.rows.length > 0) {
          const _conflictShop = duplicateCheck.rows[0];
          throw new ConflictError(`Wallet address already in use by another shop`);
        }
      }

      // Update wallets (database constraint will also catch duplicates)
      const shop = await shopQueries.updateWallets(id, walletUpdates);

      return res.status(200).json({
        success: true,
        data: {
          wallet_btc: shop.wallet_btc || null,
          wallet_eth: shop.wallet_eth || null,
          wallet_usdt: shop.wallet_usdt || null,
          wallet_ltc: shop.wallet_ltc || null,
          updated_at: shop.updated_at,
        },
      });
    } catch (error) {
      // P0-DB-1: Handle unique constraint violation
      if (error.code === '23505' && error.constraint?.includes('wallet')) {
        const walletType = error.constraint
          .replace('shops_wallet_', '')
          .replace('_unique', '')
          .toUpperCase();
        throw new ConflictError(`${walletType} wallet address already in use by another shop`);
      }

      logger.error('Update wallets error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),
};

export default shopController;
