const express = require('express');
const {
  getMessageById,
  updateMessage,
  deleteMessage,
  markMessageAsRead,
  markAllMessagesAsRead,
  getReadReceipts,
} = require('../controllers/message-controller');
const { protect } = require('../middleware/auth');

const messageRoute = express.Router();

/**
 * @route   GET /api/messages/:id
 * @desc    Get a message by ID
 * @access  Private
 */
messageRoute.get('/:id', protect, getMessageById);

/**
 * @route   PUT /api/messages/:id
 * @desc    Update a message
 * @access  Private
 */
messageRoute.put('/:id', protect, updateMessage);

/**
 * @route   DELETE /api/messages/:id
 * @desc    Delete a message
 * @access  Private
 */
messageRoute.delete('/:id', protect, deleteMessage);

/**
 * @route   PUT /api/messages/:id/read
 * @desc    Mark a message as read
 * @access  Private
 */
messageRoute.put('/:id/read', protect, markMessageAsRead);

/**
 * @route   PUT /api/messages/read-all
 * @desc    Mark all messages in a chat as read
 * @access  Private
 */
messageRoute.put('/read-all', protect, markAllMessagesAsRead);

/**
 * @route   GET /api/messages/:id/read-receipts
 * @desc    Get read receipts for a message
 * @access  Private
 */
messageRoute.get('/:id/read-receipts', protect, getReadReceipts);

module.exports = {messageRoute};
