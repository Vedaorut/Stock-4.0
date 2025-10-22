import { paymentQueries, orderQueries } from '../models/db.js';
import cryptoService from '../services/crypto.js';
import telegramService from '../services/telegram.js';
import logger from '../utils/logger.js';

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
          error: 'Payment address not set for this order'
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
  }
};

export default paymentController;
