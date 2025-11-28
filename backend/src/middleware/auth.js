import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { shopQueries, workerQueries } from '../database/queries/index.js';
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

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Attach user data to request
    req.user = {
      id: decoded.id,
      telegram_id: decoded.telegram_id,
      username: decoded.username,
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      if (process.env.NODE_ENV === 'test') {
        logger.warn('[verifyToken] Invalid JWT', { error: error.message });
      }
      return res.status(401).json({
        success: false,
        error: 'Invalid token',
      });
    }

    if (error.name === 'TokenExpiredError') {
      if (process.env.NODE_ENV === 'test') {
        logger.warn('[verifyToken] Expired JWT', { error: error.message });
      }
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

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret);

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
      req.shopAccess = {
        shopId,
        accessType: 'worker',
        isOwner: false,
        isWorker: true,
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

export default {
  verifyToken,
  optionalAuth,
  requireShopOwner,
  requireShopAccess,
};
