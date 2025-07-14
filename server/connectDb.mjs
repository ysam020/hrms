import mongoose from "mongoose";
import dotenv from "dotenv";
import dns from "dns";

dotenv.config();

const MONGODB_URI =
  process.env.NODE_ENV === "production"
    ? process.env.PROD_MONGODB_URI
    : process.env.DEV_MONGODB_URI;

let isConnected = false;
let reconnectTimer = null;

// Check for internet connectivity
const checkInternetConnection = () => {
  return new Promise((resolve) => {
    dns.lookup("google.com", (err) => {
      resolve(!err);
    });
  });
};

const connectDB = async () => {
  try {
    if (isConnected) return;

    mongoose.set("strictQuery", true);
    mongoose.set("bufferCommands", false);

    await mongoose.connect(MONGODB_URI, {
      minPoolSize: 10,
      maxPoolSize: 100,
      serverSelectionTimeoutMS: 30000,
      connectTimeoutMS: 60000,
      socketTimeoutMS: 60000,
      retryWrites: true,
      family: 4,
    });

    isConnected = true;

    // Clear any existing reconnect timer if connection is successful
    if (reconnectTimer) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  } catch (error) {
    console.error("Error connecting to MongoDB Atlas:", error.message);
    isConnected = false;
    monitorInternetConnection();
  }
};

const monitorInternetConnection = async () => {
  // Clear any existing timer to avoid multiple timers
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
  }

  reconnectTimer = setInterval(async () => {
    const isOnline = await checkInternetConnection();

    if (isOnline && !isConnected) {
      await connectDB();
    }

    // If we're connected, stop monitoring
    if (isConnected) {
      clearInterval(reconnectTimer);
      reconnectTimer = null;
    }
  }, 5000);
};

// Handle MongoDB disconnection events
mongoose.connection.on("disconnected", () => {
  isConnected = false;
  monitorInternetConnection();
});

// Handle MongoDB connection errors
mongoose.connection.on("error", (err) => {
  console.error("MongoDB connection error:", err.message);
  isConnected = false;
  monitorInternetConnection();
});

export const connectionCleanup = () => {
  // Clear any reconnect timers on shutdown
  if (reconnectTimer) {
    clearInterval(reconnectTimer);
  }

  process.on("SIGINT", async () => {
    if (reconnectTimer) clearInterval(reconnectTimer);
    await mongoose.connection.close();
    process.exit(0);
  });

  process.on("SIGTERM", async () => {
    if (reconnectTimer) clearInterval(reconnectTimer);
    await mongoose.connection.close();
    process.exit(0);
  });
};

export default connectDB;
