import express from 'express';
import { authController } from '../controllers/authController.js';
import { authValidation } from '../middleware/validation.js';
import { verifyToken } from '../middleware/auth.js';

const router = express.Router();

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

export default router;
