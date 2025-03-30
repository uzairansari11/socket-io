const express = require('express');
const {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteReadNotifications,
} = require('../controllers/notification-controller');
const { protect } = require('../middleware/auth');

const notificationRoute = express.Router();

/**
 * @route   GET /api/notifications
 * @desc    Get all notifications for a user
 * @access  Private
 */
notificationRoute.get('/', protect, getNotifications);

/**
 * @route   PUT /api/notifications/:id/read
 * @desc    Mark notification as read
 * @access  Private
 */
notificationRoute.put('/:id/read', protect, markAsRead);

/**
 * @route   PUT /api/notifications/read-all
 * @desc    Mark all notifications as read
 * @access  Private
 */
notificationRoute.put('/read-all', protect, markAllAsRead);

/**
 * @route   DELETE /api/notifications/:id
 * @desc    Delete a notification
 * @access  Private
 */
notificationRoute.delete('/:id', protect, deleteNotification);

/**
 * @route   DELETE /api/notifications/read
 * @desc    Delete all read notifications
 * @access  Private
 */
notificationRoute.delete('/read', protect, deleteReadNotifications);

module.exports = {notificationRoute};
