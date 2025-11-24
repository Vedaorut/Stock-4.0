/**
 * Subscription Invoice Service
 *
 * Handles invoice generation for shop subscription payments:
 * - Creates payment invoices with unique HD wallet addresses
 * - Registers webhooks for BTC/LTC (BlockCypher)
 * - ETH/USDT use polling (no webhook registration needed)
 * - 30 minute expiration window
 */

import logger from '../utils/logger.js';
import * as walletService from './walletService.js';
import * as blockCypherService from './blockCypherService.js';
import * as cryptoPriceService from './cryptoPriceService.js';
import { invoiceQueries } from '../database/queries/index.js';
import { query } from '../config/database.js';
import { SUBSCRIPTION_PRICES } from '../config/subscriptionPricing.js';
import { INVOICE_PURPOSES } from '../constants/invoice.js';

// Invoice expiration time (30 minutes)
const INVOICE_EXPIRATION_MINUTES = 30;

/**
 * Get HD wallet xpub keys from environment (lazy loading to ensure dotenv is loaded)
 */
function getXpubs() {
  return {
    BTC: process.env.BTC_XPUB || process.env.HD_XPUB_BTC,
    LTC: process.env.LTC_XPUB || process.env.HD_XPUB_LTC,
    ETH: process.env.ETH_XPUB || process.env.HD_XPUB_ETH,
    USDT_TRC20:
      process.env.TRX_XPUB ||
      process.env.HD_XPUB_TRON ||
      null, // USDT TRC20 requires Tron xpub - NO fallback to ETH!
  };
}

/**
 * Get webhook base URL from environment
 */
function getWebhookBaseUrl() {
  return process.env.WEBHOOK_BASE_URL || 'https://api.yourplatform.com';
}

/**
 * Generate payment invoice for subscription
 *
 * @param {number} subscriptionId - Shop subscription ID (from shop_subscriptions table)
 * @param {string} chain - Blockchain (BTC, LTC, ETH, USDT_TRC20)
 * @returns {Promise<object>} { invoice, address, expectedAmount, currency, expiresAt }
 */
export async function generateSubscriptionInvoice(subscriptionId, chain, options = {}) {
  const {
    purpose = INVOICE_PURPOSES.SUBSCRIPTION,
    usdAmountOverride = null,
  } = options;

  try {
    logger.info(
      `[SubscriptionInvoice] Generating invoice for subscription ${subscriptionId}, chain: ${chain}, purpose: ${purpose}`
    );

    // 1. Get subscription details
    const subscriptionResult = await query(
      `SELECT ss.*,
              COALESCE(s.tier, ss.tier) as tier,
              s.name as shop_name
       FROM shop_subscriptions ss
       LEFT JOIN shops s ON ss.shop_id = s.id
       WHERE ss.id = $1`,
      [subscriptionId]
    );

    if (subscriptionResult.rows.length === 0) {
      throw new Error(`Subscription ${subscriptionId} not found`);
    }

    const subscription = subscriptionResult.rows[0];
    const { tier, shop_name } = subscription;

    // 2. Determine expected amount from tier (in USD)
    const usdAmount = usdAmountOverride ?? SUBSCRIPTION_PRICES[tier];

    if (!usdAmount || Number.isNaN(usdAmount) || usdAmount <= 0) {
      throw new Error(`Invalid subscription amount for tier '${tier}': ${usdAmount}. Check SUBSCRIPTION_PRICES configuration.`);
    }

    logger.info(
      `[SubscriptionInvoice] Subscription tier: ${tier}, USD amount: $${usdAmount} (purpose: ${purpose})`
    );

    // 3. Normalize chain name
    const normalizedChain = normalizeChain(chain);
    const currency = getCurrencyFromChain(normalizedChain);

    // 4. Get crypto price and convert USD → Crypto
    let cryptoAmount;
    let usdRate;

    try {
      const conversionResult = await cryptoPriceService.convertAndRound(usdAmount, normalizedChain);
      // CRITICAL FIX: Convert string to float to avoid precision issues
      cryptoAmount = parseFloat(conversionResult.cryptoAmount);
      usdRate = parseFloat(conversionResult.usdRate);

      logger.info(
        `[SubscriptionInvoice] Price conversion: $${usdAmount} USD = ${cryptoAmount} ${currency} (rate: $${usdRate})`
      );
    } catch (priceError) {
      logger.error('[SubscriptionInvoice] Failed to fetch crypto price:', {
        error: priceError.message,
        chain: normalizedChain,
      });
      throw new Error(
        `Cannot generate invoice: crypto price unavailable for ${normalizedChain}. Please try again in a few moments.`
      );
    }

    // 5. Validate xpub exists for chain
    const xpubs = getXpubs();
    const xpub = xpubs[normalizedChain];

    if (!xpub) {
      throw new Error(
        `No xpub configured for chain: ${normalizedChain}. Set ${normalizedChain}_XPUB or HD_XPUB_${normalizedChain.replace('_', '_')} in environment.`
      );
    }

    // 6. Get next derivation index for this chain
    const nextIndex = await invoiceQueries.getNextIndex(normalizedChain);

    logger.info(`[SubscriptionInvoice] Next address index for ${normalizedChain}: ${nextIndex}`);

    // 7. Generate unique payment address
    // Map chain to wallet type (USDT tokens use underlying blockchain)
    const walletType = normalizedChain === 'USDT_TRC20' ? 'TRX' : normalizedChain;

    const { address, derivationPath } = await walletService.generateAddress(
      walletType,
      xpub,
      nextIndex
    );

    logger.info(`[SubscriptionInvoice] Generated address: ${address} (${derivationPath})`);

    // 8. Calculate expiration time (30 minutes from now)
    const expiresAt = new Date(Date.now() + INVOICE_EXPIRATION_MINUTES * 60 * 1000);

    // 9. Register webhook for BTC/LTC (BlockCypher)
    let webhookSubscriptionId = null;

    if (normalizedChain === 'BTC' || normalizedChain === 'LTC') {
      try {
        const callbackUrl = `${getWebhookBaseUrl()}/api/webhooks/blockcypher`;

        logger.info(
          `[SubscriptionInvoice] Registering BlockCypher webhook for ${normalizedChain}...`
        );

        webhookSubscriptionId = await blockCypherService.registerWebhook(
          normalizedChain,
          address,
          callbackUrl,
          3 // 3 confirmations
        );

        logger.info(`[SubscriptionInvoice] Webhook registered: ${webhookSubscriptionId}`);
      } catch (webhookError) {
        // Non-critical: webhook registration failed, but polling will still work
        logger.warn(`[SubscriptionInvoice] Webhook registration failed (will rely on polling):`, {
          error: webhookError.message,
          chain: normalizedChain,
          address,
        });
      }
    } else {
      logger.info(`[SubscriptionInvoice] No webhook needed for ${normalizedChain} (polling-based)`);
    }

    // 10. Create invoice record with crypto_amount and usd_rate (migration 016)
    const invoiceResult = await query(
      `INSERT INTO invoices
       (subscription_id, chain, address, address_index, expected_amount, crypto_amount, usd_rate, currency, tatum_subscription_id, expires_at, status, purpose)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'pending', $11)
       RETURNING *`,
      [
        subscriptionId,
        normalizedChain,
        address,
        nextIndex,
        usdAmount,
        cryptoAmount,
        usdRate,
        currency,
        webhookSubscriptionId,
        expiresAt,
        purpose,
      ]
    );

    const invoice = invoiceResult.rows[0];

    logger.info('[SubscriptionInvoice] Invoice created successfully', {
      invoiceId: invoice.id,
      subscriptionId,
      shopName: shop_name,
      tier,
      address,
      usdAmount,
      cryptoAmount,
      currency,
      usdRate,
      expiresAt: expiresAt.toISOString(),
      expiresAtUnix: expiresAt.getTime(),
      currentTimeUnix: Date.now(),
      validityPeriodSeconds: Math.floor((expiresAt.getTime() - Date.now()) / 1000),
    });

    return {
      invoice,
      address,
      expectedAmount: usdAmount, // USD price for display
      cryptoAmount, // Exact crypto amount to pay
      usdRate, // Exchange rate used
      currency,
      expiresAt,
      derivationPath,
      webhookSubscriptionId,
    };
  } catch (error) {
    logger.error('[SubscriptionInvoice] Failed to generate subscription invoice:', {
      error: error.message,
      subscriptionId,
      chain,
    });
    throw new Error(`Failed to generate subscription invoice: ${error.message}`);
  }
}

/**
 * Find active (pending, not expired) invoice for subscription
 *
 * @param {number} subscriptionId - Shop subscription ID
 * @param {string|null} purpose - Optional invoice purpose filter
 * @returns {Promise<object|null>} Invoice or null
 */
export async function findActiveInvoiceForSubscription(subscriptionId, purpose = null) {
  try {
    logger.debug('[SubscriptionInvoice] Searching for active invoice', {
      subscriptionId,
      purpose,
      searchConditions: {
        status: 'pending',
        expires_at: 'must be > NOW()',
      },
    });

    const params = [subscriptionId];
    let purposeFilter = '';

    if (purpose) {
      purposeFilter = 'AND purpose = $2';
      params.push(purpose);
    }

    // Main query - Relaxed to include PAID invoices so the UI doesn't crash after payment
    const result = await query(
      `SELECT * FROM invoices
       WHERE subscription_id = $1
       ${purposeFilter}
       AND (
         (status = 'pending' AND expires_at > NOW())
         OR
         status IN ('paid', 'confirmed')
       )
       ORDER BY created_at DESC
       LIMIT 1`,
      params
    );

    if (result.rows.length === 0) {
      logger.warn('[SubscriptionInvoice] No active invoice found - running diagnostics', {
        subscriptionId,
      });

      // Diagnostic query: find ALL invoices for this subscription
      const diagnosticResult = await query(
        `SELECT 
          id, 
          status, 
          expires_at, 
          NOW() as current_time,
          (expires_at > NOW()) as is_valid,
          EXTRACT(EPOCH FROM (expires_at - NOW())) as seconds_until_expiry,
          created_at
        FROM invoices 
        WHERE subscription_id = $1
        ${purposeFilter}
        ORDER BY created_at DESC
        LIMIT 5`,
        params
      );

      if (diagnosticResult.rows.length === 0) {
        logger.warn('[SubscriptionInvoice] No invoices exist for this subscription', {
          subscriptionId,
          reason: 'No invoices created yet',
        });
      } else {
        // Analyze why invoice didn't pass conditions
        diagnosticResult.rows.forEach((inv, index) => {
          const reasons = [];
          if (inv.status !== 'pending') {
            reasons.push(`status=${inv.status} (not 'pending')`);
          }
          if (!inv.is_valid) {
            reasons.push(`expired ${Math.abs(inv.seconds_until_expiry).toFixed(0)}s ago`);
          }

          logger.warn('[SubscriptionInvoice] Invoice found but not active', {
            subscriptionId,
            invoiceId: inv.id,
            index,
            status: inv.status,
            expiresAt: inv.expires_at,
            currentTime: inv.current_time,
            isValid: inv.is_valid,
            secondsUntilExpiry: parseFloat(inv.seconds_until_expiry).toFixed(2),
            createdAt: inv.created_at,
            reasons: reasons.length > 0 ? reasons.join(', ') : 'Active and valid',
          });
        });
      }

      return null;
    }

    const invoice = result.rows[0];

    logger.info('[SubscriptionInvoice] Found active invoice', {
      subscriptionId,
      invoiceId: invoice.id,
      address: invoice.address,
      expiresAt: invoice.expires_at,
      status: invoice.status,
    });

    return invoice;
  } catch (error) {
    logger.error('[SubscriptionInvoice] Error finding active invoice:', {
      error: error.message,
      stack: error.stack,
      subscriptionId,
    });
    return null;
  }
}

/**
 * Normalize chain identifier
 * @param {string} chain - Input chain name
 * @returns {string} Normalized chain name
 */
function normalizeChain(chain) {
  const chainUpper = chain.toUpperCase();

  switch (chainUpper) {
    case 'BTC':
    case 'BITCOIN':
      return 'BTC';

    case 'LTC':
    case 'LITECOIN':
      return 'LTC';

    case 'ETH':
    case 'ETHEREUM':
      return 'ETH';

    case 'USDT':
    case 'USDT_TRC20':
      return 'USDT_TRC20';

    default:
      throw new Error(`Unsupported chain: ${chain}. Supported: BTC, LTC, ETH, USDT_TRC20`);
  }
}

/**
 * Get currency name from chain
 * @param {string} chain - Normalized chain name
 * @returns {string} Currency ticker
 */
function getCurrencyFromChain(chain) {
  switch (chain) {
    case 'BTC':
      return 'BTC';
    case 'LTC':
      return 'LTC';
    case 'ETH':
      return 'ETH';
    case 'USDT_TRC20':
      return 'USDT';
    default:
      return chain;
  }
}

// Re-export INVOICE_PURPOSES for backward compatibility with controllers
export { INVOICE_PURPOSES };

export default {
  generateSubscriptionInvoice,
  findActiveInvoiceForSubscription,
  SUBSCRIPTION_PRICES,
  INVOICE_PURPOSES, // Also include in default export
};
