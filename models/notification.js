const mongoose = require('mongoose');

/**
 * Notification Schema Definition
 *
 * This schema represents system notifications sent to users.
 * It handles different notification types and their read status.
 */
const NotificationSchema = new mongoose.Schema(
  {
    // User who will receive this notification
    recipient: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Reference to User model
      required: true, // A notification must have a recipient
    },

    // User who triggered the notification (if applicable)
    sender: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Reference to User model
    },

    // Type of notification for different actions
    type: {
      type: String,
      enum: [
        'message', // New message notification
        'groupInvite', // Invitation to join a group
        'friendRequest', // Friend request notification
        'friendAccept', // Friend request accepted
        'groupActivity', // Activity in a group
        'mention', // User mentioned in a message
        'system', // System-generated notification
      ],
      required: true,
    },

    // Text content of the notification
    content: {
      type: String,
      required: true,
    },

    // For notifications related to a specific chat
    relatedChatId: {
      type: mongoose.Schema.Types.ObjectId,
      refPath: 'relatedChatType', // Dynamic reference based on relatedChatType
    },

    // Type of chat the notification is related to (if applicable)
    relatedChatType: {
      type: String,
      enum: ['Chat', 'GroupChat', null], // Can be individual chat or group chat
    },

    // For notifications related to a specific message
    relatedMessageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message', // Reference to Message model
    },

    // Has the notification been read by the recipient
    isRead: {
      type: Boolean,
      default: false, // New notifications are unread by default
    },

    // When the notification was read (if it has been read)
    readAt: {
      type: Date,
    },

    // Creation timestamp
    createdAt: {
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
NotificationSchema.index({ recipient: 1, isRead: 1, createdAt: -1 });
NotificationSchema.index({ sender: 1 });

/**
 * Method to mark notification as read
 *
 * @returns {Promise} - The updated notification document
 */
NotificationSchema.methods.markAsRead = function () {
  this.isRead = true;
  this.readAt = new Date();
  return this.save();
};

/**
 * Static method to mark all notifications for a user as read
 *
 * @param {string} userId - The ID of the user whose notifications to mark as read
 * @returns {Promise} - The update operation result
 */
NotificationSchema.statics.markAllAsRead = function (userId) {
  return this.updateMany(
    { recipient: userId, isRead: false },
    { isRead: true, readAt: new Date() },
  );
};

/**
 * Static method to get unread notification count for a user
 *
 * @param {string} userId - The ID of the user to check
 * @returns {Promise<number>} - The count of unread notifications
 */
NotificationSchema.statics.getUnreadCount = function (userId) {
  return this.countDocuments({ recipient: userId, isRead: false });
};

// Create and export the Notification model
const Notification = mongoose.model('Notification', NotificationSchema);
module.exports = Notification;
