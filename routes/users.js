const express = require('express');
const {
  getUsers,
  getUserById,
  getUserStatus,
  updateUserStatus,
  uploadProfilePicture,
  updateProfile,
  blockUser,
  unblockUser,
  getBlockedUsers,
  searchUsers,
  getUserActivity,
} = require('../controllers/user-controller');
const { protect } = require('../middleware/auth');
const { uploadSingle, handleUploadErrors } = require('../middleware/upload');
const { check } = require('express-validator');

const usersRoute = express.Router();

/**
 * @route   GET /api/users
 * @desc    Get all users with pagination and filtering
 * @access  Private
 */
usersRoute.get('/', protect, getUsers);

/**
 * @route   GET /api/users/search
 * @desc    Search users
 * @access  Private
 */
usersRoute.get('/search', protect, searchUsers);

/**
 * @route   GET /api/users/blocked
 * @desc    Get list of blocked users
 * @access  Private
 */
usersRoute.get('/blocked', protect, getBlockedUsers);

/**
 * @route   GET /api/users/activity
 * @desc    Get user's activity
 * @access  Private
 */
usersRoute.get('/activity', protect, getUserActivity);

/**
 * @route   PUT /api/users/status
 * @desc    Update user's status
 * @access  Private
 */
usersRoute.put(
  '/status',
  [
    protect,
    check('status', 'Status must be online, offline, or away').isIn([
      'online',
      'offline',
      'away',
    ]),
  ],
  updateUserStatus,
);

/**
 * @route   PUT /api/users/profile
 * @desc    Update user profile
 * @access  Private
 */
usersRoute.put(
  '/profile',
  [
    protect,
    check('username', 'Username must be between 3 and 20 characters')
      .optional()
      .isLength({ min: 3, max: 20 }),
    check('bio', 'Bio cannot exceed 200 characters')
      .optional()
      .isLength({ max: 200 }),
  ],
  updateProfile,
);

/**
 * @route   POST /api/users/profile-picture
 * @desc    Upload profile picture
 * @access  Private
 */
usersRoute.post(
  '/profile-picture',
  protect,
  uploadSingle('image'), // 'image' is the field name in the form data
  handleUploadErrors,
  uploadProfilePicture,
);

/**
 * @route   GET /api/users/:id
 * @desc    Get user by ID
 * @access  Private
 */
usersRoute.get('/:id', protect, getUserById);

/**
 * @route   GET /api/users/:id/status
 * @desc    Get user's status
 * @access  Private
 */
usersRoute.get('/:id/status', protect, getUserStatus);

/**
 * @route   POST /api/users/block/:id
 * @desc    Block a user
 * @access  Private
 */
usersRoute.post('/block/:id', protect, blockUser);

/**
 * @route   DELETE /api/users/block/:id
 * @desc    Unblock a user
 * @access  Private
 */
usersRoute.delete('/block/:id', protect, unblockUser);

module.exports = {usersRoute};
