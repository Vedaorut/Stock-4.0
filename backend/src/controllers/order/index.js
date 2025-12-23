import { create } from './handlers/createHandlers.js';
import { getById, getMyOrders, getMyPendingOrders, getPendingOrder } from './handlers/readHandlers.js';
import { updateStatus, getActiveCount, cancelPendingOrder } from './handlers/statusHandlers.js';
import { bulkUpdateStatus } from './handlers/bulkHandlers.js';
import { getAnalytics } from './handlers/analyticsHandlers.js';
import {
  getPaymentInfo,
  submitPayment,
  getPaymentStatus,
} from './handlers/paymentHandlers.js';

export const orderController = {
  create,
  getById,
  getMyOrders,
  getMyPendingOrders,
  getPendingOrder,
  updateStatus,
  getActiveCount,
  cancelPendingOrder,
  bulkUpdateStatus,
  getAnalytics,
  getPaymentInfo,
  submitPayment,
  getPaymentStatus,
};

export {
  create,
  getById,
  getMyOrders,
  getMyPendingOrders,
  getPendingOrder,
  updateStatus,
  getActiveCount,
  cancelPendingOrder,
  bulkUpdateStatus,
  getAnalytics,
  getPaymentInfo,
  submitPayment,
  getPaymentStatus,
};

export default orderController;
