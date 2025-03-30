const mongoose = require('mongoose');

/**
 * Chat Schema Definition
 *
 * This schema represents one-to-one private conversations between two users.
 * It tracks participants and conversation state (blocked status, last activity).
 */
const ChatSchema = new mongoose.Schema({
  // The two users participating in this private conversation
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',                          // Reference to User model
    required: true                        // A chat must have participants
  }],

  // Tracks if either participant has blocked the conversation
  isBlocked: {
    type: Boolean,
    default: false                        // Initially not blocked
  },

  // Who blocked the conversation (if blocked)
  blockedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',                          // Reference to User who blocked the chat
    default: null                         // Initially not blocked by anyone
  },

  // When the conversation was last updated (new message, status change, etc.)
  lastActivity: {
    type: Date,
    default: Date.now
  },

  // Timestamps for creation and updates
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true                        // Automatically manage createdAt and updatedAt
});

/**
 * Virtual property to get all messages in this chat
 *
 * This creates a virtual relationship with the Message model
 * to easily access all messages belonging to this chat
 */
ChatSchema.virtual('messages', {
  ref: 'Message',                         // Reference to Message model
  localField: '_id',                      // Field in Chat model
  foreignField: 'chatId',                 // Field in Message model
  justOne: false,                         // Return multiple messages
  match: { chatType: 'Chat' }             // Only include messages with chatType 'Chat'
});

/**
 * Index to improve query performance when searching for chats by participants
 *
 * This creates a compound index on participants field, which makes queries
 * using the participants field faster
 */
ChatSchema.index({ participants: 1 });

/**
 * Method to check if a user is a participant in this chat
 *
 * @param {string} userId - The ID of the user to check
 * @returns {boolean} - True if user is a participant, false otherwise
 */
ChatSchema.methods.hasParticipant = function(userId) {
  return this.participants.some(participant =>
    participant.toString() === userId.toString()
  );
};

/**
 * Method to get the other participant in a one-to-one chat
 *
 * @param {string} userId - The ID of the current user
 * @returns {string|null} - The ID of the other participant, or null if not found
 */
ChatSchema.methods.getOtherParticipant = function(userId) {
  const otherParticipant = this.participants.find(
    participant => participant.toString() !== userId.toString()
  );
  return otherParticipant || null;
};

// Create and export the Chat model
module.exports = mongoose.model('Chat', ChatSchema);
