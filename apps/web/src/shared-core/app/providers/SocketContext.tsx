import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useCallback,
  useState,
  type ReactNode,
  type MutableRefObject,
} from "react";
import type { Socket } from "socket.io-client";
import { UserContext } from "./UserContext";
import { getAccessToken } from "@web/core/http/axiosConfig";

const loadSocketIO = () => import("socket.io-client");

interface SocketContextType {
  socketRef: MutableRefObject<Socket | null>;
  connected: boolean;
}

export const SocketContext = createContext<SocketContextType | null>(null);

export function SocketProvider({ children }: { children: ReactNode }) {
  const { user } = useContext(UserContext);
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );
  const [connected, setConnected] = useState(false);

  const initializeSocket = useCallback(async () => {
    if (!user?.id) return;

    const token = getAccessToken();
    if (!token) return; // Wait until access token is available in memory

    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const { io } = await loadSocketIO();

    const socket = io(import.meta.env.VITE_SERVER_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      timeout: 20000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setConnected(true);
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    });

    socket.on("disconnect", (reason) => {
      console.warn("[Socket] Disconnected. Reason:", reason);
      setConnected(false);
      if (reason !== "io client disconnect") {
        reconnectTimeoutRef.current = setTimeout(() => {
          socket.connect();
        }, 3000);
      }
    });

    socket.on("connect_error", (error) => {
      console.error("Socket connection error:", error);
    });
  }, [user?.id]);

  const disconnectSocket = useCallback(() => {
    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    setConnected(false);
  }, []);

  useEffect(() => {
    if (user?.id) {
      initializeSocket();
    }
    return () => disconnectSocket();
  }, [user?.id, initializeSocket, disconnectSocket]);

  // Only reconnect for bfcache restore (back/forward navigation).
  // Do NOT disconnect on tab/window focus loss — chat must stay live in background.
  useEffect(() => {
    const handlePageHide = (e: PageTransitionEvent) => {
      if (e.persisted) disconnectSocket();
    };
    const handlePageShow = (e: PageTransitionEvent) => {
      if (e.persisted && user?.id) initializeSocket();
    };
    window.addEventListener("pagehide", handlePageHide);
    window.addEventListener("pageshow", handlePageShow);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      window.removeEventListener("pageshow", handlePageShow);
    };
  }, [user?.id, initializeSocket, disconnectSocket]);

  return (
    <SocketContext.Provider value={{ socketRef, connected }}>
      {children}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  const context = useContext(SocketContext);
  if (!context) {
    throw new Error("useSocket must be used inside SocketProvider");
  }
  return context;
}
