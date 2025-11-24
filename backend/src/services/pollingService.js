import { invoiceQueries, orderQueries } from '../database/queries/index.js';
import { getClient } from '../config/database.js';
import * as etherscanService from './etherscanService.js';
import * as tronService from './tronService.js';
import * as blockCypherService from './blockCypherService.js';
import invoicePaymentService from './invoicePaymentService.js';
import logger from '../utils/logger.js';
import { amountsMatchWithTolerance } from '../utils/paymentTolerance.js';
import { SUPPORTED_CURRENCIES } from '../utils/constants.js';

/**
 * Polling Service - Payment monitoring for ETH and TRON chains
 *
 * Features:
 * - Poll pending invoices every 60 seconds
 * - Verify payments on Ethereum (ETH, USDT ERC-20)
 * - Verify payments on Tron (USDT TRC-20)
 * - Update payment records and order status
 * - Notify users via Telegram
 * - Handle expired invoices
 *
 * Note: BTC and LTC use webhooks (BlockCypher), so no polling needed
 */

let pollingInterval;
let isPolling = false;
let isProcessing = false; // Mutex lock to prevent concurrent polling

// Configuration
const POLLING_INTERVAL_MS = 60000; // 60 seconds
const BATCH_SIZE = 10; // Process 10 invoices at a time

// Statistics
let stats = {
  pollCount: 0,
  paymentsFound: 0,
  paymentsConfirmed: 0,
  errors: 0,
  lastPollTime: null,
};

/**
 * Start polling service
 */
export function startPolling() {
  if (isPolling) {
    logger.warn('[PollingService] Already running');
    return;
  }

  logger.info('[PollingService] Starting payment polling...');

  isPolling = true;

  // Run immediately on start with mutex lock
  isProcessing = true;
  checkPendingPayments()
    .catch((error) => {
      logger.error('[PollingService] Initial poll failed:', {
        error: error.message,
      });
    })
    .finally(() => {
      isProcessing = false;
    });

  // Then run every 60 seconds with mutex lock
  pollingInterval = setInterval(async () => {
    if (isPolling && !isProcessing) {
      isProcessing = true;
      try {
        await checkPendingPayments();
      } catch (error) {
        logger.error('[PollingService] Polling error:', error);
      } finally {
        isProcessing = false;
      }
    } else if (isProcessing) {
      logger.warn('[PollingService] Skipping poll - previous poll still running');
    }
  }, POLLING_INTERVAL_MS);

  logger.info('[PollingService] Polling started successfully');
}

/**
 * Stop polling service
 */
export function stopPolling() {
  if (!isPolling) {
    logger.warn('[PollingService] Not running');
    return;
  }

  logger.info('[PollingService] Stopping payment polling...');

  isPolling = false;

  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }

  logger.info('[PollingService] Polling stopped successfully');
}

/**
 * Get polling statistics
 * @returns {object} Statistics
 */
export function getStats() {
  return {
    ...stats,
    isRunning: isPolling,
  };
}

/**
 * Reset statistics
 */
export function resetStats() {
  stats = {
    pollCount: 0,
    paymentsFound: 0,
    paymentsConfirmed: 0,
    errors: 0,
    lastPollTime: null,
  };
  logger.info('[PollingService] Statistics reset');
}

/**
 * Main polling function - checks all pending payments
 */
async function checkPendingPayments() {
  try {
    stats.pollCount++;
    stats.lastPollTime = new Date().toISOString();

    logger.info('[PollingService] Checking pending payments...', {
      pollCount: stats.pollCount,
    });

    // Get all pending invoices for ETH and TRON (USDT TRC-20) chains
    const pendingInvoices = await getPendingInvoices();

    if (pendingInvoices.length === 0) {
      logger.debug('[PollingService] No pending invoices found');
      return;
    }

    logger.info(`[PollingService] Found ${pendingInvoices.length} pending invoices`);

    // Process invoices in batches
    for (let i = 0; i < pendingInvoices.length; i += BATCH_SIZE) {
      const batch = pendingInvoices.slice(i, i + BATCH_SIZE);

      await Promise.all(batch.map((invoice) => processInvoice(invoice)));
    }

    // Handle expired invoices
    await handleExpiredInvoices();

    logger.info('[PollingService] Poll completed', {
      processed: pendingInvoices.length,
      paymentsFound: stats.paymentsFound,
      paymentsConfirmed: stats.paymentsConfirmed,
    });
  } catch (error) {
    stats.errors++;
    logger.error('[PollingService] Poll failed:', {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Get pending invoices for ETH and TRON (USDT TRC-20) chains
 * @returns {Promise<Array>} Pending invoices
 */
async function getPendingInvoices() {
  try {
    // Query invoices table for pending invoices (all chains)
    // BTC/LTC use webhooks but polling serves as fallback
    const result = await invoiceQueries.findPendingByChains([
      'ETH',
      'USDT_TRC20',
      'BTC',
      'LTC'
    ]);
    return result || [];
  } catch (error) {
    logger.error('[PollingService] Failed to get pending invoices:', {
      error: error.message,
    });
    return [];
  }
}

/**
 * Process a single invoice - check for payment
 * @param {object} invoice - Invoice record
 */
async function processInvoice(invoice) {
  try {
    const invoiceType = invoice.order_id ? 'order' : 'subscription';
    logger.debug(`[PollingService] Processing ${invoiceType} invoice ${invoice.id}`, {
      chain: invoice.chain,
      address: invoice.address,
      expectedAmount: invoice.expected_amount,
      orderId: invoice.order_id || null,
      subscriptionId: invoice.subscription_id || null,
    });

    let payment;

    // Check if invoice expired BEFORE attempting verification
    const now = new Date();
    const expiresAt = new Date(invoice.expires_at);
    
    // Allow 24-hour grace period for crypto payments
    // This prevents "money gone" scenarios where user pays right at expiration
    const GRACE_PERIOD_MS = 24 * 60 * 60 * 1000; // 24 hours
    const hardDeadline = new Date(expiresAt.getTime() + GRACE_PERIOD_MS);

    if (now > hardDeadline) {
      logger.info(`[PollingService] Invoice expired > 24h ago, skipping:`, {
        invoiceId: invoice.id,
        expiresAt: invoice.expires_at,
        chain: invoice.chain,
      });
      
      // Mark as expired (will be handled by handleExpiredInvoices)
      return;
    }

    if (now > expiresAt) {
      logger.info(`[PollingService] Invoice expired but within grace period, checking payment:`, {
        invoiceId: invoice.id,
        expiresAt: invoice.expires_at,
        chain: invoice.chain,
      });
    }

    // Check based on chain
    if (invoice.chain === 'ETH') {
      payment = await checkEthPayment(invoice);
    } else if (invoice.chain === 'USDT_TRC20') {
      payment = await checkTronPayment(invoice);
    } else if (invoice.chain === 'BTC' || invoice.chain === 'LTC') {
      payment = await checkBlockCypherPayment(invoice);
    } else {
      logger.warn(`[PollingService] Unsupported chain: ${invoice.chain}`);
      return;
    }

    if (!payment) {
      logger.debug(`[PollingService] No payment found for ${invoiceType} invoice ${invoice.id}`);
      return;
    }

    // Payment found!
    stats.paymentsFound++;

    logger.info(`[PollingService] Payment found for ${invoiceType} invoice ${invoice.id}`, {
      txHash: payment.txHash,
      amount: payment.amount,
      confirmations: payment.confirmations,
      orderId: invoice.order_id || null,
      subscriptionId: invoice.subscription_id || null,
    });

    // Delegate state transitions to unified payment orchestrator
    if (invoice.order_id) {
      const result = await invoicePaymentService.processOrderPayment({
        orderId: invoice.order_id,
        txHash: payment.txHash,
        paymentLink: null,
        actorUserId: null,
        allowSeller: true,
      });

      if (result.ok && result.state === 'confirmed') {
        stats.paymentsConfirmed++;
      }
    } else if (invoice.subscription_id) {
      const result = await invoicePaymentService.processSubscriptionPayment({
        subscriptionId: invoice.subscription_id,
        txHash: payment.txHash,
        paymentLink: null,
        actorUserId: null,
        invoiceId: invoice.id,
        purpose: invoice.purpose,
        mode: invoice.purpose === 'subscription_upgrade' ? 'upgrade' : null,
      });

      if (result.ok && result.state === 'confirmed') {
        stats.paymentsConfirmed++;
      }
    }
  } catch (error) {
    logger.error(`[PollingService] Failed to process invoice ${invoice.id}:`, {
      error: error.message,
      stack: error.stack,
    });
  }
}

/**
 * Check for ETH payment (ETH or USDT ERC-20)
 * @param {object} invoice - Invoice record
 * @returns {Promise<object|null>} Payment details or null
 */
async function checkEthPayment(invoice) {
  try {
    const currency = invoice.currency.toUpperCase();

    if (currency === 'ETH') {
      // Discover ETH value transfers to this address via Etherscan txlist
      const txs = await etherscanService.getAddressTransactions(invoice.address);
      if (!txs || txs.length === 0) {
        return null;
      }

      const expectedAmountEth = parseFloat(invoice.crypto_amount);
      const matching = txs.find((tx) => {
        if (!tx.to || tx.isError) return false;
        if (tx.to.toLowerCase() !== invoice.address.toLowerCase()) return false;
        const amountEth = Number(tx.value) / 1e18;
        return amountsMatchWithTolerance(amountEth, expectedAmountEth, undefined, 'ETH');
      });

      if (!matching) {
        return null;
      }

      // Verify this transaction for confirmations and status
      const verification = await etherscanService.verifyEthPayment(
        matching.hash,
        invoice.address,
        expectedAmountEth
      );
      if (!verification.verified) {
        return null;
      }

      return {
        txHash: matching.hash,
        amount: verification.amount,
        confirmations: verification.confirmations,
        status: verification.status,
      };
    } else if (currency === 'USDT') {
      // Get USDT ERC-20 transfers to this address
      const transfers = await etherscanService.getTokenTransfers(invoice.address);

      if (transfers.length === 0) {
        return null;
      }

      // Find matching transfer
      const matchingTransfer = transfers.find((tx) => {
        const amount = Number(tx.value) / 1e6; // USDT has 6 decimals
        return amountsMatchWithTolerance(amount, invoice.crypto_amount, undefined, 'USDT');
      });

      if (!matchingTransfer) {
        return null;
      }

      // Verify this specific transaction
      const verification = await etherscanService.verifyUsdtPayment(
        matchingTransfer.hash,
        invoice.address,
        invoice.crypto_amount
      );

      if (!verification.verified) {
        return null;
      }

      return {
        txHash: matchingTransfer.hash,
        amount: verification.amount,
        confirmations: verification.confirmations,
        status: verification.status,
      };
    }

    return null;
  } catch (error) {
    logger.error('[PollingService] ETH payment check failed:', {
      error: error.message,
      invoiceId: invoice.id,
    });
    return null;
  }
}

/**
 * Check for TRON payment (USDT TRC-20)
 * @param {object} invoice - Invoice record
 * @returns {Promise<object|null>} Payment details or null
 */
async function checkTronPayment(invoice) {
  try {
    // Get USDT TRC-20 transfers to this address
    const transfers = await tronService.getTrc20Transfers(invoice.address);

    if (transfers.length === 0) {
      return null;
    }

    // Find matching transfer
    const matchingTransfer = transfers.find((tx) => {
      const amount = parseFloat(tx.value) / Math.pow(10, tx.tokenInfo.decimals);
      return (
        tx.to === invoice.address &&
        amountsMatchWithTolerance(amount, invoice.crypto_amount, undefined, 'USDT_TRC20')
      );
    });

    if (!matchingTransfer) {
      return null;
    }

    // Verify this specific transaction
    const verification = await tronService.verifyPayment(
      matchingTransfer.transactionId,
      invoice.address,
      invoice.crypto_amount
    );

    if (!verification.verified) {
      return null;
    }

    return {
      txHash: matchingTransfer.transactionId,
      amount: verification.amount,
      confirmations: verification.confirmations,
      status: verification.status,
    };
  } catch (error) {
    logger.error('[PollingService] TRON payment check failed:', {
      error: error.message,
      invoiceId: invoice.id,
    });
    return null;
  }
}

/**
 * Check BTC/LTC payment via BlockCypher API
 * @param {Object} invoice - Invoice object
 * @returns {Promise<Object|null>} Payment object or null
 */
async function checkBlockCypherPayment(invoice) {
  try {
    logger.info(`[PollingService] Checking ${invoice.chain} payment for invoice:`, {
      invoiceId: invoice.id,
      address: invoice.address,
      chain: invoice.chain,
    });

    // Get pending transactions for address
    const chain = invoice.chain; // 'BTC' or 'LTC'
    let txHash = invoice.tx_hash; // If user provided tx hash or webhook set it

    // If no tx_hash, try to find transaction by address via BlockCypher
    if (!txHash) {
      logger.debug(`[PollingService] No tx_hash for ${chain} invoice ${invoice.id}, checking address transactions`);
      
      try {
        // Get address info from BlockCypher
        const addressInfo = await blockCypherService.getAddressInfo(chain, invoice.address);
        
        const confirmed = Array.isArray(addressInfo?.txrefs) ? addressInfo.txrefs : [];
        const unconfirmed = Array.isArray(addressInfo?.unconfirmed_txrefs)
          ? addressInfo.unconfirmed_txrefs
          : [];

        const allRefs = [...confirmed, ...unconfirmed];

        if (allRefs.length === 0) {
          logger.debug(
            `[PollingService] No transactions (confirmed or unconfirmed) found for ${chain} address ${invoice.address}`
          );
          return null;
        }

        // Find first transaction that matches expected amount (with tolerance per chain)
        const expectedAmount = parseFloat(invoice.crypto_amount);
        const matchingTx = allRefs.find((tx) => {
          const txAmount = tx.value / 1e8; // Convert satoshis to BTC/LTC
          return amountsMatchWithTolerance(txAmount, expectedAmount, undefined, chain);
        });

        if (!matchingTx) {
          logger.debug(
            `[PollingService] No matching transaction found for amount ${expectedAmount} on ${chain} address`
          );
          return null;
        }
        
        txHash = matchingTx.tx_hash;
        logger.info(`[PollingService] Found tx_hash ${txHash} for ${chain} invoice ${invoice.id}`);
      } catch (error) {
        logger.error(`[PollingService] Error getting address info:`, {
          error: error.message,
          chain,
          address: invoice.address,
        });
        return null;
      }
    }

    // Verify payment using BlockCypher
    const verificationResult = await blockCypherService.verifyPayment(
      chain,
      txHash,
      invoice.address,
      parseFloat(invoice.crypto_amount)
    );

    if (!verificationResult.verified) {
      logger.warn(`[PollingService] ${chain} payment not verified:`, {
        invoiceId: invoice.id,
        txHash,
        error: verificationResult.error,
      });
      return null;
    }

    logger.info(`[PollingService] ${chain} payment verified:`, {
      invoiceId: invoice.id,
      txHash,
      confirmations: verificationResult.confirmations,
      amount: verificationResult.amount,
    });

    // Check confirmations - use threshold from constants
    const minConfirmations = SUPPORTED_CURRENCIES[chain].confirmations;
    const status = verificationResult.confirmations >= minConfirmations ? 'confirmed' : 'pending';

    // Create payment record
    return {
      txHash: txHash,
      amount: verificationResult.amount,
      confirmations: verificationResult.confirmations,
      status: status,
    };
  } catch (error) {
    logger.error(`[PollingService] Error checking ${invoice.chain} payment:`, {
      error: error.message,
      stack: error.stack,
      invoiceId: invoice.id,
    });
    return null;
  }
}

/**
 * Handle expired invoices - mark as expired
 */
async function handleExpiredInvoices() {
  try {
    const expiredInvoices = await invoiceQueries.findExpired();

    if (expiredInvoices.length === 0) {
      return;
    }

    logger.info(`[PollingService] Found ${expiredInvoices.length} expired invoices`);

    for (const invoice of expiredInvoices) {
      await invoiceQueries.updateStatus(invoice.id, 'expired');

      // Update order status to 'cancelled' (only for order invoices)
      if (invoice.order_id) {
        await orderQueries.updateStatus(invoice.order_id, 'cancelled');
      }

      // For subscription invoices, mark subscription as cancelled (constraint doesn't allow 'failed')
      if (invoice.subscription_id) {
        const client = await getClient();
        try {
          await client.query(`UPDATE shop_subscriptions SET status = 'cancelled' WHERE id = $1`, [
            invoice.subscription_id,
          ]);
          logger.info('[PollingService] Subscription cancelled due to expired invoice:', {
            subscriptionId: invoice.subscription_id,
            invoiceId: invoice.id,
          });
        } finally {
          client.release();
        }
      }

      logger.info('[PollingService] Invoice expired:', {
        invoiceId: invoice.id,
        orderId: invoice.order_id || null,
        subscriptionId: invoice.subscription_id || null,
      });
    }
  } catch (error) {
    logger.error('[PollingService] Failed to handle expired invoices:', {
      error: error.message,
    });
  }
}

/**
 * Manually trigger a poll (for testing or admin purposes)
 * @returns {Promise<object>} Poll results
 */
export async function manualPoll() {
  logger.info('[PollingService] Manual poll triggered');

  const before = { ...stats };

  await checkPendingPayments();

  const after = { ...stats };

  return {
    before,
    after,
    processed: after.pollCount - before.pollCount,
    found: after.paymentsFound - before.paymentsFound,
    confirmed: after.paymentsConfirmed - before.paymentsConfirmed,
  };
}

export default {
  startPolling,
  stopPolling,
  getStats,
  resetStats,
  manualPoll,
};
