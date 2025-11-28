import { productQueries } from '../../../database/queries/index.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { NotFoundError } from '../../../utils/errors.js';
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
