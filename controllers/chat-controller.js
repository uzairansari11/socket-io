const Chat = require('../models/chat');
const Message = require('../models/message');
const User = require('../models/user');

/**
 * Get all chats for a user
 *
 * @route   GET /api/chats
 * @access  Private
 */
const getUserChats = async (req, res) => {
  try {
    // Find all chats where the user is a participant
    const chats = await Chat.find({
      participants: req.user.id,
    })
      .populate('participants', 'username email profilePicture status lastSeen')
      .sort({ updatedAt: -1 }); // Sort by most recent activity

    // For each chat, get the last message
    const chatsWithLastMessage = await Promise.all(
      chats.map(async (chat) => {
        // Find the last message in this chat
        const lastMessage = await Message.findOne({
          chatId: chat._id,
          chatType: 'Chat',
        })
          .sort({ createdAt: -1 })
          .populate('sender', 'username');

        // Find the other participant (not the current user)
        const otherParticipant = chat.participants.find(
          (participant) => participant._id.toString() !== req.user.id,
        );

        // Check if this user has blocked the other participant
        const currentUser = await User.findById(req.user.id);
        const isBlocked = currentUser.blockedUsers.some(
          (id) => id.toString() === otherParticipant._id.toString(),
        );

        // Check if the other participant has blocked the current user
        const otherUser = await User.findById(otherParticipant._id);
        const isBlockedBy = otherUser.blockedUsers.some(
          (id) => id.toString() === req.user.id,
        );

        // Return chat with additional information
        return {
          _id: chat._id,
          otherUser: otherParticipant,
          lastMessage: lastMessage || null,
          updatedAt: chat.updatedAt,
          createdAt: chat.createdAt,
          isBlocked,
          isBlockedBy,
        };
      }),
    );

    res.status(200).json({
      success: true,
      count: chatsWithLastMessage.length,
      chats: chatsWithLastMessage,
    });
  } catch (error) {
    console.error('Get user chats error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching chats',
    });
  }
};

/**
 * Get or create a chat with another user
 *
 * @route   POST /api/chats
 * @access  Private
 */
const createOrGetChat = async (req, res) => {
  try {
    const { userId } = req.body;

    // Check if userId is provided
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'Please provide a userId',
      });
    }

    // Check if user exists
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    // Check if trying to chat with self
    if (userId === req.user.id) {
      return res.status(400).json({
        success: false,
        message: 'Cannot create chat with yourself',
      });
    }

    // Check if user is blocked
    const currentUser = await User.findById(req.user.id);
    if (currentUser.blockedUsers.includes(userId)) {
      return res.status(400).json({
        success: false,
        message: 'You have blocked this user',
      });
    }

    // Check if current user is blocked by the other user
    const otherUser = await User.findById(userId);
    if (otherUser.blockedUsers.includes(req.user.id)) {
      return res.status(400).json({
        success: false,
        message: 'You have been blocked by this user',
      });
    }

    // Check if chat already exists
    let chat = await Chat.findOne({
      participants: { $all: [req.user.id, userId] },
    });

    // If chat doesn't exist, create a new one
    if (!chat) {
      chat = new Chat({
        participants: [req.user.id, userId],
        lastActivity: Date.now(),
      });

      await chat.save();
    }

    // Populate participant information
    await chat.populate(
      'participants',
      'username email profilePicture status lastSeen',
    );

    res.status(200).json({
      success: true,
      chat,
    });
  } catch (error) {
    console.error('Create/get chat error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'User not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while creating/getting chat',
    });
  }
};

/**
 * Get chat by ID
 *
 * @route   GET /api/chats/:id
 * @access  Private
 */
const getChatById = async (req, res) => {
  try {
    const chat = await Chat.findById(req.params.id).populate(
      'participants',
      'username email profilePicture status lastSeen',
    );

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    // Check if user is a participant in this chat
    if (
      !chat.participants.some(
        (participant) => participant._id.toString() === req.user.id,
      )
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this chat',
      });
    }

    res.status(200).json({
      success: true,
      chat,
    });
  } catch (error) {
    console.error('Get chat by ID error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching chat',
    });
  }
};

/**
 * Get messages for a chat
 *
 * @route   GET /api/chats/:id/messages
 * @access  Private
 */
const getChatMessages = async (req, res) => {
  try {
    // Parse query parameters for pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Find chat by ID
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    // Check if user is a participant in this chat
    if (
      !chat.participants.some(
        (participant) => participant.toString() === req.user.id,
      )
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this chat',
      });
    }

    // Get messages for this chat with pagination
    // Sort by createdAt descending to get newest messages first
    const messages = await Message.find({
      chatId: req.params.id,
      chatType: 'Chat',
    })
      .populate('sender', 'username profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total messages count for pagination
    const total = await Message.countDocuments({
      chatId: req.params.id,
      chatType: 'Chat',
    });

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    // Mark messages as read by current user
    const unreadMessages = messages.filter(
      (message) =>
        message.sender._id.toString() !== req.user.id && // Not sent by current user
        !message.readBy.some((read) => read.user.toString() === req.user.id), // Not already read
    );

    // Mark messages as read in background
    if (unreadMessages.length > 0) {
      await Promise.all(
        unreadMessages.map((message) =>
          Message.findByIdAndUpdate(message._id, {
            $push: { readBy: { user: req.user.id, readAt: new Date() } },
          }),
        ),
      );
    }

    // Reverse messages to display in chronological order
    const chronologicalMessages = messages.reverse();

    res.status(200).json({
      success: true,
      count: messages.length,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
      messages: chronologicalMessages,
    });
  } catch (error) {
    console.error('Get chat messages error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching messages',
    });
  }
};

/**
 * Send a message in a chat
 *
 * @route   POST /api/chats/:id/messages
 * @access  Private
 */
const sendChatMessage = async (req, res) => {
  try {
    const { content, replyTo } = req.body;
    let { messageType } = req.body;

    // Get media URL from file upload middleware if available
    const mediaUrl = req.file ? req.file.path : null;

    // If media is uploaded but no messageType is specified, determine it from file type
    if (mediaUrl && !messageType) {
      const mimeType = req.file.mimetype;

      if (mimeType.startsWith('image/')) {
        messageType = 'image';
      } else if (mimeType.startsWith('video/')) {
        messageType = 'video';
      } else if (mimeType.startsWith('audio/')) {
        messageType = 'audio';
      } else {
        messageType = 'file';
      }
    } else if (!messageType) {
      // Default message type is text
      messageType = 'text';
    }

    // Find chat by ID
    const chat = await Chat.findById(req.params.id);

    if (!chat) {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    // Check if user is a participant in this chat
    if (
      !chat.participants.some(
        (participant) => participant.toString() === req.user.id,
      )
    ) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send messages in this chat',
      });
    }

    // Create new message
    const message = new Message({
      sender: req.user.id,
      content: content || '',
      chatId: chat._id,
      chatType: 'Chat',
      messageType,
      mediaUrl,
      replyTo: replyTo || null,
      readBy: [{ user: req.user.id }], // Sender automatically reads their own message
    });

    // If it's a media message, add media metadata
    if (req.file) {
      message.media = {
        originalName: req.file.originalname,
        fileSize: req.file.size,
        mimeType: req.file.mimetype,
      };
    }

    await message.save();

    // Update chat's last activity time
    chat.lastActivity = Date.now();
    chat.updatedAt = Date.now();
    await chat.save();

    // Populate sender information for the response
    await message.populate('sender', 'username profilePicture');

    // If replying to a message, populate that info too
    if (message.replyTo) {
      await message.populate({
        path: 'replyTo',
        select: 'content messageType sender',
        populate: {
          path: 'sender',
          select: 'username',
        },
      });
    }

    res.status(201).json({
      success: true,
      message,
    });
  } catch (error) {
    console.error('Send message error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Chat not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while sending message',
    });
  }
};

// Export all controller functions
module.exports = {
  getUserChats,
  createOrGetChat,
  getChatById,
  getChatMessages,
  sendChatMessage,
};
