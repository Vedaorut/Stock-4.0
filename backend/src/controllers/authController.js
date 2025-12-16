import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { userQueries, refreshTokenQueries } from '../database/queries/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { NotFoundError, UnauthenticatedError, ValidationError } from '../utils/errors.js';
import telegramService from '../services/telegram.js';
import logger from '../utils/logger.js';

/**
 * Generate a cryptographically secure refresh token
 * @returns {string} Random 32-byte hex string
 */
const generateRefreshToken = () => crypto.randomBytes(32).toString('hex');

/**
 * Hash a refresh token for storage
 * @param {string} token - Plain refresh token
 * @returns {string} SHA-256 hash
 */
const hashRefreshToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

/**
 * Authentication Controller
 */
export const authController = {
  /**
   * Login or register user via Telegram Web App
   */
  login: asyncHandler(async (req, res) => {
    try {
      const { telegramId, initData } = req.body;

      // Verify Telegram init data
      const isValid = telegramService.verifyInitData(initData);

      if (!isValid) {
        throw new UnauthenticatedError('Invalid Telegram authentication data');
      }

      // Parse user data from init data
      const userData = telegramService.parseInitData(initData);

      // SECURITY FIX: Verify that body telegramId matches verified initData user.id
      // This prevents telegramId spoofing attacks
      if (telegramId && String(telegramId) !== String(userData.id)) {
        logger.warn('Security: Telegram ID mismatch attempt', {
          bodyTelegramId: telegramId,
          verifiedTelegramId: userData.id,
          ip: req.ip,
        });
        throw new UnauthenticatedError('Telegram ID mismatch');
      }

      // Use ONLY the verified telegramId from initData
      const verifiedTelegramId = userData.id;

      // Check if user exists
      let user = await userQueries.findByTelegramId(verifiedTelegramId);

      if (!user) {
        // Create new user
        user = await userQueries.create({
          telegramId: userData.id,
          username: userData.username,
          firstName: userData.firstName,
          lastName: userData.lastName,
        });
      }

      // Generate JWT access token
      const token = jwt.sign(
        {
          id: user.id,
          telegram_id: user.telegram_id,
          username: user.username,
          jti: crypto.randomBytes(16).toString('hex'),
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn, algorithm: 'HS256' }
      );

      // Generate refresh token
      const refreshToken = generateRefreshToken();
      const refreshTokenHash = hashRefreshToken(refreshToken);
      await refreshTokenQueries.create(user.id, refreshTokenHash);

      return res.status(200).json({
        success: true,
        data: {
          token,
          refreshToken,
          user: {
            id: user.id,
            telegram_id: user.telegram_id,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            selected_role: user.selected_role,
            language: user.language || null, // FIX: Don't default to 'ru' - let bot show language selection
            is_admin: user.is_admin || false,
            created_at: user.created_at,
          },
        },
      });
    } catch (error) {
      logger.error('Login error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Register or login user (for Telegram Bot)
   * If user exists, returns token (login)
   * If user doesn't exist, creates and returns token (register)
   * 
   * SECURITY: Requires x-telegram-init-data header for verification
   * User data is extracted from verified initData, NOT from request body
   */
  register: asyncHandler(async (req, res) => {
    try {
      // SECURITY FIX: Require and verify Telegram initData
      const initData = req.headers['x-telegram-init-data'];
      
      if (!initData) {
        logger.warn('Security: Register attempt without initData', {
          ip: req.ip,
          bodyTelegramId: req.body.telegramId,
        });
        throw new UnauthenticatedError('Telegram authentication required');
      }

      // Verify the initData signature
      const isValid = telegramService.verifyInitData(initData);
      if (!isValid) {
        logger.warn('Security: Register attempt with invalid initData', {
          ip: req.ip,
        });
        throw new UnauthenticatedError('Invalid Telegram authentication data');
      }

      // Parse and use ONLY verified user data from initData
      const userData = telegramService.parseInitData(initData);
      const telegramId = userData.id;
      const username = userData.username;
      const firstName = userData.firstName;
      const lastName = userData.lastName;

      // Check if user already exists
      let user = await userQueries.findByTelegramId(telegramId);
      let isNewUser = false;

      if (!user) {
        // Create new user only if doesn't exist
        user = await userQueries.create({
          telegramId,
          username,
          firstName,
          lastName,
        });
        isNewUser = true;
        logger.info(`New user registered: ${telegramId} (@${username})`);
      } else {
        logger.info(`Existing user logged in: ${telegramId} (@${username})`);
      }

      // Generate JWT access token
      const token = jwt.sign(
        {
          id: user.id,
          telegram_id: Number(user.telegram_id),
          username: user.username,
          jti: crypto.randomBytes(16).toString('hex'),
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn, algorithm: 'HS256' }
      );

      // Generate refresh token
      const refreshToken = generateRefreshToken();
      const refreshTokenHash = hashRefreshToken(refreshToken);
      await refreshTokenQueries.create(user.id, refreshTokenHash);

      return res.status(isNewUser ? 201 : 200).json({
        token,
        refreshToken,
        user: {
          id: user.id,
          telegram_id: Number(user.telegram_id),
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          selected_role: user.selected_role,
          language: user.language || null,
          is_admin: user.is_admin || false,
          created_at: user.created_at,
        },
      });
    } catch (error) {
      logger.error('Register error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Get current user profile
   */
  getProfile: asyncHandler(async (req, res) => {
    try {
      const user = await userQueries.findById(req.user.id);

      if (!user) {
        throw new NotFoundError('User');
      }

      logger.info(`[Profile] userId=${user.id} telegramId=${user.telegram_id} lang=${user.language}`);

      return res.status(200).json({
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          selected_role: user.selected_role,
          language: user.language || null,
          is_admin: user.is_admin || false,
          created_at: user.created_at,
          updated_at: user.updated_at,
        },
      });
    } catch (error) {
      logger.error('Get profile error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Update user profile
   */
  updateProfile: asyncHandler(async (req, res) => {
    try {
      const { username, firstName, lastName } = req.body;

      const user = await userQueries.update(req.user.id, {
        username,
        firstName,
        lastName,
      });

      if (!user) {
        throw new NotFoundError('User');
      }

      return res.status(200).json({
        success: true,
        data: {
          id: user.id,
          telegram_id: user.telegram_id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          selected_role: user.selected_role,
          updated_at: user.updated_at,
        },
      });
    } catch (error) {
      logger.error('Update profile error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Update user's selected role
   */
  updateRole: asyncHandler(async (req, res) => {
    try {
      const { role } = req.body;

      logger.info(`User ${req.user.id} updating role to: ${role}`);

      const user = await userQueries.updateRole(req.user.id, role);

      if (!user) {
        throw new NotFoundError('User');
      }

      return res.status(200).json({
        user: {
          selected_role: user.selected_role,
        },
      });
    } catch (error) {
      logger.error('Update role error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Validate Telegram initData and return JWT token
   * Simplified endpoint for WebApp auto-authentication
   */
  validateTelegramInitData: asyncHandler(async (req, res) => {
    try {
      const { initData } = req.body;

      if (!initData) {
        throw new ValidationError('initData is required');
      }

      // Verify Telegram init data
      const isValid = telegramService.verifyInitData(initData);

      if (!isValid) {
        logger.warn('Invalid Telegram initData validation attempt');
        throw new UnauthenticatedError('Invalid Telegram authentication data');
      }

      // Parse user data from init data
      const userData = telegramService.parseInitData(initData);

      // Check if user exists
      let user = await userQueries.findByTelegramId(userData.id);

      if (!user) {
        // Create new user
        user = await userQueries.create({
          telegramId: userData.id,
          username: userData.username,
          firstName: userData.firstName,
          lastName: userData.lastName,
        });
        logger.info(`New user auto-registered via WebApp: ${userData.id} (@${userData.username})`);
      } else {
        logger.info(`User authenticated via WebApp: ${userData.id} (@${userData.username})`);
      }

      // Generate JWT access token
      const token = jwt.sign(
        {
          id: user.id,
          telegram_id: Number(user.telegram_id),
          username: user.username,
          jti: crypto.randomBytes(16).toString('hex'),
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn, algorithm: 'HS256' }
      );

      // Generate refresh token
      const refreshToken = generateRefreshToken();
      const refreshTokenHash = hashRefreshToken(refreshToken);
      await refreshTokenQueries.create(user.id, refreshTokenHash);

      return res.status(200).json({
        success: true,
        data: {
          token,
          refreshToken,
          user: {
            id: user.id,
            telegram_id: Number(user.telegram_id),
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            selected_role: user.selected_role,
            language: user.language || null, // FIX: Don't default to 'ru' - let bot show language selection
            created_at: user.created_at,
          },
        },
      });
    } catch (error) {
      logger.error('Telegram initData validation error', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }),


  /**
   * Telegram WebApp authentication via middleware
   * SECURE: Uses verifyTelegramInitData middleware with timing-safe comparison
   * IMPORTANT: initData must be sent in x-telegram-init-data header
   * This is the RECOMMENDED method for WebApp authentication
   */
  telegramValidate: asyncHandler(async (req, res) => {
    try {
      // req.telegramUser is populated by verifyTelegramInitData middleware
      const telegramUser = req.telegramUser;

      if (!telegramUser || !telegramUser.id) {
        throw new UnauthenticatedError('Telegram user data not found');
      }

      // Check if user exists
      let user = await userQueries.findByTelegramId(telegramUser.id);
      let isNewUser = false;

      if (!user) {
        // Create new user
        user = await userQueries.create({
          telegramId: telegramUser.id,
          username: telegramUser.username || null,
          firstName: telegramUser.first_name || null,
          lastName: telegramUser.last_name || null,
        });
        isNewUser = true;
        logger.info(
          `New user created via Telegram validation: ${telegramUser.id} (@${telegramUser.username})`
        );
      } else {
        // Update user info if changed
        const needsUpdate =
          user.username !== telegramUser.username ||
          user.first_name !== telegramUser.first_name ||
          user.last_name !== telegramUser.last_name;

        if (needsUpdate) {
          user = await userQueries.update(user.id, {
            username: telegramUser.username || user.username,
            firstName: telegramUser.first_name || user.first_name,
            lastName: telegramUser.last_name || user.last_name,
          });
          logger.info(`User info updated via Telegram validation: ${telegramUser.id}`);
        } else {
          logger.info(
            `Existing user logged in via Telegram validation: ${telegramUser.id} (@${telegramUser.username})`
          );
        }
      }

      // Generate JWT access token
      const token = jwt.sign(
        {
          id: user.id,
          telegram_id: Number(user.telegram_id),
          username: user.username,
          jti: crypto.randomBytes(16).toString('hex'),
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn, algorithm: 'HS256' }
      );

      // Generate refresh token
      const refreshToken = generateRefreshToken();
      const refreshTokenHash = hashRefreshToken(refreshToken);
      await refreshTokenQueries.create(user.id, refreshTokenHash);

      return res.status(isNewUser ? 201 : 200).json({
        success: true,
        token,
        refreshToken,
        user: {
          id: user.id,
          telegram_id: Number(user.telegram_id),
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          selected_role: user.selected_role,
          language: user.language || null,
          created_at: user.created_at,
        },
      });
    } catch (error) {
      logger.error('Telegram validate error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Refresh access token using refresh token
   * Implements token rotation: old token is revoked, new one is issued
   * @route POST /api/auth/refresh
   */
  refreshToken: asyncHandler(async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (!refreshToken) {
        throw new ValidationError('Refresh token is required');
      }

      // Hash the provided token for lookup
      const tokenHash = hashRefreshToken(refreshToken);

      // Find valid token in database
      const tokenRecord = await refreshTokenQueries.findValidByHash(tokenHash);

      if (!tokenRecord) {
        logger.warn('Invalid or expired refresh token attempt');
        throw new UnauthenticatedError('Invalid or expired refresh token');
      }

      // Get full user data
      const user = await userQueries.findById(tokenRecord.user_id);

      if (!user) {
        // User was deleted but token still exists - revoke it
        await refreshTokenQueries.revoke(tokenHash);
        throw new UnauthenticatedError('User not found');
      }

      // BUG-AUTH-001 FIX: Token rotation - revoke old token BEFORE issuing new one
      // This prevents stolen tokens from being used after legitimate refresh
      await refreshTokenQueries.revoke(tokenHash);

      // Generate new access token
      const newAccessToken = jwt.sign(
        {
          id: user.id,
          telegram_id: Number(user.telegram_id),
          username: user.username,
          jti: crypto.randomBytes(16).toString('hex'),
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn, algorithm: 'HS256' }
      );

      // BUG-AUTH-001 FIX: Issue new refresh token (rotation)
      const newRefreshToken = generateRefreshToken();
      const newRefreshTokenHash = hashRefreshToken(newRefreshToken);
      await refreshTokenQueries.create(user.id, newRefreshTokenHash);

      logger.info(`Token refreshed with rotation for user: ${user.telegram_id}`);

      return res.status(200).json({
        success: true,
        data: {
          token: newAccessToken,
          refreshToken: newRefreshToken,
        },
      });
    } catch (error) {
      logger.error('Refresh token error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),


  /**
   * Logout - revoke refresh token
   * @route POST /api/auth/logout
   */
  logout: asyncHandler(async (req, res) => {
    try {
      const { refreshToken } = req.body;

      if (refreshToken) {
        const tokenHash = hashRefreshToken(refreshToken);
        await refreshTokenQueries.revoke(tokenHash);
        logger.info(`Refresh token revoked for user: ${req.user?.id}`);
      }

      return res.status(200).json({
        success: true,
        message: 'Logged out successfully',
      });
    } catch (error) {
      logger.error('Logout error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),
};

export default authController;
