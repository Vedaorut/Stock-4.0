import { getClient, query } from '../config/database.js';
import {
  orderItemQueries,
  orderQueries,
  paymentQueries,
  productQueries,
  shopQueries,
  subscriptionQueries,
  userQueries,
} from '../database/queries/index.js';
import telegramService from './telegram.js';
import logger from '../utils/logger.js';
import { SUBSCRIPTION_PERIOD_DAYS } from '../config/subscriptionPricing.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import { INVOICE_PURPOSES, INVOICE_STATES } from '../constants/invoice.js';

const ORDER_STATES = {
  PENDING: 'pending',
  CONFIRMED: 'confirmed',
  CANCELLED: 'cancelled',
};

async function ensureInvoiceActive(invoice, client) {
  const now = new Date();
  const expiresAt = new Date(invoice.expires_at);

  if (invoice.status === INVOICE_STATES.PAID) {
    return { active: false, reason: 'already_paid' };
  }

  if (expiresAt < now) {
    await client.query(
      `UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2`,
      [INVOICE_STATES.EXPIRED, invoice.id]
    );

    return { active: false, reason: 'expired' };
  }

  return { active: true };
}

async function guardTxReuse(client, txHash, { orderId = null, subscriptionId = null }) {
  if (!txHash) {
    return null;
  }

  const existing = await client.query('SELECT * FROM payments WHERE tx_hash = $1 FOR UPDATE', [
    txHash,
  ]);

  if (existing.rows.length === 0) {
    return null;
  }

  const payment = existing.rows[0];

  const sameOrder = orderId && payment.order_id === orderId;
  const sameSubscription = subscriptionId && payment.subscription_id === subscriptionId;

  if (!sameOrder && !sameSubscription) {
    throw new ValidationError('This transaction was already used for another payment');
  }

  return payment;
}

async function attachPaymentRecord(client, { invoice, verification, orderId = null, subscriptionId = null }) {
  const payment = await paymentQueries.create(
    {
      orderId,
      subscriptionId,
      txHash: verification.txHash,
      amount: verification.amount,
      currency: invoice.currency,
      status: verification.status,
    },
    client
  );

  if (verification.confirmations !== undefined) {
    await paymentQueries.updateStatus(payment.id, verification.status, verification.confirmations, client);
  }

  return payment;
}

async function markInvoicePaid(client, invoiceId, txHash) {
  await client.query(
    `UPDATE invoices
       SET status = $1,
           tx_hash = COALESCE($3, tx_hash),
           paid_at = NOW(),
           updated_at = NOW()
     WHERE id = $2`,
    [INVOICE_STATES.PAID, invoiceId, txHash]
  );
}

async function validateAndLockOrder(client, orderId, actorUserId, { allowSeller = false } = {}) {
  const orderResult = await client.query(
    `SELECT o.*, s.owner_id
       FROM orders o
       JOIN products p ON o.product_id = p.id
       JOIN shops s ON p.shop_id = s.id
      WHERE o.id = $1
      FOR UPDATE`,
    [orderId]
  );
  if (orderResult.rows.length === 0) {
    throw new NotFoundError('Order');
  }

  const order = orderResult.rows[0];

  if (actorUserId) {
    const isBuyer = order.buyer_id === actorUserId;
    const isSeller = allowSeller && order.owner_id === actorUserId;

    if (!isBuyer && !isSeller) {
      throw new UnauthorizedError('Access denied');
    }
  }

  return order;
}

async function validateAndLockSubscription(client, subscriptionId, actorUserId) {
  // Lock the subscription row first (without join to avoid FOR UPDATE on nullable side)
  const subResult = await client.query(
    `SELECT * FROM shop_subscriptions WHERE id = $1 FOR UPDATE`,
    [subscriptionId]
  );

  if (subResult.rows.length === 0) {
    throw new NotFoundError('Subscription');
  }

  const subscription = subResult.rows[0];

  // Get owner_id separately (no lock needed for this check)
  let owner_id = subscription.user_id;
  if (subscription.shop_id) {
    const shopResult = await client.query(
      `SELECT owner_id FROM shops WHERE id = $1`,
      [subscription.shop_id]
    );
    if (shopResult.rows.length > 0) {
      owner_id = shopResult.rows[0].owner_id;
    }
  }

  subscription.owner_id = owner_id;

  if (actorUserId && subscription.owner_id !== actorUserId) {
    throw new UnauthorizedError('Not authorized to manage this subscription');
  }

  return subscription;
}

async function _finalizeOrderPayment(client, { order, invoice, verification, payment }) {
  // Check invoice expiry just before confirmation
  const now = new Date();
  const expiresAt = new Date(invoice.expires_at);
  if (expiresAt < now) {
    await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [
      ORDER_STATES.CANCELLED,
      order.id,
    ]);
    await client.query('UPDATE invoices SET status = $1, updated_at = NOW() WHERE id = $2', [
      INVOICE_STATES.EXPIRED,
      invoice.id,
    ]);

    return {
      ok: false,
      state: 'expired',
      code: 'INVOICE_EXPIRED',
      message: 'Payment window expired. Please create a new order.',
    };
  }

  // Lock products to avoid overselling
  const orderItems = await orderItemQueries.findByOrderIdWithStock(order.id, client);
  const productIds = orderItems.map((item) => item.product_id).filter(Boolean);

  if (productIds.length > 0) {
    await client.query(
      `SELECT id FROM products WHERE id = ANY($1::int[]) FOR UPDATE`,
      [productIds]
    );
  }

  // Validate stock and product existence
  if (orderItems.length === 0) {
    // Legacy single-item order fallback
    const checkResult = await client.query(
      `SELECT p.stock_quantity, p.is_preorder, p.name as product_name,
              s.id as shop_id, s.name as shop_name
         FROM products p
         LEFT JOIN shops s ON p.shop_id = s.id
        WHERE p.id = $1`,
      [order.product_id]
    );

    if (checkResult.rows.length === 0 || !checkResult.rows[0].shop_id) {
      await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [
        ORDER_STATES.CANCELLED,
        order.id,
      ]);

      return {
        ok: false,
        state: 'cancelled',
        code: 'PRODUCT_UNAVAILABLE',
        message: 'This product is no longer available. Order cancelled.',
      };
    }

    const productInfo = checkResult.rows[0];
    if (!productInfo.is_preorder && productInfo.stock_quantity < order.quantity) {
      await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [
        ORDER_STATES.CANCELLED,
        order.id,
      ]);

      return {
        ok: false,
        state: 'cancelled',
        code: 'STOCK_INSUFFICIENT',
        message: 'Sorry, this product is sold out. Your payment will be refunded.',
      };
    }
  } else {
    for (const item of orderItems) {
      if (!item.product_id || !item.shop_id) {
        await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [
          ORDER_STATES.CANCELLED,
          order.id,
        ]);

        return {
          ok: false,
          state: 'cancelled',
          code: 'PRODUCT_UNAVAILABLE',
          message: 'One or more products are no longer available. Order cancelled.',
        };
      }

      if (!item.is_preorder && item.stock_quantity < item.ordered_quantity) {
        await client.query('UPDATE orders SET status = $1, updated_at = NOW() WHERE id = $2', [
          ORDER_STATES.CANCELLED,
          order.id,
        ]);

        return {
          ok: false,
          state: 'cancelled',
          code: 'STOCK_INSUFFICIENT',
          message: `"${item.product_name}" is sold out. Your payment will be refunded.`,
        };
      }
    }
  }

  // Deduct stock and confirm order
  if (orderItems.length === 0) {
    const preorderCheck = await client.query('SELECT is_preorder FROM products WHERE id = $1', [
      order.product_id,
    ]);
    if (preorderCheck.rows.length > 0 && !preorderCheck.rows[0].is_preorder) {
      await productQueries.updateStock(order.product_id, -order.quantity, client);
    }
  } else {
    for (const item of orderItems) {
      if (!item.is_preorder) {
        await productQueries.updateStock(item.product_id, -item.ordered_quantity, client);
      }
    }
  }

  await client.query('UPDATE orders SET status = $1, updated_at = NOW(), paid_at = NOW() WHERE id = $2', [
    ORDER_STATES.CONFIRMED,
    order.id,
  ]);

  await markInvoicePaid(client, invoice.id, verification.txHash);

  if (payment?.id && payment.status !== 'confirmed') {
    await paymentQueries.updateStatus(payment.id, 'confirmed', verification.confirmations, client);
  }

  return {
    ok: true,
    state: 'confirmed',
  };
}

async function finalizeSubscriptionPayment(client, { subscription, invoice, verification, payment, mode = 'subscription' }) {
  const isUpgrade = mode === 'upgrade';

  if (isUpgrade && subscription.tier === 'pro') {
    await markInvoicePaid(client, invoice.id, verification.txHash);
    if (payment?.id && payment.status !== 'confirmed') {
      await paymentQueries.updateStatus(payment.id, 'confirmed', verification.confirmations, client);
    }
    return { ok: true, state: 'confirmed', idempotent: true };
  }

  // Skip if already processed for regular subscription payments
  if (!isUpgrade && ['active', 'paid'].includes(subscription.status)) {
    await markInvoicePaid(client, invoice.id, verification.txHash);
    return { ok: true, state: 'confirmed', idempotent: true };
  }

  // NEW PAYMENT = NEW PERIOD (always start from NOW for subscription payments)
  const periodStart = new Date();
  const periodEnd = new Date(
    periodStart.getTime() + SUBSCRIPTION_PERIOD_DAYS * 24 * 60 * 60 * 1000
  );

  if (isUpgrade) {
    if (!subscription.shop_id) {
      return {
        ok: false,
        state: 'failed',
        code: 'SHOP_NOT_FOUND',
        message: 'Cannot upgrade subscription without an attached shop',
      };
    }

    await client.query(
      `UPDATE shops
          SET tier = 'pro',
              subscription_status = 'active',
              next_payment_due = $1,
              grace_period_until = NULL,
              registration_paid = true,
              is_active = true,
              updated_at = NOW()
        WHERE id = $2`,
      [periodEnd, subscription.shop_id]
    );

    await client.query(
      `UPDATE shop_subscriptions
          SET status = 'active',
              tier = 'pro',
              verified_at = NOW(),
              period_start = $1,
              period_end = $2,
              tx_hash = COALESCE($4, tx_hash),
              currency = $5,
              amount = COALESCE($6, amount)
        WHERE id = $3`,
      [
        periodStart,
        periodEnd,
        subscription.id,
        verification.txHash,
        invoice.currency,
        invoice.expected_amount,
      ]
    );

    await markInvoicePaid(client, invoice.id, verification.txHash);

    if (payment?.id && payment.status !== 'confirmed') {
      await paymentQueries.updateStatus(payment.id, 'confirmed', verification.confirmations, client);
    }

    return { ok: true, state: 'confirmed' };
  }

  // If shop exists, activate it; else auto-create
  if (subscription.shop_id) {
    await client.query(
      `UPDATE shops
          SET tier = $1,
              subscription_status = 'active',
              next_payment_due = $2,
              grace_period_until = NULL,
              registration_paid = true,
              is_active = true,
              updated_at = NOW()
        WHERE id = $3`,
      [subscription.tier, periodEnd, subscription.shop_id]
    );

    await client.query(
      `UPDATE shop_subscriptions
          SET status = 'active',
              verified_at = NOW(),
              period_start = $1,
              period_end = $2,
              tx_hash = COALESCE($4, tx_hash),
              currency = $5,
              amount = COALESCE($6, amount)
        WHERE id = $3`,
      [
        periodStart,
        periodEnd,
        subscription.id,
        verification.txHash,
        invoice.currency,
        invoice.expected_amount,
      ]
    );
  } else {
    // Auto-create shop to avoid money loss
    const userResult = await client.query('SELECT telegram_id, username FROM users WHERE id = $1', [
      subscription.user_id,
    ]);
    const user = userResult.rows[0];
    if (!user) {
      return {
        ok: false,
        state: 'failed',
        code: 'USER_NOT_FOUND',
        message: 'User not found for subscription',
      };
    }

    // RACE CONDITION FIX: Check if user already has an active shop
    const existingShopResult = await client.query(
      `SELECT id, name FROM shops WHERE owner_id = $1 AND is_active = true LIMIT 1`,
      [subscription.user_id]
    );

    let newShop;
    if (existingShopResult.rows.length > 0) {
      // Use existing shop instead of creating duplicate
      newShop = existingShopResult.rows[0];
      logger.info(`[SubscriptionPayment] Using existing shop: ${newShop.id} for user ${subscription.user_id}`);
    } else {
      // Create new shop only if none exists
      const shopName = `Shop_${user.username || user.telegram_id}_${Date.now()}`;
      const shopResult = await client.query(
        `INSERT INTO shops (name, owner_id, tier, subscription_status, registration_paid, is_active)
           VALUES ($1, $2, $3, 'active', true, true)
           RETURNING id, name`,
        [shopName, subscription.user_id, subscription.tier]
      );
      newShop = shopResult.rows[0];
      logger.info(`[SubscriptionPayment] Created new shop: ${newShop.id} for user ${subscription.user_id}`);
    }

    await client.query(
      `UPDATE shop_subscriptions
          SET shop_id = $1,
              status = 'active',
              period_start = $2,
              period_end = $3,
              tx_hash = COALESCE($5, tx_hash),
              currency = $6,
              amount = COALESCE($7, amount)
        WHERE id = $4`,
      [
        newShop.id,
        periodStart,
        periodEnd,
        subscription.id,
        verification.txHash,
        invoice.currency,
        invoice.expected_amount,
      ]
    );

    await client.query(
      `UPDATE shops SET next_payment_due = $1, updated_at = NOW() WHERE id = $2`,
      [periodEnd, newShop.id]
    );
  }

  await markInvoicePaid(client, invoice.id, verification.txHash);

  if (payment?.id && payment.status !== 'confirmed') {
    await paymentQueries.updateStatus(payment.id, 'confirmed', verification.confirmations, client);
  }

  return { ok: true, state: 'confirmed' };
}

async function notifyOrderConfirmed(orderId) {
  // Fetch fresh order/product/shop data outside the transaction for notifications
  const order = await orderQueries.findById(orderId);
  if (!order) {
    return;
  }

  const product = await productQueries.findById(order.product_id);
  const shop = product ? await shopQueries.findById(product.shop_id) : null;
  const buyer = await userQueries.findById(order.buyer_id);
  const seller = shop ? await userQueries.findById(shop.owner_id) : null;

  // Notify seller
  if (seller?.telegram_id && product && shop) {
    try {
      await telegramService.notifyPaymentConfirmedSeller(seller.telegram_id, {
        orderId: order.id,
        productName: product.name,
        quantity: order.quantity,
        totalPrice: order.total_price,
        currency: order.currency,
        buyerUsername: buyer?.username || 'Anonymous',
        buyerTelegramId: buyer?.telegram_id,
      });
    } catch (error) {
      logger.error('[InvoicePayment] Seller notification error', { error: error.message });
    }
  }

  // Notify buyer
  if (order.buyer_telegram_id && product && shop && seller) {
    try {
      await telegramService.notifyPaymentConfirmed(order.buyer_telegram_id, {
        id: order.id,
        product_name: product.name,
        quantity: order.quantity,
        total_price: order.total_price,
        currency: order.currency,
        seller_username: seller.username,
        shop_name: shop.name,
      });
    } catch (error) {
      logger.error('[InvoicePayment] Buyer notification error', { error: error.message });
    }
  }
}

async function notifySubscriptionActivated(subscriptionId) {
  try {
    const subscription = await subscriptionQueries.findShopSubscriptionById(subscriptionId);
    if (!subscription || !subscription.shop_id) {
      return;
    }

    const shop = await shopQueries.findById(subscription.shop_id);
    const owner = shop ? await userQueries.findById(shop.owner_id) : null;

    if (owner?.telegram_id && shop && global.botInstance) {
      const tierEmoji = subscription.tier === 'pro' ? '⭐' : '✨';
      const tierLabel = (subscription.tier || 'basic').toUpperCase();
      const nextDue = subscription.period_end
        ? new Date(subscription.period_end).toLocaleDateString('ru-RU', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : null;

      const message = `${tierEmoji} <b>Магазин активирован</b>

<b>${shop.name}</b>
Тариф: ${tierLabel}${nextDue ? `\nДействует до: ${nextDue}` : ''}`;

      try {
        await global.botInstance.telegram.sendMessage(owner.telegram_id, message.trim(), {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[{ text: '📋 Перейти в меню', callback_data: 'back_to_main' }]],
          },
        });
      } catch (err) {
        logger.error('[InvoicePayment] Failed to notify subscription owner', {
          error: err.message,
          subscriptionId,
        });
      }
    }
  } catch (error) {
    logger.error('[InvoicePayment] Subscription notification error', { error: error.message });
  }
}

/**
 * Process crypto payment for an order using invoice as single source of truth.
 */
export async function processOrderPayment({ orderId, txHash, paymentLink: _paymentLink, actorUserId, allowSeller = false }) {
  const client = await getClient();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');

    const order = await validateAndLockOrder(client, orderId, actorUserId, { allowSeller });

    if (order.status === ORDER_STATES.CONFIRMED) {
      await client.query('COMMIT');
      return {
        ok: true,
        state: 'confirmed',
        idempotent: true,
        message: 'Order already confirmed',
      };
    }

    const invoiceResult = await client.query(
      `SELECT * FROM invoices WHERE order_id = $1 ORDER BY created_at DESC LIMIT 1 FOR UPDATE`,
      [orderId]
    );

    if (invoiceResult.rows.length === 0) {
      throw new ValidationError('No invoice found for this order. Generate a new invoice.');
    }

    const invoice = invoiceResult.rows[0];
    // Lock using advisory lock
    await client.query('SELECT pg_advisory_xact_lock($1)', [invoice.id]);

    const activity = await ensureInvoiceActive(invoice, client);
    if (!activity.active) {
      if (activity.reason === 'already_paid') {
        await client.query('COMMIT');
        return { ok: true, state: 'confirmed', idempotent: true, message: 'Invoice already paid' };
      }

      await client.query('COMMIT');
      return {
        ok: false,
        state: 'expired',
        code: 'INVOICE_EXPIRED',
        message: 'Payment window expired. Please create a new order.',
      };
    }

    const guardedPayment = txHash
      ? await guardTxReuse(client, txHash, { orderId })
      : null;

    if (guardedPayment && guardedPayment.status === 'confirmed') {
      await markInvoicePaid(client, invoice.id, guardedPayment.tx_hash);
      await client.query('COMMIT');
      await notifyOrderConfirmed(order.id);
      return { ok: true, state: 'confirmed', idempotent: true };
    }

    // CrystalPay not supported for orders anymore - use direct blockchain payments
    logger.error(`[InvoicePayment] Order ${orderId} - CrystalPay invoice processing removed`);
    await client.query('COMMIT');
    return {
      ok: false,
      state: 'failed',
      code: 'UNSUPPORTED_PAYMENT_METHOD',
      message: 'CrystalPay payment gateway not supported for orders. Use direct blockchain payments.',
    };
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('[InvoicePayment] Rollback error', { error: rollbackError.message });
    }
    logger.error('[InvoicePayment] Order payment processing failed', {
      orderId,
      error: error.message,
    });
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Process crypto payment for a shop subscription using invoice as single source of truth.
 */
export async function processSubscriptionPayment({
  subscriptionId,
  txHash,
  paymentLink: _paymentLink,
  actorUserId,
  mode = null,
  invoiceId = null,
  purpose = null,
}) {
  // =========================================================================
  // PHASE 1: VERIFICATION (Outside transaction, no locks)
  // =========================================================================

  // 1.1. Find relevant Invoice using pool (query) for fast lookup
  let invoiceFilter = 'subscription_id = $1';
  const invoiceParams = [subscriptionId];

  if (invoiceId) {
    invoiceFilter += ` AND id = $${invoiceParams.length + 1}`;
    invoiceParams.push(invoiceId);
  } else if (purpose) {
    invoiceFilter += ` AND purpose = $${invoiceParams.length + 1}`;
    invoiceParams.push(purpose);
  }

  // ⚠️ Using query() from pool (NOT client.query in transaction)
  const invoiceResult = await query(
    `SELECT * FROM invoices WHERE ${invoiceFilter} ORDER BY created_at DESC LIMIT 1`,
    invoiceParams
  );

  if (invoiceResult.rows.length === 0) {
    throw new ValidationError('Invoice not found');
  }

  const invoice = invoiceResult.rows[0];
  const invoicePurpose = invoice.purpose || INVOICE_PURPOSES.SUBSCRIPTION;
  const effectiveMode = mode || (invoicePurpose === INVOICE_PURPOSES.UPGRADE ? 'upgrade' : 'subscription');

  if (mode && mode === 'upgrade' && invoicePurpose !== INVOICE_PURPOSES.UPGRADE) {
    throw new ValidationError('Upgrade payment requested but invoice purpose mismatches');
  }

  // 1.2. Preliminary status check (Optimistic exit)
  if (invoice.status !== INVOICE_STATES.PENDING) {
    return { ok: true, state: 'already_processed', message: `Invoice status is ${invoice.status}` };
  }

  // Preliminary expiration check
  if (new Date(invoice.expires_at) < new Date()) {
    return { ok: false, state: 'expired', code: 'INVOICE_EXPIRED', message: 'Invoice expired' };
  }

  // 1.3. Skip verification for CrystalPay (external payment gateway handles verification)
  const isCrystalPay = invoice.chain === 'CRYSTALPAY';
  const verifiedTxHash = txHash;
  let verification;

  if (isCrystalPay) {
    // CrystalPay webhook already verified payment - trust the gateway
    logger.info(`[InvoicePayment] CrystalPay invoice ${invoice.id} - skipping blockchain verification (gateway verified)`);

    // Create verification object for CrystalPay (gateway already verified)
    verification = {
      verified: true,
      txHash: verifiedTxHash || txHash,
      amount: parseFloat(invoice.crypto_amount) || parseFloat(invoice.expected_amount),
      currency: invoice.currency || invoice.chain,
      status: 'confirmed',
      confirmations: 0
    };
  } else {
    // HD wallet blockchain verification removed - only CrystalPay payments supported
    logger.error(`[InvoicePayment] Non-CrystalPay invoice ${invoice.id} - blockchain verification not available`);
    return {
      ok: false,
      state: 'failed',
      code: 'UNSUPPORTED_CHAIN',
      message: 'Direct blockchain payments not supported. Use CrystalPay.'
    };
  }

  // =========================================================================
  // PHASE 2: FINALIZATION (Atomic transaction with locks)
  // =========================================================================

  logger.info(`[InvoicePayment] Phase 2: Starting transaction for invoice ${invoice.id}...`);
  const client = await getClient();
  try {
    // ⚠️ Using READ COMMITTED (default). SERIALIZABLE was overkill.
    await client.query('BEGIN');

    // 2.1. Set short lock_timeout ("Fail Fast")
    // If we can't get lock within 5 seconds, better to quickly return error
    await client.query("SET LOCAL lock_timeout = '5s'");

    // 2.2. Lock and get subscription (FOR UPDATE)
    // This operation should now execute instantly
    const subscription = await validateAndLockSubscription(
      client,
      subscriptionId,
      actorUserId
    );

    // 2.3. CRITICAL: Lock and re-check Invoice status
    // While we were verifying blockchain (Phase 1), another process may have processed this invoice
    const currentInvoiceResult = await client.query(
      'SELECT * FROM invoices WHERE id = $1 FOR UPDATE',
      [invoice.id]
    );
    const currentInvoice = currentInvoiceResult.rows[0];

    // Check activity and handle expiration atomically
    const activity = await ensureInvoiceActive(currentInvoice, client);

    if (!activity.active) {
      // If invoice already paid - rollback and return success (idempotency)
      // If expired - commit the EXPIRED status update and return error
      if (activity.reason === 'already_paid') {
        await client.query('ROLLBACK');
        return { ok: true, state: 'already_processed', idempotent: true, message: 'Invoice processed concurrently' };
      } else {
        await client.query('COMMIT');
        return { ok: false, state: 'expired', code: 'INVOICE_EXPIRED', message: 'Invoice expired during processing' };
      }
    }

    // 2.4. Check TX Hash reuse (must be inside transaction)
    const guardedPayment = await guardTxReuse(client, verifiedTxHash, { subscriptionId });

    if (guardedPayment && guardedPayment.status === 'confirmed') {
      // Processed by another process with same txHash
      await markInvoicePaid(client, invoice.id, guardedPayment.tx_hash);
      await client.query('COMMIT');
      return { ok: true, state: 'confirmed', idempotent: true };
    }

    // 2.5. Create payment record
    const payment = await attachPaymentRecord(client, {
      invoice,
      verification: { ...verification, txHash: verifiedTxHash },
      subscriptionId,
      orderId: null
    });

    // 2.6. Check confirmations
    if (verification.status !== 'confirmed') {
      await client.query(
        `UPDATE invoices SET tx_hash = COALESCE($2, tx_hash), updated_at = NOW() WHERE id = $1`,
        [invoice.id, verifiedTxHash]
      );
      await client.query('COMMIT');
      return { ok: true, state: 'pending', payment, message: 'Payment received, waiting for confirmations' };
    }

    // 2.7. ⚠️ FINALIZE - Activate subscription, create shop
    const finalizeResult = await finalizeSubscriptionPayment(client, {
      subscription,
      invoice: { ...currentInvoice, tx_hash: verifiedTxHash },
      verification: { ...verification, txHash: verifiedTxHash },
      payment,
      mode: effectiveMode
    });

    await client.query('COMMIT');
    logger.info(`[InvoicePayment] Phase 2: Transaction committed successfully for invoice ${invoice.id}.`);

    if (finalizeResult.ok && finalizeResult.state === 'confirmed') {
      await notifySubscriptionActivated(subscriptionId);
    }

    return finalizeResult;

  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch (rollbackError) {
      logger.error('[InvoicePayment] Rollback error:', rollbackError);
    }

    // Handle lock_timeout error (PostgreSQL code 55P03)
    if (error.code === '55P03') {
      logger.warn(`[InvoicePayment] Lock contention for subscription ${subscriptionId}. Failed to acquire lock within 5s.`);
      throw new ValidationError('System is busy (Lock Timeout), please try again shortly.');
    }

    logger.error('[InvoicePayment] Subscription payment failed:', {
      subscriptionId,
      error: error.message,
      stack: error.stack
    });

    throw error;
  } finally {
    client.release();
  }
}

export default {
  processOrderPayment,
  processSubscriptionPayment,
};
