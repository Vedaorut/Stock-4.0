import {
  generatePaymentInvoice,
  getPaymentStatus,
  confirmPaymentWithTxHash,
} from './handlers/paymentHandlers.js';
import {
  getUpgradeCost,
  generateUpgradePaymentInvoice,
  getUpgradePaymentStatus,
  confirmUpgradePaymentWithTxHash,
} from './handlers/upgradeHandlers.js';
import { getStatus, getHistory, getPricing } from './handlers/statusHandlers.js';
import {
  checkSubscription,
  getUserSubscriptions,
  getMyShopSubscriptions,
  createSubscription,
} from './handlers/userHandlers.js';
import { createPendingSubscription } from './handlers/pendingHandlers.js';

export {
  getUpgradeCost,
  getStatus,
  getHistory,
  getPricing,
  checkSubscription,
  getUserSubscriptions,
  getMyShopSubscriptions,
  createSubscription,
  generatePaymentInvoice,
  generateUpgradePaymentInvoice,
  getPaymentStatus,
  getUpgradePaymentStatus,
  confirmPaymentWithTxHash,
  confirmUpgradePaymentWithTxHash,
  createPendingSubscription,
};

const subscriptionController = {
  getUpgradeCost,
  getStatus,
  getHistory,
  getPricing,
  checkSubscription,
  getUserSubscriptions,
  getMyShopSubscriptions,
  createSubscription,
  generatePaymentInvoice,
  generateUpgradePaymentInvoice,
  getPaymentStatus,
  getUpgradePaymentStatus,
  confirmPaymentWithTxHash,
  confirmUpgradePaymentWithTxHash,
  createPendingSubscription,
};

export default subscriptionController;
