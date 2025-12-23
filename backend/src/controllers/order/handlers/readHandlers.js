import { orderQueries, shopQueries, workerQueries } from '../../../database/queries/index.js';
import { asyncHandler } from '../../../middleware/errorHandler.js';
import { NotFoundError } from '../../../utils/errors.js';
import { validateOrderAccess } from '../../../validators/orderValidator.js';
import { parseStatusFilter } from '../utils/filters.js';
import { INVOICE_EXPIRY_SECONDS } from '../../../config/payments.js';

/**
 * Get order by ID
 */
export const getById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  const order = await orderQueries.findById(id);

  if (!order) {
    throw new NotFoundError('Order');
  }

  await validateOrderAccess(order, req.user.id);

  return res.json({
    success: true,
    data: order,
  });
});

/**
 * Get orders for current user
 * P0-DB-3 FIX: Add MAX_LIMIT to prevent unbounded queries
 */
export const getMyOrders = asyncHandler(async (req, res) => {
  const MAX_LIMIT = 1000;
  const requestedLimit = parseInt(req.query.limit, 10) || 50;
  const limit = Math.min(requestedLimit, MAX_LIMIT);

  const page = parseInt(req.query.page, 10) || 1;
  const offset = (page - 1) * limit;
  const type = req.query.type;
  const hasShopFilter = typeof req.query.shop_id !== 'undefined';
  const shopId = hasShopFilter ? parseInt(req.query.shop_id, 10) : null;
  const statusFilter = parseStatusFilter(req.query.status);

  let orders;

  if (hasShopFilter) {
    if (!Number.isInteger(shopId) || shopId <= 0) {
      return res.status(400).json({
        success: false,
        error: 'Invalid shop_id',
      });
    }

    const shop = await shopQueries.findById(shopId);

    if (!shop) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found',
      });
    }

    const isOwner = shop.owner_id === req.user.id;
    const isWorker = await workerQueries.findByShopAndUser(shopId, req.user.id);

    if (!isOwner && !isWorker) {
      return res.status(403).json({
        success: false,
        error: 'You can only view orders for shops you own or work at',
      });
    }

    orders = await orderQueries.findByShopId(shopId, {
      limit,
      offset,
      statuses: statusFilter,
    });

    const total = await orderQueries.countByShopId(shopId, statusFilter);

    return res.json({
      success: true,
      data: orders,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasMore: orders.length === limit,
      },
    });
  } else if (type === 'seller') {
    const shops = await shopQueries.findByOwnerId(req.user.id);
    const workerShops = await workerQueries.getWorkerShops(req.user.id);

    if ((!shops || shops.length === 0) && (!workerShops || workerShops.length === 0)) {
      return res.status(403).json({
        success: false,
        error: 'You need shop access to view seller orders',
      });
    }

    if (shops && shops.length > 0) {
      orders = await orderQueries.findByOwnerId(req.user.id, {
        limit,
        offset,
        statuses: statusFilter,
      });
    } else {
      // Worker fallback: single query for all worker shops (N+1 fix)
      const shopIds = workerShops.map((s) => s.id);
      orders = await orderQueries.findByShopIds(shopIds, {
        limit,
        offset,
        statuses: statusFilter,
      });
    }
  } else {
    // Buyer orders
    orders = await orderQueries.findByBuyerId(req.user.id, {
      limit,
      offset,
      statuses: statusFilter.length > 0 ? statusFilter : undefined,
    });
  }

  return res.json({
    success: true,
    data: orders,
    pagination: {
      page,
      limit,
      maxLimit: MAX_LIMIT,
      hasMore: orders.length === limit,
    },
  });
});

/**
 * Get pending orders for current user (with payment info)
 */
export const getMyPendingOrders = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);

  const orders = await orderQueries.findPendingByBuyer(
    userId,
    INVOICE_EXPIRY_SECONDS,
    limit
  );

  const now = Date.now();
  const mapped = orders.map((order) => {
    const baseTime = order.updated_at || order.created_at;
    const expiresAt = baseTime
      ? new Date(new Date(baseTime).getTime() + INVOICE_EXPIRY_SECONDS * 1000).toISOString()
      : null;
    const expiresIn = baseTime
      ? Math.max(0, Math.floor((new Date(expiresAt).getTime() - now) / 1000))
      : null;

    return {
      ...order,
      expiresAt,
      expiresIn,
    };
  });

  return res.json({
    success: true,
    data: mapped,
  });
});

/**
 * Get the latest pending order for current user (single order response)
 */
export const getPendingOrder = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  const orders = await orderQueries.findPendingByBuyer(
    userId,
    INVOICE_EXPIRY_SECONDS,
    1
  );

  if (!orders.length) {
    return res.json({
      success: true,
      data: null,
    });
  }

  const order = orders[0];
  const baseTime = order.updated_at || order.created_at;
  const expiresAt = baseTime
    ? new Date(new Date(baseTime).getTime() + INVOICE_EXPIRY_SECONDS * 1000).toISOString()
    : null;

  return res.json({
    success: true,
    data: {
      orderId: order.id,
      payment_address: order.payment_address,
      currency: order.crypto_currency,
      amount: order.crypto_amount,
      expires_at: expiresAt,
      expiresAt,
      shop_id: order.shop_id,
      shop_name: order.shop_name,
      product_name: order.product_name,
    },
  });
});
