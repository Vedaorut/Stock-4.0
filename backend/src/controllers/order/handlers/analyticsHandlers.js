import { asyncHandler } from '../../../middleware/errorHandler.js';
import { getOrderAnalytics } from '../../../services/orderService.js';
import { validateDateRange } from '../validators/payloadValidators.js';

/**
 * Get sales analytics for seller
 */
export const getAnalytics = asyncHandler(async (req, res) => {
  const { from, to } = req.query;
  const userId = req.user.id;

  const { fromDate, toDate } = validateDateRange(from, to);

  const analytics = await getOrderAnalytics(userId, fromDate, toDate);

  return res.json({
    success: true,
    data: {
      period: { from, to },
      ...analytics,
    },
  });
});
