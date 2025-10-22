import express from 'express';
import { walletController } from '../controllers/walletController.js';
import { walletValidation } from '../middleware/validation.js';
import { verifyToken, requireShopOwner } from '../middleware/auth.js';

const router = express.Router();

/**
 * @route   GET /api/wallets/:shopId
 * @desc    Get shop wallet addresses
 * @access  Private (Shop owner only)
 */
router.get(
  '/:shopId',
  verifyToken,
  requireShopOwner,
  walletValidation.getWallets,
  walletController.getWallets
);

/**
 * @route   PUT /api/wallets/:shopId
 * @desc    Update shop wallet addresses
 * @access  Private (Shop owner only)
 */
router.put(
  '/:shopId',
  verifyToken,
  requireShopOwner,
  walletValidation.updateWallets,
  walletController.updateWallets
);

/**
 * @route   PATCH /api/wallets/:shopId
 * @desc    Update shop wallet addresses (alias for PUT)
 * @access  Private (Shop owner only)
 */
router.patch(
  '/:shopId',
  verifyToken,
  requireShopOwner,
  walletValidation.updateWallets,
  walletController.updateWallets
);

export default router;
