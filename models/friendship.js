const mongoose = require('mongoose');

/**
 * Friendship Schema Definition
 *
 * This schema manages friendship relationships between users.
 * It tracks friendship requests, status changes, and blocked relationships.
 */
const FriendshipSchema = new mongoose.Schema(
  {
    // User who sent the friendship request
    requester: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Reference to User model
      required: true, // A friendship must have a requester
    },

    // User who received the friendship request
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Reference to User model
      required: true, // A friendship must have a recipient
    },

    // Current status of the friendship
    status: {
      type: String,
      enum: [
        'pending', // Request sent, not yet accepted/rejected
        'accepted', // Request accepted, users are friends
        'rejected', // Request rejected
        'blocked', // One user has blocked the other
      ],
      default: 'pending', // Default status when request is first sent
    },

    // Who initiated a block (if status is 'blocked')
    blockedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Reference to User who blocked
      default: null, // Not blocked initially
    },

    // When the friendship request was sent
    requestedAt: {
      type: Date,
      default: Date.now,
    },

    // When the friendship status was last changed
    updatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // Automatically manage createdAt and updatedAt
  },
);

/**
 * Indexes to improve query performance
 */
FriendshipSchema.index({ requester: 1, status: 1 });
FriendshipSchema.index({ recipient: 1, status: 1 });
FriendshipSchema.index({ requester: 1, recipient: 1 }, { unique: true });

/**
 * Method to accept a friendship request
 *
 * @returns {Promise} - The updated friendship document
 */
FriendshipSchema.methods.accept = function () {
  this.status = 'accepted';
  this.updatedAt = new Date();
  return this.save();
};

/**
 * Method to reject a friendship request
 *
 * @returns {Promise} - The updated friendship document
 */
FriendshipSchema.methods.reject = function () {
  this.status = 'rejected';
  this.updatedAt = new Date();
  return this.save();
};

/**
 * Method to block a friendship
 *
 * @param {string} userId - The ID of the user initiating the block
 * @returns {Promise} - The updated friendship document
 */
FriendshipSchema.methods.block = function (userId) {
  this.status = 'blocked';
  this.blockedBy = userId;
  this.updatedAt = new Date();
  return this.save();
};

/**
 * Method to unblock a friendship
 *
 * @returns {Promise} - The updated friendship document
 */
FriendshipSchema.methods.unblock = function () {
  this.status = 'accepted';
  this.blockedBy = null;
  this.updatedAt = new Date();
  return this.save();
};

/**
 * Static method to find friendship between two users
 *
 * @param {string} user1Id - The ID of first user
 * @param {string} user2Id - The ID of second user
 * @returns {Promise} - The friendship document if exists
 */
FriendshipSchema.statics.findFriendship = function (user1Id, user2Id) {
  return this.findOne({
    $or: [
      { requester: user1Id, recipient: user2Id },
      { requester: user2Id, recipient: user1Id },
    ],
  });
};

/**
 * Static method to get all friends of a user
 *
 * @param {string} userId - The ID of the user
 * @returns {Promise} - Array of friendship documents
 */
FriendshipSchema.statics.getFriends = function (userId) {
  return this.find({
    $or: [{ requester: userId }, { recipient: userId }],
    status: 'accepted',
  })
    .populate('requester', 'username email profilePicture status')
    .populate('recipient', 'username email profilePicture status');
};

// Create and export the Friendship model
const Friendship = mongoose.model('Friendship', FriendshipSchema);
module.exports = Friendship;
