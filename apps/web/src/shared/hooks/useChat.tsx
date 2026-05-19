import { useState, useEffect, useContext, useRef, useCallback } from "react";
import apiClient from "@web/core/http/axiosConfig";
import { useApiClient } from "@web/shared/hooks/useApiClient";
import { UserContext } from "@web/app/providers/UserContext";
import { useSocket } from "@web/app/providers/SocketContext";
import { API_ENDPOINTS } from "@web/shared/constants";
import {
  getMessagesByRoom,
  saveMessages,
  saveMessage,
  patchMessage,
  deleteRoomMessages,
  getConversations,
  saveConversations,
  saveConversation,
  deleteConversationFromDB,
  enqueueMessage,
  dequeueMessage,
  getPendingMessages,
} from "@web/core/db";

function useChat() {
  const { user } = useContext(UserContext);
  const { socketRef, connected } = useSocket();

  const [conversations, setConversations] = useState<any[]>([]);
  const [messages, setMessages] = useState({}); // roomId -> Message[]
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [typingUsers, setTypingUsers] = useState({}); // roomId -> username[]
  const [unreadCounts, setUnreadCounts] = useState({}); // roomId -> number
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);

  const typingTimeoutsRef = useRef({}); // roomId:username -> timeout
  const dbLoadedRoomsRef = useRef(new Set());
  const prevConnectedRef = useRef(false);
  const hasEverConnectedRef = useRef(false);
  const api = useApiClient();

  // IndexedDB helpers

  /**
   * Merge two message arrays by _id (server data wins on conflict).
   * Preserves order (oldest first) and deduplicates.
   */
  const mergeMessages = (cached, fetched) => {
    const map = new Map();
    cached.forEach((m) => map.set(m._id, m));
    fetched.forEach((m) => map.set(m._id, m)); // server wins
    return Array.from(map.values()).sort(
      (a, b) =>
        new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
  };

  // HTTP helpers

  const fetchConversations = useCallback(async () => {
    setLoadingConversations(true);
    try {
      // Show cached conversations immediately, filtered to current user to avoid
      // flashing stale data from a previous session or different tenant
      const cached = (await getConversations()) as any[];
      const userCached = cached.filter(
        (c) =>
          Array.isArray(c.participants) && c.participants.includes(user?.id),
      );
      if (userCached.length > 0) {
        setConversations(
          userCached.sort(
            (a, b) =>
              new Date(b.lastActivity).getTime() -
              new Date(a.lastActivity).getTime(),
          ),
        );
      }

      const res = await api.get(API_ENDPOINTS.GET_CONVERSATIONS);
      const fresh = res.data.data || [];
      setConversations(fresh);
      saveConversations(fresh).catch(console.error);
    } catch (err: any) {
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
      console.error("fetchConversations error:", err);
    } finally {
      setLoadingConversations(false);
    }
  }, [api]);

  const fetchMessages = useCallback(
    async (roomId, before = null) => {
      setLoadingMessages(true);
      try {
        // Load from IndexedDB first (instant) for initial room opens
        if (!before) {
          const cached = (await getMessagesByRoom(roomId)) as any[];
          if (cached.length > 0) {
            setMessages((prev) => ({
              ...prev,
              [roomId]: cached,
            }));
          }
        }

        const params = before ? `?before=${before}` : "";
        const res = await api.get(API_ENDPOINTS.GET_MESSAGES(roomId) + params);
        const fetched = res.data.data || [];

        if (!before) {
          // Merge cached + fetched so we never lose optimistic messages
          setMessages((prev) => {
            const merged = mergeMessages(prev[roomId] || [], fetched);
            return { ...prev, [roomId]: merged };
          });
          // Persist to IndexedDB
          saveMessages(fetched).catch(console.error);
          dbLoadedRoomsRef.current.add(roomId);
        } else {
          setMessages((prev) => ({
            ...prev,
            [roomId]: [...fetched, ...(prev[roomId] || [])],
          }));
          saveMessages(fetched).catch(console.error);
        }
      } catch (err) {
        console.error("fetchMessages error:", err);
      } finally {
        setLoadingMessages(false);
      }
    },
    [api],
  );

  const fetchUnreadCounts = useCallback(async () => {
    try {
      const res = await api.get(API_ENDPOINTS.GET_UNREAD_COUNTS);
      setUnreadCounts(res.data.data || {});
    } catch (err: any) {
      if (err?.code === "ERR_CANCELED" || err?.name === "CanceledError") return;
      console.error("fetchUnreadCounts error:", err);
    }
  }, [api]);

  const startConversation = useCallback(async (recipientUserId) => {
    const res = await apiClient.post(API_ENDPOINTS.START_CONVERSATION, {
      recipientUserId,
    });
    const room = res.data.data;
    setConversations((prev) => {
      const exists = prev.find((c) => c._id === room._id);
      return exists ? prev : [room, ...prev];
    });
    saveConversation(room).catch(console.error);
    return room;
  }, []);

  const markRoomAsRead = useCallback(async (roomId) => {
    try {
      await apiClient.post(API_ENDPOINTS.MARK_AS_READ(roomId));
      setUnreadCounts((prev) => ({ ...prev, [roomId]: 0 }));
    } catch (err) {
      console.error("markRoomAsRead error:", err);
    }
  }, []);

  const deleteMessage = useCallback(
    async (messageId, roomId) => {
      await apiClient.delete(API_ENDPOINTS.DELETE_MESSAGE(messageId));
      setMessages((prev) => ({
        ...prev,
        [roomId]: (prev[roomId] || []).map((m) =>
          m._id === messageId ? { ...m, isDeleted: true, content: null } : m,
        ),
      }));
      patchMessage(messageId, { isDeleted: true, content: null }).catch(
        console.error,
      );
      socketRef.current?.emit("chat:delete-message", { messageId, roomId });
    },
    [socketRef],
  );

  const deleteConversation = useCallback(
    async (roomId) => {
      await apiClient.delete(API_ENDPOINTS.DELETE_CONVERSATION(roomId));
      setConversations((prev) => prev.filter((c) => c._id !== roomId));
      dbLoadedRoomsRef.current.delete(roomId);
      setMessages((prev) => {
        const next = { ...prev };
        delete next[roomId];
        return next;
      });
      deleteConversationFromDB(roomId).catch(console.error);
      deleteRoomMessages(roomId).catch(console.error);
    },
    [dbLoadedRoomsRef],
  );

  // Socket actions

  const joinRoom = useCallback(
    (roomId) => {
      socketRef.current?.emit("chat:join", { roomId });
    },
    [socketRef],
  );

  /**
   * sendMessage
   *
   * If the socket is connected, emit immediately.
   * If offline, persist the payload to IndexedDB outbox so it can be
   * re-sent automatically when the socket reconnects.
   */
  const sendMessage = useCallback(
    ({
      roomId,
      content,
      type = "text",
      replyTo,
      fileUrl,
      fileName,
      fileMimeType,
      fileSize,
    }: {
      roomId: any;
      content: any;
      type?: string;
      replyTo?: any;
      fileUrl?: any;
      fileName?: any;
      fileMimeType?: any;
      fileSize?: any;
    }) => {
      const payload = {
        roomId,
        content,
        type,
        replyTo,
        fileUrl,
        fileName,
        fileMimeType,
        fileSize,
      };

      const socket = socketRef.current;
      const isConnected = socket?.connected;

      if (isConnected) {
        socket.emit("chat:send", payload);
      } else {
        // Queue for delivery on reconnect
        const tempId = `offline_${Date.now()}_${Math.random()}`;
        enqueueMessage(tempId, roomId, payload).catch(console.error);
      }
    },
    [socketRef],
  );

  /**
   * Flush the offline outbox when we (re)connect.
   */
  const flushOutbox = useCallback(async () => {
    const socket = socketRef.current;
    if (!socket?.connected) return;

    try {
      const pending = (await getPendingMessages()) as any[];
      if (pending.length === 0) return;

      for (const entry of pending) {
        socket.emit("chat:send", entry.payload);
        await dequeueMessage(entry.tempId).catch(console.error);
      }
    } catch (err) {
      console.error("[useChat] outbox flush error:", err);
    }
  }, [socketRef]);

  const emitTyping = useCallback(
    (roomId) => {
      socketRef.current?.emit("chat:typing", { roomId });
    },
    [socketRef],
  );

  const emitStopTyping = useCallback(
    (roomId) => {
      socketRef.current?.emit("chat:stop-typing", { roomId });
    },
    [socketRef],
  );

  const emitRead = useCallback(
    (roomId) => {
      socketRef.current?.emit("chat:read", { roomId });
    },
    [socketRef],
  );

  // Socket event handlers

  const handleIncomingMessage = useCallback(
    (msg) => {
      const roomId = msg.chatRoom?.toString?.() ?? msg.chatRoom;

      setMessages((prev) => ({
        ...prev,
        [roomId]: [...(prev[roomId] || []), msg],
      }));

      // Persist to IndexedDB
      saveMessage(msg).catch(console.error);

      setConversations((prev) => {
        const updated = prev.map((c) =>
          c._id === roomId
            ? { ...c, lastMessage: msg, lastActivity: new Date().toISOString() }
            : c,
        );
        return updated.sort(
          (a, b) =>
            new Date(b.lastActivity).getTime() -
            new Date(a.lastActivity).getTime(),
        );
      });

      if (msg.senderId !== user?.id && roomId !== activeRoomId) {
        setUnreadCounts((prev) => ({
          ...prev,
          [roomId]: (prev[roomId] || 0) + 1,
        }));
      }

      if (roomId === activeRoomId) {
        emitRead(roomId);
      }
    },
    [user?.id, activeRoomId, emitRead],
  );

  const handleTyping = useCallback(({ roomId, username }) => {
    setTypingUsers((prev) => {
      const current = prev[roomId] || [];
      if (current.includes(username)) return prev;
      return { ...prev, [roomId]: [...current, username] };
    });

    const key = `${roomId}:${username}`;
    clearTimeout(typingTimeoutsRef.current[key]);
    typingTimeoutsRef.current[key] = setTimeout(() => {
      setTypingUsers((prev) => ({
        ...prev,
        [roomId]: (prev[roomId] || []).filter((u) => u !== username),
      }));
    }, 3000);
  }, []);

  const handleStopTyping = useCallback(({ roomId, username }) => {
    setTypingUsers((prev) => ({
      ...prev,
      [roomId]: (prev[roomId] || []).filter((u) => u !== username),
    }));
    const key = `${roomId}:${username}`;
    clearTimeout(typingTimeoutsRef.current[key]);
  }, []);

  const handleMessageDeleted = useCallback(({ messageId, roomId }) => {
    setMessages((prev) => {
      if (!prev[roomId]) return prev;
      return {
        ...prev,
        [roomId]: prev[roomId].map((m) =>
          m._id === messageId ? { ...m, isDeleted: true, content: null } : m,
        ),
      };
    });
    patchMessage(messageId, { isDeleted: true, content: null }).catch(
      console.error,
    );
  }, []);

  const handleRead = useCallback(({ roomId, reader }) => {
    setMessages((prev) => {
      if (!prev[roomId]) return prev;
      return {
        ...prev,
        [roomId]: prev[roomId].map((m) =>
          m.readBy?.includes(reader)
            ? m
            : { ...m, readBy: [...(m.readBy || []), reader] },
        ),
      };
    });
  }, []);

  // Socket subscriptions

  useEffect(() => {
    if (!user?.id) return;
    fetchConversations();
    fetchUnreadCounts();
  }, [user?.id, fetchConversations, fetchUnreadCounts]);

  // Reconnect: refetch + flush outbox
  useEffect(() => {
    if (!user?.id) return;

    const wasConnected = prevConnectedRef.current;
    prevConnectedRef.current = connected;

    if (connected && !wasConnected) {
      if (hasEverConnectedRef.current) {
        // Genuine reconnect — fetch fresh data to catch missed updates
        fetchConversations();
        fetchUnreadCounts();
        if (activeRoomId) {
          dbLoadedRoomsRef.current.delete(activeRoomId);
          fetchMessages(activeRoomId);
        }
      }
      hasEverConnectedRef.current = true;
      // Deliver any messages that were queued while offline
      flushOutbox();
    }
  }, [
    connected,
    user?.id,
    activeRoomId,
    fetchConversations,
    fetchUnreadCounts,
    fetchMessages,
    flushOutbox,
  ]);

  useEffect(() => {
    if (!user?.id || !connected) return;

    const socket = socketRef.current;
    if (!socket) return;

    socket.on("chat:message", handleIncomingMessage);
    socket.on("chat:typing", handleTyping);
    socket.on("chat:stop-typing", handleStopTyping);
    socket.on("chat:read", handleRead);
    socket.on("chat:message-deleted", handleMessageDeleted);

    return () => {
      socket.off("chat:message", handleIncomingMessage);
      socket.off("chat:typing", handleTyping);
      socket.off("chat:stop-typing", handleStopTyping);
      socket.off("chat:read", handleRead);
      socket.off("chat:message-deleted", handleMessageDeleted);
    };
  }, [
    user?.id,
    connected,
    socketRef,
    handleIncomingMessage,
    handleTyping,
    handleStopTyping,
    handleRead,
    handleMessageDeleted,
  ]);

  return {
    conversations,
    messages,
    activeRoomId,
    setActiveRoomId,
    typingUsers,
    unreadCounts,
    loadingConversations,
    loadingMessages,
    fetchConversations,
    fetchMessages,
    dbLoadedRoomsRef,
    startConversation,
    markRoomAsRead,
    deleteMessage,
    deleteConversation,
    joinRoom,
    sendMessage,
    emitTyping,
    emitStopTyping,
    emitRead,
  };
}

export default useChat;
