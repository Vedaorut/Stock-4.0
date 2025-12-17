/**
 * Invoice Payment Service Constants
 *
 * @module invoicePayment/constants
 */

export const ORDER_STATES = {
  PENDING: 'pending',
  // DB constraint: pending, confirmed, shipped, delivered, cancelled
  // 'paid' doesn't exist in DB - use 'confirmed' for paid orders
  PAID: 'confirmed',
  CONFIRMED: 'confirmed',
  DELIVERED: 'delivered',
  CANCELLED: 'cancelled',
};
