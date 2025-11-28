/**
 * Invoice Payment Service
 *
 * Main API hub for invoice payment processing.
 * Re-exports all public functions from submodules.
 *
 * Usage:
 *   import { processOrderPayment, processSubscriptionPayment } from './services/invoicePayment/index.js';
 *   // or
 *   import invoicePaymentService from './services/invoicePayment/index.js';
 *
 * @module invoicePayment
 */

// Constants
export { ORDER_STATES } from './constants.js';

// Validators
export { validateAndLockOrder, validateAndLockSubscription } from './validators/index.js';

// Utils
export {
  ensureInvoiceActive,
  guardTxReuse,
  attachPaymentRecord,
  markInvoicePaid,
} from './utils/index.js';

// Finalizers
export { finalizeOrderPayment } from './finalizers/orderFinalizer.js';
export { finalizeSubscriptionPayment } from './finalizers/subscriptionFinalizer.js';

// Notifications
export { notifyOrderConfirmed, notifySubscriptionActivated } from './notifications/index.js';

// Processors (Main API)
export { processOrderPayment, processSubscriptionPayment } from './processors/index.js';

// Default export for backward compatibility
import { processOrderPayment, processSubscriptionPayment } from './processors/index.js';

export default {
  processOrderPayment,
  processSubscriptionPayment,
};
