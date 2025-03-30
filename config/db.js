const mongoose = require('mongoose');

/**
 * Connect to MongoDB using Mongoose
 *
 * This function establishes a connection to the MongoDB database
 * using the connection string from environment variables.
 * It handles connection errors and successful connections with
 * appropriate logging.
 */
const connectDB = async () => {
  try {
    // Connect to MongoDB using the URI from environment variables
    // Options ensure proper connection behavior and handle deprecation warnings
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      useNewUrlParser: true,           // Use the new URL parser
      useUnifiedTopology: true,        // Use the new Server Discovery and Monitoring engine
    });

    // Log successful connection with the host information
    console.log(`MongoDB Connected: ${conn.connection.host}`);
  } catch (error) {
    // Log any connection errors
    console.error(`Error connecting to MongoDB: ${error.message}`);

    // Exit process with failure if cannot connect to database
    // This is critical as the application cannot function without database access
    process.exit(1);
  }
};

// Export the connection function to be used in server.js
module.exports = connectDB;
