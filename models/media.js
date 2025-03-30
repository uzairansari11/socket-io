const mongoose = require('mongoose');

/**
 * Media Schema Definition
 *
 * This schema represents uploaded media files in the application.
 * It tracks file metadata and relationships to messages and users.
 */
const MediaSchema = new mongoose.Schema(
  {
    // Original filename from the uploader
    originalName: {
      type: String,
      required: true, // Must know the original filename
    },

    // Size of the file in bytes
    fileSize: {
      type: Number,
      required: true, // Must know the file size
    },

    // MIME type of the file (e.g., image/jpeg, audio/mp3)
    mimeType: {
      type: String,
      required: true, // Must know the file type
    },

    // The URL path where the file is stored
    url: {
      type: String,
      required: true, // Must have a URL to access the file
    },

    // The user who uploaded the file
    uploader: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User', // Reference to User model
      required: true, // A file must have an uploader
    },

    // The message this media is attached to (if any)
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message', // Reference to Message model
      default: null, // Not all media may be attached to messages
    },

    // For images and videos, store dimensions
    dimensions: {
      width: Number,
      height: Number,
    },

    // For audio and video files, store duration in seconds
    duration: {
      type: Number,
    },

    // Type of media for easier filtering
    mediaType: {
      type: String,
      enum: ['image', 'audio', 'video', 'document', 'other'],
      required: true,
    },

    // Thumbnail URL for videos and some document types
    thumbnailUrl: {
      type: String,
    },

    // If this is a profile or group picture
    isProfilePicture: {
      type: Boolean,
      default: false,
    },

    // Upload timestamp
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true, // Automatically manage createdAt and updatedAt
  },
);

/**
 * Index to improve query performance
 */
MediaSchema.index({ uploader: 1 });
MediaSchema.index({ messageId: 1 });
MediaSchema.index({ mediaType: 1 });

/**
 * Method to determine if media file is an image
 *
 * @returns {boolean} - True if the file is an image, false otherwise
 */
MediaSchema.methods.isImage = function () {
  return this.mimeType.startsWith('image/');
};

/**
 * Method to determine if media file is an audio
 *
 * @returns {boolean} - True if the file is audio, false otherwise
 */
MediaSchema.methods.isAudio = function () {
  return this.mimeType.startsWith('audio/');
};

/**
 * Method to determine if media file is a video
 *
 * @returns {boolean} - True if the file is a video, false otherwise
 */
MediaSchema.methods.isVideo = function () {
  return this.mimeType.startsWith('video/');
};

/**
 * Method to get formatted file size in human-readable format
 *
 * @returns {string} - Formatted file size (e.g., "1.5 MB")
 */
MediaSchema.methods.getFormattedSize = function () {
  const bytes = this.fileSize;

  if (bytes < 1024) {
    return bytes + ' B';
  } else if (bytes < 1048576) {
    return (bytes / 1024).toFixed(1) + ' KB';
  } else if (bytes < 1073741824) {
    return (bytes / 1048576).toFixed(1) + ' MB';
  } else {
    return (bytes / 1073741824).toFixed(1) + ' GB';
  }
};

// Create and export the Media model
const Media = mongoose.model('Media', MediaSchema);
module.exports = Media;
