import { paymentQueries, orderQueries, productQueries, shopQueries } from '../database/queries/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { NotFoundError, UnauthorizedError, ValidationError } from '../utils/errors.js';
import invoicePaymentService from '../services/invoicePaymentService.js';
import logger from '../utils/logger.js';
import QRCode from 'qrcode';

/**
 * Payment Controller
 */
export const paymentController = {
  /**
   * Verify crypto payment
   */
  verify: asyncHandler(async (req, res) => {
    const { orderId, txHash, paymentLink, txLink, transactionUrl } = req.body;
    const proofLink = paymentLink || txLink || transactionUrl || null;

    const result = await invoicePaymentService.processOrderPayment({
      orderId,
      txHash,
      paymentLink: proofLink,
      actorUserId: req.user.id,
    });

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        error: result.message,
        code: result.code || 'PAYMENT_FAILED',
        state: result.state,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        state: result.state,
        payment: result.payment || null,
        invoice: result.invoice || null,
        idempotent: result.idempotent || false,
      },
    });
  }),


  /**
   * Get payment by order ID
   */
  getByOrder: asyncHandler(async (req, res) => {
    try {
      const { orderId } = req.params;

      // Get order to check access
      const order = await orderQueries.findById(orderId);

      if (!order) {
        throw new NotFoundError('Order');
      }

      // Check if user has access (buyer or seller)
      const isBuyer = order.buyer_id === req.user.id;

      // Get seller ID through product → shop → owner
      let isSeller = false;
      if (!isBuyer) {
        const product = await productQueries.findById(order.product_id);
        if (product) {
          const shop = await shopQueries.findById(product.shop_id);
          isSeller = shop && shop.owner_id === req.user.id;
        }
      }

      if (!isBuyer && !isSeller) {
        throw new UnauthorizedError('Access denied');
      }

      const payments = await paymentQueries.findByOrderId(orderId);

      return res.status(200).json({
        success: true,
        data: payments,
      });
    } catch (error) {
      logger.error('Get payment error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Check payment status (for polling)
  */
  checkStatus: asyncHandler(async (req, res) => {
    const { txHash, paymentLink, txLink, transactionUrl } = req.query;

    if (!txHash) {
      throw new ValidationError('Transaction hash required');
    }

    const payment = await paymentQueries.findByTxHash(txHash);
    if (!payment) {
      throw new NotFoundError('Payment');
    }

    const order = await orderQueries.findById(payment.order_id);
    if (!order) {
      throw new NotFoundError('Order');
    }

    const product = await productQueries.findById(order.product_id);
    const shop = product ? await shopQueries.findById(product.shop_id) : null;

    const isBuyer = order.buyer_id === req.user.id;
    const isSeller = shop && shop.owner_id === req.user.id;

    if (!isBuyer && !isSeller) {
      throw new UnauthorizedError('Access denied');
    }

    const result = await invoicePaymentService.processOrderPayment({
      orderId: order.id,
      txHash,
      paymentLink: paymentLink || txLink || transactionUrl || null,
      actorUserId: req.user.id,
      allowSeller: true,
    });

    if (!result.ok) {
      return res.status(400).json({
        success: false,
        error: result.message,
        code: result.code || 'PAYMENT_FAILED',
        state: result.state,
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        state: result.state,
        payment: result.payment || payment,
        idempotent: result.idempotent || false,
      },
    });
  }),


  /**
   * Generate QR code for payment
   */
  generateQR: asyncHandler(async (req, res) => {
    try {
      const { address, amount, currency } = req.body;

      // Validate inputs (explicit checks to avoid falsy issues with amount: 0)
      if (!address || amount === undefined || amount === null || !currency) {
        throw new ValidationError('Missing required fields: address, amount, currency');
      }

      // Validate amount is positive number
      const parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        throw new ValidationError('Amount must be a positive number greater than 0');
      }

      // Validate currency
      const supportedCurrencies = ['BTC', 'ETH', 'USDT', 'LTC'];
      if (!supportedCurrencies.includes(currency.toUpperCase())) {
        throw new ValidationError(`Unsupported currency. Supported: ${supportedCurrencies.join(', ')}`);
      }

      // Generate payment URI based on currency standard
      let paymentURI;
      switch (currency.toUpperCase()) {
        case 'BTC':
          // BIP-21: bitcoin:address?amount=X
          paymentURI = `bitcoin:${address}?amount=${amount}`;
          break;
        case 'ETH': {
          // EIP-681: ethereum:address?value=X (value in wei)
          // Convert ETH to wei (string to avoid precision loss)
          const ethFloat = parseFloat(amount);
          const wei = Number.isFinite(ethFloat) ? BigInt(Math.round(ethFloat * 1e18)).toString() : amount;
          paymentURI = `ethereum:${address}?value=${wei}`;
          break;
        }
        case 'USDT':
          // TRC-20 Tron format
          // TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t is USDT contract on Tron
          paymentURI = `tronlink://send?token=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t&to=${address}&amount=${amount}`;
          break;
        case 'LTC':
          // BIP-21: litecoin:address?amount=X
          paymentURI = `litecoin:${address}?amount=${amount}`;
          break;
      }

      logger.info('Generating QR code', {
        currency,
        addressPrefix: address.substring(0, 10),
        amount,
      });

      // Generate QR code as data URL
      const qrDataURL = await QRCode.toDataURL(paymentURI, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 512,
        margin: 2,
      });

      return res.status(200).json({
        success: true,
        data: {
          qrCode: qrDataURL,
          paymentURI,
          address,
          amount,
          currency,
        },
      });
    } catch (error) {
      logger.error('QR generation error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),
};

export default paymentController;
