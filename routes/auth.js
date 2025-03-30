const express = require('express');
const { check } = require('express-validator');
const {
  register,
  login,
  getMe,
  updateProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  verifyEmail,
  refreshToken,
  logout,
} = require('../controllers/auth-controller');
const { protect } = require('../middleware/auth');

const authRoute = express.Router();

/**
 * @route   POST /api/auth/register
 * @desc    Register a new user
 * @access  Public
 */
authRoute.post(
  '/register',
  [
    // Validation middleware using express-validator
    check('username', 'Username is required')
      .not()
      .isEmpty()
      .isLength({ min: 3, max: 20 })
      .withMessage('Username must be between 3 and 20 characters'),
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password must be at least 6 characters').isLength({
      min: 6,
    }),
  ],
  register,
);

/**
 * @route   POST /api/auth/login
 * @desc    Login user and get token
 * @access  Public
 */
authRoute.post(
  '/login',
  [
    // Validation middleware
    check('email', 'Please include a valid email').isEmail(),
    check('password', 'Password is required').exists(),
  ],
  login,
);

/**
 * @route   GET /api/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
authRoute.get('/me', protect, getMe);

/**
 * @route   PUT /api/auth/profile
 * @desc    Update user profile
 * @access  Private
 */
authRoute.put(
  '/profile',
  [
    protect,
    // Validation middleware
    check('username')
      .optional()
      .isLength({ min: 3, max: 20 })
      .withMessage('Username must be between 3 and 20 characters'),
    check('bio')
      .optional()
      .isLength({ max: 200 })
      .withMessage('Bio cannot exceed 200 characters'),
  ],
  updateProfile,
);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Change user password
 * @access  Private
 */
authRoute.put(
  '/change-password',
  [
    protect,
    // Validation middleware
    check('currentPassword', 'Current password is required').exists(),
    check('newPassword', 'New password must be at least 6 characters').isLength(
      { min: 6 },
    ),
  ],
  changePassword,
);

/**
 * @route   POST /api/auth/forgot-password
 * @desc    Request password reset email
 * @access  Public
 */
authRoute.post(
  '/forgot-password',
  [check('email', 'Please include a valid email').isEmail()],
  forgotPassword,
);

/**
 * @route   POST /api/auth/reset-password/:resetToken
 * @desc    Reset password using token
 * @access  Public
 */
authRoute.post(
  '/reset-password/:resetToken',
  [
    check('password', 'Password must be at least 6 characters').isLength({
      min: 6,
    }),
  ],
  resetPassword,
);

/**
 * @route   GET /api/auth/verify-email/:verificationToken
 * @desc    Verify user email
 * @access  Public
 */
authRoute.get('/verify-email/:verificationToken', verifyEmail);

/**
 * @route   POST /api/auth/refresh-token
 * @desc    Refresh authentication token
 * @access  Public
 */
authRoute.post('/refresh-token', refreshToken);

/**
 * @route   POST /api/auth/logout
 * @desc    Logout user and invalidate token
 * @access  Private
 */
authRoute.post('/logout', protect, logout);

module.exports = {authRoute};
