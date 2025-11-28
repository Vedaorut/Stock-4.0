/**
 * CrystalPay Service - Payment gateway integration
 * 
 * API Documentation: https://docs.crystalpay.io
 * 
 * Endpoints:
 * - POST /v3/invoice/create/ - Create payment invoice
 * - POST /v3/invoice/info/ - Get invoice status
 */

import crypto from 'crypto';
import axios from 'axios';
import logger from '../utils/logger.js';

const API_URL = 'https://api.crystalpay.io/v3';

// Supported payment methods for subscriptions
export const PAYMENT_METHODS = {
  BITCOIN: 'BITCOIN',
  LITECOIN: 'LITECOIN'
};

// Invoice states
export const INVOICE_STATES = {
  CREATED: 'created',
  NOT_PAYED: 'notpayed', 
  PROCESSING: 'processing',
  WRONG_AMOUNT: 'wrongamount',
  FAILED: 'failed',
  PAYED: 'payed',
  UNAVAILABLE: 'unavailable'
};

/**
 * Get config from environment (lazy load)
 */
function getConfig() {
  return {
    authLogin: process.env.CRYSTALPAY_LOGIN,
    authSecret: process.env.CRYSTALPAY_SECRET,
    salt: process.env.CRYSTALPAY_SALT,
    callbackUrl: process.env.CRYSTALPAY_CALLBACK_URL
  };
}

/**
 * Validate config is present
 */
function validateConfig(config) {
  if (!config.authLogin || !config.authSecret) {
    throw new Error('CrystalPay credentials not configured');
  }
}

/**
 * Create payment invoice
 *
 * @param {Object} params
 * @param {number} params.amount - Amount in USD
 * @param {string} params.method - BITCOIN or LITECOIN
 * @param {string} params.description - Payment description
 * @param {string} params.extra - Custom data (our invoice_id)
 * @param {number} params.lifetime - Invoice lifetime in seconds (default 3600 = 1 hour)
 * @returns {Promise<{id: string, url: string, amount: string}>}
 */
export async function createInvoice({ amount, method, description, extra, lifetime = 3600 }) {
  const config = getConfig();
  validateConfig(config);

  logger.info('[CrystalPay] Creating invoice', { amount, method, description });

  try {
    const response = await axios.post(`${API_URL}/invoice/create/`, {
      auth_login: config.authLogin,
      auth_secret: config.authSecret,
      amount: String(amount),
      type: 'purchase',
      lifetime,
      currency: 'RUB',
      required_method: method,
      callback_url: config.callbackUrl,
      description,
      extra: extra ? String(extra) : undefined
    });

    if (response.data.error) {
      logger.error('[CrystalPay] Create invoice error', { errors: response.data.errors });
      throw new Error(`CrystalPay error: ${response.data.errors?.join(', ')}`);
    }

    logger.info('[CrystalPay] Invoice created', { 
      id: response.data.id,
      url: response.data.url,
      amount: response.data.amount
    });

    return {
      id: response.data.id,
      url: response.data.url,
      amount: response.data.amount,
      currency: response.data.currency
    };

  } catch (error) {
    if (error.response) {
      logger.error('[CrystalPay] API error', { 
        status: error.response.status,
        data: error.response.data 
      });
    }
    throw error;
  }
}

/**
 * Get invoice info/status
 * 
 * @param {string} invoiceId - CrystalPay invoice ID
 * @returns {Promise<{id: string, state: string, amount: string, method: string}>}
 */
export async function getInvoiceInfo(invoiceId) {
  const config = getConfig();
  validateConfig(config);

  try {
    const response = await axios.post(`${API_URL}/invoice/info/`, {
      auth_login: config.authLogin,
      auth_secret: config.authSecret,
      id: invoiceId
    });

    if (response.data.error) {
      throw new Error(`CrystalPay error: ${response.data.errors?.join(', ')}`);
    }

    return {
      id: response.data.id,
      state: response.data.state,
      amount: response.data.amount,
      currency: response.data.currency,
      method: response.data.method,
      createdAt: response.data.created_at,
      expiredAt: response.data.expired_at
    };

  } catch (error) {
    logger.error('[CrystalPay] Get invoice info error', { invoiceId, error: error.message });
    throw error;
  }
}

/**
 * Verify webhook signature
 * 
 * Signature = SHA1(id:salt)
 * 
 * @param {Object} payload - Webhook payload with signature and id
 * @returns {boolean}
 */
export function verifySignature(payload) {
  const config = getConfig();
  
  if (!config.salt) {
    logger.warn('[CrystalPay] Salt not configured, allowing in dev mode');
    return process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test';
  }

  if (!payload.signature || !payload.id) {
    logger.warn('[CrystalPay] Missing signature or id');
    return false;
  }

  const expectedSignature = crypto
    .createHash('sha1')
    .update(`${payload.id}:${config.salt}`)
    .digest('hex');

  const isValid = payload.signature === expectedSignature;

  if (!isValid) {
    logger.warn('[CrystalPay] Invalid signature', {
      received: payload.signature.substring(0, 10) + '...',
      expected: expectedSignature.substring(0, 10) + '...'
    });
  }

  return isValid;
}

/**
 * Check if payment is successful
 */
export function isPaymentSuccessful(state) {
  return state === INVOICE_STATES.PAYED;
}

/**
 * Check if payment is pending
 */
export function isPaymentPending(state) {
  return [INVOICE_STATES.CREATED, INVOICE_STATES.NOT_PAYED, INVOICE_STATES.PROCESSING].includes(state);
}

/**
 * Check if payment failed
 */
export function isPaymentFailed(state) {
  return [INVOICE_STATES.FAILED, INVOICE_STATES.WRONG_AMOUNT, INVOICE_STATES.UNAVAILABLE].includes(state);
}

export default {
  PAYMENT_METHODS,
  INVOICE_STATES,
  createInvoice,
  getInvoiceInfo,
  verifySignature,
  isPaymentSuccessful,
  isPaymentPending,
  isPaymentFailed
};
