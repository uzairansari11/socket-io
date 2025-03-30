const express = require('express');
const {
  getFriends,
  getFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
} = require('../controllers/friend-controller');
const { protect } = require('../middleware/auth');

const friendsRoute = express.Router();

/**
 * @route   GET /api/friends
 * @desc    Get all friends of a user
 * @access  Private
 */
friendsRoute.get('/', protect, getFriends);

/**
 * @route   GET /api/friends/requests
 * @desc    Get all friend requests (sent and received)
 * @access  Private
 */
friendsRoute.get('/requests', protect, getFriendRequests);

/**
 * @route   POST /api/friends/requests
 * @desc    Send a friend request
 * @access  Private
 */
friendsRoute.post('/requests', protect, sendFriendRequest);

/**
 * @route   PUT /api/friends/requests/:id/accept
 * @desc    Accept a friend request
 * @access  Private
 */
friendsRoute.put('/requests/:id/accept', protect, acceptFriendRequest);

/**
 * @route   PUT /api/friends/requests/:id/reject
 * @desc    Reject a friend request
 * @access  Private
 */
friendsRoute.put('/requests/:id/reject', protect, rejectFriendRequest);

/**
 * @route   DELETE /api/friends/requests/:id
 * @desc    Cancel a sent friend request
 * @access  Private
 */
friendsRoute.delete('/requests/:id', protect, cancelFriendRequest);

/**
 * @route   DELETE /api/friends/:id
 * @desc    Remove a friend
 * @access  Private
 */
friendsRoute.delete('/:id', protect, removeFriend);

module.exports = {friendsRoute};
