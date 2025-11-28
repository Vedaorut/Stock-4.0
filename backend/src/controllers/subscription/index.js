import {
  paySubscription,
  generatePaymentInvoice,
  getPaymentStatus,
  confirmPaymentWithTxHash,
} from './handlers/paymentHandlers.js';
import {
  upgradeShop,
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
} from './handlers/userHandlers.js';
import { createPendingSubscription } from './handlers/pendingHandlers.js';

export {
  paySubscription,
  upgradeShop,
  getUpgradeCost,
  getStatus,
  getHistory,
  getPricing,
  checkSubscription,
  getUserSubscriptions,
  getMyShopSubscriptions,
  generatePaymentInvoice,
  generateUpgradePaymentInvoice,
  getPaymentStatus,
  getUpgradePaymentStatus,
  confirmPaymentWithTxHash,
  confirmUpgradePaymentWithTxHash,
  createPendingSubscription,
};

const subscriptionController = {
  paySubscription,
  upgradeShop,
  getUpgradeCost,
  getStatus,
  getHistory,
  getPricing,
  checkSubscription,
  getUserSubscriptions,
  getMyShopSubscriptions,
  generatePaymentInvoice,
  generateUpgradePaymentInvoice,
  getPaymentStatus,
  getUpgradePaymentStatus,
  confirmPaymentWithTxHash,
  confirmUpgradePaymentWithTxHash,
  createPendingSubscription,
};

export default subscriptionController;
