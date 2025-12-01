import { api, logger } from './config.js';

export const orderApi = {
  // Get buyer orders
  async getMyOrders(token) {
    const { data } = await api.get('/orders/my', {
      headers: { Authorization: `Bearer ${token}` },
    });
    // Unwrap response: return data.data (array of orders) instead of wrapper
    const orders = data.data || data;
    return Array.isArray(orders) ? orders : [];
  },

  // Get shop orders (sales)
  async getShopOrders(shopId, token, options = {}) {
    try {
      const params = {
        shop_id: shopId,
      };

      if (options.status) {
        params.status = Array.isArray(options.status) ? options.status.join(',') : options.status;
      }

      if (options.limit) {
        params.limit = options.limit;
      }

      if (options.page) {
        params.page = options.page;
      }

      logger.info('getShopOrders request:', {
        shopId,
        filters: options,
        params,
        hasToken: !!token,
      });

      // Prefer new worker-friendly endpoint, fallback to legacy
      let data;
      try {
        const response = await api.get(`/shops/${shopId}/orders`, {
          params,
          headers: { Authorization: `Bearer ${token}` },
        });
        data = response.data;
      } catch (err) {
        if (err.response?.status !== 404) {
          throw err;
        }
        const response = await api.get('/orders', {
          params,
          headers: { Authorization: `Bearer ${token}` },
        });
        data = response.data;
      }

      logger.info('getShopOrders response:', {
        status: 200,
        dataStructure: {
          hasData: !!data,
          hasDataData: !!data?.data,
          isArray: Array.isArray(data),
          dataIsArray: Array.isArray(data?.data),
          payloadHasOrders: !!(data?.data?.orders || data?.orders),
          ordersCount:
            data?.data?.orders?.length ||
            data?.data?.length ||
            data?.orders?.length ||
            data?.length ||
            0,
        },
      });

      // Unwrap response: return data.data (array of orders) instead of wrapper
      const payload = data.data || data;
      const orders = Array.isArray(payload?.orders) ? payload.orders : payload;
      return Array.isArray(orders) ? orders : [];
    } catch (error) {
      logger.error('getShopOrders error:', {
        error: error.message,
        status: error.response?.status,
        data: error.response?.data,
        shopId,
        filters: options,
      });
      throw error; // Re-throw to be caught by handler
    }
  },

  // Get active orders count
  async getActiveOrdersCount(shopId, token) {
    const { data } = await api.get('/orders/active/count', {
      headers: { Authorization: `Bearer ${token}` },
      params: { shop_id: shopId },
    });

    const count = data?.data?.count ?? data?.count ?? 0;
    return Number.isFinite(Number(count)) ? Number(count) : 0;
  },

  // Update order status
  async updateOrderStatus(orderId, status, token) {
    const { data } = await api.put(
      `/orders/${orderId}/status`,
      { status },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return data.data || data;
  },

  // Bulk update order status
  async bulkUpdateOrderStatus(orderIds, status, token) {
    const { data } = await api.post(
      '/orders/bulk-status',
      { order_ids: orderIds, status },
      { headers: { Authorization: `Bearer ${token}` } }
    );
    return data.data || data;
  },

  /**
   * Get order analytics for period
   */
  async getAnalytics(shopId, startDate, endDate, token) {
    try {
      const response = await api.get('/orders/analytics', {
        params: {
          shop_id: shopId,
          from: startDate,
          to: endDate,
        },
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      return response.data.data;
    } catch (error) {
      logger.error('Error fetching analytics:', error);
      throw error;
    }
  },
};
