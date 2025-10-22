import { shopQueries } from '../models/db.js';
import { dbErrorHandler } from '../middleware/errorHandler.js';
import logger from '../utils/logger.js';

/**
 * Wallet Controller
 * Manages crypto wallet addresses for shops
 */
export const walletController = {
  /**
   * Get shop wallet addresses
   */
  getWallets: async (req, res) => {
    try {
      const { shopId } = req.params;

      // Get shop by ID
      const shop = await shopQueries.findById(shopId);

      if (!shop) {
        return res.status(404).json({
          success: false,
          error: 'Shop not found'
        });
      }

      // Verify shop ownership
      if (shop.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'You can only view wallet addresses for your own shops'
        });
      }

      // Return wallet addresses
      return res.status(200).json({
        success: true,
        data: {
          shopId: shop.id,
          shopName: shop.name,
          wallets: {
            btc: shop.wallet_btc || null,
            eth: shop.wallet_eth || null,
            usdt: shop.wallet_usdt || null,
            ton: shop.wallet_ton || null
          }
        }
      });

    } catch (error) {
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {})
        });
      }

      logger.error('Get wallets error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to get wallet addresses'
      });
    }
  },

  /**
   * Update shop wallet addresses
   */
  updateWallets: async (req, res) => {
    try {
      const { shopId } = req.params;
      const {
        walletBtc,
        walletEth,
        walletUsdt,
        walletTon
      } = req.body;

      // Check if shop exists
      const existingShop = await shopQueries.findById(shopId);

      if (!existingShop) {
        return res.status(404).json({
          success: false,
          error: 'Shop not found'
        });
      }

      // Verify shop ownership
      if (existingShop.owner_id !== req.user.id) {
        return res.status(403).json({
          success: false,
          error: 'You can only update wallet addresses for your own shops'
        });
      }

      // Build update query dynamically based on provided fields
      const updates = [];
      const values = [];
      let paramCount = 1;

      if (walletBtc !== undefined) {
        updates.push(`wallet_btc = $${paramCount}`);
        values.push(walletBtc || null);
        paramCount++;
      }

      if (walletEth !== undefined) {
        updates.push(`wallet_eth = $${paramCount}`);
        values.push(walletEth || null);
        paramCount++;
      }

      if (walletUsdt !== undefined) {
        updates.push(`wallet_usdt = $${paramCount}`);
        values.push(walletUsdt || null);
        paramCount++;
      }

      if (walletTon !== undefined) {
        updates.push(`wallet_ton = $${paramCount}`);
        values.push(walletTon || null);
        paramCount++;
      }

      // If no updates provided
      if (updates.length === 0) {
        return res.status(400).json({
          success: false,
          error: 'No wallet addresses provided to update'
        });
      }

      // Add updated_at
      updates.push(`updated_at = NOW()`);

      // Add shop ID as last parameter
      values.push(shopId);

      // Execute update query
      const { query } = await import('../config/database.js');
      const result = await query(
        `UPDATE shops
         SET ${updates.join(', ')}
         WHERE id = $${paramCount}
         RETURNING id, name, wallet_btc, wallet_eth, wallet_usdt, wallet_ton, updated_at`,
        values
      );

      const updatedShop = result.rows[0];

      return res.status(200).json({
        success: true,
        data: {
          shopId: updatedShop.id,
          shopName: updatedShop.name,
          wallets: {
            btc: updatedShop.wallet_btc || null,
            eth: updatedShop.wallet_eth || null,
            usdt: updatedShop.wallet_usdt || null,
            ton: updatedShop.wallet_ton || null
          },
          updatedAt: updatedShop.updated_at
        },
        message: 'Wallet addresses updated successfully'
      });

    } catch (error) {
      if (error.code) {
        const handledError = dbErrorHandler(error);
        return res.status(handledError.statusCode).json({
          success: false,
          error: handledError.message,
          ...(handledError.details ? { details: handledError.details } : {})
        });
      }

      logger.error('Update wallets error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to update wallet addresses'
      });
    }
  }
};

export default walletController;
