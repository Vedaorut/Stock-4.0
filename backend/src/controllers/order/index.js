import { create } from './handlers/createHandlers.js';
import { getById, getMyOrders } from './handlers/readHandlers.js';
import { updateStatus, getActiveCount } from './handlers/statusHandlers.js';
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
  updateStatus,
  getActiveCount,
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
  updateStatus,
  getActiveCount,
  bulkUpdateStatus,
  getAnalytics,
  getPaymentInfo,
  submitPayment,
  getPaymentStatus,
};

export default orderController;
