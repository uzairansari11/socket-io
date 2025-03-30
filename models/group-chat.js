const mongoose = require('mongoose');

/**
 * GroupChat Schema Definition
 *
 * This schema represents group conversations with multiple participants.
 * It includes metadata about the group and manages member permissions.
 */
const GroupChatSchema = new mongoose.Schema(
  {
    // Basic group information
    name: {
      type: String,
      required: [true, 'Group name is required'],
      trim: true,
      minlength: [3, 'Group name must be at least 3 characters'],
      maxlength: [50, 'Group name cannot exceed 50 characters'],
    },

    description: {
      type: String,
      trim: true,
      maxlength: [200, 'Description cannot exceed 200 characters'],
    },

    // Group profile image
    groupPicture: {
      type: String,
      default: 'default-group.png', // Default group image path
    },

    // The user who created the group (primary admin)
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Reference to User model
      required: true, // A group must have an admin
    },

    // List of all members in the group with their roles
    members: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User', // Reference to User model
          required: true,
        },
        role: {
          type: String,
          enum: ['admin', 'moderator', 'member'], // Available role types
          default: 'member', // Default role for new members
        },
        joinedAt: {
          type: Date,
          default: Date.now, // When the user joined the group
        },
      },
    ],

    // Group settings
    isPublic: {
      type: Boolean,
      default: false, // Private by default
    },

    // When the group was last active (new message, member change, etc.)
    lastActivity: {
      type: Date,
      default: Date.now,
    },

    // Timestamps for creation and updates
    createdAt: {
      type: Date,
      default: Date.now,
    },
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
 * Virtual property to get all messages in this group chat
 *
 * This creates a virtual relationship with the Message model
 * to easily access all messages belonging to this group chat
 */
GroupChatSchema.virtual('messages', {
  ref: 'Message', // Reference to Message model
  localField: '_id', // Field in GroupChat model
  foreignField: 'chatId', // Field in Message model
  justOne: false, // Return multiple messages
  match: { chatType: 'GroupChat' }, // Only include messages with chatType 'GroupChat'
});

/**
 * Index to improve query performance when searching for group chats
 * Creates indexes on frequently queried fields
 */
GroupChatSchema.index({ 'members.user': 1 });
GroupChatSchema.index({ admin: 1 });

/**
 * Method to check if a user is a member of this group
 *
 * @param {string} userId - The ID of the user to check
 * @returns {boolean} - True if user is a member, false otherwise
 */
GroupChatSchema.methods.hasMember = function (userId) {
  return this.members.some(
    (member) => member.user.toString() === userId.toString(),
  );
};

/**
 * Method to check if a user is an admin of this group
 *
 * @param {string} userId - The ID of the user to check
 * @returns {boolean} - True if user is an admin, false otherwise
 */
GroupChatSchema.methods.isAdmin = function (userId) {
  return (
    this.members.some(
      (member) =>
        member.user.toString() === userId.toString() && member.role === 'admin',
    ) || this.admin.toString() === userId.toString()
  );
};

/**
 * Method to check if a user is a moderator of this group
 *
 * @param {string} userId - The ID of the user to check
 * @returns {boolean} - True if user is a moderator, false otherwise
 */
GroupChatSchema.methods.isModerator = function (userId) {
  return (
    this.members.some(
      (member) =>
        member.user.toString() === userId.toString() &&
        (member.role === 'admin' || member.role === 'moderator'),
    ) || this.admin.toString() === userId.toString()
  );
};

/**
 * Method to get a member's role in the group
 *
 * @param {string} userId - The ID of the user to check
 * @returns {string|null} - The role of the user or null if not a member
 */
GroupChatSchema.methods.getMemberRole = function (userId) {
  const member = this.members.find(
    (member) => member.user.toString() === userId.toString(),
  );

  return member ? member.role : null;
};

// Create and export the GroupChat model
const GroupChat = mongoose.model('GroupChat', GroupChatSchema);
module.exports = GroupChat;
