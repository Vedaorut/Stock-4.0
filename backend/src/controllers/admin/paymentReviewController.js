/**
 * Admin Payment Review Controller
 *
 * Handles review of late payments marked as needs_review
 */

import { query } from '../../config/database.js';
import logger from '../../utils/logger.js';
import { logPaymentStatusChange, logOrderStatusChange } from '../../utils/statusLogger.js';
import { alertInfo } from '../../utils/alerts.js';

/**
 * Get all payments needing review
 * GET /api/admin/payments/needs-review
 */
export async function getNeedsReviewPayments(req, res) {
  try {
    const result = await query(`
      SELECT
        p.id as payment_id,
        p.order_id,
        p.tx_hash,
        p.amount,
        p.currency,
        p.expected_crypto_amount,
        p.status,
        p.verification_status,
        p.verification_error,
        p.created_at as payment_created_at,
        o.total_price,
        o.currency as order_currency,
        o.created_at as order_created_at,
        o.status as order_status,
        EXTRACT(EPOCH FROM (p.created_at - o.created_at)) / 60 as delay_minutes,
        buyer.username as buyer_username,
        buyer.telegram_id as buyer_telegram_id,
        seller.username as seller_username,
        s.name as shop_name
      FROM payments p
      JOIN orders o ON p.order_id = o.id
      LEFT JOIN users buyer ON o.buyer_id = buyer.id
      LEFT JOIN products prod ON o.product_id = prod.id
      LEFT JOIN shops s ON prod.shop_id = s.id
      LEFT JOIN users seller ON s.owner_id = seller.id
      WHERE p.status = 'needs_review'
      ORDER BY p.created_at DESC
      LIMIT 100
    `);

    // Mask tx_hash for display
    const payments = result.rows.map(p => ({
      ...p,
      tx_hash_masked: p.tx_hash ?
        p.tx_hash.substring(0, 10) + '...' + p.tx_hash.substring(p.tx_hash.length - 6) : null,
    }));

    res.json({
      success: true,
      data: payments,
      count: payments.length,
    });
  } catch (error) {
    logger.error('[Admin] Failed to get needs_review payments:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch payments',
    });
  }
}

/**
 * Approve a late payment (confirm it despite expiry)
 * POST /api/admin/payments/:paymentId/approve
 */
export async function approvePayment(req, res) {
  const { paymentId } = req.params;
  const { notes } = req.body;
  const adminId = req.user?.id;

  try {
    // Get payment and order info
    const paymentResult = await query(
      `SELECT p.*, o.id as order_id, o.status as order_status
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       WHERE p.id = $1 AND p.status = 'needs_review'
       FOR UPDATE`,
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found or not in needs_review status',
      });
    }

    const payment = paymentResult.rows[0];

    // Update payment to confirmed
    await query(
      `UPDATE payments
       SET status = 'confirmed',
           verification_status = 'confirmed',
           reviewed_at = NOW(),
           reviewed_by = $2,
           review_notes = $3,
           updated_at = NOW()
       WHERE id = $1`,
      [paymentId, adminId, notes || 'Approved by admin']
    );

    // Update order to confirmed if still pending
    if (payment.order_status === 'pending') {
      await query(
        `UPDATE orders
         SET status = 'confirmed',
             paid_at = NOW(),
             updated_at = NOW()
         WHERE id = $1`,
        [payment.order_id]
      );

      logOrderStatusChange({
        orderId: payment.order_id,
        statusFrom: 'pending',
        statusTo: 'confirmed',
        reason: 'admin_approved_late_payment',
        requestId: req.requestId,
      });
    }

    logPaymentStatusChange({
      paymentId: parseInt(paymentId),
      orderId: payment.order_id,
      statusFrom: 'needs_review',
      statusTo: 'confirmed',
      reason: 'admin_approved',
      requestId: req.requestId,
      extra: { adminId, notes },
    });

    alertInfo('Late Payment Approved', {
      'Payment ID': paymentId,
      'Order ID': payment.order_id,
      'Approved By': adminId,
    });

    logger.info('[Admin] Payment approved', {
      paymentId,
      orderId: payment.order_id,
      adminId,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      message: 'Payment approved and order confirmed',
      data: { paymentId, orderId: payment.order_id },
    });
  } catch (error) {
    logger.error('[Admin] Failed to approve payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to approve payment',
    });
  }
}

/**
 * Reject a late payment (mark for refund)
 * POST /api/admin/payments/:paymentId/reject
 */
export async function rejectPayment(req, res) {
  const { paymentId } = req.params;
  const { notes } = req.body;
  const adminId = req.user?.id;

  try {
    const paymentResult = await query(
      `SELECT p.*, o.id as order_id, o.status as order_status
       FROM payments p
       JOIN orders o ON p.order_id = o.id
       WHERE p.id = $1 AND p.status = 'needs_review'`,
      [paymentId]
    );

    if (paymentResult.rows.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'Payment not found or not in needs_review status',
      });
    }

    const payment = paymentResult.rows[0];

    // Update payment to failed with refund note
    await query(
      `UPDATE payments
       SET status = 'failed',
           verification_status = 'failed',
           verification_error = $2,
           reviewed_at = NOW(),
           reviewed_by = $3,
           review_notes = $4,
           updated_at = NOW()
       WHERE id = $1`,
      [paymentId, 'Rejected - refund required', adminId, notes || 'Rejected by admin - refund needed']
    );

    // Cancel order if still pending
    if (payment.order_status === 'pending') {
      await query(
        `UPDATE orders
         SET status = 'cancelled',
             updated_at = NOW()
         WHERE id = $1`,
        [payment.order_id]
      );

      logOrderStatusChange({
        orderId: payment.order_id,
        statusFrom: 'pending',
        statusTo: 'cancelled',
        reason: 'admin_rejected_late_payment',
        requestId: req.requestId,
      });
    }

    logPaymentStatusChange({
      paymentId: parseInt(paymentId),
      orderId: payment.order_id,
      statusFrom: 'needs_review',
      statusTo: 'failed',
      reason: 'admin_rejected',
      requestId: req.requestId,
      extra: { adminId, notes },
    });

    logger.info('[Admin] Payment rejected', {
      paymentId,
      orderId: payment.order_id,
      adminId,
      requestId: req.requestId,
    });

    res.json({
      success: true,
      message: 'Payment rejected, refund may be required',
      data: { paymentId, orderId: payment.order_id },
    });
  } catch (error) {
    logger.error('[Admin] Failed to reject payment:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reject payment',
    });
  }
}

export default {
  getNeedsReviewPayments,
  approvePayment,
  rejectPayment,
};
