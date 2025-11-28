import { ValidationError } from '../../../utils/errors.js';
import { DEFAULT_LIST_LIMIT, MAX_LIST_LIMIT, MAX_BULK_UPDATES } from '../constants.js';

export function parsePagination(query = {}) {
  const page = Number.parseInt(query.page, 10) || 1;
  if (!Number.isInteger(page) || page <= 0) {
    throw new ValidationError('Invalid page parameter');
  }

  const limit = Number.parseInt(query.limit, 10) || DEFAULT_LIST_LIMIT;
  if (!Number.isInteger(limit) || limit <= 0 || limit > MAX_LIST_LIMIT) {
    throw new ValidationError('Invalid limit parameter (must be 1-1000)');
  }

  return { page, limit, offset: (page - 1) * limit };
}

export function validateProductIds(productIds) {
  if (!Array.isArray(productIds) || productIds.length === 0) {
    throw new ValidationError('productIds must be a non-empty array');
  }
}

export function validateBulkUpdates(updates) {
  if (!Array.isArray(updates) || updates.length === 0) {
    throw new ValidationError('updates must be a non-empty array');
  }

  if (updates.length > MAX_BULK_UPDATES) {
    throw new ValidationError('Maximum 50 products per request');
  }
}

export function requireShopId(shopId) {
  if (!shopId) {
    throw new ValidationError('Shop ID required');
  }
}
