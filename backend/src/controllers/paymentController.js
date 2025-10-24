import { paymentQueries, orderQueries } from '../models/db.js';
import cryptoService from '../services/crypto.js';
import telegramService from '../services/telegram.js';
import logger from '../utils/logger.js';
import QRCode from 'qrcode';

/**
 * Payment Controller
 */
export const paymentController = {
  /**
   * Verify crypto payment
   */
  verify: async (req, res) => {
    try {
      const { orderId, txHash, currency } = req.body;

      // Get order
      const order = await orderQueries.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Check if order belongs to user
      if (order.buyer_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // Check if order already has a verified payment
      const existingPayments = await paymentQueries.findByOrderId(orderId);
      const verifiedPayment = existingPayments.find(p => p.status === 'confirmed');

      if (verifiedPayment) {
        return res.status(400).json({
          success: false,
          error: 'Order already paid'
        });
      }

      // Check if this transaction was already submitted
      const existingTx = await paymentQueries.findByTxHash(txHash);

      if (existingTx) {
        return res.status(400).json({
          success: false,
          error: 'Transaction already submitted',
          payment: existingTx
        });
      }

      // Check if payment address is set (CRITICAL: prevents NULL address verification failures)
      if (!order.payment_address) {
        return res.status(400).json({
          success: false,
          error: 'payment_address is required for payment verification'
        });
      }

      // Verify payment with blockchain
      const verification = await cryptoService.verifyTransaction(
        txHash,
        order.payment_address,
        order.total_price,
        currency
      );

      if (!verification.verified) {
        // Create failed payment record
        await paymentQueries.create({
          orderId,
          txHash,
          amount: order.total_price,
          currency,
          status: 'failed'
        });

        return res.status(400).json({
          success: false,
          error: verification.error || 'Payment verification failed'
        });
      }

      // Create payment record
      const payment = await paymentQueries.create({
        orderId,
        txHash,
        amount: verification.amount,
        currency,
        status: verification.status
      });

      // Update payment with confirmations
      if (verification.confirmations) {
        await paymentQueries.updateStatus(
          payment.id,
          verification.status,
          verification.confirmations
        );
      }

      // If payment is confirmed, update order status
      if (verification.status === 'confirmed') {
        await orderQueries.updateStatus(orderId, 'confirmed');

        // Notify buyer
        try {
          await telegramService.notifyPaymentConfirmed(order.buyer_telegram_id, {
            id: order.id,
            product_name: order.product_name,
            total_price: order.total_price,
            currency: order.currency
          });
        } catch (notifError) {
          logger.error('Notification error', { error: notifError.message, stack: notifError.stack });
        }
      }

      return res.status(200).json({
        success: true,
        data: {
          payment,
          verification: {
            verified: verification.verified,
            confirmations: verification.confirmations,
            status: verification.status
          }
        }
      });

    } catch (error) {
      logger.error('Verify payment error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to verify payment'
      });
    }
  },

  /**
   * Get payment by order ID
   */
  getByOrder: async (req, res) => {
    try {
      const { orderId } = req.params;

      // Get order to check access
      const order = await orderQueries.findById(orderId);

      if (!order) {
        return res.status(404).json({
          success: false,
          error: 'Order not found'
        });
      }

      // Check if user has access
      if (order.buyer_id !== req.user.id && order.seller_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      const payments = await paymentQueries.findByOrderId(orderId);

      return res.status(200).json({
        success: true,
        data: payments
      });

    } catch (error) {
      logger.error('Get payment error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to get payment'
      });
    }
  },

  /**
   * Check payment status (for polling)
   */
  checkStatus: async (req, res) => {
    try {
      const { txHash } = req.query;

      if (!txHash) {
        return res.status(400).json({
          success: false,
          error: 'Transaction hash required'
        });
      }

      const payment = await paymentQueries.findByTxHash(txHash);

      if (!payment) {
        return res.status(404).json({
          success: false,
          error: 'Payment not found'
        });
      }

      // Get order to check access
      const order = await orderQueries.findById(payment.order_id);

      if (order.buyer_id !== req.user.id && order.seller_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'Access denied'
        });
      }

      // If payment is still pending, check blockchain again
      if (payment.status === 'pending') {
        const verification = await cryptoService.verifyTransaction(
          payment.tx_hash,
          order.payment_address,
          order.total_price,
          payment.currency
        );

        if (verification.verified && verification.status === 'confirmed') {
          await paymentQueries.updateStatus(
            payment.id,
            'confirmed',
            verification.confirmations
          );

          await orderQueries.updateStatus(order.id, 'confirmed');

          payment.status = 'confirmed';
          payment.confirmations = verification.confirmations;
        }
      }

      return res.status(200).json({
        success: true,
        data: payment
      });

    } catch (error) {
      logger.error('Check payment status error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to check payment status'
      });
    }
  },

  /**
   * Generate QR code for payment
   */
  generateQR: async (req, res) => {
    try {
      const { address, amount, currency } = req.body;

      // Validate inputs
      if (!address || !amount || !currency) {
        return res.status(400).json({
          success: false,
          error: 'Missing required fields: address, amount, currency'
        });
      }

      // Validate currency
      const supportedCurrencies = ['BTC', 'ETH', 'USDT', 'TON'];
      if (!supportedCurrencies.includes(currency.toUpperCase())) {
        return res.status(400).json({
          success: false,
          error: `Unsupported currency. Supported: ${supportedCurrencies.join(', ')}`
        });
      }

      // Generate payment URI based on currency standard
      let paymentURI;
      switch (currency.toUpperCase()) {
        case 'BTC':
          // BIP-21: bitcoin:address?amount=X
          paymentURI = `bitcoin:${address}?amount=${amount}`;
          break;
        case 'ETH':
          // EIP-681: ethereum:address?value=X (value in wei)
          paymentURI = `ethereum:${address}?value=${amount}`;
          break;
        case 'USDT':
          // TRC-20 Tron format
          // TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t is USDT contract on Tron
          paymentURI = `tronlink://send?token=TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t&to=${address}&amount=${amount}`;
          break;
        case 'TON':
          // TON transfer format
          paymentURI = `ton://transfer/${address}?amount=${amount}`;
          break;
      }

      logger.info('Generating QR code', {
        currency,
        addressPrefix: address.substring(0, 10),
        amount
      });

      // Generate QR code as data URL
      const qrDataURL = await QRCode.toDataURL(paymentURI, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        width: 512,
        margin: 2
      });

      return res.status(200).json({
        success: true,
        data: {
          qrCode: qrDataURL,
          paymentURI,
          address,
          amount,
          currency
        }
      });

    } catch (error) {
      logger.error('QR generation error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to generate QR code'
      });
    }
  }
};

export default paymentController;
