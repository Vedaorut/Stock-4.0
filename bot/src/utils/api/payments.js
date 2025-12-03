import { api, paymentAxios, logger } from './config.js';

// P0-BOT-7 FIX: Use paymentAxios with 60s timeout for payment endpoints
export const paymentApi = {
  // Verify crypto payment (blockchain query - needs 60s timeout)
  async verifyPayment(paymentData, token) {
    const { data } = await paymentAxios.post('/payments/verify', paymentData, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data (payment object) instead of wrapper
    return data.data || data;
  },
};

export const subscriptionApi = {
  // Get subscription pricing (tier prices from backend)
  async getPricing() {
    try {
      const { data } = await api.get('/subscriptions/pricing');
      return data;
    } catch (error) {
      logger.error('Failed to fetch subscription pricing:', error);
      // Fallback prices if API fails
      return {
        basic: { price: 25, currency: 'USD', period: '30 days' },
        pro: { price: 35, currency: 'USD', period: '30 days' },
      };
    }
  },

  // Check if user is subscribed to shop
  async checkSubscription(shopId, token) {
    const { data } = await api.get(`/subscriptions/check/${shopId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data (object with isSubscribed and subscription) instead of wrapper
    return data.data || data;
  },

  // Subscribe to shop
  async subscribe(shopId, token, telegramId = null) {
    const { data } = await api.post(
      '/subscriptions',
      {
        shopId: Number(shopId),
        telegramId: telegramId ? String(telegramId) : undefined,
      },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    // Unwrap response: return data.data (subscription object) instead of wrapper
    return data.data || data;
  },

  // Get user subscriptions
  async getMySubscriptions(token) {
    const { data } = await api.get('/subscriptions', {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data (array of subscriptions) instead of wrapper
    return data.data || data;
  },

  // Unsubscribe from shop
  async unsubscribe(shopId, token) {
    const { data } = await api.delete(`/subscriptions/${shopId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data instead of wrapper
    return data.data || data;
  },

  // Generate payment invoice for subscription (blockchain query - needs 60s timeout)
  async generateSubscriptionInvoice(subscriptionId, chain, token) {
    const { data } = await paymentAxios.post(
      `/subscriptions/${subscriptionId}/payment/generate`,
      { chain },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    // Unwrap response: return data.invoice instead of wrapper
    return data.invoice || data.data || data;
  },

  // Get payment status for subscription (blockchain query - needs 60s timeout)
  async getSubscriptionPaymentStatus(subscriptionId, token) {
    const { data } = await paymentAxios.get(`/subscriptions/${subscriptionId}/payment/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.payment instead of wrapper
    return data.payment || data.data || data;
  },

  // Manual confirmation by tx hash (server verifies on-chain)
  async confirmSubscriptionPayment(subscriptionId, txHash, token) {
    const { data } = await paymentAxios.post(
      `/subscriptions/${subscriptionId}/payment/confirm`,
      { txHash },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.data || data;
  },

  async generateUpgradeInvoice(subscriptionId, chain, token) {
    const { data } = await paymentAxios.post(
      `/subscriptions/${subscriptionId}/upgrade/payment/generate`,
      { chain },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.invoice || data.data || data;
  },

  async getUpgradePaymentStatus(subscriptionId, token) {
    const { data } = await paymentAxios.get(
      `/subscriptions/${subscriptionId}/upgrade/payment/status`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.payment || data.data || data;
  },

  async confirmUpgradePayment(subscriptionId, txHash, token) {
    const { data } = await paymentAxios.post(
      `/subscriptions/${subscriptionId}/upgrade/payment/confirm`,
      { txHash },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.data || data;
  },

  // Create pending subscription (first-time shop creation or trial-to-paid conversion)
  async createPending(tier, token, shopId = null) {
    const payload = { tier };
    if (shopId) {
      payload.shopId = Number(shopId);
    }
    const { data } = await api.post('/subscriptions/pending', payload, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Backend returns { success, subscription: { id, ... } }
    // Map to { subscriptionId, ... } for bot compatibility
    const subscription = data.subscription || data.data?.subscription || data.data || data;
    return {
      subscriptionId: subscription.id,
      ...subscription,
    };
  },

  // Get subscription status for shop
  async getStatus(shopId, token) {
    const { data } = await api.get(`/subscriptions/status/${shopId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data instead of wrapper
    return data.data || data;
  },

  // Create CrystalPay invoice for subscription payment
  async createCrystalPayInvoice(subscriptionId, method, purpose, token) {
    const { data } = await api.post(
      `/payments/subscriptions/${subscriptionId}/invoice/crystalpay`,
      { method, purpose },
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    // Unwrap response: return invoice data
    return data.data || data;
  },

  // Get invoice status (for CrystalPay webhooks)
  async getInvoiceStatus(invoiceId, token) {
    const { data } = await api.get(`/payments/invoices/${invoiceId}/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return status data
    return data.data || data;
  },
};
