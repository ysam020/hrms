import { useState, useEffect, useContext, useRef, useCallback } from "react";
import { io } from "socket.io-client";
import apiClient from "../config/axiosConfig";
import { UserContext } from "../contexts/UserContext";

function useNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const { user } = useContext(UserContext);
  const socketRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);

  // Callback to handle new notifications
  const handleNotification = useCallback((data) => {
    setNotifications((prev) => {
      // Check if notification already exists to avoid duplicates
      const exists = prev.some(
        (notif) =>
          notif._id === data._id ||
          (notif.title === data.title &&
            notif.message === data.message &&
            Math.abs(new Date(notif.timeStamp) - new Date(data.timeStamp)) <
              1000)
      );

      if (!exists) {
        return [data, ...prev]; // Add new notification to the beginning
      }
      return prev;
    });
  }, []);

  // Callback to handle resignation alerts (specific to your use case)
  const handleResignationAlert = useCallback(
    (data) => {
      // You can show a toast notification or update UI specifically for resignation alerts
      // For now, we'll convert it to a standard notification format
      const notificationData = {
        _id: `resignation-${data.resignationId}-${Date.now()}`,
        title: "Resignation Alert",
        message: data.message,
        timeStamp: data.timestamp,
        eventType: "resignation",
        targetUser: user?.username,
      };

      handleNotification(notificationData);
    },
    [handleNotification, user?.username]
  );

  // Initialize socket connection
  const initializeSocket = useCallback(() => {
    if (!user?.username) return;

    // Clean up existing socket
    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const socket = io(process.env.REACT_APP_SERVER_URL, {
      auth: {
        username: user.username,
      },
      transports: ["websocket", "polling"],
      timeout: 20000,
      forceNew: true,
    });

    socketRef.current = socket;

    // Connection event handlers
    socket.on("connect", () => {
      // Clear any pending reconnection timeout
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    });

    socket.on("disconnect", (reason) => {
      // Attempt to reconnect after a delay if not manually disconnected
      if (reason !== "io client disconnect") {
        reconnectTimeoutRef.current = setTimeout(() => {
          socket.connect();
        }, 3000);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });

    // Notification event handlers
    socket.on("notification", handleNotification);
    socket.on("resignation-alert", handleResignationAlert);

    // Generic error handler
    socket.on("error", (error) => {
      console.error("Socket error:", error);
    });

    return socket;
  }, [user?.username, handleNotification, handleResignationAlert]);

  // Fetch initial notifications
  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiClient.get("/get-notifications");
      setNotifications(res.data || []);
    } catch (err) {
      console.error("Error fetching notifications:", err);
      setNotifications([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Main effect
  useEffect(() => {
    if (user?.username) {
      fetchNotifications();
      initializeSocket();
    }

    // Cleanup function
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [user?.username, fetchNotifications, initializeSocket]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, []);

  return {
    notifications,
    setNotifications,
    loading,
    setLoading,
  };
}

export default useNotifications;
