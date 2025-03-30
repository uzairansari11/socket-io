const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

/**
 * User Schema Definition
 *
 * Defines the structure for user documents in the database,
 * including personal information, authentication details,
 * and user status information.
 */
const UserSchema = new mongoose.Schema({
  // Basic user information
  username: {
    type: String,
    required: [true, 'Please provide a username'],
    unique: true,                         // Ensures usernames are unique
    trim: true,                           // Removes whitespace from both ends
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [20, 'Username cannot exceed 20 characters']
  },

  email: {
    type: String,
    required: [true, 'Please provide an email address'],
    unique: true,                         // Ensures emails are unique
    match: [
      /^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/,
      'Please provide a valid email address'
    ]
  },

  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: [6, 'Password must be at least 6 characters'],
    select: false                         // Don't include password in query results by default
  },

  // Profile customization
  profilePicture: {
    type: String,
    default: 'default-avatar.png'         // Default profile picture path
  },

  bio: {
    type: String,
    maxlength: [200, 'Bio cannot exceed 200 characters']
  },

  // User status information
  status: {
    type: String,
    enum: ['online', 'offline', 'away'],  // Allowed status values
    default: 'offline'
  },

  lastSeen: {
    type: Date,
    default: Date.now
  },

  // User relationships
  blockedUsers: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'                           // Reference to other users that this user has blocked
  }],

  // Real-time connection tracking
  socketId: {
    type: String,
    default: null                         // Socket.IO connection identifier
  },

  // Timestamps
  createdAt: {
    type: Date,
    default: Date.now
  },

  // Password reset functionality
  resetPasswordToken: String,
  resetPasswordExpire: Date
}, {
  timestamps: true                        // Automatically add createdAt and updatedAt fields
});

/**
 * Pre-save middleware to hash passwords before saving to database
 *
 * This runs before every save() operation to ensure passwords
 * are always properly hashed before storage
 */
UserSchema.pre('save', async function(next) {
  // Only hash the password if it has been modified (or is new)
  if (!this.isModified('password')) {
    return next();
  }

  try {
    // Generate a salt with 10 rounds (higher is more secure but slower)
    const salt = await bcrypt.genSalt(10);

    // Hash the password using the generated salt
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error);
  }
});

/**
 * Method to check if provided password matches stored hash
 *
 * @param {string} enteredPassword - The password provided during login attempt
 * @returns {boolean} - True if password matches, false otherwise
 */
UserSchema.methods.matchPassword = async function(enteredPassword) {
  // Compare entered password with stored hashed password
  return await bcrypt.compare(enteredPassword, this.password);
};

/**
 * Method to generate JSON Web Token for authentication
 *
 * @returns {string} - JWT token containing user ID as payload
 */
UserSchema.methods.generateAuthToken = function() {
  // Create token with user ID in payload
  return jwt.sign(
    { id: this._id },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );
};

/**
 * Virtual property to get all chats that this user is part of
 * This creates a virtual relationship with the Chat model
 */
UserSchema.virtual('chats', {
  ref: 'Chat',                           // Reference to the Chat model
  localField: '_id',                     // Field in User model
  foreignField: 'participants',          // Field in Chat model
  justOne: false                         // Return multiple chats
});

/**
 * Virtual property to get all group chats that this user is part of
 * This creates a virtual relationship with the GroupChat model
 */
UserSchema.virtual('groupChats', {
  ref: 'GroupChat',                      // Reference to the GroupChat model
  localField: '_id',                     // Field in User model
  foreignField: 'members.user',          // Field in GroupChat model
  justOne: false                         // Return multiple group chats
});

// Create and export the User model
module.exports = mongoose.model('User', UserSchema);
