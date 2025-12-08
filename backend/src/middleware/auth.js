import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { shopQueries, workerQueries, userQueries } from '../database/queries/index.js';
import { query } from '../config/database.js';
import logger from '../utils/logger.js';

/**
 * Verify JWT token middleware
 */
export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      if (process.env.NODE_ENV === 'test') {
        logger.warn('[verifyToken] Missing or malformed Authorization header in test', {
          header: authHeader || null,
          path: req.path,
        });
      }
      return res.status(401).json({
        success: false,
        error: 'No token provided. Authorization header must be in format: Bearer <token>',
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      if (process.env.NODE_ENV === 'test') {
        logger.warn('[verifyToken] Empty token after split', { header: authHeader });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid token format',
      });
    }

    // Verify token (explicit algorithm to prevent algorithm confusion attacks)
    const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });

    // SECURITY: Verify user exists in database (prevents stale JWT after DB reset)
    const userExists = await userQueries.findById(decoded.id);
    if (!userExists) {
      logger.warn('[verifyToken] User from token not found in DB', {
        tokenUserId: decoded.id,
        tokenTelegramId: decoded.telegram_id,
      });
      return res.status(401).json({
        success: false,
        error: 'User not found. Please re-authenticate.',
        code: 'USER_NOT_FOUND',
      });
    }

    // PROD GUARDRAIL: Detect language desync between client and server
    const clientLang = req.headers['accept-language']?.split(',')[0]?.substring(0, 2);
    const serverLang = userExists.language || 'ru';
    if (clientLang && clientLang !== serverLang && ['ru', 'en'].includes(clientLang)) {
      logger.info('[GUARDRAIL] Language desync detected', {
        userId: decoded.id,
        clientLang,
        serverLang,
        path: req.path,
      });
      // Attach preferred language to request for downstream handlers
      req.preferredLanguage = clientLang;
    }

    // Attach user data to request (including language for localized errors)
    req.user = {
      id: decoded.id,
      telegram_id: decoded.telegram_id,
      username: decoded.username,
      language: serverLang,
    };

    next();
  } catch (error) {
    // DEBUG: Always log JWT errors to help debug authentication issues
    logger.warn('[verifyToken] JWT verification failed', {
      errorName: error.name,
      errorMessage: error.message,
      tokenLength: req.headers.authorization?.split(' ')[1]?.length,
      secretLength: config.jwt.secret?.length,
    });

    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired',
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Authentication error',
    });
  }
};

/**
 * Optional authentication - doesn't fail if no token
 */
export const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next();
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return next();
    }

    // Verify token (explicit algorithm to prevent algorithm confusion attacks)
    const decoded = jwt.verify(token, config.jwt.secret, { algorithms: ['HS256'] });

    // SECURITY: Verify user exists in database (prevents stale JWT after DB reset)
    const userExists = await userQueries.findById(decoded.id);
    if (!userExists) {
      return next(); // For optional auth, continue without user
    }

    // Attach user data to request
    req.user = {
      id: decoded.id,
      telegram_id: decoded.telegram_id,
      username: decoded.username,
    };

    next();
  } catch (error) {
    // If token is invalid, continue without user
    next();
  }
};

/**
 * Require user to own the SPECIFIC shop from params
 * Checks req.params.id or req.params.shopId
 */
export const requireShopOwner = async (req, res, next) => {
  try {
    // Get shopId from params
    const shopId = req.params.id || req.params.shopId;

    // If no shopId in params, check that user has at least one shop (generic check)
    if (!shopId) {
      const shops = await shopQueries.findByOwnerId(req.user.id);

      if (!shops || shops.length === 0) {
        return res.status(403).json({
          success: false,
          error: 'Only shop owners can perform this action. Create a shop first.',
        });
      }

      req.userShops = shops;
      return next();
    }

    // Check if user owns THIS specific shop
    const shop = await shopQueries.findById(shopId);

    if (!shop) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found',
      });
    }

    if (shop.owner_id !== req.user.id) {
      return res.status(403).json({
        success: false,
        error: 'Only shop owner can perform this action',
      });
    }

    // Attach shop to request
    req.shop = shop;
    next();
  } catch (error) {
    logger.error('Shop ownership verification error', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Failed to verify shop ownership',
    });
  }
};

/**
 * Check if user has access to shop (owner OR worker)
 * Sets req.shopAccess for downstream handlers
 */
export const requireShopAccess = async (req, res, next) => {
  try {
    // Get shopId from params or body
    const shopId = req.params.shopId || req.params.id || req.body.shopId;

    if (!shopId) {
      return res.status(400).json({
        success: false,
        error: 'Shop ID is required',
      });
    }

    // Check if user is owner
    const shop = await shopQueries.findById(shopId);
    if (!shop) {
      return res.status(404).json({
        success: false,
        error: 'Shop not found',
      });
    }

    const isOwner = shop.owner_id === req.user.id;

    if (isOwner) {
      req.shopAccess = {
        shopId,
        accessType: 'owner',
        isOwner: true,
        isWorker: false,
      };
      return next();
    }

    // Check if user is worker
    const worker = await workerQueries.findByShopAndUser(shopId, req.user.id);
    const isWorker = !!worker;

    if (isWorker) {
      // PROD GUARDRAIL: Log worker mode access for monitoring
      logger.info('[GUARDRAIL] Worker mode access', {
        userId: req.user.id,
        shopId,
        workerId: worker.id,
        shopOwnerId: shop.owner_id,
      });

      req.shopAccess = {
        shopId,
        accessType: 'worker',
        isOwner: false,
        isWorker: true,
        workerId: worker.id,
      };
      return next();
    }

    // No access
    return res.status(403).json({
      success: false,
      error: 'You do not have access to this shop',
    });
  } catch (error) {
    logger.error('Shop access verification error', { error: error.message });
    return res.status(500).json({
      success: false,
      error: 'Failed to verify shop access',
    });
  }
};

/**
 * Authenticate middleware (alias for verifyToken)
 * Use this in routes that require authentication
 */
export const authenticate = verifyToken;

/**
 * Require admin privileges
 * Must be used AFTER authenticate middleware
 * Checks is_admin flag in database
 */
export const requireAdmin = async (req, res, next) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({
        success: false,
        error: 'Authentication required',
      });
    }

    // Check is_admin flag in database
    const result = await query(
      'SELECT is_admin FROM users WHERE id = $1',
      [req.user.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        success: false,
        error: 'User not found',
      });
    }

    if (!result.rows[0].is_admin) {
      logger.warn('[requireAdmin] Non-admin user attempted admin access', {
        userId: req.user.id,
        username: req.user.username,
        path: req.path,
      });
      return res.status(403).json({
        success: false,
        error: 'Admin privileges required',
      });
    }

    // Attach admin flag to request
    req.user.is_admin = true;
    next();
  } catch (error) {
    logger.error('[requireAdmin] Error checking admin status', {
      error: error.message,
      userId: req.user?.id,
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to verify admin privileges',
    });
  }
};

/**
 * Require shop to have active subscription (not 'inactive')
 * Blocks API access for deactivated shops
 * Must be used AFTER verifyToken and requireShopOwner/requireShopAccess
 *
 * CRITICAL: This prevents sellers from managing products/settings
 * when subscription has expired and grace period ended
 */
export const requireActiveShop = async (req, res, next) => {
  try {
    // Shop already attached by requireShopOwner or requireShopAccess
    let shop = req.shop;

    // If not attached, try to get shopId from explicit sources
    // NOTE: Do NOT use req.params.id as fallback - it may be productId, orderId, etc.
    // Only use explicit shopId params to avoid confusion
    if (!shop) {
      const shopId = req.params.shopId || req.body.shopId;

      if (!shopId) {
        // No explicit shop context - let handler decide (it may load shop from product/order)
        return next();
      }

      shop = await shopQueries.findById(shopId);

      if (!shop) {
        return res.status(404).json({
          success: false,
          error: 'Shop not found',
        });
      }
    }

    // Check if shop is deactivated (subscription_status = 'inactive')
    const status = shop.subscription_status;

    if (status === 'inactive') {
      logger.warn('[requireActiveShop] Blocked access to inactive shop', {
        shopId: shop.id,
        shopName: shop.name,
        userId: req.user?.id,
        path: req.path,
        method: req.method,
      });

      return res.status(402).json({
        success: false,
        error: 'SUBSCRIPTION_INACTIVE',
        message: 'Your subscription has expired. Please renew to continue managing your shop.',
        code: 'SHOP_INACTIVE',
        renewUrl: '/api/payments/subscription/crystalpay',
      });
    }

    // Attach shop to request if not already
    if (!req.shop) {
      req.shop = shop;
    }

    next();
  } catch (error) {
    logger.error('[requireActiveShop] Error checking shop status', {
      error: error.message,
      userId: req.user?.id,
      path: req.path,
    });
    return res.status(500).json({
      success: false,
      error: 'Failed to verify shop status',
    });
  }
};

export default {
  verifyToken,
  authenticate,
  optionalAuth,
  requireShopOwner,
  requireShopAccess,
  requireAdmin,
  requireActiveShop,
};
