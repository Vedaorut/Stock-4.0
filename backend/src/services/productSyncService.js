import { productQueries } from '../models/db.js';
import { shopFollowQueries } from '../models/shopFollowQueries.js';
import { syncedProductQueries } from '../models/syncedProductQueries.js';
import logger from '../utils/logger.js';

/**
 * Product Sync Service
 * Handles syncing products between source and follower shops
 */

/**
 * Calculate price with markup
 * @param {number} sourcePrice - Original price
 * @param {number} markupPercentage - Markup percentage (e.g., 20 for 20%)
 * @returns {number} Price with markup (rounded to 2 decimals)
 */
export function calculatePriceWithMarkup(sourcePrice, markupPercentage) {
  return Math.round(parseFloat(sourcePrice) * (1 + markupPercentage / 100) * 100) / 100;
}

/**
 * Generate unique product name for synced product
 * Adds suffix if name collision detected
 * @param {string} baseName - Original product name
 * @param {number} shopId - Target shop ID
 * @returns {Promise<string>} Unique name
 */
async function generateUniqueName(baseName, shopId) {
  // Check if name exists in target shop
  const existingProducts = await productQueries.list({ shopId, limit: 1000 });
  const existingNames = new Set(existingProducts.map(p => p.name.toLowerCase()));
  
  if (!existingNames.has(baseName.toLowerCase())) {
    return baseName;
  }
  
  // Add suffix (копия N)
  let counter = 1;
  let newName = `${baseName} (копия ${counter})`;
  
  while (existingNames.has(newName.toLowerCase())) {
    counter++;
    newName = `${baseName} (копия ${counter})`;
  }
  
  return newName;
}

/**
 * Copy product from source to follower shop with markup
 * @param {number} sourceProductId - Source product ID
 * @param {number} followId - Follow relationship ID
 * @returns {Promise<Object>} Created synced product record
 */
export async function copyProductWithMarkup(sourceProductId, followId) {
  try {
    // Get follow details
    const follow = await shopFollowQueries.findById(followId);
    if (!follow) {
      throw new Error(`Follow relationship ${followId} not found`);
    }
    
    if (follow.mode !== 'resell') {
      throw new Error('Can only copy products in resell mode');
    }
    
    // Get source product
    const sourceProduct = await productQueries.findById(sourceProductId);
    if (!sourceProduct) {
      throw new Error(`Source product ${sourceProductId} not found`);
    }
    
    // Check if already synced
    const existing = await syncedProductQueries.findBySourceAndFollow(sourceProductId, followId);
    if (existing) {
      logger.info(`Product ${sourceProductId} already synced to follow ${followId}`);
      return existing;
    }
    
    // Calculate price with markup
    const newPrice = calculatePriceWithMarkup(sourceProduct.price, follow.markup_percentage);
    
    // Generate unique name
    const uniqueName = await generateUniqueName(sourceProduct.name, follow.follower_shop_id);
    
    // Create product in follower shop
    const syncedProduct = await productQueries.create({
      shopId: follow.follower_shop_id,
      name: uniqueName,
      description: sourceProduct.description,
      price: newPrice,
      currency: sourceProduct.currency || 'USD',
      stockQuantity: sourceProduct.stock_quantity
    });
    
    // Create synced_products record
    const syncRecord = await syncedProductQueries.create({
      followId,
      syncedProductId: syncedProduct.id,
      sourceProductId
    });
    
    logger.info(`Product synced: source ${sourceProductId} → synced ${syncedProduct.id} (follow ${followId})`);
    
    return syncRecord;
  } catch (error) {
    logger.error(`Error copying product ${sourceProductId} to follow ${followId}:`, error);
    throw error;
  }
}

/**
 * Update synced product based on source changes
 * @param {number} syncedProductId - Synced product record ID
 * @returns {Promise<Object>} Updated synced product record
 */
export async function updateSyncedProduct(syncedProductId) {
  try {
    // Get synced product record
    const syncRecord = await syncedProductQueries.findById(syncedProductId);
    if (!syncRecord) {
      throw new Error(`Synced product ${syncedProductId} not found`);
    }
    
    // Check if manual edits detected
    const hasEdits = await syncedProductQueries.hasManualEdits(syncRecord.synced_product_id);
    if (hasEdits) {
      // Mark as conflict, don't update
      await syncedProductQueries.updateConflictStatus(syncedProductId, 'conflict');
      logger.warn(`Manual edits detected on synced product ${syncRecord.synced_product_id}, marked as conflict`);
      return syncRecord;
    }
    
    // Get current source product data
    const sourceProduct = await productQueries.findById(syncRecord.source_product_id);
    if (!sourceProduct) {
      logger.warn(`Source product ${syncRecord.source_product_id} not found, may have been deleted`);
      return syncRecord;
    }
    
    // Get follow for markup
    const follow = await shopFollowQueries.findById(syncRecord.follow_id);
    const newPrice = calculatePriceWithMarkup(sourceProduct.price, follow.markup_percentage);
    
    // Update synced product
    await productQueries.update(syncRecord.synced_product_id, {
      price: newPrice,
      stockQuantity: sourceProduct.stock_quantity,
      isActive: sourceProduct.is_active
    });
    
    // Update last synced timestamp
    await syncedProductQueries.updateLastSynced(syncedProductId);
    
    logger.info(`Synced product ${syncRecord.synced_product_id} updated from source ${syncRecord.source_product_id}`);
    
    return await syncedProductQueries.findById(syncedProductId);
  } catch (error) {
    logger.error(`Error updating synced product ${syncedProductId}:`, error);
    throw error;
  }
}

/**
 * Handle source product deletion
 * Soft delete synced products (keep for order history)
 * @param {number} sourceProductId - Deleted source product ID
 * @returns {Promise<number>} Number of synced products affected
 */
export async function handleSourceProductDelete(sourceProductId) {
  try {
    const syncedProducts = await syncedProductQueries.findBySourceProductId(sourceProductId);
    
    let count = 0;
    for (const sync of syncedProducts) {
      // Soft delete: deactivate instead of deleting
      await productQueries.update(sync.synced_product_id, { isActive: false });
      count++;
    }
    
    logger.info(`Source product ${sourceProductId} deleted, deactivated ${count} synced products`);
    return count;
  } catch (error) {
    logger.error(`Error handling source product deletion ${sourceProductId}:`, error);
    throw error;
  }
}

/**
 * Sync all products for a follow relationship
 * Called when follow is created or mode switched to resell
 * @param {number} followId - Follow relationship ID
 * @returns {Promise<Object>} Sync results
 */
export async function syncAllProductsForFollow(followId) {
  try {
    const follow = await shopFollowQueries.findById(followId);
    if (!follow) {
      throw new Error(`Follow ${followId} not found`);
    }
    
    if (follow.mode !== 'resell') {
      return { synced: 0, skipped: 0, errors: 0 };
    }
    
    // Get all active products from source shop
    const sourceProducts = await productQueries.list({ 
      shopId: follow.source_shop_id, 
      isActive: true,
      limit: 1000 
    });
    
    const results = { synced: 0, skipped: 0, errors: 0 };
    
    for (const product of sourceProducts) {
      try {
        await copyProductWithMarkup(product.id, followId);
        results.synced++;
      } catch (error) {
        if (error.message.includes('already synced')) {
          results.skipped++;
        } else {
          results.errors++;
          logger.error(`Failed to sync product ${product.id}:`, error);
        }
      }
    }
    
    logger.info(`Bulk sync for follow ${followId}: ${results.synced} synced, ${results.skipped} skipped, ${results.errors} errors`);
    return results;
  } catch (error) {
    logger.error(`Error syncing products for follow ${followId}:`, error);
    throw error;
  }
}

/**
 * Update markup for all synced products in a follow
 * Called when user changes markup percentage
 * @param {number} followId - Follow relationship ID
 * @param {number} newMarkupPercentage - New markup percentage
 * @returns {Promise<number>} Number of products updated
 */
export async function updateMarkupForFollow(followId, newMarkupPercentage) {
  try {
    const syncedProducts = await syncedProductQueries.findByFollowId(followId);
    
    let count = 0;
    for (const sync of syncedProducts) {
      if (sync.conflict_status === 'synced') {
        const newPrice = calculatePriceWithMarkup(sync.source_product_price, newMarkupPercentage);
        await productQueries.update(sync.synced_product_id, { price: newPrice });
        await syncedProductQueries.updateLastSynced(sync.id);
        count++;
      }
    }
    
    logger.info(`Updated markup for follow ${followId}: ${count} products updated`);
    return count;
  } catch (error) {
    logger.error(`Error updating markup for follow ${followId}:`, error);
    throw error;
  }
}

/**
 * Run periodic sync for all active resell follows
 * Called by cron job every 5 minutes
 * @returns {Promise<Object>} Sync statistics
 */
export async function runPeriodicSync() {
  try {
    const stats = { updated: 0, conflicts: 0, errors: 0, skipped: 0 };
    
    // Find products that haven't been synced in last 5 minutes
    const staleProducts = await syncedProductQueries.findStaleProducts(5);
    
    logger.info(`Periodic sync: found ${staleProducts.length} stale products`);
    
    for (const sync of staleProducts) {
      try {
        // Check if source differs from synced
        const sourcePrice = parseFloat(sync.source_price);
        const syncedPrice = parseFloat(sync.synced_price);
        const expectedPrice = calculatePriceWithMarkup(sourcePrice, sync.markup_percentage);
        
        const priceChanged = Math.abs(syncedPrice - expectedPrice) > 0.01;
        const stockChanged = sync.source_stock !== sync.synced_stock;
        const activeChanged = sync.source_active !== sync.synced_active;
        
        if (priceChanged || stockChanged || activeChanged) {
          await updateSyncedProduct(sync.id);
          stats.updated++;
        } else {
          // Just update timestamp
          await syncedProductQueries.updateLastSynced(sync.id);
          stats.skipped++;
        }
      } catch (error) {
        if (error.message && error.message.includes('conflict')) {
          stats.conflicts++;
        } else {
          stats.errors++;
          logger.error(`Error syncing product ${sync.id}:`, error);
        }
      }
    }
    
    logger.info(`Periodic sync completed:`, stats);
    return stats;
  } catch (error) {
    logger.error('Error in periodic sync:', error);
    throw error;
  }
}
