import jwt from 'jsonwebtoken';
import { config } from '../config/env.js';
import { userQueries } from '../models/db.js';
import telegramService from '../services/telegram.js';
import logger from '../utils/logger.js';

/**
 * Authentication Controller
 */
export const authController = {
  /**
   * Login or register user via Telegram Web App
   */
  login: async (req, res) => {
    try {
      const { telegramId, initData } = req.body;

      // Verify Telegram init data
      const isValid = telegramService.verifyInitData(initData);

      if (!isValid) {
        return res.status(401).json({
          success: false,
          error: 'Invalid Telegram authentication data'
        });
      }

      // Parse user data from init data
      const userData = telegramService.parseInitData(initData);

      // Check if user exists
      let user = await userQueries.findByTelegramId(telegramId);

      if (!user) {
        // Create new user
        user = await userQueries.create({
          telegramId: userData.id,
          username: userData.username,
          firstName: userData.firstName,
          lastName: userData.lastName
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        {
          id: user.id,
          telegramId: user.telegram_id,
          username: user.username
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
            telegramId: user.telegram_id,
            username: user.username,
            firstName: user.first_name,
            lastName: user.last_name,
            createdAt: user.created_at
          }
        }
      });

    } catch (error) {
      logger.error('Login error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Login failed'
      });
    }
  },

  /**
   * Register or login user (for Telegram Bot)
   * If user exists, returns token (login)
   * If user doesn't exist, creates and returns token (register)
   */
  register: async (req, res) => {
    try {
      const { telegramId, username, firstName, lastName } = req.body;

      // Check if user already exists
      let user = await userQueries.findByTelegramId(telegramId);
      let isNewUser = false;

      if (!user) {
        // Create new user only if doesn't exist
        user = await userQueries.create({
          telegramId,
          username,
          firstName,
          lastName
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
          username: user.username
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
          selected_role: user.selected_role,  // ✅ Добавлено для восстановления роли
          created_at: user.created_at
        }
      });

    } catch (error) {
      logger.error('Register error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Registration failed'
      });
    }
  },

  /**
   * Get current user profile
   */
  getProfile: async (req, res) => {
    try {
      const user = await userQueries.findById(req.user.id);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
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
          updated_at: user.updated_at
        }
      });

    } catch (error) {
      logger.error('Get profile error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to get profile'
      });
    }
  },

  /**
   * Update user profile
   */
  updateProfile: async (req, res) => {
    try {
      const { username, firstName, lastName } = req.body;

      const user = await userQueries.update(req.user.id, {
        username,
        firstName,
        lastName
      });

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      return res.status(200).json({
        success: true,
        data: {
          id: user.id,
          telegramId: user.telegram_id,
          username: user.username,
          firstName: user.first_name,
          lastName: user.last_name,
          updatedAt: user.updated_at
        }
      });

    } catch (error) {
      logger.error('Update profile error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to update profile'
      });
    }
  },

  /**
   * Update user's selected role
   */
  updateRole: async (req, res) => {
    try {
      const { role } = req.body;

      logger.info(`User ${req.user.id} updating role to: ${role}`);

      const user = await userQueries.updateRole(req.user.id, role);

      if (!user) {
        return res.status(404).json({
          success: false,
          error: 'User not found'
        });
      }

      return res.status(200).json({
        user: {
          selected_role: user.selected_role
        }
      });

    } catch (error) {
      logger.error('Update role error', { error: error.message, stack: error.stack });
      return res.status(500).json({
        success: false,
        error: 'Failed to update role'
      });
    }
  }
};

export default authController;
