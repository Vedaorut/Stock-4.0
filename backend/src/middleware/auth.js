import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { shopQueries } from '../models/db.js';
import logger from '../utils/logger.js';

/**
 * Verify JWT token middleware
 */
export const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        error: 'No token provided. Authorization header must be in format: Bearer <token>'
      });
    }

    const token = authHeader.split(' ')[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        error: 'Invalid token format'
      });
    }

    // Verify token
    const decoded = jwt.verify(token, config.jwt.secret);

    // Attach user data to request
    req.user = {
      id: decoded.id,
      telegramId: decoded.telegramId,
      username: decoded.username
    };

    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        error: 'Invalid token'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        error: 'Token expired'
      });
    }

    return res.status(500).json({
      success: false,
      error: 'Authentication error'
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
      telegramId: decoded.telegramId,
      username: decoded.username
    };

    next();
  } catch (error) {
    // If token is invalid, continue without user
    next();
  }
};

/**
 * Require user to own at least one shop
 * A user becomes a seller by creating a shop
 */
export const requireShopOwner = async (req, res, next) => {
  try {
    const shops = await shopQueries.findBySellerId(req.user.id);

    if (!shops || shops.length === 0) {
      return res.status(403).json({
        success: false,
        error: 'Only shop owners can perform this action. Create a shop first.'
      });
    }

    // Attach shops to request for later use
    req.userShops = shops;
    next();
  } catch (error) {
    logger.error('Shop ownership verification error', { error: error.message, stack: error.stack });
    return res.status(500).json({
      success: false,
      error: 'Failed to verify shop ownership'
    });
  }
};

export default {
  verifyToken,
  optionalAuth,
  requireShopOwner
};
