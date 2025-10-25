import { paymentQueries, invoiceQueries, orderQueries } from '../models/db.js';
import * as etherscanService from './etherscanService.js';
import * as tronService from './tronService.js';
import telegramService from './telegram.js';
import logger from '../utils/logger.js';

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

// Configuration
const POLLING_INTERVAL_MS = 60000; // 60 seconds
const BATCH_SIZE = 10; // Process 10 invoices at a time
const INVOICE_EXPIRY_HOURS = 24;

// Statistics
let stats = {
  pollCount: 0,
  paymentsFound: 0,
  paymentsConfirmed: 0,
  errors: 0,
  lastPollTime: null
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

  // Run immediately on start
  checkPendingPayments().catch(error => {
    logger.error('[PollingService] Initial poll failed:', {
      error: error.message
    });
  });

  // Then run every 60 seconds
  pollingInterval = setInterval(async () => {
    if (isPolling) {
      await checkPendingPayments();
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
    isRunning: isPolling
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
    lastPollTime: null
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
      pollCount: stats.pollCount
    });

    // Get all pending invoices for ETH and TRON chains
    const pendingInvoices = await getPendingInvoices();

    if (pendingInvoices.length === 0) {
      logger.debug('[PollingService] No pending invoices found');
      return;
    }

    logger.info(`[PollingService] Found ${pendingInvoices.length} pending invoices`);

    // Process invoices in batches
    for (let i = 0; i < pendingInvoices.length; i += BATCH_SIZE) {
      const batch = pendingInvoices.slice(i, i + BATCH_SIZE);

      await Promise.all(
        batch.map(invoice => processInvoice(invoice))
      );
    }

    // Handle expired invoices
    await handleExpiredInvoices();

    logger.info('[PollingService] Poll completed', {
      processed: pendingInvoices.length,
      paymentsFound: stats.paymentsFound,
      paymentsConfirmed: stats.paymentsConfirmed
    });
  } catch (error) {
    stats.errors++;
    logger.error('[PollingService] Poll failed:', {
      error: error.message,
      stack: error.stack
    });
  }
}

/**
 * Get pending invoices for ETH and TRON chains
 * @returns {Promise<Array>} Pending invoices
 */
async function getPendingInvoices() {
  try {
    // Query invoices table for pending ETH/TRON invoices
    const result = await invoiceQueries.findPendingByChains(['ETH', 'TRON']);
    return result || [];
  } catch (error) {
    logger.error('[PollingService] Failed to get pending invoices:', {
      error: error.message
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
    logger.debug(`[PollingService] Processing invoice ${invoice.id}`, {
      chain: invoice.chain,
      address: invoice.address,
      expectedAmount: invoice.expected_amount
    });

    let payment;

    // Check based on chain
    if (invoice.chain === 'ETH') {
      payment = await checkEthPayment(invoice);
    } else if (invoice.chain === 'TRON') {
      payment = await checkTronPayment(invoice);
    } else {
      logger.warn(`[PollingService] Unsupported chain: ${invoice.chain}`);
      return;
    }

    if (!payment) {
      logger.debug(`[PollingService] No payment found for invoice ${invoice.id}`);
      return;
    }

    // Payment found!
    stats.paymentsFound++;

    logger.info(`[PollingService] Payment found for invoice ${invoice.id}`, {
      txHash: payment.txHash,
      amount: payment.amount,
      confirmations: payment.confirmations
    });

    // Check if payment already exists in database
    const existingPayment = await paymentQueries.findByTxHash(payment.txHash);

    if (existingPayment) {
      // Update existing payment
      await paymentQueries.updateStatus(
        existingPayment.id,
        payment.status,
        payment.confirmations
      );

      // If newly confirmed, handle order
      if (payment.status === 'confirmed' && existingPayment.status !== 'confirmed') {
        stats.paymentsConfirmed++;
        await handleConfirmedPayment(invoice, existingPayment);
      }
    } else {
      // Create new payment record
      const newPayment = await paymentQueries.create({
        orderId: invoice.order_id,
        txHash: payment.txHash,
        amount: payment.amount,
        currency: invoice.currency,
        status: payment.status
      });

      // Update confirmations if available
      if (payment.confirmations !== undefined) {
        await paymentQueries.updateStatus(
          newPayment.id,
          payment.status,
          payment.confirmations
        );
      }

      // Update invoice status
      await invoiceQueries.updateStatus(invoice.id, 'paid');

      // If confirmed, handle order
      if (payment.status === 'confirmed') {
        stats.paymentsConfirmed++;
        await handleConfirmedPayment(invoice, newPayment);
      }
    }
  } catch (error) {
    logger.error(`[PollingService] Failed to process invoice ${invoice.id}:`, {
      error: error.message,
      stack: error.stack
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
      // Get recent transactions to this address
      // Note: Etherscan doesn't have a direct "get txs to address" endpoint
      // We need to get token transfers or check specific tx hash
      // For now, we'll skip automatic discovery and rely on user submitting tx hash

      // Alternative: query getTransaction for known hashes
      // This is a limitation - ETH polling requires tx hash submission
      logger.debug('[PollingService] ETH requires tx hash submission (no auto-discovery)');
      return null;
    } else if (currency === 'USDT') {
      // Get USDT ERC-20 transfers to this address
      const transfers = await etherscanService.getTokenTransfers(invoice.address);

      if (transfers.length === 0) {
        return null;
      }

      // Find matching transfer
      const matchingTransfer = transfers.find(tx => {
        const amount = parseInt(tx.value) / 1e6; // USDT has 6 decimals
        const tolerance = invoice.expected_amount * 0.01;
        return Math.abs(amount - invoice.expected_amount) <= tolerance;
      });

      if (!matchingTransfer) {
        return null;
      }

      // Verify this specific transaction
      const verification = await etherscanService.verifyUsdtPayment(
        matchingTransfer.hash,
        invoice.address,
        invoice.expected_amount
      );

      if (!verification.verified) {
        return null;
      }

      return {
        txHash: matchingTransfer.hash,
        amount: verification.amount,
        confirmations: verification.confirmations,
        status: verification.status
      };
    }

    return null;
  } catch (error) {
    logger.error('[PollingService] ETH payment check failed:', {
      error: error.message,
      invoiceId: invoice.id
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
    const matchingTransfer = transfers.find(tx => {
      const amount = parseFloat(tx.value) / Math.pow(10, tx.tokenInfo.decimals);
      const tolerance = invoice.expected_amount * 0.01;
      return (
        tx.to === invoice.address &&
        Math.abs(amount - invoice.expected_amount) <= tolerance
      );
    });

    if (!matchingTransfer) {
      return null;
    }

    // Verify this specific transaction
    const verification = await tronService.verifyPayment(
      matchingTransfer.transactionId,
      invoice.address,
      invoice.expected_amount
    );

    if (!verification.verified) {
      return null;
    }

    return {
      txHash: matchingTransfer.transactionId,
      amount: verification.amount,
      confirmations: verification.confirmations,
      status: verification.status
    };
  } catch (error) {
    logger.error('[PollingService] TRON payment check failed:', {
      error: error.message,
      invoiceId: invoice.id
    });
    return null;
  }
}

/**
 * Handle confirmed payment - update order and notify user
 * @param {object} invoice - Invoice record
 * @param {object} payment - Payment record
 */
async function handleConfirmedPayment(invoice, payment) {
  try {
    logger.info(`[PollingService] Handling confirmed payment for order ${invoice.order_id}`);

    // Update order status to confirmed
    await orderQueries.updateStatus(invoice.order_id, 'confirmed');

    // Get order details for notification
    const order = await orderQueries.findById(invoice.order_id);

    if (!order) {
      logger.error('[PollingService] Order not found:', {
        orderId: invoice.order_id
      });
      return;
    }

    // Notify user via Telegram
    try {
      await telegramService.notifyPaymentConfirmed(order.buyer_telegram_id, {
        id: order.id,
        product_name: order.product_name,
        total_price: order.total_price,
        currency: order.currency
      });

      logger.info('[PollingService] User notified successfully', {
        orderId: order.id,
        telegramId: order.buyer_telegram_id
      });
    } catch (notifError) {
      logger.error('[PollingService] Failed to notify user:', {
        error: notifError.message,
        orderId: order.id
      });
      // Don't throw - notification failure shouldn't fail the whole process
    }
  } catch (error) {
    logger.error('[PollingService] Failed to handle confirmed payment:', {
      error: error.message,
      invoiceId: invoice.id,
      orderId: invoice.order_id
    });
    throw error;
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

      // Optionally: update order status to 'cancelled'
      await orderQueries.updateStatus(invoice.order_id, 'cancelled');

      logger.info('[PollingService] Invoice expired:', {
        invoiceId: invoice.id,
        orderId: invoice.order_id
      });
    }
  } catch (error) {
    logger.error('[PollingService] Failed to handle expired invoices:', {
      error: error.message
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
    confirmed: after.paymentsConfirmed - before.paymentsConfirmed
  };
}

export default {
  startPolling,
  stopPolling,
  getStats,
  resetStats,
  manualPoll
};
