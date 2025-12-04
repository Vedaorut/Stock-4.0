import { productQueries } from '../database/queries/index.js';
import { shopFollowQueries } from '../models/shopFollowQueries.js';
import { syncedProductQueries } from '../models/syncedProductQueries.js';
import logger from '../utils/logger.js';
import { getClient, pool } from '../config/database.js';
import { TIER_LIMITS } from '../config/subscriptionPricing.js';
import { invalidateProductLimitCache } from '../middleware/productLimits.js';

/**
 * Get product limit for tier
 * @param {string} tier - Shop tier ('pro' or 'max')
 * @returns {number} Product limit (Infinity for max tier)
 */
function getProductLimit(tier) {
  const limits = TIER_LIMITS[tier];
  return limits ? limits.products : TIER_LIMITS.pro.products;
}

/**
 * Get shop tier and current product count
 * @param {number} shopId - Shop ID
 * @returns {Promise<{tier: string, productCount: number, limit: number}>}
 */
async function getShopProductCapacity(shopId) {
  const result = await pool.query(
    `SELECT s.tier, COUNT(p.id)::int as product_count
     FROM shops s
     LEFT JOIN products p ON p.shop_id = s.id AND p.is_active = true
     WHERE s.id = $1
     GROUP BY s.id, s.tier`,
    [shopId]
  );

  if (result.rows.length === 0) {
    throw new Error(`Shop ${shopId} not found`);
  }

  const shop = result.rows[0];
  const tier = shop.tier || 'pro';
  const limit = getProductLimit(tier);

  return {
    tier,
    productCount: shop.product_count,
    limit,
    remaining: limit === Infinity ? Infinity : Math.max(0, limit - shop.product_count),
  };
}

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
  // FIX H3: Validate inputs to prevent NaN
  const price = parseFloat(sourcePrice);
  if (isNaN(price) || price < 0) {
    throw new Error(`Invalid source price: ${sourcePrice}`);
  }

  const markup = parseFloat(markupValue) || 0;
  if (isNaN(markup)) {
    throw new Error(`Invalid markup value: ${markupValue}`);
  }

  if (markupType === 'fixed') {
    return Math.round((price + markup) * 100) / 100;
  }
  // percentage (default)
  return Math.round(price * (1 + markup / 100) * 100) / 100;
}

/**
 * Generate unique product name for synced product
 * Adds suffix if name collision detected
 * @param {string} baseName - Original product name
 * @param {number} shopId - Target shop ID
 * @param {Set<string>|null} existingNamesSet - Pre-loaded set of existing names (lowercase), or null to load from DB
 * @returns {Promise<string>} Unique name
 */
async function generateUniqueName(baseName, shopId, existingNamesSet = null) {
  // Use provided set or load from DB (fallback for single-product operations)
  let existingNames = existingNamesSet;
  if (!existingNames) {
    const existingProducts = await productQueries.list({ shopId, limit: 1000 });
    existingNames = new Set(existingProducts.map((p) => p.name.toLowerCase()));
  }

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
 * @param {Set<string>|null} existingNamesSet - Pre-loaded set of existing product names (lowercase) for bulk operations
 * @returns {Promise<Object>} Created synced product record
 */
export async function copyProductWithMarkup(sourceProductId, followId, existingNamesSet = null) {
  try {
    // Get follow details
    const follow = await shopFollowQueries.findById(followId);
    if (!follow) {
      throw new Error(`Follow relationship ${followId} not found`);
    }

    if (follow.mode !== 'resell') {
      throw new Error('Can only copy products in resell mode');
    }

    // Check tier product limit BEFORE creating product
    const capacity = await getShopProductCapacity(follow.follower_shop_id);
    if (capacity.remaining === 0) {
      logger.warn(
        `[Sync] Shop ${follow.follower_shop_id} (${capacity.tier}) reached product limit ${capacity.limit}, skipping copy of product ${sourceProductId}`
      );
      return { ok: false, code: 'LIMIT_REACHED', message: `Product limit reached (${capacity.limit})` };
    }

    // Get source product
    const sourceProduct = await productQueries.findById(sourceProductId);
    if (!sourceProduct) {
      throw new Error(`Source product ${sourceProductId} not found`);
    }

    // Check if source product is itself a synced copy (prevent chain copying)
    const isCopy = await syncedProductQueries.findBySyncedProductId(sourceProductId);
    if (isCopy) {
      logger.warn(
        `[CopyProtection] Blocked: Product ${sourceProductId} is already a synced copy ` +
        `(original source: ${isCopy.source_product_id}, follow: ${isCopy.follow_id}). ` +
        `Skipping to prevent chain copying.`
      );
      return null; // Return null to indicate blocked (different from existing check which returns record)
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

    // Generate unique name (uses pre-loaded set if provided)
    const uniqueName = await generateUniqueName(sourceProduct.name, follow.follower_shop_id, existingNamesSet);

    // Create product in follower shop
    const syncedProduct = await productQueries.create({
      shopId: follow.follower_shop_id,
      name: uniqueName,
      description: sourceProduct.description,
      price: newPrice,
      currency: sourceProduct.currency || 'USD',
      stockQuantity: sourceProduct.stock_quantity,
    });

    // Invalidate product limit cache after creating product
    invalidateProductLimitCache(follow.follower_shop_id);

    // Create synced_products record
    const syncRecord = await syncedProductQueries.create({
      followId,
      syncedProductId: syncedProduct.id,
      sourceProductId,
    });

    logger.info(
      `Product synced: source ${sourceProductId} → synced ${syncedProduct.id} (follow ${followId})`
    );

    return { ...syncRecord, name: uniqueName };
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

    // Check tier product limit BEFORE syncing
    const capacity = await getShopProductCapacity(follow.follower_shop_id);
    if (capacity.remaining === 0) {
      logger.warn(
        `[Sync] Shop ${follow.follower_shop_id} (${capacity.tier}) at product limit ${capacity.limit}, sync aborted for follow ${followId}`
      );
      return {
        synced: 0,
        skipped: 0,
        errors: 0,
        blockedCopies: 0,
        limitReached: true,
        reason: 'LIMIT_REACHED',
        limit: capacity.limit,
        tier: capacity.tier,
      };
    }

    // Get all active products from source shop
    const sourceProducts = await productQueries.list({
      shopId: follow.source_shop_id,
      isActive: true,
      limit: 1000,
    });

    const results = { synced: 0, skipped: 0, errors: 0, blockedCopies: 0, limitReached: false };

    // Log if source has more products than follower can sync
    if (capacity.remaining !== Infinity && sourceProducts.length > capacity.remaining) {
      logger.warn(
        `[Sync] Shop ${follow.follower_shop_id} (${capacity.tier}) can only sync ${capacity.remaining} of ${sourceProducts.length} products due to tier limit ${capacity.limit}`
      );
    }

    // OPTIMIZATION: Load existing product names ONCE before the loop
    // This eliminates N+1 query pattern (was: 100 products = 100 queries x 1000 rows)
    const existingProducts = await productQueries.list({
      shopId: follow.follower_shop_id,
      limit: 1000,
    });
    const existingNames = new Set(existingProducts.map((p) => p.name.toLowerCase()));

    // Process sequentially to correctly track new product names and avoid duplicates
    for (const product of sourceProducts) {
      try {
        const result = await copyProductWithMarkup(product.id, followId, existingNames);

        if (result === null) {
          // Blocked chain copy
          results.blockedCopies++;
        } else if (result.ok === false && result.code === 'LIMIT_REACHED') {
          // Product limit reached - stop syncing more products
          results.limitReached = true;
          results.limit = capacity.limit;
          results.tier = capacity.tier;
          logger.info(`[Sync] Product limit reached for shop ${follow.follower_shop_id}, stopping bulk sync`);
          break;
        } else if (result.name) {
          // Newly synced - add name to set to prevent duplicates in subsequent iterations
          existingNames.add(result.name.toLowerCase());
          results.synced++;
        } else {
          // Already synced (existing record returned without name property)
          results.skipped++;
        }
      } catch (error) {
        if (error.message.includes('already synced')) {
          results.skipped++;
        } else {
          results.errors++;
          logger.error(`Failed to sync product ${product.id}:`, error);
        }
      }
    }

    logger.info(
      `Bulk sync for follow ${followId}: ${results.synced} synced, ${results.skipped} skipped, ${results.blockedCopies} blocked (chain copies), ${results.errors} errors${results.limitReached ? `, LIMIT_REACHED (${capacity.tier}: ${capacity.limit})` : ''}`
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

    // Calculate all new prices first
    const updates = productsWithoutCustomMarkup.map((sync) => ({
      productId: sync.synced_product_id,
      syncedProductId: sync.id,
      newPrice: calculatePriceWithMarkup(sync.source_product_price, markupType, markupValue),
    }));

    // FIX H5: Lock all product rows in one query with ORDER BY to prevent deadlocks
    await client.query('SELECT id FROM products WHERE id = ANY($1) ORDER BY id FOR UPDATE', [
      updates.map((u) => u.productId),
    ]);

    // Batch update all product prices using unnest()
    await client.query(
      `UPDATE products p
       SET price = u.new_price, updated_at = NOW()
       FROM unnest($1::int[], $2::decimal[]) AS u(id, new_price)
       WHERE p.id = u.id`,
      [updates.map((u) => u.productId), updates.map((u) => u.newPrice)]
    );

    // Batch update all synced_products timestamps
    await client.query(
      `UPDATE synced_products
       SET last_synced_at = NOW()
       WHERE id = ANY($1)`,
      [updates.map((u) => u.syncedProductId)]
    );

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

// Batch size for chunked sync processing
const SYNC_CHUNK_SIZE = 50;

/**
 * Run periodic sync for all active resell follows
 * Called by cron job every 5 minutes
 * Uses batch processing to reduce transaction overhead
 * @returns {Promise<Object>} Sync statistics
 */
export async function runPeriodicSync() {
  try {
    const stats = { updated: 0, conflicts: 0, errors: 0, skipped: 0 };

    // Find products that haven't been synced in last 5 minutes
    const staleProducts = await syncedProductQueries.findStaleProducts(5);

    logger.info(`Periodic sync: found ${staleProducts.length} stale products`);

    // Process products in chunks to reduce transaction overhead
    for (let i = 0; i < staleProducts.length; i += SYNC_CHUNK_SIZE) {
      const chunk = staleProducts.slice(i, i + SYNC_CHUNK_SIZE);
      const client = await getClient();

      try {
        // Begin transaction for this chunk
        await client.query('BEGIN');

        for (const sync of chunk) {
          try {
            // Lock the synced product row to prevent concurrent updates
            await client.query('SELECT id FROM products WHERE id = $1 FOR UPDATE NOWAIT', [
              sync.synced_product_id,
            ]);

            // Check if source differs from synced
            const sourcePrice = parseFloat(sync.source_price);
            const syncedPrice = parseFloat(sync.synced_price);

            // BUG FIX: Determine effective markup (custom > global)
            const effectiveMarkupType = sync.custom_markup_type || sync.markup_type || 'percentage';
            const effectiveMarkupValue = sync.custom_markup_type
              ? (effectiveMarkupType === 'fixed' ? sync.custom_markup_fixed : sync.custom_markup_percentage)
              : (effectiveMarkupType === 'fixed' ? sync.markup_fixed : sync.markup_percentage);

            const expectedPrice = calculatePriceWithMarkup(sourcePrice, effectiveMarkupType, effectiveMarkupValue);

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
          } catch (productError) {
            // Handle individual product errors within the chunk
            // NOWAIT lock failures (55P03) are expected when rows are locked by another process
            if (productError.code === '55P03') {
              stats.skipped++;
              logger.debug(`Product ${sync.synced_product_id} locked by another process, skipping`);
            } else if (productError.message && productError.message.includes('conflict')) {
              stats.conflicts++;
            } else {
              stats.errors++;
              logger.error(`Error syncing product ${sync.id}:`, productError);
            }
            // Continue processing other products in the chunk
          }
        }

        // Commit transaction for the entire chunk
        await client.query('COMMIT');
      } catch (error) {
        // Rollback on chunk-level error
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          logger.error(`Rollback failed for chunk starting at ${i}:`, rollbackError);
        }

        stats.errors += chunk.length;
        logger.error(`Error processing chunk starting at ${i}:`, error);
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
