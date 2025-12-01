import { ValidationError, UnauthorizedError } from '../utils/errors.js';
import { workerQueries } from '../database/queries/index.js';

/**
 * Order Validator
 * Business logic validation for order operations
 */

/**
 * Parse and validate cart items from request body
 * Supports both legacy (productId, quantity) and multi-item (items array) formats
 *
 * @param {Object} body - Request body
 * @returns {Array<{productId: number, quantity: number}>} - Validated cart items
 * @throws {ValidationError} - If validation fails
 */
export const validateCartItems = (body) => {
  const { productId, quantity, items } = body;

  // Legacy format: single item (backward compatible)
  if (productId && quantity) {
    if (!Number.isInteger(quantity) || quantity <= 0) {
      throw new ValidationError('Quantity must be a positive integer');
    }
    if (quantity > 10000) {
      throw new ValidationError('Quantity exceeds maximum allowed (10000)');
    }
    return [{ productId, quantity }];
  }

  // Multi-item format
  if (!items || !Array.isArray(items) || items.length === 0) {
    throw new ValidationError('Either productId+quantity or items array is required');
  }

  // Validate each item
  for (const item of items) {
    if (!item.productId || !item.quantity) {
      throw new ValidationError('Each item must have productId and quantity');
    }
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      throw new ValidationError('All quantities must be positive integers');
    }
    if (item.quantity > 10000) {
      throw new ValidationError('Quantity exceeds maximum allowed (10000)');
    }
  }

  return items;
};

/**
 * Fetch and validate products for order creation
 * Uses FOR UPDATE for row-level locking (race condition safety)
 *
 * @param {Array<{productId: number, quantity: number}>} cartItems - Cart items
 * @param {Object} client - Database client (transaction)
 * @returns {Object} - Validated data: { items, shopId, currency, totalPrice }
 * @throws {ValidationError} - If validation fails (stock, shop, currency)
 */
export const validateProductsForOrder = async (cartItems, client) => {
  const productIds = cartItems.map(item => item.productId);

  // Fetch products with row-level lock (race condition safety)
  const { rows: products } = await client.query(
    `SELECT id, shop_id, name, price, currency,
            stock_quantity, reserved_quantity, is_active, is_preorder
     FROM products
     WHERE id = ANY($1)
     FOR UPDATE`,
    [productIds]
  );

  // Check all products found
  if (products.length !== productIds.length) {
    const foundIds = products.map(p => p.id);
    const missingIds = productIds.filter(id => !foundIds.includes(id));
    throw new ValidationError(`Products not found or locked: ${missingIds.join(', ')}`);
  }

  // Validate products
  const validatedItems = [];
  let shopId = null;
  let currency = null;

  for (const cartItem of cartItems) {
    const product = products.find(p => p.id === cartItem.productId);

    // Check product active
    if (!product.is_active) {
      throw new ValidationError(`Product "${product.name}" is not available`);
    }

    // Check stock (non-preorder only)
    if (!product.is_preorder) {
      const available = product.stock_quantity - (product.reserved_quantity || 0);
      if (available < cartItem.quantity) {
        throw new ValidationError(
          `Insufficient stock for "${product.name}". Available: ${available}, requested: ${cartItem.quantity}`
        );
      }
    }

    // Validate same shop
    if (shopId === null) {
      shopId = product.shop_id;
    } else if (product.shop_id !== shopId) {
      throw new ValidationError('All products must be from the same shop');
    }

    // Validate same currency
    if (currency === null) {
      currency = product.currency;
    } else if (product.currency !== currency) {
      throw new ValidationError('All products must have the same currency');
    }

    validatedItems.push({
      productId: product.id,
      productName: product.name,
      quantity: cartItem.quantity,
      price: product.price,
      currency: product.currency,
      shopId: product.shop_id,
      isPreorder: product.is_preorder,
    });
  }

  return {
    items: validatedItems,
    shopId,
    currency,
    totalPrice: validatedItems.reduce((sum, item) => sum + (item.price * item.quantity), 0),
  };
};

/**
 * Check if user has access to order (buyer or shop owner)
 *
 * @param {Object} order - Order object with buyer_id and owner_id
 * @param {number} userId - User ID to check
 * @throws {UnauthorizedError} - If user doesn't have access
 */
export const validateOrderAccess = async (order, userId) => {
  const isBuyer = order.buyer_id === userId;
  const isOwner = order.owner_id && order.owner_id === userId;
  let isWorker = false;

  if (!isOwner && order.shop_id) {
    const worker = await workerQueries.findByShopAndUser(order.shop_id, userId);
    isWorker = !!worker;
  }

  if (!isBuyer && !isOwner && !isWorker) {
    throw new UnauthorizedError('You do not have access to this order');
  }
};

/**
 * Validate status update authorization and state transition
 *
 * @param {Object} order - Order object with status, buyer_id, owner_id
 * @param {string} newStatus - New status to transition to
 * @param {number} userId - User ID performing the update
 * @throws {UnauthorizedError} - If user is not authorized
 * @throws {ValidationError} - If state transition is invalid
 */
export const validateStatusUpdate = async (order, newStatus, userId) => {
  const { validateStatusTransition } = await import('../utils/orderStateValidator.js');

  // Check authorization based on role
  if (order.buyer_id === userId) {
    // Buyer can only cancel pending orders
    if (newStatus !== 'cancelled') {
      throw new UnauthorizedError('Buyers can only cancel orders');
    }
    if (order.status !== 'pending') {
      throw new ValidationError('Only pending orders can be cancelled by buyer');
    }
  } else if (order.owner_id && order.owner_id === userId) {
    // Seller can update to: confirmed, shipped, delivered, cancelled
    const allowedStatuses = ['confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!allowedStatuses.includes(newStatus)) {
      throw new UnauthorizedError(`Sellers can only update status to: ${allowedStatuses.join(', ')}`);
    }
  } else if (order.shop_id) {
    // Workers of this shop can manage orders with same rules as owner
    const worker = await workerQueries.findByShopAndUser(order.shop_id, userId);
    if (!worker) {
      throw new UnauthorizedError('You do not have permission to update this order');
    }

    const allowedStatuses = ['confirmed', 'shipped', 'delivered', 'cancelled'];
    if (!allowedStatuses.includes(newStatus)) {
      throw new UnauthorizedError(`Workers can only update status to: ${allowedStatuses.join(', ')}`);
    }
  } else {
    throw new UnauthorizedError('You do not have permission to update this order');
  }

  // Validate state transition
  const transition = validateStatusTransition(order.status, newStatus);

  if (!transition.valid) {
    throw new ValidationError(`Invalid status transition: ${order.status} → ${newStatus}`);
  }

  // Return transition info for idempotent check
  return transition;
};

export default {
  validateCartItems,
  validateProductsForOrder,
  validateOrderAccess,
  validateStatusUpdate,
};
