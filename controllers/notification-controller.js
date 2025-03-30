const Notification = require('../models/notification');

/**
 * Get all notifications for a user
 *
 * @route   GET /api/notifications
 * @access  Private
 */
const getNotifications = async (req, res) => {
  try {
    // Parse query parameters for pagination
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 20;
    const skip = (page - 1) * limit;

    // Get notifications for the user with pagination
    const notifications = await Notification.find({ recipient: req.user.id })
      .populate('sender', 'username profilePicture')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    // Get total notifications count for pagination
    const total = await Notification.countDocuments({ recipient: req.user.id });

    // Calculate total pages
    const totalPages = Math.ceil(total / limit);

    // Get unread count
    const unreadCount = await Notification.countDocuments({
      recipient: req.user.id,
      isRead: false,
    });

    res.status(200).json({
      success: true,
      count: notifications.length,
      unreadCount,
      pagination: {
        total,
        page,
        limit,
        totalPages,
      },
      notifications,
    });
  } catch (error) {
    console.error('Get notifications error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while fetching notifications',
    });
  }
};

/**
 * Mark notification as read
 *
 * @route   PUT /api/notifications/:id/read
 * @access  Private
 */
const markAsRead = async (req, res) => {
  try {
    // Find notification by ID
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    // Check if user is the recipient of this notification
    if (notification.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to access this notification',
      });
    }

    // If notification is already read, just return it
    if (notification.isRead) {
      return res.status(200).json({
        success: true,
        notification,
      });
    }

    // Mark as read
    notification.isRead = true;
    notification.readAt = Date.now();
    await notification.save();

    res.status(200).json({
      success: true,
      notification,
    });
  } catch (error) {
    console.error('Mark notification as read error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while marking notification as read',
    });
  }
};

/**
 * Mark all notifications as read
 *
 * @route   PUT /api/notifications/read-all
 * @access  Private
 */
const markAllAsRead = async (req, res) => {
  try {
    // Update all unread notifications for this user
    const result = await Notification.updateMany(
      { recipient: req.user.id, isRead: false },
      { isRead: true, readAt: Date.now() },
    );

    res.status(200).json({
      success: true,
      message: 'All notifications marked as read',
      count: result.nModified,
    });
  } catch (error) {
    console.error('Mark all notifications as read error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while marking notifications as read',
    });
  }
};

/**
 * Delete a notification
 *
 * @route   DELETE /api/notifications/:id
 * @access  Private
 */
const deleteNotification = async (req, res) => {
  try {
    // Find notification by ID
    const notification = await Notification.findById(req.params.id);

    if (!notification) {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    // Check if user is the recipient of this notification
    if (notification.recipient.toString() !== req.user.id) {
      return res.status(403).json({
        success: false,
        message: 'Not authorized to delete this notification',
      });
    }

    // Delete the notification
    await Notification.findByIdAndDelete(req.params.id);

    res.status(200).json({
      success: true,
      message: 'Notification deleted successfully',
    });
  } catch (error) {
    console.error('Delete notification error:', error.message);

    // Check if error is due to invalid ID format
    if (error.kind === 'ObjectId') {
      return res.status(404).json({
        success: false,
        message: 'Notification not found',
      });
    }

    res.status(500).json({
      success: false,
      message: 'Server error while deleting notification',
    });
  }
};

/**
 * Delete all read notifications
 *
 * @route   DELETE /api/notifications/read
 * @access  Private
 */
const deleteReadNotifications = async (req, res) => {
  try {
    // Delete all read notifications for this user
    const result = await Notification.deleteMany({
      recipient: req.user.id,
      isRead: true,
    });

    res.status(200).json({
      success: true,
      message: 'All read notifications deleted',
      count: result.deletedCount,
    });
  } catch (error) {
    console.error('Delete read notifications error:', error.message);
    res.status(500).json({
      success: false,
      message: 'Server error while deleting notifications',
    });
  }
};

// Export all controller functions
module.exports = {
  getNotifications,
  markAsRead,
  markAllAsRead,
  deleteNotification,
  deleteReadNotifications,
};
