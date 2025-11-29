import express from 'express';
import * as followController from '../controllers/shopFollowController.js';
import { verifyToken } from '../middleware/auth.js';
import { optionalTelegramAuth } from '../middleware/telegramAuth.js';
import { requireFollowOwner } from '../middleware/authorization.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);
router.use(optionalTelegramAuth);

// Get all follows for a shop (alias supports /shop-follows?shop_id=...)
router.get('/', (req, res, next) => {
  if (req.query.shop_id && !req.query.shopId) {
    req.query.shopId = req.query.shop_id;
  }
  return followController.getMyFollows(req, res, next);
});

router.get('/my', followController.getMyFollows);

// Get follow detail
// Check follow limit
router.get('/check-limit', followController.checkFollowLimit);

// Create new follow
router.post('/', followController.createFollow);

// Follow detail and products
router.get('/:id', followController.getFollowDetail);
router.get('/:id/products', followController.getFollowProducts);

// P0-PERF-1: Get sync status for background product sync
router.get('/:id/sync-status', followController.getFollowSyncStatus);

// Per-product markup (custom markup for individual products)
router.put('/:id/products/:productId/markup', requireFollowOwner, followController.updateProductMarkup);
router.delete('/:id/products/:productId/markup', requireFollowOwner, followController.resetProductMarkup);

// Update follow markup (requires ownership)
router.put('/:id/markup', requireFollowOwner, followController.updateFollowMarkup);

// Switch follow mode (requires ownership)
router.put('/:id/mode', requireFollowOwner, followController.switchFollowMode);

// Delete follow (requires ownership)
router.delete('/:id', requireFollowOwner, followController.deleteFollow);

export default router;
