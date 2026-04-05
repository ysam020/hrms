import { useState, useEffect, useContext, useCallback, useRef } from "react";
import apiClient from "@web/core/http/axiosConfig";
import { UserContext } from "@web/app/providers/UserContext";
import { useSocket } from "@web/app/providers/SocketContext";
import { API_ENDPOINTS } from "@web/shared/constants";
import {
  getNotifications,
  saveNotifications,
  saveNotification,
  pruneNotifications,
} from "@web/core/db";

function useNotifications() {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const { user } = useContext(UserContext);
  const { socketRef } = useSocket();

  // prevents stale async overwrite
  const requestIdRef = useRef(0);

  const handleNotification = useCallback((data) => {
    setNotifications((prev) => {
      const exists = prev.some(
        (notif) =>
          notif._id === data._id ||
          (notif.title === data.title &&
            notif.message === data.message &&
            Math.abs(
              new Date(notif.timeStamp).getTime() -
                new Date(data.timeStamp).getTime(),
            ) < 1000),
      );
      return exists ? prev : [data, ...prev];
    });

    saveNotification(data)
      .then(() => pruneNotifications(200))
      .catch(console.error);
  }, []);

  const handleResignationAlert = useCallback(
    (data) => {
      handleNotification({
        _id: `resignation-${data.resignationId}-${Date.now()}`,
        title: "Resignation Alert",
        message: data.message,
        timeStamp: data.timestamp,
        eventType: "resignation",
        targetUser: user?.username,
      });
    },
    [handleNotification, user?.username],
  );

  const fetchNotifications = useCallback(() => {
    const controller = new AbortController();
    const signal = controller.signal;

    const currentRequestId = ++requestIdRef.current;

    (async () => {
      try {
        setLoading(true);

        // show cached notifications immediately
        const cached = await getNotifications();
        if (cached.length > 0 && currentRequestId === requestIdRef.current) {
          setNotifications(cached);
        }

        const res = await apiClient(API_ENDPOINTS.GET_NOTIFICATIONS, {
          signal,
        });

        if (currentRequestId !== requestIdRef.current) return;

        const fresh = (res.data.data || []).map((n) => ({
          ...n,
          _id: n._id || n.id,
          message: n.message || n.body,
          timeStamp: n.timeStamp || n.createdAt,
        }));

        setNotifications(fresh);

        saveNotifications(fresh)
          .then(() => pruneNotifications(200))
          .catch(console.error);
      } catch (err) {
        if (err.name === "CanceledError" || err.code === "ERR_CANCELED") {
          return;
        }

        console.error("Error fetching notifications:", err);

        setNotifications((prev) => (prev.length > 0 ? prev : []));
      } finally {
        if (currentRequestId === requestIdRef.current) {
          setLoading(false);
        }
      }
    })();

    return () => controller.abort();
  }, []);

  useEffect(() => {
    if (!user?.username) return;

    const cleanupFetch = fetchNotifications();

    let intervalId;
    let subscribedSocket: any = null;

    const subscribeWhenReady = () => {
      const socket = socketRef.current;
      if (!socket) return false;

      socket.on("notification", handleNotification);
      socket.on("resignation-alert", handleResignationAlert);

      subscribedSocket = socket;
      return true;
    };

    if (!subscribeWhenReady()) {
      intervalId = setInterval(() => {
        if (subscribeWhenReady()) clearInterval(intervalId);
      }, 100);
    }

    return () => {
      if (cleanupFetch) cleanupFetch();

      clearInterval(intervalId);

      if (subscribedSocket) {
        subscribedSocket.off("notification", handleNotification);
        subscribedSocket.off("resignation-alert", handleResignationAlert);
      }
    };
  }, [
    user?.username,
    socketRef,
    handleNotification,
    handleResignationAlert,
    fetchNotifications,
  ]);

  return { notifications, setNotifications, loading, setLoading };
}

export default useNotifications;
