/**
 * Invoice Constants
 * Single source of truth for invoice-related constants
 */

export const INVOICE_PURPOSES = {
  ORDER: 'order',
  SUBSCRIPTION: 'subscription',
  UPGRADE: 'subscription_upgrade',
};

export const INVOICE_STATES = {
  PENDING: 'pending',
  PAID: 'paid',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled',
};

export default {
  INVOICE_PURPOSES,
  INVOICE_STATES,
};
