import express from 'express';
import { authController } from '../controllers/authController.js';
import { authValidation } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';
import { authLimiter } from '../middleware/rateLimiter.js';
import { verifyTelegramInitData } from '../middleware/telegramAuth.js';

const router = express.Router();

// Apply auth rate limiter to all routes in this router
router.use(authLimiter);

/**
 * @route   POST /api/auth/login
 * @desc    Login or register via Telegram Web App
 * @access  Public
 */
router.post('/login', authValidation.login, authController.login);

/**
 * @route   POST /api/auth/register
 * @desc    Register new user with specific role
 * @access  Public
 */
router.post('/register', authValidation.register, authController.register);

/**
 * @route   GET /api/auth/profile
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/profile', verifyToken, authController.getProfile);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
router.put('/profile', verifyToken, authController.updateProfile);

/**
 * @route   PATCH /api/auth/role
 * @desc    Update user's selected role
 * @access  Private
 */
router.patch('/role', verifyToken, authValidation.updateRole, authController.updateRole);

/**
 * @route   POST /api/auth/telegram-validate
 * @desc    Validate Telegram WebApp initData and auto-register/login user
 * @access  Public (but requires valid Telegram initData in x-telegram-init-data header)
 * @security HMAC-SHA256 signature verification with timing-safe comparison
 * @important initData must be sent in x-telegram-init-data header (NOT body)
 */
router.post('/telegram-validate', verifyTelegramInitData, authController.telegramValidate);

/**
 * @route   POST /api/auth/refresh
 * @desc    Refresh access token using refresh token
 * @access  Public (requires valid refresh token in body)
 */
router.post('/refresh', authController.refreshToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout and revoke refresh token
 * @access  Public (optionally authenticated)
 */
router.post('/logout', authController.logout);

export default router;
