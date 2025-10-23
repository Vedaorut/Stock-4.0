import express from 'express';
import * as followController from '../controllers/shopFollowController.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

// All routes require authentication
router.use(verifyToken);

// Get all follows for a shop
router.get('/my', followController.getMyFollows);

// Check follow limit
router.get('/check-limit', followController.checkFollowLimit);

// Create new follow
router.post('/', followController.createFollow);

// Update follow markup
router.put('/:id/markup', followController.updateFollowMarkup);

// Switch follow mode
router.put('/:id/mode', followController.switchFollowMode);

// Delete follow
router.delete('/:id', followController.deleteFollow);

export default router;
