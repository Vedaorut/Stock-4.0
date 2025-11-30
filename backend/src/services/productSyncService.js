import { productQueries } from '../database/queries/index.js';
import { shopFollowQueries } from '../models/shopFollowQueries.js';
import { syncedProductQueries } from '../models/syncedProductQueries.js';
import logger from '../utils/logger.js';
import { getClient } from '../config/database.js';

/**
 * Product Sync Service
 * Handles syncing products between source and follower shops
 */

/**
 * Calculate price with markup
 * @param {number} sourcePrice - Original price
 * @param {string} markupType - Markup type ('percentage' or 'fixed')
 * @param {number} markupValue - Markup value (percentage or fixed dollar amount)
 * @returns {number} Price with markup (rounded to 2 decimals)
 */
export function calculatePriceWithMarkup(sourcePrice, markupType, markupValue) {
  const price = parseFloat(sourcePrice);
  if (markupType === 'fixed') {
    return Math.round((price + parseFloat(markupValue)) * 100) / 100;
  }
  // percentage (default)
  return Math.round(price * (1 + markupValue / 100) * 100) / 100;
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
  const existingNames = new Set(existingProducts.map((p) => p.name.toLowerCase()));

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
    const markupType = follow.markup_type || 'percentage';
    const markupValue = markupType === 'fixed' ? follow.markup_fixed : follow.markup_percentage;
    const newPrice = calculatePriceWithMarkup(sourceProduct.price, markupType, markupValue);

    // Generate unique name
    const uniqueName = await generateUniqueName(sourceProduct.name, follow.follower_shop_id);

    // Create product in follower shop
    const syncedProduct = await productQueries.create({
      shopId: follow.follower_shop_id,
      name: uniqueName,
      description: sourceProduct.description,
      price: newPrice,
      currency: sourceProduct.currency || 'USD',
      stockQuantity: sourceProduct.stock_quantity,
    });

    // Create synced_products record
    const syncRecord = await syncedProductQueries.create({
      followId,
      syncedProductId: syncedProduct.id,
      sourceProductId,
    });

    logger.info(
      `Product synced: source ${sourceProductId} → synced ${syncedProduct.id} (follow ${followId})`
    );

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
      logger.warn(
        `Manual edits detected on synced product ${syncRecord.synced_product_id}, marked as conflict`
      );
      return syncRecord;
    }

    // Get current source product data
    const sourceProduct = await productQueries.findById(syncRecord.source_product_id);
    if (!sourceProduct) {
      logger.warn(
        `Source product ${syncRecord.source_product_id} not found, may have been deleted`
      );
      return syncRecord;
    }

    // Get follow for markup
    const follow = await shopFollowQueries.findById(syncRecord.follow_id);
    const markupType = follow.markup_type || 'percentage';
    const markupValue = markupType === 'fixed' ? follow.markup_fixed : follow.markup_percentage;
    const newPrice = calculatePriceWithMarkup(sourceProduct.price, markupType, markupValue);

    // Update synced product
    await productQueries.update(syncRecord.synced_product_id, {
      price: newPrice,
      stockQuantity: sourceProduct.stock_quantity,
      isActive: sourceProduct.is_active,
    });

    // Update last synced timestamp
    await syncedProductQueries.updateLastSynced(syncedProductId);

    logger.info(
      `Synced product ${syncRecord.synced_product_id} updated from source ${syncRecord.source_product_id}`
    );

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

    // OPTIMIZED: Batch deactivate follower products with Promise.all
    await Promise.all(
      syncedProducts.map((sync) =>
        productQueries.update(sync.synced_product_id, { isActive: false })
      )
    );

    // Remove sync mappings to avoid stale records/counts
    if (syncedProducts.length > 0) {
      await syncedProductQueries.deleteBySourceProductId(sourceProductId);
    }

    const count = syncedProducts.length;
    logger.info(
      `Source product ${sourceProductId} deleted, deactivated ${count} synced products and removed sync mappings`
    );
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
      limit: 1000,
    });

    const results = { synced: 0, skipped: 0, errors: 0 };

    // OPTIMIZED: Parallel execution with Promise.allSettled (prevents one error from stopping all)
    const syncPromises = sourceProducts.map((product) =>
      copyProductWithMarkup(product.id, followId)
        .then(() => ({ status: 'synced', productId: product.id }))
        .catch((error) => ({
          status: error.message.includes('already synced') ? 'skipped' : 'error',
          productId: product.id,
          error,
        }))
    );

    const syncResults = await Promise.all(syncPromises);

    // Count results
    for (const result of syncResults) {
      if (result.status === 'synced') {
        results.synced++;
      } else if (result.status === 'skipped') {
        results.skipped++;
      } else {
        results.errors++;
        logger.error(`Failed to sync product ${result.productId}:`, result.error);
      }
    }

    logger.info(
      `Bulk sync for follow ${followId}: ${results.synced} synced, ${results.skipped} skipped, ${results.errors} errors`
    );
    return results;
  } catch (error) {
    logger.error(`Error syncing products for follow ${followId}:`, error);
    throw error;
  }
}

/**
 * Update markup for all synced products in a follow
 * Called when user changes markup settings
 * @param {number} followId - Follow relationship ID
 * @param {string} markupType - Markup type ('percentage' or 'fixed')
 * @param {number} markupValue - Markup value (percentage or fixed dollar amount)
 * @returns {Promise<number>} Number of products updated
 */
export async function updateMarkupForFollow(followId, markupType, markupValue) {
  const client = await getClient();

  try {
    // Begin transaction FIRST to prevent race condition with follow deletion
    await client.query('BEGIN');
    logger.info(`updateMarkupForFollow: Transaction started for follow ${followId}`);

    // Lock the follow row FIRST to prevent concurrent deletion
    const followResult = await client.query(
      'SELECT id FROM shop_follows WHERE id = $1 FOR UPDATE',
      [followId]
    );

    // Check if follow still exists after acquiring lock
    if (followResult.rows.length === 0) {
      await client.query('ROLLBACK');
      logger.warn(`updateMarkupForFollow: Follow ${followId} not found or was deleted`);
      return 0;
    }

    // Now read synced products WITH FOR UPDATE lock (inside transaction)
    // Include custom_markup fields to respect per-product markup settings
    const syncedResult = await client.query(
      `SELECT sp.id, sp.synced_product_id, sp.source_product_id, sp.conflict_status,
              sp.custom_markup_type, sp.custom_markup_percentage, sp.custom_markup_fixed,
              p.price as source_product_price
       FROM synced_products sp
       JOIN products p ON p.id = sp.source_product_id
       WHERE sp.follow_id = $1
       FOR UPDATE OF sp`,
      [followId]
    );

    // Filter synced products only
    const productsToUpdate = syncedResult.rows.filter((sync) => sync.conflict_status === 'synced');

    if (productsToUpdate.length === 0) {
      await client.query('COMMIT');
      logger.info(`No products to update for follow ${followId}`);
      return 0;
    }

    // Filter out products with custom_markup - they should NOT be updated by global markup change
    const productsWithoutCustomMarkup = productsToUpdate.filter((sync) => !sync.custom_markup_type);
    const skippedCount = productsToUpdate.length - productsWithoutCustomMarkup.length;

    logger.info(`updateMarkupForFollow: Processing ${productsWithoutCustomMarkup.length} products for follow ${followId} (skipping ${skippedCount} with custom markup)`);

    // Sequential update with FOR UPDATE locks (not parallel to avoid deadlocks)
    for (const sync of productsWithoutCustomMarkup) {
      // Lock product row
      await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [
        sync.synced_product_id,
      ]);

      // Update product price with global markup (custom_markup products are already filtered out)
      const newPrice = calculatePriceWithMarkup(sync.source_product_price, markupType, markupValue);
      await client.query('UPDATE products SET price = $1, updated_at = NOW() WHERE id = $2', [
        newPrice,
        sync.synced_product_id,
      ]);

      // Update last synced timestamp
      await client.query('UPDATE synced_products SET last_synced_at = NOW() WHERE id = $1', [
        sync.id,
      ]);
    }

    // Commit transaction
    await client.query('COMMIT');
    const count = productsWithoutCustomMarkup.length;
    logger.info(`updateMarkupForFollow: Transaction committed for follow ${followId}`, {
      productsUpdated: count,
      productsSkipped: skippedCount,
    });
    return count;
  } catch (error) {
    // Rollback on error
    try {
      await client.query('ROLLBACK');
      logger.warn(`updateMarkupForFollow: Transaction rolled back for follow ${followId}`, {
        error: error.message,
      });
    } catch (rollbackError) {
      logger.error(`updateMarkupForFollow: Rollback failed for follow ${followId}`, {
        error: rollbackError.message,
      });
    }

    logger.error(`Error updating markup for follow ${followId}:`, error);
    throw error;
  } finally {
    // Always release client
    client.release();
    logger.debug(`updateMarkupForFollow: Client released for follow ${followId}`);
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

    // Process each product in its own transaction with row-level locks
    for (const sync of staleProducts) {
      const client = await getClient();

      try {
        // Begin transaction for this product sync
        await client.query('BEGIN');

        // Lock the synced product row to prevent concurrent updates
        await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE', [
          sync.synced_product_id,
        ]);

        // Check if source differs from synced
        const sourcePrice = parseFloat(sync.source_price);
        const syncedPrice = parseFloat(sync.synced_price);
        const markupType = sync.markup_type || 'percentage';
        const markupValue = markupType === 'fixed' ? sync.markup_fixed : sync.markup_percentage;
        const expectedPrice = calculatePriceWithMarkup(sourcePrice, markupType, markupValue);

        const priceChanged = Math.abs(syncedPrice - expectedPrice) > 0.01;
        const stockChanged = sync.source_stock !== sync.synced_stock;
        const activeChanged = sync.source_active !== sync.synced_active;

        const isConflict = sync.conflict_status === 'conflict';
        const conflictResolved = isConflict && !priceChanged;

        if (conflictResolved || priceChanged || stockChanged || activeChanged) {
          if (isConflict && priceChanged && !(stockChanged || activeChanged)) {
            // Preserve manual price edits but still refresh stock/active timestamp
            await client.query(
              `UPDATE products
               SET stock_quantity = $1,
                   is_active = $2,
                   updated_at = NOW()
               WHERE id = $3`,
              [sync.source_stock, sync.source_active, sync.synced_product_id]
            );
          } else {
            // Update synced product with direct SQL (within transaction)
            await client.query(
              `UPDATE products
               SET price = $1,
                   stock_quantity = $2,
                   is_active = $3,
                   updated_at = NOW()
               WHERE id = $4`,
              [expectedPrice, sync.source_stock, sync.source_active, sync.synced_product_id]
            );
          }

          // Update last synced timestamp and clear conflict if resolved
          await client.query(
            `UPDATE synced_products 
             SET last_synced_at = NOW(),
                 conflict_status = CASE 
                   WHEN $2 THEN 'synced' 
                   ELSE conflict_status 
                 END
             WHERE id = $1`,
            [sync.id, conflictResolved]
          );

          stats.updated++;
          logger.debug(
            `Synced product ${sync.synced_product_id} updated from source ${sync.source_product_id}`
          );
        } else {
          // Just update timestamp
          await client.query('UPDATE synced_products SET last_synced_at = NOW() WHERE id = $1', [
            sync.id,
          ]);
          stats.skipped++;
        }

        // Commit transaction
        await client.query('COMMIT');
      } catch (error) {
        // Rollback on error
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          logger.error(`Rollback failed for synced product ${sync.id}:`, rollbackError);
        }

        if (error.message && error.message.includes('conflict')) {
          stats.conflicts++;
        } else {
          stats.errors++;
          logger.error(`Error syncing product ${sync.id}:`, error);
        }
      } finally {
        // Always release client
        client.release();
      }
    }

    logger.info(`Periodic sync completed:`, stats);
    return stats;
  } catch (error) {
    logger.error('Error in periodic sync:', error);
    throw error;
  }
}
