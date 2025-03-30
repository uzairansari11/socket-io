const mongoose = require('mongoose');

/**
 * Message Schema Definition
 *
 * This schema represents individual messages sent in chats.
 * It supports different message types and tracks read status.
 */
const MessageSchema = new mongoose.Schema({
  // The user who sent the message
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',                          // Reference to User model
    required: true                        // A message must have a sender
  },

  // The text content of the message
  content: {
    type: String,
    trim: true                            // Remove whitespace from both ends
  },

  // Which chat this message belongs to (can be a one-to-one chat or a group chat)
  chatId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true,
    // This could reference either Chat or GroupChat models
    refPath: 'chatType'                   // Dynamic reference based on chatType field
  },

  // Specifies whether this message belongs to a one-to-one chat or a group chat
  chatType: {
    type: String,
    required: true,
    enum: ['Chat', 'GroupChat']           // Allowed chat types
  },

  // Type of message content
  messageType: {
    type: String,
    enum: ['text', 'image', 'audio', 'video', 'file', 'system'],
    default: 'text'                       // Most messages are text by default
  },

  // For messages with media attachments, store the media URL
  mediaUrl: {
    type: String                          // URL to the stored media file
  },

  // For media files, store metadata
  media: {
    originalName: String,                 // Original filename
    fileSize: Number,                     // Size in bytes
    mimeType: String,                     // MIME type (e.g., image/jpeg)
    dimensions: {                         // For images and videos
      width: Number,
      height: Number
    }
  },

  // Tracks which users have read this message and when
  readBy: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User'                         // Reference to User model
    },
    readAt: {
      type: Date,
      default: Date.now                   // When the user read the message
    }
  }],

  // For replies to other messages
  replyTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message',                       // Reference to another Message
    default: null                         // Not a reply by default
  },

  // For edited messages
  isEdited: {
    type: Boolean,
    default: false                        // Not edited by default
  },

  // For deleted messages
  isDeleted: {
    type: Boolean,
    default: false                        // Not deleted by default
  },

  // Creation timestamp
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true                        // Automatically manage createdAt and updatedAt
});

/**
 * Indexes to improve query performance
 */
MessageSchema.index({ chatId: 1, createdAt: 1 });
MessageSchema.index({ sender: 1 });

/**
 * Method to mark message as read by a user
 *
 * @param {string} userId - The ID of the user who read the message
 * @returns {Promise} - The updated message document
 */
MessageSchema.methods.markAsRead = async function(userId) {
  // Check if user already marked the message as read
  const alreadyRead = this.readBy.some(read =>
    read.user.toString() === userId.toString()
  );

  // If not read yet, add user to readBy array
  if (!alreadyRead) {
    this.readBy.push({
      user: userId,
      readAt: new Date()
    });

    return this.save();
  }

  return this;
};

/**
 * Method to check if message has been read by a user
 *
 * @param {string} userId - The ID of the user to check
 * @returns {boolean} - True if read by user, false otherwise
 */
MessageSchema.methods.isReadBy = function(userId) {
  return this.readBy.some(read =>
    read.user.toString() === userId.toString()
  );
};

/**
 * Method to get all users who read the message
 *
 * @returns {Array} - Array of user IDs who read the message
 */
MessageSchema.methods.getReadByUsers = function() {
  return this.readBy.map(read => read.user);
};

// Create and export the Message model
module.exports = mongoose.model('Message', MessageSchema);
