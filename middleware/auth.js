const jwt = require('jsonwebtoken');
const User = require('../models/user');

/**
 * Authentication Middleware
 *
 * This middleware protects routes by verifying JWT tokens in request headers.
 * It adds the authenticated user to the request object if verification succeeds.
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next middleware function
 */
const protect = async (req, res, next) => {
  let token;

  // Check if authorization header exists and has the correct format
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // Extract token from the authorization header
      // Format: "Bearer [token]"
      token = req.headers.authorization.split(' ')[1];

      // Verify the token using the JWT_SECRET from environment variables
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // Find user by ID from the decoded token
      // Select all fields except password for security
      req.user = await User.findById(decoded.id).select('-password');

      // If user not found in database despite valid token
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'User not found with this token',
        });
      }

      // Proceed to the protected route
      next();
    } catch (error) {
      // Handle token validation errors
      console.error('Authentication error:', error.message);

      return res.status(401).json({
        success: false,
        message: 'Not authorized, token validation failed',
      });
    }
  }

  // No token provided
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'Not authorized, no token provided',
    });
  }
};

/**
 * Role-Based Authorization Middleware
 *
 * Restricts route access to users with specific roles.
 * Must be used after the protect middleware.
 *
 * @param {Array} roles - Array of allowed roles
 * @returns {Function} - Express middleware function
 */
const authorize = (...roles) => {
  return (req, res, next) => {
    // Check if user's role is included in the allowed roles
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role ${req.user.role} is not authorized to access this resource`,
      });
    }

    next();
  };
};

/**
 * Check if user is the owner of a resource
 *
 * Generic middleware to verify resource ownership
 *
 * @param {Function} getResourceOwner - Function to extract owner ID from request
 * @returns {Function} - Express middleware function
 */
const isOwner = (getResourceOwner) => {
  return async (req, res, next) => {
    try {
      // Get resource owner ID using the provided function
      const ownerId = await getResourceOwner(req);

      // Check if authenticated user is the owner
      if (req.user.id !== ownerId.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Not authorized to perform this action',
        });
      }

      next();
    } catch (error) {
      console.error('Ownership check error:', error.message);

      return res.status(500).json({
        success: false,
        message: 'Error checking resource ownership',
      });
    }
  };
};

// Export all middleware functions
module.exports = { protect, authorize, isOwner };
