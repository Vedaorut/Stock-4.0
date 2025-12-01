import { create } from './handlers/createHandlers.js';
import { getById, list, search } from './handlers/readHandlers.js';
import { update } from './handlers/updateHandlers.js';
import {
  deleteProduct,
  bulkDeleteAll,
  bulkDeleteByIds,
} from './handlers/deleteHandlers.js';
import { applyBulkDiscount, removeBulkDiscount } from './handlers/discountHandlers.js';
import { bulkUpdateProducts } from './handlers/bulkUpdateHandlers.js';

export const productController = {
  create,
  getById,
  list,
  search,
  update,
  delete: deleteProduct,
  bulkDeleteAll,
  bulkDeleteByIds,
  applyBulkDiscount,
  removeBulkDiscount,
  bulkUpdateProducts,
};

export {
  create,
  getById,
  list,
  search,
  update,
  deleteProduct as delete,
  bulkDeleteAll,
  bulkDeleteByIds,
  applyBulkDiscount,
  removeBulkDiscount,
  bulkUpdateProducts,
};

export default productController;
