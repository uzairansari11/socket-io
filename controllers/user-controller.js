const User = require('../models/user');
const Media = require('../models/media');
const Friendship = require('../models/friendship');
const Chat = require('../models/chat');
const GroupChat = require('../models/group-chat');
const Message = require('../models/message');
const { deleteFile } = require('../middleware/upload');
const mongoose = require('mongoose');

/**
 * Get all users (with pagination and filtering)
 *
 * @route   GET /api/users
 * @access  Private
 */
const getUsers = async (req, res) => {
  try {
    // Parse query parameters for filtering and pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const search = req.query.search || '';
    const status = req.query.status;

    // Calculate skip value for pagination
    const skip = (page - 1) * limit;

    // Build search query
    const query = {};

    // Add search filter if provided
    if (search) {
      query.$or = [
        { username: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    // Add status filter if provided
    if (status && ['online', 'offline', 'away'].includes(status)) {
      query.status = status;
    }

    // Don't include the current user in results
    query._id = { $ne: req.user.id };

    // Don't include users blocked by current user
    const currentUser = await User.findById(req.user.id);
    if (currentUser.blockedUsers && currentUser.blockedUsers.length > 0) {
      query._id.$nin = currentUser.blockedUsers;
    }

    // Execute query with pagination
    const users = await User.find(query)
      .select('username email profilePicture status lastSeen bio')
      .skip(skip)
      .limit(limit)
      .sort({ username: 1 });

    // Get total count for pagination
    const total = await User.countDocuments(query);

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    // For each user, check if they are friends with current user
    const usersWithFriendStatus = await Promise.all(
      users.map(async (user) => {
        const friendship = await Friendship.findOne({
          $or: [
            { requester: req.user.id, recipient: user._id },
            { requester: user._id, recipient: req.user.id },
          ],
        });

        let friendshipStatus = 'none';
        let friendshipId = null;

        if (friendship) {
          friendshipStatus = friendship.status;
          friendshipId = friendship._id;
        }

        return {
          ...user.toObject(),
          friendshipStatus,
          friendshipId,
        };
      }),
    );

    res.status(200).json({
      success: true,
      count: users.length,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
      users: usersWithFriendStatus,
    });
  } catch (error) {
    console.error('Get users error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching users',
    });
  }
};

/**
 * Get user by ID
 *
 * @route   GET /api/users/:id
 * @access  Private
 */
const getUserById = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select(
      'username email profilePicture status lastSeen bio createdAt',
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if current user has blocked this user or vice versa
    const currentUser = await User.findById(req.user.id);
    const isBlocked = currentUser.blockedUsers.includes(req.params.id);
    const isBlockedBy = user.blockedUsers.includes(req.user.id);

    // Get friendship status
    const friendship = await Friendship.findOne({
      $or: [
        { requester: req.user.id, recipient: req.params.id },
        { requester: req.params.id, recipient: req.user.id },
      ],
    });

    let friendshipStatus = 'none';
    let friendshipId = null;

    if (friendship) {
      friendshipStatus = friendship.status;
      friendshipId = friendship._id;
    }

    // Get mutual groups
    const userGroups = await GroupChat.find({
      'members.user': req.params.id,
    }).select('_id name');

    const currentUserGroups = await GroupChat.find({
      'members.user': req.user.id,
    }).select('_id');

    const currentUserGroupIds = currentUserGroups.map((group) =>
      group._id.toString(),
    );

    const mutualGroups = userGroups.filter((group) =>
      currentUserGroupIds.includes(group._id.toString()),
    );

    res.status(200).json({
      success: true,
      user: {
        ...user.toObject(),
        isBlocked,
        isBlockedBy,
        friendshipStatus,
        friendshipId,
        mutualGroups,
      },
    });
  } catch (error) {
    console.error('Get user by ID error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching user',
    });
  }
};

/**
 * Get user's status
 *
 * @route   GET /api/users/:id/status
 * @access  Private
 */
const getUserStatus = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('status lastSeen');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(200).json({
      success: true,
      userId: req.params.id,
      status: user.status,
      lastSeen: user.lastSeen,
    });
  } catch (error) {
    console.error('Get user status error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching user status',
    });
  }
};

/**
 * Update user's status
 *
 * @route   PUT /api/users/status
 * @access  Private
 */
const updateUserStatus = async (req, res) => {
  try {
    const { status } = req.body;

    // Validate status
    if (!status || !['online', 'away', 'offline'].includes(status)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid status. Must be online, away, or offline',
      });
    }

    // Update user status
    const user = await User.findByIdAndUpdate(
      req.user.id,
      {
        status,
        lastSeen: status === 'offline' ? Date.now() : user.lastSeen,
      },
      { new: true },
    ).select('status lastSeen');

    res.status(200).json({
      success: true,
      status: user.status,
      lastSeen: user.lastSeen,
    });
  } catch (error) {
    console.error('Update user status error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while updating user status',
    });
  }
};

/**
 * Upload profile picture
 *
 * @route   POST /api/users/profile-picture
 * @access  Private
 */
const uploadProfilePicture = async (req, res) => {
  try {
    // req.file is available from multer middleware
    if (!req.file) {
      return res.status(400).json({
        success: false,
        message: 'Please upload an image file',
      });
    }

    // Get file details from multer
    const { filename, originalname, mimetype, size, path: filePath } = req.file;

    // Validate that the file is an image
    if (!mimetype.startsWith('image/')) {
      // Delete the uploaded file if it's not an image
      await deleteFile(filePath);

      return res.status(400).json({
        success: false,
        message: 'Please upload an image file',
      });
    }

    // Create new media record for the profile picture
    const media = new Media({
      originalName: originalname,
      fileSize: size,
      mimeType: mimetype,
      url: `/uploads/images/${filename}`,
      uploader: req.user.id,
      mediaType: 'image',
      isProfilePicture: true,
    });

    await media.save();

    // Get user's current profile picture
    const user = await User.findById(req.user.id);
    const oldProfilePicture = user.profilePicture;

    // Update user's profile picture
    user.profilePicture = `/uploads/images/${filename}`;
    await user.save();

    // If user had a custom profile picture (not the default), delete the old one
    if (oldProfilePicture && oldProfilePicture !== 'default-avatar.png') {
      // Find if the old profile picture exists in the Media collection
      const oldMedia = await Media.findOne({ url: oldProfilePicture });

      if (oldMedia) {
        // Delete the file from the filesystem
        await deleteFile(oldProfilePicture);

        // Delete the media record
        await Media.findByIdAndDelete(oldMedia._id);
      }
    }

    res.status(200).json({
      success: true,
      profilePicture: `/uploads/images/${filename}`,
      message: 'Profile picture updated successfully',
    });
  } catch (error) {
    console.error('Profile picture upload error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while uploading profile picture',
    });
  }
};

/**
 * Update user profile
 *
 * @route   PUT /api/users/profile
 * @access  Private
 */
const updateProfile = async (req, res) => {
  try {
    const { username, bio } = req.body;

    // Build update object
    const updateFields = {};

    if (username) {
      // Check if username is already taken
      const existingUser = await User.findOne({ username });

      if (existingUser && existingUser._id.toString() !== req.user.id) {
        return res.status(400).json({
          success: false,
          message: 'Username is already taken',
        });
      }

      updateFields.username = username;
    }

    if (bio !== undefined) {
      updateFields.bio = bio;
    }

    // Update user profile
    const user = await User.findByIdAndUpdate(req.user.id, updateFields, {
      new: true,
    }).select('username email profilePicture bio status lastSeen');

    res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error('Update profile error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while updating profile',
    });
  }
};

/**
 * Block a user
 *
 * @route   POST /api/users/block/:id
 * @access  Private
 */
const blockUser = async (req, res) => {
  try {
    const userToBlock = await User.findById(req.params.id);

    if (!userToBlock) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Cannot block yourself
    if (req.params.id === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot block yourself',
      });
    }

    // Check if user is already blocked
    const user = await User.findById(req.user.id);

    if (user.blockedUsers.includes(req.params.id)) {
      return res.status(400).json({
        success: false,
        message: 'User is already blocked',
      });
    }

    // Begin a transaction
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      // Add user to blocked list
      user.blockedUsers.push(req.params.id);
      await user.save({ session });

      // Update any friendship to blocked status
      await Friendship.findOneAndUpdate(
        {
          $or: [
            { requester: req.user.id, recipient: req.params.id },
            { requester: req.params.id, recipient: req.user.id },
          ],
        },
        {
          status: 'blocked',
          blockedBy: req.user.id,
          updatedAt: Date.now(),
        },
        { session },
      );

      // Find private chat if exists
      const privateChat = await Chat.findOne({
        participants: { $all: [req.user.id, req.params.id] },
      });

      // If chat exists, mark it as blocked
      if (privateChat) {
        privateChat.isBlocked = true;
        privateChat.blockedBy = req.user.id;
        privateChat.updatedAt = Date.now();
        await privateChat.save({ session });
      }

      // Commit the transaction
      await session.commitTransaction();
      session.endSession();

      res.status(200).json({
        success: true,
        message: 'User blocked successfully',
      });
    } catch (error) {
      // Abort transaction in case of error
      await session.abortTransaction();
      session.endSession();
      throw error;
    }
  } catch (error) {
    console.error('Block user error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while blocking user',
    });
  }
};
