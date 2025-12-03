import { api, logger } from './config.js';

export const orderApi = {
  // Get order by ID (with ownership check on backend)
  async getOrder(orderId, token) {
    const { data } = await api.get(`/orders/${orderId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

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
          hasPagination: !!data?.pagination,
          ordersCount: data?.data?.length || 0,
        },
      });

      // Return full response with pagination for proper sync
      // Format: { success: true, data: [...], pagination: { total, totalPages, page, limit, hasMore } }
      if (data.success && Array.isArray(data.data)) {
        return {
          success: data.success,
          data: data.data,
          pagination: data.pagination || { total: data.data.length, hasMore: false },
        };
      }

      // Legacy fallback: wrap array in expected format
      const orders = Array.isArray(data.data) ? data.data : Array.isArray(data) ? data : [];
      return {
        success: true,
        data: orders,
        pagination: { total: orders.length, totalPages: 1, hasMore: false },
      };
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
