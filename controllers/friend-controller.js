const Friendship = require('../models/friendship');
const Notification = require('../models/notification');
const User = require('../models/user');

/**
 * Get all friends of a user
 *
 * @route   GET /api/friends
 * @access  Private
 */
const getFriends = async (req, res) => {
  try {
    // Find all accepted friendships where the user is either requester or recipient
    const friendships = await Friendship.find({
      $or: [{ requester: req.user.id }, { recipient: req.user.id }],
      status: 'accepted',
    })
      .populate('requester', 'username email profilePicture status lastSeen')
      .populate('recipient', 'username email profilePicture status lastSeen');

    // Extract friend data from each friendship
    const friends = friendships.map((friendship) => {
      // Determine which user is the friend (not the current user)
      const isFriendRequester =
        friendship.requester._id.toString() !== req.user.id;
      const friend = isFriendRequester
        ? friendship.requester
        : friendship.recipient;

      return {
        _id: friend._id,
        username: friend.username,
        email: friend.email,
        profilePicture: friend.profilePicture,
        status: friend.status,
        lastSeen: friend.lastSeen,
        friendshipId: friendship._id,
        createdAt: friendship.createdAt,
      };
    });

    res.status(200).json({
      success: true,
      count: friends.length,
      friends,
    });
  } catch (error) {
    console.error('Get friends error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching friends',
    });
  }
};

/**
 * Get all friend requests (sent and received)
 *
 * @route   GET /api/friends/requests
 * @access  Private
 */
const getFriendRequests = async (req, res) => {
  try {
    // Find all pending friendships
    const friendships = await Friendship.find({
      $or: [{ requester: req.user.id }, { recipient: req.user.id }],
      status: 'pending',
    })
      .populate('requester', 'username email profilePicture')
      .populate('recipient', 'username email profilePicture');

    // Separate sent and received requests
    const sentRequests = friendships.filter(
      (friendship) => friendship.requester._id.toString() === req.user.id,
    );

    const receivedRequests = friendships.filter(
      (friendship) => friendship.recipient._id.toString() === req.user.id,
    );

    res.status(200).json({
      success: true,
      sentRequests,
      receivedRequests,
    });
  } catch (error) {
    console.error('Get friend requests error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching friend requests',
    });
  }
};

/**
 * Send a friend request
 *
 * @route   POST /api/friends/requests
 * @access  Private
 */
const sendFriendRequest = async (req, res) => {
  try {
    const { userId } = req.body;

    // Check if userId is provided
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a userId',
      });
    }

    // Check if trying to friend self
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot send friend request to yourself',
      });
    }

    // Check if recipient exists
    const recipient = await User.findById(userId);
    if (!recipient) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if friendship already exists
    const existingFriendship = await Friendship.findOne({
      $or: [
        { requester: req.user.id, recipient: userId },
        { requester: userId, recipient: req.user.id },
      ],
    });

    if (existingFriendship) {
      return res.status(400).json({
        success: false,
        message: `Friend request already ${existingFriendship.status}`,
      });
    }

    // Create new friendship request
    const friendship = new Friendship({
      requester: req.user.id,
      recipient: userId,
      status: 'pending',
      requestedAt: Date.now(),
    });

    await friendship.save();

    // Populate requester information
    await friendship.populate('requester', 'username email profilePicture');

    // Create notification for recipient
    const notification = new Notification({
      recipient: userId,
      sender: req.user.id,
      type: 'friendRequest',
      content: `${req.user.username} sent you a friend request`,
      isRead: false,
    });

    await notification.save();

    res.status(201).json({
      success: true,
      message: 'Friend request sent successfully',
      friendship,
    });
  } catch (error) {
    console.error('Send friend request error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while sending friend request',
    });
  }
};

/**
 * Accept a friend request
 *
 * @route   PUT /api/friends/requests/:id/accept
 * @access  Private
 */
const acceptFriendRequest = async (req, res) => {
  try {
    // Find the friendship request
    const friendship = await Friendship.findById(req.params.id);

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found',
      });
    }

    // Check if user is the recipient of this request
    if (friendship.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to accept this friend request',
      });
    }

    // Check if request is pending
    if (friendship.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Friend request is already ${friendship.status}`,
      });
    }

    // Update friendship status to accepted
    friendship.status = 'accepted';
    friendship.updatedAt = Date.now();
    await friendship.save();

    // Populate user information
    await friendship.populate(
      'requester',
      'username email profilePicture status lastSeen',
    );
    await friendship.populate(
      'recipient',
      'username email profilePicture status lastSeen',
    );

    // Create notification for requester
    const notification = new Notification({
      recipient: friendship.requester,
      sender: req.user.id,
      type: 'friendAccept',
      content: `${req.user.username} accepted your friend request`,
      isRead: false,
    });

    await notification.save();

    res.status(200).json({
      success: true,
      message: 'Friend request accepted',
      friendship,
    });
  } catch (error) {
    console.error('Accept friend request error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while accepting friend request',
    });
  }
};

/**
 * Reject a friend request
 *
 * @route   PUT /api/friends/requests/:id/reject
 * @access  Private
 */
const rejectFriendRequest = async (req, res) => {
  try {
    // Find the friendship request
    const friendship = await Friendship.findById(req.params.id);

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found',
      });
    }

    // Check if user is the recipient of this request
    if (friendship.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to reject this friend request',
      });
    }

    // Check if request is pending
    if (friendship.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Friend request is already ${friendship.status}`,
      });
    }

    // Update friendship status to rejected
    friendship.status = 'rejected';
    friendship.updatedAt = Date.now();
    await friendship.save();

    res.status(200).json({
      success: true,
      message: 'Friend request rejected',
      friendship,
    });
  } catch (error) {
    console.error('Reject friend request error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while rejecting friend request',
    });
  }
};

/**
 * Cancel a sent friend request
 *
 * @route   DELETE /api/friends/requests/:id
 * @access  Private
 */
const cancelFriendRequest = async (req, res) => {
  try {
    // Find the friendship request
    const friendship = await Friendship.findById(req.params.id);

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found',
      });
    }

    // Check if user is the requester of this request
    if (friendship.requester.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to cancel this friend request',
      });
    }

    // Check if request is still pending
    if (friendship.status !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Cannot cancel ${friendship.status} friend request`,
      });
    }

    // Delete the friendship document
    await Friendship.findByIdAndDelete(req.params.id);

    // Delete any related notifications
    await Notification.deleteMany({
      sender: req.user.id,
      recipient: friendship.recipient,
      type: 'friendRequest',
    });

    res.status(200).json({
      success: true,
      message: 'Friend request canceled',
    });
  } catch (error) {
    console.error('Cancel friend request error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Friend request not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while canceling friend request',
    });
  }
};

/**
 * Remove a friend
 *
 * @route   DELETE /api/friends/:id
 * @access  Private
 */
const removeFriend = async (req, res) => {
  try {
    // Find the friendship
    const friendship = await Friendship.findOne({
      $or: [
        {
          requester: req.user.id,
          recipient: req.params.id,
          status: 'accepted',
        },
        {
          requester: req.params.id,
          recipient: req.user.id,
          status: 'accepted',
        },
      ],
    });

    if (!friendship) {
      return res.status(404).json({
        success: false,
        message: 'Friendship not found',
      });
    }

    // Delete the friendship
    await Friendship.findByIdAndDelete(friendship._id);

    res.status(200).json({
      success: true,
      message: 'Friend removed successfully',
    });
  } catch (error) {
    console.error('Remove friend error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Friend not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while removing friend',
    });
  }
};

// Export all controller functions
module.exports = {
  getFriends,
  getFriendRequests,
  sendFriendRequest,
  acceptFriendRequest,
  rejectFriendRequest,
  cancelFriendRequest,
  removeFriend,
};
