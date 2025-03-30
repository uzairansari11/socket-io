const { deleteFile } = require('../middleware/upload');
const GroupChat = require('../models/group-chat');
const Media = require('../models/media');
const Message = require('../models/message');
const Notification = require('../models/notification');
const User = require('../models/user');

/**
 * Get all group chats for a user
 *
 * @route   GET /api/group-chats
 * @access  Private
 */
const getUserGroupChats = async (req, res) => {
  try {
    // Find all group chats where the user is a member
    const groupChats = await GroupChat.find({
      'members.user': req.user.id,
    })
      .populate('admin', 'username email profilePicture')
      .populate('members.user', 'username email profilePicture status lastSeen')
      .sort({ updatedAt: -1 }); // Sort by most recent activity

    // For each group chat, get the last message
    const groupsWithLastMessage = await Promise.all(
      groupChats.map(async (group) => {
        // Find the last message in this group
        const lastMessage = await Message.findOne({
          chatId: group._id,
          chatType: 'GroupChat',
        })
          .sort({ createdAt: -1 })
          .populate('sender', 'username');

        // Return group with additional information
        return {
          _id: group._id,
          name: group.name,
          description: group.description,
          groupPicture: group.groupPicture,
          admin: group.admin,
          members: group.members,
          isPublic: group.isPublic,
          lastMessage: lastMessage || null,
          lastActivity: group.lastActivity,
          updatedAt: group.updatedAt,
          createdAt: group.createdAt,
          // Get user's role in this group
          userRole:
            group.members.find(
              (member) => member.user._id.toString() === req.user.id,
            )?.role || 'member',
        };
      }),
    );

    res.status(200).json({
      success: true,
      count: groupsWithLastMessage.length,
      groups: groupsWithLastMessage,
    });
  } catch (error) {
    console.error('Get user group chats error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching group chats',
    });
  }
};

/**
 * Create a new group chat
 *
 * @route   POST /api/group-chats
 * @access  Private
 */
const createGroupChat = async (req, res) => {
  try {
    const { name, description, members, isPublic } = req.body;

    // Validate name
    if (!name || name.trim().length < 3) {
      return res.status(400).json({
        success: false,
        message: 'Group name must be at least 3 characters',
      });
    }

    // Ensure current user is included in members
    let membersList = Array.isArray(members) ? [...members] : [];
    if (!membersList.includes(req.user.id)) {
      membersList.push(req.user.id);
    }

    // Remove duplicates
    membersList = [...new Set(membersList)];

    // Validate member IDs
    for (const memberId of membersList) {
      const user = await User.findById(memberId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: `User with ID ${memberId} not found`,
        });
      }
    }

    // Format members with roles (creator is admin)
    const formattedMembers = membersList.map((memberId) => ({
      user: memberId,
      role: memberId === req.user.id ? 'admin' : 'member',
      joinedAt: Date.now(),
    }));

    // Create the group chat
    const groupChat = new GroupChat({
      name,
      description: description || '',
      admin: req.user.id,
      members: formattedMembers,
      isPublic: isPublic || false,
      lastActivity: Date.now(),
    });

    await groupChat.save();

    // Populate member information
    await groupChat.populate('admin', 'username email profilePicture');
    await groupChat.populate(
      'members.user',
      'username email profilePicture status',
    );

    // Create notifications for all members except creator
    const notifications = membersList
      .filter((memberId) => memberId !== req.user.id)
      .map((memberId) => ({
        recipient: memberId,
        sender: req.user.id,
        type: 'groupInvite',
        content: `${req.user.username} added you to group "${name}"`,
        relatedChatId: groupChat._id,
        relatedChatType: 'GroupChat',
      }));

    if (notifications.length > 0) {
      await Notification.insertMany(notifications);
    }

    // Create system message in the group
    const systemMessage = new Message({
      sender: req.user.id,
      content: `Group "${name}" created by ${req.user.username}`,
      chatId: groupChat._id,
      chatType: 'GroupChat',
      messageType: 'system',
      readBy: [{ user: req.user.id }],
    });

    await systemMessage.save();

    res.status(201).json({
      success: true,
      groupChat,
    });
  } catch (error) {
    console.error('Create group chat error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while creating group chat',
    });
  }
};

/**
 * Get group chat by ID
 *
 * @route   GET /api/group-chats/:id
 * @access  Private
 */
const getGroupChatById = async (req, res) => {
  try {
    const groupChat = await GroupChat.findById(req.params.id)
      .populate('admin', 'username email profilePicture')
      .populate(
        'members.user',
        'username email profilePicture status lastSeen',
      );

    if (!groupChat) {
      return res.status(404).json({
        success: false,
        message: 'Group chat not found',
      });
    }

    // Check if user is a member of this group
    if (!groupChat.hasMember(req.user.id)) {
      // If group is public, allow viewing but not the messages
      if (!groupChat.isPublic) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to access this group chat',
        });
      }
    }

    // Get user's role in this group
    const userRole = groupChat.getMemberRole(req.user.id);

    res.status(200).json({
      success: true,
      groupChat: {
        ...groupChat.toObject(),
        userRole,
      },
    });
  } catch (error) {
    console.error('Get group chat by ID error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Group chat not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching group chat',
    });
  }
};

/**
 * Update group chat information
 *
 * @route   PUT /api/group-chats/:id
 * @access  Private
 */
const updateGroupChat = async (req, res) => {
  try {
    const { name, description, isPublic } = req.body;

    // Find group chat
    const groupChat = await GroupChat.findById(req.params.id);

    if (!groupChat) {
      return res.status(404).json({
        success: false,
        message: 'Group chat not found',
      });
    }

    // Check if user is admin or moderator of this group
    if (!groupChat.isModerator(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update this group chat',
      });
    }

    // Update fields if provided
    if (name) groupChat.name = name;
    if (description !== undefined) groupChat.description = description;
    if (isPublic !== undefined) groupChat.isPublic = isPublic;

    groupChat.updatedAt = Date.now();
    await groupChat.save();

    // Create system message about the update
    const systemMessage = new Message({
      sender: req.user.id,
      content: `${req.user.username} updated the group information`,
      chatId: groupChat._id,
      chatType: 'GroupChat',
      messageType: 'system',
      readBy: [{ user: req.user.id }],
    });

    await systemMessage.save();

    // Populate member information
    await groupChat.populate('admin', 'username email profilePicture');
    await groupChat.populate(
      'members.user',
      'username email profilePicture status',
    );

    res.status(200).json({
      success: true,
      groupChat,
    });
  } catch (error) {
    console.error('Update group chat error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Group chat not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating group chat',
    });
  }
};

/**
 * Add members to group chat
 *
 * @route   POST /api/group-chats/:id/members
 * @access  Private
 */
const addGroupMembers = async (req, res) => {
  try {
    const { members } = req.body;

    if (!Array.isArray(members) || members.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Please provide an array of member IDs',
      });
    }

    // Find group chat
    const groupChat = await GroupChat.findById(req.params.id);

    if (!groupChat) {
      return res.status(404).json({
        success: false,
        message: 'Group chat not found',
      });
    }

    // Check if user is admin or moderator of this group
    if (!groupChat.isModerator(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to add members to this group',
      });
    }

    // Get existing member IDs
    const existingMemberIds = groupChat.members.map((member) =>
      member.user.toString(),
    );

    // Filter out members that are already in the group
    const newMembers = members.filter(
      (memberId) => !existingMemberIds.includes(memberId),
    );

    if (newMembers.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'All specified users are already members of this group',
      });
    }

    // Validate member IDs
    for (const memberId of newMembers) {
      const user = await User.findById(memberId);
      if (!user) {
        return res.status(404).json({
          success: false,
          message: `User with ID ${memberId} not found`,
        });
      }
    }

    // Add new members to the group
    const newMemberObjects = newMembers.map((memberId) => ({
      user: memberId,
      role: 'member',
      joinedAt: Date.now(),
    }));

    groupChat.members.push(...newMemberObjects);
    groupChat.updatedAt = Date.now();
    await groupChat.save();

    // Create notifications for new members
    const notifications = newMembers.map((memberId) => ({
      recipient: memberId,
      sender: req.user.id,
      type: 'groupInvite',
      content: `${req.user.username} added you to group "${groupChat.name}"`,
      relatedChatId: groupChat._id,
      relatedChatType: 'GroupChat',
    }));

    await Notification.insertMany(notifications);

    // Create system message about new members
    const addedUsers = await User.find({ _id: { $in: newMembers } }).select(
      'username',
    );

    const usernames = addedUsers.map((user) => user.username).join(', ');
    const systemMessage = new Message({
      sender: req.user.id,
      content: `${req.user.username} added ${usernames} to the group`,
      chatId: groupChat._id,
      chatType: 'GroupChat',
      messageType: 'system',
      readBy: [{ user: req.user.id }],
    });

    await systemMessage.save();

    // Populate member information
    await groupChat.populate(
      'members.user',
      'username email profilePicture status',
    );

    res.status(200).json({
      success: true,
      groupChat,
    });
  } catch (error) {
    console.error('Add group members error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Group chat or user not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while adding members',
    });
  }
};

/**
 * Remove member from group chat
 *
 * @route   DELETE /api/group-chats/:id/members/:userId
 * @access  Private
 */
const removeGroupMember = async (req, res) => {
  try {
    const groupId = req.params.id;
    const memberIdToRemove = req.params.userId;

    // Find group chat
    const groupChat = await GroupChat.findById(groupId);

    if (!groupChat) {
      return res.status(404).json({
        success: false,
        message: 'Group chat not found',
      });
    }

    // Check if the member exists in the group
    const memberIndex = groupChat.members.findIndex(
      (member) => member.user.toString() === memberIdToRemove,
    );

    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in this group',
      });
    }

    // Get the member's role
    const memberRole = groupChat.members[memberIndex].role;

    // If removing someone else
    if (memberIdToRemove !== req.user.id) {
      // Check if user is admin or moderator
      if (!groupChat.isModerator(req.user.id)) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to remove members from this group',
        });
      }

      // Check if user is trying to remove the admin
      if (memberIdToRemove === groupChat.admin.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Cannot remove the group admin',
        });
      }

      // Check if moderator is trying to remove another moderator
      if (
        groupChat.getMemberRole(req.user.id) === 'moderator' &&
        memberRole === 'moderator'
      ) {
        return res.status(403).json({
          success: false,
          message: 'Moderators cannot remove other moderators',
        });
      }
    }

    // If admin is leaving, transfer admin role to a moderator or another member
    if (
      memberIdToRemove === req.user.id &&
      groupChat.admin.toString() === req.user.id
    ) {
      // Find a moderator to promote
      const moderatorIndex = groupChat.members.findIndex(
        (member) =>
          member.user.toString() !== req.user.id && member.role === 'moderator',
      );

      // If there's a moderator, make them admin
      if (moderatorIndex !== -1) {
        const newAdminId = groupChat.members[moderatorIndex].user;
        groupChat.admin = newAdminId;
        groupChat.members[moderatorIndex].role = 'admin';
      } else {
        // If no moderator, find another member
        const anotherMemberIndex = groupChat.members.findIndex(
          (member) => member.user.toString() !== req.user.id,
        );

        // If there are other members, make one the admin
        if (anotherMemberIndex !== -1) {
          const newAdminId = groupChat.members[anotherMemberIndex].user;
          groupChat.admin = newAdminId;
          groupChat.members[anotherMemberIndex].role = 'admin';
        } else {
          // If no other members, delete the group
          await GroupChat.findByIdAndDelete(groupId);

          return res.status(200).json({
            success: true,
            message: 'Group deleted as you were the last member',
          });
        }
      }
    }

    // Get member information for notification
    const memberUsername = (await User.findById(memberIdToRemove)).username;

    // Remove the member
    groupChat.members.splice(memberIndex, 1);
    groupChat.updatedAt = Date.now();
    await groupChat.save();

    // Create system message about member removal
    const messageContent =
      memberIdToRemove === req.user.id
        ? `${req.user.username} left the group`
        : `${req.user.username} removed ${memberUsername} from the group`;

    const systemMessage = new Message({
      sender: req.user.id,
      content: messageContent,
      chatId: groupId,
      chatType: 'GroupChat',
      messageType: 'system',
      readBy: [{ user: req.user.id }],
    });

    await systemMessage.save();

    res.status(200).json({
      success: true,
      message:
        memberIdToRemove === req.user.id
          ? 'You left the group'
          : `${memberUsername} removed from the group`,
      groupChat,
    });
  } catch (error) {
    console.error('Remove group member error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Group chat or user not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while removing member',
    });
  }
};

/**
 * Update member role in group chat
 *
 * @route   PUT /api/group-chats/:id/members/:userId
 * @access  Private
 */
const updateMemberRole = async (req, res) => {
  try {
    const { role } = req.body;
    const groupId = req.params.id;
    const memberIdToUpdate = req.params.userId;

    // Validate role
    if (!['admin', 'moderator', 'member'].includes(role)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid role. Must be admin, moderator, or member',
      });
    }

    // Find group chat
    const groupChat = await GroupChat.findById(groupId);

    if (!groupChat) {
      return res.status(404).json({
        success: false,
        message: 'Group chat not found',
      });
    }

    // Check if the member exists in the group
    const memberIndex = groupChat.members.findIndex(
      (member) => member.user.toString() === memberIdToUpdate,
    );

    if (memberIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Member not found in this group',
      });
    }

    // Only group admin can change roles
    if (groupChat.admin.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Only the group admin can change member roles',
      });
    }

    // Admin cannot change their own role
    if (memberIdToUpdate === req.user.id && role !== 'admin') {
      return res.status(400).json({
        success: false,
        message: 'Admin cannot change their own role',
      });
    }

    // Get member information for notification and message
    const memberUsername = (await User.findById(memberIdToUpdate)).username;
    const currentRole = groupChat.members[memberIndex].role;

    // If making someone else admin
    if (role === 'admin' && memberIdToUpdate !== req.user.id) {
      // Change current admin to moderator
      const currentAdminIndex = groupChat.members.findIndex(
        (member) => member.user.toString() === req.user.id,
      );

      if (currentAdminIndex !== -1) {
        groupChat.members[currentAdminIndex].role = 'moderator';
      }

      // Set new admin
      groupChat.admin = memberIdToUpdate;
    }

    // Update member role
    groupChat.members[memberIndex].role = role;
    groupChat.updatedAt = Date.now();
    await groupChat.save();

    // Create system message about role change
    const systemMessage = new Message({
      sender: req.user.id,
      content: `${req.user.username} changed ${memberUsername}'s role from ${currentRole} to ${role}`,
      chatId: groupId,
      chatType: 'GroupChat',
      messageType: 'system',
      readBy: [{ user: req.user.id }],
    });

    await systemMessage.save();

    // Create notification for the member
    if (memberIdToUpdate !== req.user.id) {
      const notification = new Notification({
        recipient: memberIdToUpdate,
        sender: req.user.id,
        type: 'groupActivity',
        content: `${req.user.username} changed your role to ${role} in "${groupChat.name}"`,
        relatedChatId: groupId,
        relatedChatType: 'GroupChat',
      });

      await notification.save();
    }

    // Populate member information
    await groupChat.populate(
      'members.user',
      'username email profilePicture status',
    );

    res.status(200).json({
      success: true,
      message: `${memberUsername}'s role updated to ${role}`,
      groupChat,
    });
  } catch (error) {
    console.error('Update member role error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Group chat or user not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while updating member role',
    });
  }
};

/**
 * Upload group picture
 *
 * @route   POST /api/group-chats/:id/picture
 * @access  Private
 */
const uploadGroupPicture = async (req, res) => {
  try {
    // Find group chat
    const groupChat = await GroupChat.findById(req.params.id);

    if (!groupChat) {
      return res.status(404).json({
        success: false,
        message: 'Group chat not found',
      });
    }

    // Check if user is admin or moderator of this group
    if (!groupChat.isModerator(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to update group picture',
      });
    }

    // Check if file is uploaded
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

    // Create new media record for the group picture
    const media = new Media({
      originalName: originalname,
      fileSize: size,
      mimeType: mimetype,
      url: `/uploads/images/${filename}`,
      uploader: req.user.id,
      mediaType: 'image',
      isProfilePicture: false,
    });

    await media.save();

    // Get group's current picture
    const oldGroupPicture = groupChat.groupPicture;

    // Update group's picture
    groupChat.groupPicture = `/uploads/images/${filename}`;
    groupChat.updatedAt = Date.now();
    await groupChat.save();

    // If group had a custom picture (not the default), delete the old one
    if (oldGroupPicture && oldGroupPicture !== 'default-group.png') {
      // Find if the old picture exists in the Media collection
      const oldMedia = await Media.findOne({ url: oldGroupPicture });

      if (oldMedia) {
        // Delete the file from the filesystem
        await deleteFile(oldGroupPicture);

        // Delete the media record
        await Media.findByIdAndDelete(oldMedia._id);
      }
    }

    // Create system message about picture update
    const systemMessage = new Message({
      sender: req.user.id,
      content: `${req.user.username} updated the group picture`,
      chatId: groupChat._id,
      chatType: 'GroupChat',
      messageType: 'system',
      readBy: [{ user: req.user.id }],
    });

    await systemMessage.save();

    res.status(200).json({
      success: true,
      groupPicture: `/uploads/images/${filename}`,
      message: 'Group picture updated successfully',
    });
  } catch (error) {
    console.error('Group picture upload error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Group chat not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while uploading group picture',
    });
  }
};

/**
 * Get messages for a group chat
 *
 * @route   GET /api/group-chats/:id/messages
 * @access  Private
 */
const getGroupMessages = async (req, res) => {
  try {
    // Parse query parameters for pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Find group chat by ID
    const groupChat = await GroupChat.findById(req.params.id);

    if (!groupChat) {
      return res.status(404).json({
        success: false,
        message: 'Group chat not found',
      });
    }

    // Check if user is a member of this group
    if (!groupChat.hasMember(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access messages in this group',
      });
    }

    // Get messages for this group with pagination
    // Sort by createdAt descending to get newest messages first
    const messages = await Message.find({
      chatId: req.params.id,
      chatType: 'GroupChat',
    })
      .populate('sender', 'username profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total messages count for pagination
    const total = await Message.countDocuments({
      chatId: req.params.id,
      chatType: 'GroupChat',
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
    console.error('Get group messages error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Group chat not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while fetching messages',
    });
  }
};

/**
 * Send a message in a group chat
 *
 * @route   POST /api/group-chats/:id/messages
 * @access  Private
 */
const sendGroupMessage = async (req, res) => {
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

    // Find group chat by ID
    const groupChat = await GroupChat.findById(req.params.id);

    if (!groupChat) {
      return res.status(404).json({
        success: false,
        message: 'Group chat not found',
      });
    }

    // Check if user is a member of this group
    if (!groupChat.hasMember(req.user.id)) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to send messages in this group',
      });
    }

    // Create new message
    const message = new Message({
      sender: req.user.id,
      content: content || '',
      chatId: groupChat._id,
      chatType: 'GroupChat',
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

    // Update group's last activity time
    groupChat.lastActivity = Date.now();
    groupChat.updatedAt = Date.now();
    await groupChat.save();

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
    console.error('Send group message error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Group chat not found',
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
  getUserGroupChats,
  createGroupChat,
  getGroupChatById,
  updateGroupChat,
  addGroupMembers,
  removeGroupMember,
  updateMemberRole,
  uploadGroupPicture,
  getGroupMessages,
  sendGroupMessage,
};
