import { orderQueries } from '../../../database/queries/index.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import logger from '../../../utils/logger.js';
import cryptoPriceService from '../../../services/cryptoPriceService.js';
import telegramService from '../../../services/telegram.js';
import {
  ConflictError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../../../utils/errors.js';
import { validateCurrencyParam, validateTxHash } from '../validators/payloadValidators.js';
import { buildWalletMap, generatePaymentUri } from '../utils/payment.js';
import { MIN_CONFIRMATIONS } from '../constants.js';

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
      expiresIn: 3600,
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

  // validateTxHash now extracts hash from URL if needed and returns the clean hash
  const cleanTxHash = validateTxHash(tx_hash);
  const currencyUpper = validateCurrencyParam(currency);

  const order = await orderQueries.findById(id);
  if (!order) {
    throw new NotFoundError('Order');
  }

  if (order.buyer_id !== userId) {
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
    throw new ValidationError(
      'Payment info not initialized. Call GET /api/orders/:id/payment-info first.',
      { code: 'PAYMENT_NOT_INITIALIZED' }
    );
  }

  const { paymentQueries } = await import('../../../database/queries/index.js');
  const existingPayment = await paymentQueries.findByTxHash(cleanTxHash);
  if (existingPayment && existingPayment.order_id !== parseInt(id)) {
    throw new ConflictError('This transaction hash is already used for another payment');
  }

  const orderData = await orderQueries.getInvoiceData(id);
  const walletMap = buildWalletMap(orderData);
  const recipientAddress = walletMap[currencyUpper];

  let payment;
  if (existingPayment) {
    payment = existingPayment;
  } else {
    payment = await paymentQueries.createForDirectCrypto({
      orderId: parseInt(id),
      txHash: cleanTxHash,
      amount: order.total_price,
      currency: currencyUpper,
      recipientAddress,
      expectedCryptoAmount: order.crypto_amount,
    });
  }

  await orderQueries.updatePaymentHash(id, cleanTxHash);

  logger.info('[Payment] Crypto payment submitted', {
    orderId: id,
    paymentId: payment.id,
    txHash: cleanTxHash,
    currency: currencyUpper,
  });

  // Non-blocking Telegram notifications
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
    // Notify seller
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
  ]).then((results) => {
    results.forEach((result, idx) => {
      if (result.status === 'rejected') {
        logger.error('[Payment] Telegram notification failed', {
          orderId: id,
          target: idx === 0 ? 'buyer' : 'seller',
          error: result.reason?.message || result.reason,
        });
      }
    });
  });

  return res.json({
    success: true,
    data: {
      paymentId: payment.id,
      status: 'pending',
      message: 'Payment submitted. Verification in progress.',
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
