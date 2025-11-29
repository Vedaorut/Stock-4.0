import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { config } from '../config/env.js';
import { userQueries } from '../database/queries/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { NotFoundError, UnauthenticatedError, ValidationError } from '../utils/errors.js';
import telegramService from '../services/telegram.js';
import logger from '../utils/logger.js';

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

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          telegram_id: user.telegram_id,
          username: user.username,
          jti: crypto.randomBytes(16).toString('hex'),
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      return res.status(200).json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            telegram_id: user.telegram_id,
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            selected_role: user.selected_role,
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

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          telegram_id: Number(user.telegram_id),
          username: user.username,
          jti: crypto.randomBytes(16).toString('hex'),
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      return res.status(isNewUser ? 201 : 200).json({
        token,
        user: {
          id: user.id,
          telegram_id: Number(user.telegram_id),
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          selected_role: user.selected_role,
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

      return res.status(200).json({
        user: {
          id: user.id,
          telegram_id: user.telegram_id,
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          selected_role: user.selected_role,
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

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          telegram_id: Number(user.telegram_id),
          username: user.username,
          jti: crypto.randomBytes(16).toString('hex'),
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      return res.status(200).json({
        success: true,
        data: {
          token,
          user: {
            id: user.id,
            telegram_id: Number(user.telegram_id),
            username: user.username,
            first_name: user.first_name,
            last_name: user.last_name,
            selected_role: user.selected_role,
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

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          telegram_id: Number(user.telegram_id),
          username: user.username,
          jti: crypto.randomBytes(16).toString('hex'),
        },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      return res.status(isNewUser ? 201 : 200).json({
        success: true,
        token,
        user: {
          id: user.id,
          telegram_id: Number(user.telegram_id),
          username: user.username,
          first_name: user.first_name,
          last_name: user.last_name,
          selected_role: user.selected_role,
          created_at: user.created_at,
        },
      });
    } catch (error) {
      logger.error('Telegram validate error', { error: error.message, stack: error.stack });
      throw error;
    }
  }),
};

export default authController;
