const express = require('express');
const {
  getUserGroupChats,
  createGroupChat,
  getGroupChatById,
  updateGroupChat,
  addGroupMembers,
  removeGroupMember,
  updateMemberRole,
  uploadGroupPicture,
  getGroupMessages,
  sendGroupMessage,
} = require('../controllers/group-chat-controller');
const { protect } = require('../middleware/auth');
const { uploadSingle, handleUploadErrors } = require('../middleware/upload');

const groupChatRoute = express.Router();

/**
 * @route   GET /api/group-chats
 * @desc    Get all group chats for a user
 * @access  Private
 */
groupChatRoute.get('/', protect, getUserGroupChats);

/**
 * @route   POST /api/group-chats
 * @desc    Create a new group chat
 * @access  Private
 */
groupChatRoute.post('/', protect, createGroupChat);

/**
 * @route   GET /api/group-chats/:id
 * @desc    Get group chat by ID
 * @access  Private
 */
groupChatRoute.get('/:id', protect, getGroupChatById);

/**
 * @route   PUT /api/group-chats/:id
 * @desc    Update group chat information
 * @access  Private
 */
groupChatRoute.put('/:id', protect, updateGroupChat);

/**
 * @route   POST /api/group-chats/:id/members
 * @desc    Add members to group chat
 * @access  Private
 */
groupChatRoute.post('/:id/members', protect, addGroupMembers);

/**
 * @route   DELETE /api/group-chats/:id/members/:userId
 * @desc    Remove member from group chat
 * @access  Private
 */
groupChatRoute.delete('/:id/members/:userId', protect, removeGroupMember);

/**
 * @route   PUT /api/group-chats/:id/members/:userId
 * @desc    Update member role in group chat
 * @access  Private
 */
groupChatRoute.put('/:id/members/:userId', protect, updateMemberRole);

/**
 * @route   POST /api/group-chats/:id/picture
 * @desc    Upload group picture
 * @access  Private
 */
groupChatRoute.post(
  '/:id/picture',
  protect,
  uploadSingle('image'), // 'image' is the field name in the form data
  handleUploadErrors,
  uploadGroupPicture,
);

/**
 * @route   GET /api/group-chats/:id/messages
 * @desc    Get messages for a group chat
 * @access  Private
 */
groupChatRoute.get('/:id/messages', protect, getGroupMessages);

/**
 * @route   POST /api/group-chats/:id/messages
 * @desc    Send a message in a group chat
 * @access  Private
 */
groupChatRoute.post(
  '/:id/messages',
  protect,
  uploadSingle('media'), // 'media' is the field name in the form data
  handleUploadErrors,
  sendGroupMessage,
);

module.exports = {groupChatRoute};
