import { shopQueries, workerQueries } from '../../../database/queries/index.js';

/**
 * Check if user owns the shop or is assigned as a worker.
 */
export async function isAuthorizedToManageShop(shopId, userId, existingShop = null) {
  const shop = existingShop || (await shopQueries.findById(shopId));
  if (!shop) {
    return false;
  }

  if (shop.owner_id === userId) {
    return true;
  }

  const worker = await workerQueries.findByShopAndUser(shopId, userId);
  return !!worker;
}
