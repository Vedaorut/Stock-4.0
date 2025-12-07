import { api, logger } from './config.js';

export const followApi = {
  // P1-BOT-004: Validate circular dependency
  async validateCircular(followerShopId, sourceShopId, token) {
    try {
      const { data } = await api.post(
        '/follows/validate-circular',
        {
          followerShopId: Number(followerShopId),
          sourceShopId: Number(sourceShopId),
        },
        {
          headers: { Authorization: `Bearer ${token}` },
        }
      );
      return data.data || data;
    } catch (error) {
      // If endpoint doesn't exist yet, skip validation (backward compatible)
      if (error.response?.status === 404) {
        logger.warn('Circular validation endpoint not found, skipping validation');
        return { valid: true };
      }
      throw error;
    }
  },

  // Get my follows (HTTP - requires JWT token)
  async getMyFollows(shopId, token) {
    const { data } = await api.get('/follows/my', {
      params: { shopId },
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Get follow detail
  async getFollowDetail(followId, token) {
    const { data } = await api.get(`/follows/${followId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Get follow products (monitor/resell)
  async getFollowProducts(followId, token, params = {}) {
    const { data } = await api.get(`/follows/${followId}/products`, {
      params,
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Check follow limit (FREE tier = 2)
  async checkFollowLimit(shopId, token) {
    const { data } = await api.get('/follows/check-limit', {
      params: { shopId },
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Create follow
  async createFollow(followData, token) {
    logger.info(`createFollow API call: followerShopId=${followData.followerShopId}, sourceShopId=${followData.sourceShopId}, mode=${followData.mode}, hasToken=${!!token}`);
    try {
      const { data } = await api.post('/follows', followData, {
        headers: { Authorization: `Bearer ${token}` },
      });
      return data.data || data;
    } catch (error) {
      logger.error(`createFollow FAILED: status=${error.response?.status}, data=${JSON.stringify(error.response?.data)}`);
      throw error;
    }
  },

  // Update markup - supports both number (legacy) and object (new)
  async updateMarkup(followId, markupData, token) {
    // Backward compatible: if markupData is a number, treat as percentage
    const payload = typeof markupData === 'number'
      ? { markupPercentage: markupData, markupType: 'percentage' }
      : {
          markupType: markupData.markupType || 'percentage',
          markupPercentage: Number(markupData.markupPercentage) || 0,
          markupFixed: Number(markupData.markupFixed) || 0,
        };

    const { data } = await api.put(
      `/follows/${followId}/markup`,
      payload,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    return data.data || data;
  },

  // Switch mode (monitor <-> resell)
  // Supports both old format (markupData as number) and new format (markupData as object)
  async switchMode(followId, mode, token, markupData = null) {
    const requestBody = { mode };

    if (markupData !== null) {
      if (typeof markupData === 'number') {
        // Old format: just a number (treated as percentage)
        requestBody.markupPercentage = Number(markupData);
        requestBody.markupType = 'percentage';
      } else {
        // New format: { markupType, markupPercentage, markupFixed }
        requestBody.markupType = markupData.markupType || 'percentage';
        requestBody.markupPercentage = markupData.markupPercentage || 0;
        requestBody.markupFixed = markupData.markupFixed || 0;
      }
    }

    const { data } = await api.put(`/follows/${followId}/mode`, requestBody, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },

  // Delete follow
  async deleteFollow(followId, token) {
    const { data } = await api.delete(`/follows/${followId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return data.data || data;
  },
};
