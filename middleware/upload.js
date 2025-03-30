const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

/**
 * Configure storage for file uploads
 *
 * Creates custom filename with UUID to prevent filename collisions
 * Organizes files into subdirectories by file type
 */
const storage = multer.diskStorage({
  // Set the destination directory based on file type
  destination: (req, file, cb) => {
    // Determine which subdirectory to use based on mimetype
    let uploadPath = 'uploads/';

    if (file.mimetype.startsWith('image/')) {
      uploadPath += 'images/';
    } else if (file.mimetype.startsWith('video/')) {
      uploadPath += 'videos/';
    } else if (file.mimetype.startsWith('audio/')) {
      uploadPath += 'audio/';
    } else {
      uploadPath += 'documents/';
    }

    // Create directory if it doesn't exist
    const fullPath = path.join(__dirname, '..', uploadPath);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
    }

    cb(null, uploadPath);
  },

  // Generate a unique filename for the uploaded file
  filename: (req, file, cb) => {
    // Extract file extension from original filename
    const fileExt = path.extname(file.originalname);

    // Create unique filename with UUID to prevent collisions
    // Include original filename for readability but sanitize it
    const sanitizedName = file.originalname
      .replace(fileExt, '') // Remove extension
      .replace(/[^a-zA-Z0-9]/g, '_') // Replace non-alphanumeric chars with underscore
      .substring(0, 30); // Limit name length

    // Format: timestamp-uuid-sanitizedName.extension
    const newFilename = `${Date.now()}-${uuidv4().substring(
      0,
      8,
    )}-${sanitizedName}${fileExt}`;

    cb(null, newFilename);
  },
});

/**
 * File filter function to restrict file types
 *
 * @param {Object} req - Express request object
 * @param {Object} file - Uploaded file object
 * @param {Function} cb - Callback function
 */
const fileFilter = (req, file, cb) => {
  // Define allowed MIME types
  const allowedMimeTypes = [
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // Videos
    'video/mp4',
    'video/webm',
    'video/quicktime',
    // Audio
    'audio/mpeg',
    'audio/wav',
    'audio/ogg',
    // Documents
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain',
  ];

  // Check if the MIME type is in our allowed list
  if (allowedMimeTypes.includes(file.mimetype)) {
    // Accept the file
    cb(null, true);
  } else {
    // Reject the file
    cb(
      new Error(
        'Invalid file type. Only images, videos, audio, and documents are allowed.',
      ),
      false,
    );
  }
};

/**
 * Configure Multer with our storage and file filter
 */
const upload = multer({
  storage: storage,
  fileFilter: fileFilter,
  limits: {
    // Maximum file size (10MB) from environment variables
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024,
  },
});

/**
 * Error handling middleware for multer upload errors
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const handleUploadErrors = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    // A Multer error occurred when uploading
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        message: `File too large. Maximum size is ${(
          parseInt(process.env.MAX_FILE_SIZE) /
          (1024 * 1024)
        ).toFixed(1)}MB`,
      });
    }

    // Other Multer errors
    return res.status(400).json({
      success: false,
      message: `Upload error: ${err.message}`,
    });
  } else if (err) {
    // Other errors (like from our fileFilter)
    return res.status(400).json({
      success: false,
      message: err.message,
    });
  }

  // No error, continue
  next();
};

/**
 * Helper function to delete a file from the filesystem
 *
 * @param {string} filePath - Path to the file to delete
 * @returns {Promise} - Resolves when file is deleted
 */
const deleteFile = (filePath) => {
  return new Promise((resolve, reject) => {
    // Check if file exists before attempting to delete
    const fullPath = path.join(__dirname, '..', filePath);

    fs.access(fullPath, fs.constants.F_OK, (err) => {
      if (err) {
        // File doesn't exist, nothing to delete
        return resolve();
      }

      // File exists, try to delete it
      fs.unlink(fullPath, (err) => {
        if (err) {
          return reject(err);
        }
        resolve();
      });
    });
  });
};

// Export the configured multer middleware and helpers
module.exports = {
  // Single file upload middleware (field name as parameter)
  uploadSingle: (fieldName) => upload.single(fieldName),

  // Multiple files upload middleware (field name and max count)
  uploadMultiple: (fieldName, maxCount) => upload.array(fieldName, maxCount),

  // Various fields upload middleware (array of { name, maxCount })
  uploadFields: (fields) => upload.fields(fields),

  // Error handler middleware
  handleUploadErrors,

  // File deletion helper
  deleteFile,
};
