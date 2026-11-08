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
import {
  DEFAULT_RECONNECT,
  decideAfterFailure,
  type SocketErrorLike,
} from "@web/core/realtime/reconnectPolicy";

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

  // Consecutive failed connection attempts (reset on connect).
  const attemptRef = useRef(0);

  const clearReconnectTimer = () => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  };

  const initializeSocket = useCallback(async () => {
    if (!user?.id) return;

    const token = getAccessToken();
    if (!token) return; // Wait until access token is available in memory

    if (socketRef.current) {
      socketRef.current.disconnect();
    }

    const { io } = await loadSocketIO();

    const socket = io(import.meta.env.VITE_SERVER_URL, {
      // Read on EVERY (re)connect attempt, so a reconnect after an HTTP
      // refresh presents the current token, never the one from page load.
      auth: (cb) => cb({ token: getAccessToken() }),
      transports: ["websocket", "polling"],
      timeout: 20000,
      // Socket.IO's own reconnection handles transport failures (it already
      // backs off with jitter); refusals by the server's auth middleware and
      // server-initiated disconnects are handled by scheduleReconnect below.
      reconnectionDelay: DEFAULT_RECONNECT.baseMs,
      reconnectionDelayMax: DEFAULT_RECONNECT.maxMs,
      randomizationFactor: 0.5,
    });

    socketRef.current = socket;
    attemptRef.current = 0;
    let revoked = false;

    // One socket instance for the session: reconnecting calls
    // socket.connect() on it, so listeners registered by consumers
    // (chat, presence, notifications) are never duplicated.
    const scheduleReconnect = (err?: SocketErrorLike) => {
      clearReconnectTimer();
      const decision = decideAfterFailure(
        err,
        attemptRef.current++,
        getAccessToken(),
      );
      const tick = () => {
        if (socketRef.current !== socket || socket.connected) return;
        if (decision.action === "awaitNewToken") {
          // Refused or revoked: never retry with the same token. Wait for
          // the HTTP layer to refresh it (or to sign the person out).
          if (getAccessToken() === decision.staleToken) {
            reconnectTimeoutRef.current = setTimeout(tick, decision.delayMs);
            return;
          }
          revoked = false;
        }
        socket.connect();
      };
      reconnectTimeoutRef.current = setTimeout(tick, decision.delayMs);
    };

    socket.on("connect", () => {
      setConnected(true);
      attemptRef.current = 0;
      clearReconnectTimer();
    });

    // Server-side revocation: don't reconnect with this token.
    socket.on("session-expired", () => {
      revoked = true;
    });

    socket.on("disconnect", (reason) => {
      console.warn("[Socket] Disconnected. Reason:", reason);
      setConnected(false);
      if (reason === "io client disconnect") return;
      // "io server disconnect" (revocation, token expiry, graceful server
      // shutdown) is not retried by Socket.IO itself; transport failures
      // are, so only step in for the former.
      if (reason === "io server disconnect") {
        scheduleReconnect(
          revoked
            ? { data: { code: "SESSION_REVOKED", retryable: false } }
            : undefined,
        );
      }
    });

    socket.on("connect_error", (error: SocketErrorLike) => {
      console.error("Socket connection error:", error?.message);
      // Rejected by the server's auth middleware: Socket.IO won't retry
      // (socket.active is false) — decide here. Transport-level failures
      // keep Socket.IO's own backoff.
      if (!socket.active) scheduleReconnect(error);
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
