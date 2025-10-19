import client from './client.js';

/**
 * Payments API
 */
export const paymentsApi = {
  /**
   * Verify crypto payment
   * @param {string} token - JWT token
   * @param {number} orderId - Order ID
   * @param {string} txHash - Transaction hash
   * @param {string} currency - Cryptocurrency (BTC, ETH, USDT, TON)
   * @returns {Promise<object>} Verification result
   */
  async verify(token, orderId, txHash, currency) {
    return await client.post('/api/payments/verify', {
      orderId,
      txHash,
      currency
    }, token);
  },

  /**
   * Get payments by order ID
   * @param {string} token - JWT token
   * @param {number} orderId - Order ID
   * @returns {Promise<Array>} Order payments
   */
  async getByOrder(token, orderId) {
    return await client.get(`/api/payments/order/${orderId}`, token);
  },

  /**
   * Check payment status by transaction hash
   * @param {string} token - JWT token
   * @param {string} txHash - Transaction hash
   * @returns {Promise<object>} Payment status
   */
  async checkStatus(token, txHash) {
    return await client.get(`/api/payments/status?txHash=${encodeURIComponent(txHash)}`, token);
  }
};
