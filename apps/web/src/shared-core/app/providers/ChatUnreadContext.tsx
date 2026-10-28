import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { SocketContext } from "./SocketContext";
import { UserContext } from "./UserContext";
import { useApiClient } from "@web/shared/hooks/useApiClient";

export const ChatUnreadContext = createContext<{
  totalUnread: number;
  clearRoomUnread: (roomId: string) => void;
}>({ totalUnread: 0, clearRoomUnread: () => {} });

async function playNotificationSound() {
  try {
    const ctx = new (
      window.AudioContext || (window as any).webkitAudioContext
    )();
    if (ctx.state === "suspended") await ctx.resume();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    oscillator.frequency.value = 880;
    oscillator.type = "sine";
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
    oscillator.start(ctx.currentTime);
    oscillator.stop(ctx.currentTime + 0.3);
    oscillator.onended = () => ctx.close();
  } catch {
    // AudioContext unavailable or blocked — silently ignore
  }
}

export function ChatUnreadProvider({ children }: { children: ReactNode }) {
  const { user } = useContext(UserContext);
  const socketCtx = useContext(SocketContext);
  const socketRef = socketCtx?.socketRef;
  const connected = socketCtx?.connected ?? false;
  const [unreadCounts, setUnreadCounts] = useState<Record<string, number>>({});
  // Prevent sound on the very first fetch (existing unread at page load)
  const initialFetchDone = useRef(false);
  const api = useApiClient();

  const fetchUnread = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await api.get("/chat/unread-counts");
      setUnreadCounts(res.data.data || {});
    } catch {
      // silent
    }
  }, [user?.id, api]);

  // Fetch on mount and on reconnect
  useEffect(() => {
    if (!connected) return;
    fetchUnread().then(() => {
      initialFetchDone.current = true;
    });
  }, [connected, fetchUnread]);

  // Socket listeners
  useEffect(() => {
    if (!user?.id || !connected || !socketRef) return;
    const socket = socketRef.current;
    if (!socket) return;

    const handleMessage = (msg: { chatRoom?: unknown; senderId?: string }) => {
      const roomId = String(msg.chatRoom ?? "");
      if (msg.senderId !== user.id) {
        setUnreadCounts((prev) => ({
          ...prev,
          [roomId]: (prev[roomId] || 0) + 1,
        }));
        if (initialFetchDone.current) playNotificationSound();
      }
    };

    const handleRead = ({
      roomId,
      reader,
    }: {
      roomId: string;
      reader: string;
    }) => {
      if (reader === user.id) {
        setUnreadCounts((prev) => ({ ...prev, [roomId]: 0 }));
      }
    };

    socket.on("chat:message", handleMessage);
    socket.on("chat:read", handleRead);
    return () => {
      socket.off("chat:message", handleMessage);
      socket.off("chat:read", handleRead);
    };
  }, [user?.id, connected, socketRef]);

  const clearRoomUnread = useCallback((roomId: string) => {
    setUnreadCounts((prev) => ({ ...prev, [roomId]: 0 }));
  }, []);

  const totalUnread = Object.values(unreadCounts).reduce(
    (sum, n) => sum + n,
    0,
  );

  return (
    <ChatUnreadContext.Provider value={{ totalUnread, clearRoomUnread }}>
      {children}
    </ChatUnreadContext.Provider>
  );
}
