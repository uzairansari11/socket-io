const express = require('express');
const http = require('http');
const socketIO = require('socket.io');
const path = require('path');
const dotenv = require('dotenv');
const cors = require('cors');
const morgan = require('morgan');
const helmet = require('helmet');
const compression = require('compression');

// Load environment variables
dotenv.config();

// Import database connection

// Import socket handler

const { authRoute } = require('./routes/auth');
const { usersRoute } = require('./routes/users');
const { chatRoute } = require('./routes/chats');
const { groupChatRoute } = require('./routes/group-chats');
const { friendsRoute } = require('./routes/friends');
const { notificationRoute } = require('./routes/notifications');
const { messageRoute } = require('./routes/messages');
const { socketHandler } = require('./socket/socket-handler');
const { connectDB } = require('./config/db');

// Connect to database

// Initialize Express app
const app = express();

// Create HTTP server
const server = http.createServer(app);

// Initialize Socket.IO
const io = socketIO(server, {
  cors: {
    origin:
      process.env.NODE_ENV === 'production' ? process.env.CLIENT_URL : '*',
    methods: ['GET', 'POST'],
    credentials: true,
  },
});

// Pass Socket.IO instance to handler
socketHandler(io);

// Middleware
// Security headers
app.use(helmet());

// Enable CORS
app.use(cors());

// Parse JSON request body
app.use(express.json());

// Parse URL-encoded form data
app.use(express.urlencoded({ extended: true }));

// Compress all responses
app.use(compression());

// HTTP request logger in development mode
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// Static files directory
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Define API routes
app.use('/api/auth', authRoute);
app.use('/api/users', usersRoute);
app.use('/api/chats', chatRoute);
app.use('/api/group-chats', groupChatRoute);
app.use('/api/friends', friendsRoute);
app.use('/api/notifications', notificationRoute);
app.use('/api/messages', messageRoute);

// Basic route for API testing
app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to the Chat Application API',
    status: 'Server is running',
  });
});

// Handle 404 errors
app.use((req, res, next) => {
  res.status(404).json({
    success: false,
    message: 'API endpoint not found',
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);

  res.status(err.status || 500).json({
    success: false,
    message: err.message || 'Internal Server Error',
  });
});

// Get port from environment variables
const PORT = process.env.PORT || 5000;

// Start server
server.listen(PORT, () => {
  connectDB();

  console.log(`Server running in ${process.env.NODE_ENV} mode on port ${PORT}`);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (err) => {
  console.error('Unhandled Promise Rejection:', err);
  // Close server & exit process
  server.close(() => process.exit(1));
});
