const jwt = require('jsonwebtoken');
const User = require('../models/user');
const Chat = require('../models/chat');
const GroupChat = require('../models/group-chat');
const Message = require('../models/message');
const Notification = require('../models/notification');
const Friendship = require('../models/friendship');

/**
 * Socket.IO Handler
 *
 * This module manages all real-time communications for the chat application.
 * It handles authentication, presence, messaging, and other real-time features.
 *
 * @param {Object} io - The Socket.IO server instance
 */
const socketHandler = (io) => {
  // Map to track active users and their socket connections
  // Key: userId, Value: socketId
  const activeUsers = new Map();

  // Middleware for socket authentication
  io.use(async (socket, next) => {
    try {
      // Get token from handshake auth object
      const token = socket.handshake.auth.token;

      if (!token) {
        return next(new Error('Authentication error: Token required'));
      }

      // Verify JWT token
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Find user by ID
      const user = await User.findById(decoded.id);

      if (!user) {
        return next(new Error('Authentication error: User not found'));
      }

      // Attach user to socket for use in event handlers
      socket.user = user;

      next();
    } catch (error) {
      console.error('Socket authentication error:', error.message);
      next(new Error('Authentication error: Invalid token'));
    }
  });

  // Connection event handler
  io.on('connection', async (socket) => {
    console.log(`User connected: ${socket.user.username} (${socket.user._id})`);

    try {
      // Update user's status to online and save socket ID
      const userId = socket.user._id.toString();

      await User.findByIdAndUpdate(userId, {
        status: 'online',
        socketId: socket.id,
        lastSeen: Date.now(),
      });

      // Add user to active users map
      activeUsers.set(userId, socket.id);

      // Join user's personal room for direct messages
      socket.join(userId);

      // Get all user's group chats and join their rooms
      const groupChats = await GroupChat.find({
        'members.user': userId,
      });

      groupChats.forEach((group) => {
        socket.join(`group:${group._id.toString()}`);
      });

      // Broadcast user's online status to friends
      const friendships = await Friendship.find({
        $or: [{ requester: userId }, { recipient: userId }],
        status: 'accepted',
      });

      const friendIds = friendships.map((friendship) =>
        friendship.requester.toString() === userId
          ? friendship.recipient.toString()
          : friendship.requester.toString(),
      );

      // Emit status change to all friends
      friendIds.forEach((friendId) => {
        const friendSocketId = activeUsers.get(friendId);
        if (friendSocketId) {
          io.to(friendSocketId).emit('user-status-change', {
            userId: userId,
            username: socket.user.username,
            status: 'online',
          });
        }
      });

      // Emit active friends to the connected user
      const activeFriendIds = friendIds.filter((id) => activeUsers.has(id));
      const activeFriends = activeFriendIds.map((id) => ({
        userId: id,
        status: 'online',
      }));

      socket.emit('active-friends', activeFriends);

      // Fetch and send unread notifications count
      const unreadCount = await Notification.countDocuments({
        recipient: userId,
        isRead: false,
      });

      socket.emit('unread-notifications-count', { count: unreadCount });
    } catch (error) {
      console.error('Error handling socket connection:', error);
    }

    // PRIVATE MESSAGE EVENT
    // Handles sending messages in one-to-one chats
    socket.on('send-private-message', async (data) => {
      try {
        const { recipientId, content, mediaUrl, messageType } = data;
        const senderId = socket.user._id;

        // Find or create a chat between the two users
        let chat = await Chat.findOne({
          participants: { $all: [senderId, recipientId] },
        });

        // If chat doesn't exist, create a new one
        if (!chat) {
          chat = new Chat({
            participants: [senderId, recipientId],
            lastActivity: Date.now(),
          });

          await chat.save();
        } else {
          // Update last activity time
          chat.lastActivity = Date.now();
          await chat.save();
        }

        // Create a new message
        const message = new Message({
          sender: senderId,
          content: content || '',
          chatId: chat._id,
          chatType: 'Chat',
          messageType: messageType || 'text',
          mediaUrl: mediaUrl || null,
          readBy: [{ user: senderId }], // Sender automatically reads their own message
        });

        await message.save();

        // Populate sender information for the response
        await message.populate('sender', 'username profilePicture');

        // Check if recipient is online
        const recipientSocketId = activeUsers.get(recipientId);

        if (recipientSocketId) {
          // Emit message to recipient if online
          io.to(recipientSocketId).emit('receive-private-message', {
            message,
            chat: {
              _id: chat._id,
              participants: chat.participants,
            },
          });
        }

        // Create notification for offline users
        if (!recipientSocketId) {
          // Only create notification if recipient is offline
          const notification = new Notification({
            recipient: recipientId,
            sender: senderId,
            type: 'message',
            content: content
              ? `${
                  socket.user.username
                } sent you a message: ${content.substring(0, 30)}${
                  content.length > 30 ? '...' : ''
                }`
              : `${socket.user.username} sent you a ${messageType}`,
            relatedChatId: chat._id,
            relatedChatType: 'Chat',
            relatedMessageId: message._id,
          });

          await notification.save();
        }

        // Acknowledge message sent successfully
        socket.emit('private-message-sent', { message, chatId: chat._id });
      } catch (error) {
        console.error('Error sending private message:', error);
        socket.emit('message-error', { error: 'Failed to send message' });
      }
    });

    // GROUP MESSAGE EVENT
    // Handles sending messages in group chats
    socket.on('send-group-message', async (data) => {
      try {
        const { groupId, content, mediaUrl, messageType } = data;
        const senderId = socket.user._id;

        // Verify user is a member of the group
        const group = await GroupChat.findById(groupId);

        if (!group) {
          return socket.emit('message-error', { error: 'Group not found' });
        }

        if (!group.hasMember(senderId)) {
          return socket.emit('message-error', {
            error: 'Not a member of this group',
          });
        }

        // Update group's last activity time
        group.lastActivity = Date.now();
        await group.save();

        // Create a new message
        const message = new Message({
          sender: senderId,
          content: content || '',
          chatId: groupId,
          chatType: 'GroupChat',
          messageType: messageType || 'text',
          mediaUrl: mediaUrl || null,
          readBy: [{ user: senderId }], // Sender automatically reads their own message
        });

        await message.save();

        // Populate sender information for the response
        await message.populate('sender', 'username profilePicture');

        // Broadcast message to all members in the group
        io.to(`group:${groupId}`).emit('receive-group-message', {
          message,
          group: {
            _id: group._id,
            name: group.name,
          },
        });

        // Create notifications for offline group members
        const offlineMembers = group.members
          .filter(
            (member) =>
              member.user.toString() !== senderId.toString() && // Not the sender
              !activeUsers.has(member.user.toString()), // Not active
          )
          .map((member) => member.user);

        // Create a notification for each offline member
        if (offlineMembers.length > 0) {
          const notifications = offlineMembers.map((memberId) => ({
            recipient: memberId,
            sender: senderId,
            type: 'message',
            content: content
              ? `${socket.user.username} sent a message in ${
                  group.name
                }: ${content.substring(0, 30)}${
                  content.length > 30 ? '...' : ''
                }`
              : `${socket.user.username} sent a ${messageType} in ${group.name}`,
            relatedChatId: groupId,
            relatedChatType: 'GroupChat',
            relatedMessageId: message._id,
          }));

          await Notification.insertMany(notifications);
        }

        // Acknowledge message sent successfully
        socket.emit('group-message-sent', { message, groupId });
      } catch (error) {
        console.error('Error sending group message:', error);
        socket.emit('message-error', { error: 'Failed to send message' });
      }
    });

    // TYPING INDICATOR EVENTS
    socket.on('typing-start', (data) => {
      const { chatId, chatType } = data;

      if (chatType === 'Chat') {
        // Find the other participant in the chat
        Chat.findById(chatId)
          .then((chat) => {
            if (!chat) return;

            // Get the other user's ID
            const otherUserId = chat.participants.find(
              (id) => id.toString() !== socket.user._id.toString(),
            );

            if (otherUserId) {
              const otherUserSocketId = activeUsers.get(otherUserId.toString());

              if (otherUserSocketId) {
                // Emit typing indicator to the other user
                io.to(otherUserSocketId).emit('typing', {
                  chatId,
                  userId: socket.user._id,
                  username: socket.user.username,
                });
              }
            }
          })
          .catch((err) => console.error('Error in typing indicator:', err));
      } else if (chatType === 'GroupChat') {
        // Broadcast typing to everyone in the group except the sender
        socket.to(`group:${chatId}`).emit('typing', {
          chatId,
          userId: socket.user._id,
          username: socket.user.username,
        });
      }
    });

    socket.on('typing-end', (data) => {
      const { chatId, chatType } = data;

      if (chatType === 'Chat') {
        // Find the other participant in the chat
        Chat.findById(chatId)
          .then((chat) => {
            if (!chat) return;

            // Get the other user's ID
            const otherUserId = chat.participants.find(
              (id) => id.toString() !== socket.user._id.toString(),
            );

            if (otherUserId) {
              const otherUserSocketId = activeUsers.get(otherUserId.toString());

              if (otherUserSocketId) {
                // Emit stop typing indicator to the other user
                io.to(otherUserSocketId).emit('stop-typing', {
                  chatId,
                  userId: socket.user._id,
                });
              }
            }
          })
          .catch((err) =>
            console.error('Error in stop typing indicator:', err),
          );
      } else if (chatType === 'GroupChat') {
        // Broadcast stop typing to everyone in the group except the sender
        socket.to(`group:${chatId}`).emit('stop-typing', {
          chatId,
          userId: socket.user._id,
        });
      }
    });

    // READ RECEIPT EVENT
    socket.on('mark-as-read', async (data) => {
      try {
        const { messageId } = data;
        const userId = socket.user._id;

        // Find the message
        const message = await Message.findById(messageId);

        if (!message) {
          return socket.emit('error', { message: 'Message not found' });
        }

        // Check if user has already read the message
        const alreadyRead = message.readBy.some(
          (read) => read.user.toString() === userId.toString(),
        );

        if (!alreadyRead) {
          // Add user to read receipts
          message.readBy.push({
            user: userId,
            readAt: new Date(),
          });

          await message.save();

          // Emit read receipt to the sender if they're online
          const senderSocketId = activeUsers.get(message.sender.toString());

          if (senderSocketId) {
            io.to(senderSocketId).emit('message-read', {
              messageId,
              userId,
              username: socket.user.username,
              readAt: new Date(),
            });
          }
        }
      } catch (error) {
        console.error('Error marking message as read:', error);
      }
    });

    // MARK ALL MESSAGES AS READ
    socket.on('mark-all-as-read', async (data) => {
      try {
        const { chatId, chatType } = data;
        const userId = socket.user._id;

        // Find all unread messages in this chat that were not sent by the current user
        const unreadMessages = await Message.find({
          chatId,
          chatType,
          sender: { $ne: userId },
          'readBy.user': { $ne: userId },
        });

        // Mark all messages as read
        await Promise.all(
          unreadMessages.map((message) =>
            Message.findByIdAndUpdate(message._id, {
              $push: { readBy: { user: userId, readAt: new Date() } },
            }),
          ),
        );

        // Emit read receipts to senders who are online
        const uniqueSenders = [
          ...new Set(unreadMessages.map((m) => m.sender.toString())),
        ];

        uniqueSenders.forEach((senderId) => {
          const senderSocketId = activeUsers.get(senderId);
          if (senderSocketId) {
            io.to(senderSocketId).emit('messages-read-all', {
              chatId,
              chatType,
              userId,
              username: socket.user.username,
              readAt: new Date(),
            });
          }
        });

        socket.emit('marked-all-as-read', { chatId, chatType });
      } catch (error) {
        console.error('Error marking all messages as read:', error);
      }
    });

    // USER STATUS EVENT - Allow users to manually set status
    socket.on('set-status', async (data) => {
      try {
        const { status } = data;
        const userId = socket.user._id;

        // Validate status
        if (!['online', 'away', 'offline'].includes(status)) {
          return socket.emit('error', { message: 'Invalid status' });
        }

        // Update user status
        await User.findByIdAndUpdate(userId, {
          status,
          lastSeen: status === 'offline' ? Date.now() : undefined,
        });

        // Broadcast status change to friends
        const friendships = await Friendship.find({
          $or: [{ requester: userId }, { recipient: userId }],
          status: 'accepted',
        });

        const friendIds = friendships.map((friendship) =>
          friendship.requester.toString() === userId.toString()
            ? friendship.recipient.toString()
            : friendship.requester.toString(),
        );

        // Emit status change to all online friends
        friendIds.forEach((friendId) => {
          const friendSocketId = activeUsers.get(friendId);
          if (friendSocketId) {
            io.to(friendSocketId).emit('user-status-change', {
              userId: userId.toString(),
              username: socket.user.username,
              status,
              lastSeen: status === 'offline' ? new Date() : undefined,
            });
          }
        });
      } catch (error) {
        console.error('Error setting status:', error);
      }
    });

    // JOIN GROUP CHAT
    socket.on('join-group', async (groupId) => {
      try {
        // Check if group exists and user is a member
        const group = await GroupChat.findById(groupId);

        if (!group) {
          return socket.emit('error', { message: 'Group not found' });
        }

        if (!group.hasMember(socket.user._id)) {
          return socket.emit('error', {
            message: 'Not a member of this group',
          });
        }

        // Join the group's room
        socket.join(`group:${groupId}`);

        socket.emit('joined-group', { groupId });
      } catch (error) {
        console.error('Error joining group:', error);
        socket.emit('error', { message: 'Failed to join group' });
      }
    });

    // LEAVE GROUP CHAT
    socket.on('leave-group', (groupId) => {
      try {
        // Leave the group's room
        socket.leave(`group:${groupId}`);

        socket.emit('left-group', { groupId });
      } catch (error) {
        console.error('Error leaving group:', error);
      }
    });

    // FRIEND REQUEST ACCEPTED EVENT
    socket.on('friend-request-accepted', async (data) => {
      try {
        const { friendId } = data;
        const userId = socket.user._id;

        // Check if friend is online
        const friendSocketId = activeUsers.get(friendId);

        if (friendSocketId) {
          // Emit friend accepted event to the friend
          io.to(friendSocketId).emit('friend-request-accepted', {
            userId: userId.toString(),
            username: socket.user.username,
          });
        }
      } catch (error) {
        console.error('Error processing friend request accepted:', error);
      }
    });

    // NOTIFICATION READ EVENT
    socket.on('notification-read', async (notificationId) => {
      try {
        await Notification.findByIdAndUpdate(notificationId, {
          isRead: true,
          readAt: new Date(),
        });
      } catch (error) {
        console.error('Error marking notification as read:', error);
      }
    });

    // DISCONNECT EVENT
    socket.on('disconnect', async () => {
      console.log(
        `User disconnected: ${socket.user.username} (${socket.user._id})`,
      );

      try {
        const userId = socket.user._id.toString();

        // Update user status and last seen time
        await User.findByIdAndUpdate(userId, {
          status: 'offline',
          lastSeen: Date.now(),
          socketId: null,
        });

        // Remove user from active users map
        activeUsers.delete(userId);

        // Broadcast offline status to friends
        const friendships = await Friendship.find({
          $or: [{ requester: userId }, { recipient: userId }],
          status: 'accepted',
        });

        const friendIds = friendships.map((friendship) =>
          friendship.requester.toString() === userId.toString()
            ? friendship.recipient.toString()
            : friendship.requester.toString(),
        );

        // Emit status change to all online friends
        friendIds.forEach((friendId) => {
          const friendSocketId = activeUsers.get(friendId);
          if (friendSocketId) {
            io.to(friendSocketId).emit('user-status-change', {
              userId,
              username: socket.user.username,
              status: 'offline',
              lastSeen: new Date(),
            });
          }
        });
      } catch (error) {
        console.error('Error handling disconnect:', error);
      }
    });
  });
};

module.exports = {socketHandler};
