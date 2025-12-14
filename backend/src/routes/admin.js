/**
 * Admin Routes
 *
 * Protected routes for admin-only operations
 */

import { Router } from 'express';
import { authenticate, requireAdmin } from '../middleware/auth.js';
import {
  getNeedsReviewPayments,
  approvePayment,
  rejectPayment,
} from '../controllers/admin/paymentReviewController.js';
import { getStats } from '../controllers/admin/statsController.js';

const router = Router();

// All admin routes require authentication and admin role
router.use(authenticate);
router.use(requireAdmin);

// Stats endpoint
router.get('/stats', getStats);

// Payment review endpoints
router.get('/payments/needs-review', getNeedsReviewPayments);
router.post('/payments/:paymentId/approve', approvePayment);
router.post('/payments/:paymentId/reject', rejectPayment);

export default router;
