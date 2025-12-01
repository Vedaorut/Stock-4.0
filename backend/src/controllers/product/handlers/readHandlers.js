import {
  productQueries,
  subscriptionQueries,
  shopQueries,
} from '../../../database/queries/index.js';
import { shopFollowQueries } from '../../../models/shopFollowQueries.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { NotFoundError, ValidationError } from '../../../utils/errors.js';
import logger from '../../../utils/logger.js';
import { respondWithDbError } from '../utils/errors.js';
import { enrichProductWithDiscount, enrichProducts } from '../utils/products.js';
import { parsePagination } from '../validators/payloadValidators.js';

/**
 * Get product by ID
 */
export const getById = asyncHandler(async (req, res) => {
  try {
    const { id } = req.params;

    const product = await productQueries.findById(id);

    if (!product) {
      throw new NotFoundError('Product');
    }

    const enrichedProduct = enrichProductWithDiscount(product);

    return res.status(200).json({
      success: true,
      data: enrichedProduct,
    });
  } catch (error) {
    if (respondWithDbError(res, error)) {
      return;
    }

    logger.error('Get product error', { error: error.message, stack: error.stack });
    throw error;
  }
});

/**
 * List products with filters
 */
export const list = asyncHandler(async (req, res) => {
  try {
    const { page, limit, offset } = parsePagination(req.query);

    const filters = {
      shopId: req.query.shopId
        ? (() => {
            const id = Number.parseInt(req.query.shopId, 10);
            return Number.isInteger(id) && id > 0 ? id : undefined;
          })()
        : undefined,
      isActive: req.query.isActive !== undefined ? req.query.isActive === 'true' : true,
      limit,
      offset,
    };

    logger.info('[Products List] Request:', {
      shopId: filters.shopId,
      isActive: filters.isActive,
      limit: filters.limit,
      offset: filters.offset,
      userId: req.user?.id,
    });

    const products = await productQueries.list(filters);

    logger.info('[Products List] Results:', {
      count: products.length,
      shopId: filters.shopId,
      productIds: products.map((p) => p.id),
    });

    const enrichedProducts = enrichProducts(products);

    return res.status(200).json({
      success: true,
      data: enrichedProducts,
      pagination: {
        page,
        limit,
        total: enrichedProducts.length,
      },
    });
  } catch (error) {
    if (respondWithDbError(res, error)) {
      return;
    }

    logger.error('List products error', { error: error.message, stack: error.stack });
    throw error;
  }
});

/**
 * Search products across subscribed/followed shops
 * GET /api/products/search?query=<text>&subscriptions=true&follows=true
 */
export const search = asyncHandler(async (req, res) => {
  try {
    const { query: searchQuery, subscriptions, follows, limit: limitParam } = req.query;
    const userId = req.user.id;

    // Validate search query
    if (!searchQuery || searchQuery.trim().length < 2) {
      throw new ValidationError('Search query must be at least 2 characters');
    }

    const limit = Math.min(Math.max(parseInt(limitParam, 10) || 20, 1), 100);
    const shopIds = new Set();

    // Get subscribed shop IDs (buyer's perspective)
    if (subscriptions === 'true') {
      const userSubscriptions = await subscriptionQueries.findByUserId(userId, 1000, 0);
      userSubscriptions.forEach((sub) => shopIds.add(sub.shop_id));
    }

    // Get followed shop IDs (seller's perspective - source shops)
    if (follows === 'true') {
      // Get user's shops first
      const userShops = await shopQueries.findByOwnerId(userId);

      for (const shop of userShops) {
        // Get all active follows for this shop
        const shopFollows = await shopFollowQueries.findByFollowerShopId(shop.id, 'active');
        shopFollows.forEach((follow) => shopIds.add(follow.source_shop_id));
      }
    }

    // If no shops found, return empty results
    if (shopIds.size === 0) {
      return res.status(200).json({
        success: true,
        data: [],
        meta: {
          query: searchQuery,
          shopCount: 0,
          total: 0,
        },
      });
    }

    // Search products
    const products = await productQueries.searchAcrossShops(
      searchQuery.trim(),
      Array.from(shopIds),
      limit
    );

    const enrichedProducts = enrichProducts(products);

    logger.info('[Products Search] Results:', {
      userId,
      query: searchQuery,
      subscriptions: subscriptions === 'true',
      follows: follows === 'true',
      shopCount: shopIds.size,
      resultCount: products.length,
    });

    return res.status(200).json({
      success: true,
      data: enrichedProducts,
      meta: {
        query: searchQuery,
        shopCount: shopIds.size,
        total: enrichedProducts.length,
      },
    });
  } catch (error) {
    if (respondWithDbError(res, error)) {
      return;
    }

    logger.error('Search products error', { error: error.message, stack: error.stack });
    throw error;
  }
});
