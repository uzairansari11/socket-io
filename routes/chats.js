const express = require('express');
const {
  getUserChats,
  createOrGetChat,
  getChatById,
  getChatMessages,
  sendChatMessage
} = require('../controllers/chat-controller');
const { protect } = require('../middleware/auth');
const { uploadSingle, handleUploadErrors } = require('../middleware/upload');

const chatRoute = express.Router();

/**
 * @route   GET /api/chats
 * @desc    Get all chats for a user
 * @access  Private
 */
chatRoute.get('/', protect, getUserChats);

/**
 * @route   POST /api/chats
 * @desc    Create or get a chat with another user
 * @access  Private
 */
chatRoute.post('/', protect, createOrGetChat);

/**
 * @route   GET /api/chats/:id
 * @desc    Get chat by ID
 * @access  Private
 */
chatRoute.get('/:id', protect, getChatById);

/**
 * @route   GET /api/chats/:id/messages
 * @desc    Get messages for a chat
 * @access  Private
 */
chatRoute.get('/:id/messages', protect, getChatMessages);

/**
 * @route   POST /api/chats/:id/messages
 * @desc    Send a message in a chat
 * @access  Private
 */
chatRoute.post(
  '/:id/messages',
  protect,
  uploadSingle('media'), // 'media' is the field name in the form data
  handleUploadErrors,
  sendChatMessage
);

module.exports = {chatRoute};
