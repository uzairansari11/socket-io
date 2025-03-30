const Message = require('../models/message');
const Chat = require('../models/chat');
const GroupChat = require('../models/group-chat');
const User = require('../models/user');
const Media = require('../models/media');
const { deleteFile } = require('../middleware/upload');

/**
 * Get a message by ID
 *
 * @route   GET /api/messages/:id
 * @access  Private
 */
const getMessageById = async (req, res) => {
  try {
    // Find message by ID
    const message = await Message.findById(req.params.id)
      .populate('sender', 'username email profilePicture')
      .populate({
        path: 'replyTo',
        select: 'content messageType sender',
        populate: {
          path: 'sender',
          select: 'username',
        },
      });

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    // Check if user has access to this message
    let hasAccess = false;

    if (message.chatType === 'Chat') {
      // For private chats, check if user is a participant
      const chat = await Chat.findById(message.chatId);

      if (chat && chat.participants.includes(req.user.id)) {
        hasAccess = true;
      }
    } else if (message.chatType === 'GroupChat') {
      // For group chats, check if user is a member
      const groupChat = await GroupChat.findById(message.chatId);

      if (groupChat && groupChat.hasMember(req.user.id)) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this message',
      });
    }

    res.status(200).json({
      success: true,
      message,
    });
  } catch (error) {
    console.error('Get message by ID error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching message',
    });
  }
};

/**
 * Update a message
 *
 * @route   PUT /api/messages/:id
 * @access  Private
 */
const updateMessage = async (req, res) => {
  try {
    const { content } = req.body;

    // Find message by ID
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    // Check if user is the sender of this message
    if (message.sender.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this message',
      });
    }

    // Check if message is a text message (only text messages can be edited)
    if (message.messageType !== 'text') {
      return res.status(400).json({
        success: false,
        message: 'Only text messages can be edited',
      });
    }

    // Check if content is provided
    if (!content || content.trim() === '') {
      return res.status(400).json({
        success: false,
        message: 'Message content cannot be empty',
      });
    }

    // Update message content
    message.content = content;
    message.isEdited = true;
    await message.save();

    // Populate sender information for the response
    await message.populate('sender', 'username profilePicture');

    res.status(200).json({
      success: true,
      message,
    });
  } catch (error) {
    console.error('Update message error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating message',
    });
  }
};

/**
 * Delete a message
 *
 * @route   DELETE /api/messages/:id
 * @access  Private
 */
const deleteMessage = async (req, res) => {
  try {
    // Find message by ID
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    // Check if user is authorized to delete this message
    let isAuthorized = false;

    // Message sender can always delete their own messages
    if (message.sender.toString() === req.user.id) {
      isAuthorized = true;
    } else {
      // Group admins/moderators can delete messages in their groups
      if (message.chatType === 'GroupChat') {
        const groupChat = await GroupChat.findById(message.chatId);

        if (groupChat && groupChat.isModerator(req.user.id)) {
          isAuthorized = true;
        }
      }
    }

    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this message',
      });
    }

    // If message has media, delete the media file
    if (message.mediaUrl) {
      await deleteFile(message.mediaUrl);

      // Delete the media record if exists
      if (message.mediaType !== 'text') {
        await Media.findOneAndDelete({
          uploader: message.sender,
          messageId: message._id,
        });
      }
    }

    // Delete the message
    await Message.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Message deleted successfully',
    });
  } catch (error) {
    console.error('Delete message error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while deleting message',
    });
  }
};

/**
 * Mark a message as read
 *
 * @route   PUT /api/messages/:id/read
 * @access  Private
 */
const markMessageAsRead = async (req, res) => {
  try {
    // Find message by ID
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    // Check if user has access to this message
    let hasAccess = false;

    if (message.chatType === 'Chat') {
      // For private chats, check if user is a participant
      const chat = await Chat.findById(message.chatId);

      if (chat && chat.participants.includes(req.user.id)) {
        hasAccess = true;
      }
    } else if (message.chatType === 'GroupChat') {
      // For group chats, check if user is a member
      const groupChat = await GroupChat.findById(message.chatId);

      if (groupChat && groupChat.hasMember(req.user.id)) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this message',
      });
    }

    // Check if message is already read by this user
    const alreadyRead = message.readBy.some(
      (read) => read.user.toString() === req.user.id,
    );

    if (alreadyRead) {
      return res.status(200).json({
        success: true,
        message: 'Message already marked as read',
      });
    }

    // Add user to readBy array
    message.readBy.push({
      user: req.user.id,
      readAt: Date.now(),
    });

    await message.save();

    res.status(200).json({
      success: true,
      message: 'Message marked as read',
    });
  } catch (error) {
    console.error('Mark message as read error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while marking message as read',
    });
  }
};

/**
 * Mark all messages in a chat as read
 *
 * @route   PUT /api/messages/read-all
 * @access  Private
 */
const markAllMessagesAsRead = async (req, res) => {
  try {
    const { chatId, chatType } = req.body;

    if (!chatId || !chatType) {
      return res.status(400).json({
        success: false,
        message: 'Please provide chatId and chatType',
      });
    }

    // Validate chatType
    if (!['Chat', 'GroupChat'].includes(chatType)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid chatType. Must be Chat or GroupChat',
      });
    }

    // Check if user has access to this chat
    let hasAccess = false;

    if (chatType === 'Chat') {
      // For private chats, check if user is a participant
      const chat = await Chat.findById(chatId);

      if (chat && chat.participants.includes(req.user.id)) {
        hasAccess = true;
      }
    } else if (chatType === 'GroupChat') {
      // For group chats, check if user is a member
      const groupChat = await GroupChat.findById(chatId);

      if (groupChat && groupChat.hasMember(req.user.id)) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this chat',
      });
    }

    // Find all unread messages in this chat that were not sent by the current user
    const unreadMessages = await Message.find({
      chatId,
      chatType,
      sender: { $ne: req.user.id },
      'readBy.user': { $ne: req.user.id },
    });

    // Mark all messages as read
    await Promise.all(
      unreadMessages.map((message) =>
        Message.findByIdAndUpdate(message._id, {
          $push: { readBy: { user: req.user.id, readAt: Date.now() } },
        }),
      ),
    );

    res.status(200).json({
      success: true,
      message: `${unreadMessages.length} messages marked as read`,
    });
  } catch (error) {
    console.error('Mark all messages as read error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while marking messages as read',
    });
  }
};

/**
 * Get read receipts for a message
 *
 * @route   GET /api/messages/:id/read-receipts
 * @access  Private
 */
const getReadReceipts = async (req, res) => {
  try {
    // Find message by ID
    const message = await Message.findById(req.params.id);

    if (!message) {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    // Check if user is the sender or has access to this message
    let hasAccess = message.sender.toString() === req.user.id;

    if (!hasAccess) {
      if (message.chatType === 'Chat') {
        // For private chats, check if user is a participant
        const chat = await Chat.findById(message.chatId);

        if (chat && chat.participants.includes(req.user.id)) {
          hasAccess = true;
        }
      } else if (message.chatType === 'GroupChat') {
        // For group chats, check if user is a member
        const groupChat = await GroupChat.findById(message.chatId);

        if (groupChat && groupChat.hasMember(req.user.id)) {
          hasAccess = true;
        }
      }
    }

    if (!hasAccess) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this message',
      });
    }

    // Populate readBy information
    await message.populate({
      path: 'readBy.user',
      select: 'username profilePicture',
    });

    res.status(200).json({
      success: true,
      readReceipts: message.readBy,
    });
  } catch (error) {
    console.error('Get read receipts error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Message not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching read receipts',
    });
  }
};

// Export all controller functions
module.exports = {
  getMessageById,
  updateMessage,
  deleteMessage,
  markMessageAsRead,
  markAllMessagesAsRead,
  getReadReceipts,
};
