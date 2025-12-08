import { orderQueries } from '../../../database/queries/index.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';
import cryptoPriceService from '../../../services/cryptoPriceService.js';
import telegramService from '../../../services/telegram.js';
import { verifyPayment, VERIFICATION_STATUS } from '../../../services/blockchainVerificationService.js';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../../utils/errors.js';
import { alertNotificationFailed } from '../../../utils/alerts.js';
import { validateCurrencyParam, validateTxHash } from '../validators/payloadValidators.js';
import { buildWalletMap, generatePaymentUri } from '../utils/payment.js';
import { MIN_CONFIRMATIONS, INVOICE_EXPIRY_SECONDS } from '../constants.js';

/**
 * GET /api/orders/:id/payment-info
 * Returns seller's wallet address and crypto amount for payment
 */
export const getPaymentInfo = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const currencyUpper = validateCurrencyParam(req.query.currency);
  const userId = req.user.id;

  const orderData = await orderQueries.getInvoiceData(id);
  if (!orderData) {
    throw new NotFoundError('Order');
  }

  // DEBUG: Log available wallets from order data
  logger.info('[getPaymentInfo] Order wallets:', {
    orderId: id,
    wallet_btc: !!orderData.wallet_btc,
    wallet_eth: !!orderData.wallet_eth,
    wallet_usdt: !!orderData.wallet_usdt,
    wallet_ltc: !!orderData.wallet_ltc,
  });

  if (orderData.buyer_id !== userId) {
    throw new UnauthorizedError('Only buyer can view payment info');
  }

  if (orderData.status !== 'pending') {
    throw new ValidationError(`Cannot pay for ${orderData.status} order`);
  }

  const walletMap = buildWalletMap(orderData);

  // DEBUG: Log wallet map and requested currency
  logger.info('[getPaymentInfo] Wallet map built:', {
    orderId: id,
    requestedCurrency: currencyUpper,
    availableCurrencies: Object.keys(walletMap).filter(k => walletMap[k]),
    walletMap,
  });

  const walletAddress = walletMap[currencyUpper];
  if (!walletAddress) {
    const available = Object.entries(walletMap)
      .filter(([, v]) => v)
      .map(([k]) => k)
      .join(', ');
    throw new ValidationError(
      `Seller does not accept ${currencyUpper}. Available: ${available || 'none'}`
    );
  }

  // Fetch crypto price with proper error handling
  // ВАЖНО: cryptoPriceService использует USDT_TRC20 как ключ, НЕ конвертируем в USDT
  const priceChain = currencyUpper;

  let cryptoAmount, usdRate;
  try {
    const priceResult = await cryptoPriceService.convertAndRound(
      parseFloat(orderData.total_price),
      priceChain
    );
    cryptoAmount = priceResult.cryptoAmount;
    usdRate = priceResult.usdRate;
  } catch (priceError) {
    logger.error('[getPaymentInfo] Crypto price fetch failed', {
      orderId: id,
      currency: currencyUpper,
      priceChain,
      error: priceError.message,
      stack: priceError.stack,
    });
    // Return user-friendly error with specific code for frontend
    throw new ValidationError(
      `price_service_error: Unable to get ${currencyUpper} exchange rate. Please try again.`
    );
  }

  await orderQueries.setCryptoPayment(id, {
    cryptoAmount,
    cryptoCurrency: currencyUpper,
    paymentAddress: walletAddress,
  });

  const qrUri = generatePaymentUri(currencyUpper, walletAddress, cryptoAmount);

  return res.json({
    success: true,
    data: {
      orderId: parseInt(id),
      currency: currencyUpper,
      address: walletAddress,
      amount: cryptoAmount,
      amountUsd: parseFloat(orderData.total_price),
      usdRate,
      qrUri,
      shopName: orderData.shop_name,
      expiresIn: INVOICE_EXPIRY_SECONDS,
      minConfirmations: MIN_CONFIRMATIONS[currencyUpper],
    },
  });
});

/**
 * POST /api/orders/:id/submit-payment
 * Buyer submits tx_hash after payment
 * Accepts both raw tx hash and explorer URLs (hash will be extracted)
 */
export const submitPayment = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { tx_hash, currency } = req.body;
  const userId = req.user.id;

  logger.info('[submitPayment] START', { orderId: id, userId, tx_hash: tx_hash?.substring(0, 20), currency });

  // validateTxHash now extracts hash from URL if needed and returns the clean hash
  let cleanTxHash, currencyUpper;
  try {
    cleanTxHash = validateTxHash(tx_hash);
    currencyUpper = validateCurrencyParam(currency);
    logger.info('[submitPayment] Validation passed', { cleanTxHash: cleanTxHash?.substring(0, 20), currencyUpper });
  } catch (validationError) {
    logger.error('[submitPayment] Validation failed', { error: validationError.message });
    throw validationError;
  }

  logger.info('[submitPayment] Finding order...', { orderId: id });
  const order = await orderQueries.findById(id);
  if (!order) {
    logger.error('[submitPayment] Order not found', { orderId: id });
    throw new NotFoundError('Order');
  }
  logger.info('[submitPayment] Order found', { orderId: id, status: order.status, buyerId: order.buyer_id, crypto_amount: order.crypto_amount });

  if (order.buyer_id !== userId) {
    logger.error('[submitPayment] Not buyer', { orderId: id, orderBuyerId: order.buyer_id, userId });
    throw new UnauthorizedError('Only buyer can submit payment');
  }

  if (order.status === 'confirmed') {
    return res.json({
      success: true,
      data: { status: 'already_confirmed', orderId: parseInt(id) },
    });
  }
  if (order.status !== 'pending') {
    throw new ValidationError(`Cannot submit payment for ${order.status} order`);
  }

  // P0 SECURITY: Prevent tx_hash submission if crypto_amount is NULL
  // Without this check, parseFloat(NULL) = NaN bypasses amount verification
  if (!order.crypto_amount) {
    logger.error('[submitPayment] crypto_amount is NULL', { orderId: id });
    throw new ValidationError(
      'Payment info not initialized. Call GET /api/orders/:id/payment-info first.',
      { code: 'PAYMENT_NOT_INITIALIZED' }
    );
  }

  // P0 SECURITY: Invoice expiration check - crypto rate may have changed
  // updated_at is set when setCryptoPayment is called in getPaymentInfo
  const invoiceAge = (Date.now() - new Date(order.updated_at).getTime()) / 1000;
  if (invoiceAge > INVOICE_EXPIRY_SECONDS) {
    logger.warn('[submitPayment] Invoice expired', {
      orderId: id,
      invoiceAge: Math.round(invoiceAge),
      maxAge: INVOICE_EXPIRY_SECONDS,
    });
    throw new ValidationError(
      'Invoice expired. Please refresh payment info to get current exchange rate.',
      { code: 'INVOICE_EXPIRED' }
    );
  }

  logger.info('[submitPayment] Importing paymentQueries...');
  const { paymentQueries } = await import('../../../database/queries/index.js');
  logger.info('[submitPayment] Finding existing payment by txHash...');
  const existingPayment = await paymentQueries.findByTxHash(cleanTxHash);
  logger.info('[submitPayment] existingPayment result', { found: !!existingPayment, existingOrderId: existingPayment?.order_id });

  if (existingPayment && existingPayment.order_id !== parseInt(id)) {
    throw new ConflictError('This transaction hash is already used for another payment');
  }

  logger.info('[submitPayment] Getting invoice data...');
  const orderData = await orderQueries.getInvoiceData(id);
  const walletMap = buildWalletMap(orderData);
  const recipientAddress = walletMap[currencyUpper];
  logger.info('[submitPayment] Wallet info', { currencyUpper, recipientAddress: recipientAddress?.substring(0, 10) });

  // ============================================
  // P0 SECURITY: Synchronous blockchain verification
  // Verify transaction BEFORE accepting payment
  // ============================================
  logger.info('[submitPayment] Starting blockchain verification...', {
    txHash: cleanTxHash,
    currency: currencyUpper,
    expectedAddress: recipientAddress,
    expectedAmount: order.crypto_amount,
  });

  const verificationResult = await verifyPayment(
    cleanTxHash,
    currencyUpper,
    recipientAddress,
    parseFloat(order.crypto_amount)
  );

  logger.info('[submitPayment] Verification result', {
    orderId: id,
    txHash: cleanTxHash?.substring(0, 20),
    resultStatus: verificationResult.resultStatus,
    status: verificationResult.status,
    verified: verificationResult.verified,
    confirmations: verificationResult.confirmations,
    amount: verificationResult.amount,
    error: verificationResult.error,
  });

  // Handle verification failures
  if (verificationResult.resultStatus === VERIFICATION_STATUS.TX_NOT_FOUND) {
    throw new ValidationError(
      'Transaction not found on blockchain. Please check the hash and try again.',
      { code: 'TX_NOT_FOUND' }
    );
  }

  if (verificationResult.resultStatus === VERIFICATION_STATUS.TX_INVALID) {
    // Transaction exists but is invalid (wrong address, wrong amount, failed tx)
    throw new ValidationError(
      verificationResult.error || 'Transaction is invalid. It may be sent to wrong address or have incorrect amount.',
      { code: 'TX_INVALID' }
    );
  }

  if (verificationResult.resultStatus === VERIFICATION_STATUS.API_ERROR) {
    // API error - allow retry but warn user
    logger.warn('[submitPayment] Blockchain API error, allowing payment with warning', {
      orderId: id,
      txHash: cleanTxHash,
      error: verificationResult.error,
    });
    // Continue with payment creation but mark for priority verification
  }

  // SUCCESS or API_ERROR (with retry) - transaction is valid, proceed
  logger.info('[submitPayment] Blockchain verification passed', {
    orderId: id,
    txHash: cleanTxHash,
    confirmations: verificationResult.confirmations,
  });

  let payment;
  if (existingPayment) {
    payment = existingPayment;
    logger.info('[submitPayment] Using existing payment', { paymentId: payment.id });
  } else {
    logger.info('[submitPayment] Creating new payment...');
    try {
      payment = await paymentQueries.createForDirectCrypto({
        orderId: parseInt(id),
        txHash: cleanTxHash,
        amount: order.total_price,
        currency: currencyUpper,
        recipientAddress,
        expectedCryptoAmount: order.crypto_amount,
      });

      // P0 SECURITY: Check for race condition - tx_hash was claimed by another order
      // between our findByTxHash check and createForDirectCrypto
      if (payment._conflictDetected) {
        logger.warn('[submitPayment] Race condition: tx_hash conflict detected', {
          orderId: id,
          txHash: cleanTxHash,
          conflictOrderId: payment.order_id,
        });
        throw new ConflictError('This transaction hash is already used for another payment');
      }

      logger.info('[submitPayment] Payment created', { paymentId: payment?.id });
    } catch (createError) {
      logger.error('[submitPayment] Failed to create payment', { error: createError.message, stack: createError.stack });
      throw createError;
    }
  }

  await orderQueries.updatePaymentHash(id, cleanTxHash);

  logger.info('[Payment] Crypto payment submitted (verified)', {
    orderId: id,
    paymentId: payment.id,
    txHash: cleanTxHash,
    currency: currencyUpper,
    confirmations: verificationResult.confirmations,
  });

  // Non-blocking Telegram notifications with tracking and alerting
  // Notifications are best-effort but failures are tracked for debugging
  Promise.allSettled([
    // Notify buyer
    order.buyer_telegram_id && telegramService.notifyPaymentSubmittedBuyer(
      order.buyer_telegram_id,
      {
        shopName: order.shop_name,
        productName: order.product_name,
        amount: order.total_price,
        cryptoAmount: order.crypto_amount,
        currency: currencyUpper,
        txHash: cleanTxHash,
      },
      order.buyer_language || 'ru'
    ),
    // Notify seller - only after blockchain verification confirmed tx exists and is valid
    order.seller_telegram_id && telegramService.notifyPaymentSubmittedSeller(
      order.seller_telegram_id,
      {
        orderId: parseInt(id),
        productName: order.product_name,
        amount: order.total_price,
        cryptoAmount: order.crypto_amount,
        currency: currencyUpper,
        buyerUsername: order.buyer_username,
        txHash: cleanTxHash,
      },
      order.seller_language || 'ru'
    ),
  ]).then(async (results) => {
    const targets = ['buyer', 'seller'];
    const notificationStatus = {
      buyer: results[0]?.status === 'fulfilled' ? 'sent' : 'failed',
      seller: results[1]?.status === 'fulfilled' ? 'sent' : 'failed',
      timestamp: new Date().toISOString(),
    };

    // Log and alert on failures
    const failedTargets = [];
    const errors = [];
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        const target = targets[idx];
        const errorMsg = result.reason?.message || String(result.reason);
        failedTargets.push(target);
        errors.push(`${target}: ${errorMsg}`);
        notificationStatus[`${target}_error`] = errorMsg;

        logger.error('[Payment] Telegram notification failed', {
          orderId: id,
          target,
          error: errorMsg,
        });
      }
    });

    // Alert admin if any notifications failed
    if (failedTargets.length > 0) {
      alertNotificationFailed(id, failedTargets, errors);
    }

    // Track notification status in database for debugging
    try {
      await orderQueries.updateNotificationStatus(id, notificationStatus);
    } catch (dbError) {
      logger.warn('[Payment] Failed to save notification status', {
        orderId: id,
        error: dbError.message,
      });
    }
  });

  return res.json({
    success: true,
    data: {
      paymentId: payment.id,
      status: verificationResult.verified ? 'verified' : 'pending_confirmations',
      confirmations: verificationResult.confirmations,
      required: MIN_CONFIRMATIONS[currencyUpper] || 3,
      message: verificationResult.verified
        ? 'Payment verified and confirmed!'
        : `Payment verified. Waiting for ${MIN_CONFIRMATIONS[currencyUpper] || 3} confirmations.`,
    },
  });
});

/**
 * GET /api/orders/:id/payment-status
 * Returns current verification status
 * OPTIMIZATION: Combined 4 queries into 1 JOIN query
 */
export const getPaymentStatus = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  // OPTIMIZATION: Single query with all JOINs instead of 4 sequential queries
  // orderQueries.findById already returns owner_id from shops JOIN
  const order = await orderQueries.findById(id);
  if (!order) {
    throw new NotFoundError('Order');
  }

  // Check access - findById already has shop.owner_id via JOIN
  const isBuyer = order.buyer_id === userId;
  const isSeller = order.owner_id === userId;

  if (!isBuyer && !isSeller) {
    throw new UnauthorizedError('Access denied');
  }

  if (order.status === 'confirmed') {
    return res.json({
      success: true,
      data: { status: 'confirmed', orderId: parseInt(id) },
    });
  }

  if (!order.payment_hash) {
    return res.json({
      success: true,
      data: { status: 'awaiting_payment', orderId: parseInt(id) },
    });
  }

  const { paymentQueries } = await import('../../../database/queries/index.js');
  const payment = await paymentQueries.findByTxHash(order.payment_hash);

  return res.json({
    success: true,
    data: {
      status: payment?.verification_status || 'pending',
      confirmations: payment?.blockchain_confirmations || 0,
      required: MIN_CONFIRMATIONS[payment?.currency] || 3,
      orderId: parseInt(id),
      error: payment?.verification_error || null,
    },
  });
});
