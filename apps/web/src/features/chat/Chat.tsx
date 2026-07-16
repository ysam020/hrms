import {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Typography from "@mui/material/Typography";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ChatUnreadContext } from "@web/app/providers/ChatUnreadContext";
import useChat from "@web/shared/hooks/useChat";
import apiClient from "@web/core/http/axiosConfig";
import { useApiClient } from "@web/shared/hooks/useApiClient";
import "../../styles/chat.scss";
import { API_ENDPOINTS } from "@web/shared/constants";
import { ConversationsPanel } from "./ConversationsPanel";
import { ThreadHeader } from "./ThreadHeader";
import { PinnedMessagesBar } from "./PinnedMessagesBar";
import { MessagesArea } from "./MessagesArea";
import { ReplyBar } from "./ReplyBar";
import { MessageInputArea } from "./MessageInputArea";
import {
  DeleteConversationDialog,
  DeleteMessageDialog,
  ImageLightboxDialog,
} from "./ChatDialogs";
import {
  flashMessage,
  getMessageType,
  getOtherParticipant,
} from "./chatHelpers";

function Chat() {
  const { user } = useContext(UserContext);
  const { theme } = useContext(ThemeContext);
  const { setAlert } = useContext(AlertContext);
  const { clearRoomUnread } = useContext(ChatUnreadContext);
  const api = useApiClient();

  const {
    conversations,
    messages,
    activeRoomId,
    setActiveRoomId,
    typingUsers,
    unreadCounts,
    pinnedMessages,
    loadingConversations,
    loadingMessages,
    fetchMessages,
    fetchPinnedMessages,
    dbLoadedRoomsRef,
    startConversation,
    markRoomAsRead,
    deleteMessage,
    deleteConversation,
    pinMessage,
    unpinMessage,
    joinRoom,
    sendMessage,
    emitTyping,
    emitStopTyping,
    emitRead,
  } = useChat();

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<any>(null);
  const [uploading, setUploading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [mobileShowThread, setMobileShowThread] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [deleteTargetMsg, setDeleteTargetMsg] = useState<any>(null);
  const [deleteConvConfirm, setDeleteConvConfirm] = useState(false);
  const [pinnedBarExpanded, setPinnedBarExpanded] = useState(false);
  const [headerMenuAnchor, setHeaderMenuAnchor] = useState<HTMLElement | null>(
    null,
  );

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const typingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTypingRef = useRef(false);
  const emojiPickerRef = useRef<HTMLDivElement | null>(null);

  const activeRoom = useMemo(
    () => conversations.find((c) => c._id === activeRoomId),
    [conversations, activeRoomId],
  );
  const activeMessages = useMemo(
    () => (activeRoomId ? messages[activeRoomId] : []) || [],
    [messages, activeRoomId],
  );
  const activePinnedMessages = useMemo(
    () => (activeRoomId ? pinnedMessages[activeRoomId] : []) || [],
    [pinnedMessages, activeRoomId],
  );
  const resolveParticipantName = useCallback(
    (senderId: string) => {
      const detail = activeRoom?.participantDetails?.find(
        (p: any) => p.id === senderId || p._id === senderId,
      );
      return detail
        ? `${detail.first_name || ""} ${detail.last_name || ""}`.trim() ||
            detail.username ||
            ""
        : "";
    },
    [activeRoom],
  );

  // Jump to a replied-to/pinned message, WhatsApp-style: if it's already
  // rendered, just scroll+flash it. If it's older than what's currently
  // loaded (reply/pin targets are frequently much further back than the
  // last ~50 messages), page further back a screen at a time until it
  // turns up or there's genuinely nothing older left to fetch.
  const jumpToMessage = useCallback(
    async (messageId: string | undefined) => {
      if (!messageId || !activeRoomId) return;
      if (flashMessage(messageId)) return;

      let cursor = activeMessages[0]?.createdAt;
      let guard = 0;
      while (cursor && guard < 20) {
        guard += 1;
        const fetched = await fetchMessages(activeRoomId, cursor);
        if (!fetched || fetched.length === 0) break;
        // Let React commit the newly-fetched messages to the DOM before
        // checking for the target node.
        await new Promise((resolve) =>
          requestAnimationFrame(() => resolve(null)),
        );
        if (flashMessage(messageId)) return;
        cursor = fetched[0]?.createdAt;
      }
    },
    [activeRoomId, activeMessages, fetchMessages],
  );
  const activeRoomParticipants = useMemo(
    () => activeRoom?.participants || [],
    [activeRoom],
  );
  const activeTypingUsers = useMemo(
    () => (activeRoomId ? typingUsers[activeRoomId] : []) || [],
    [typingUsers, activeRoomId],
  );
  const otherUser = useMemo(
    () => (activeRoom ? getOtherParticipant(activeRoom, user?.id) : null),
    [activeRoom, user?.id],
  );

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [activeMessages, activeTypingUsers]);

  // Close emoji picker on outside click
  useEffect(() => {
    if (!showEmojiPicker) return;
    const handler = (e) => {
      if (
        emojiPickerRef.current &&
        !emojiPickerRef.current.contains(e.target)
      ) {
        setShowEmojiPicker(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showEmojiPicker]);

  const openRoom = useCallback(
    async (conv) => {
      const roomId = conv._id;
      setActiveRoomId(roomId);
      setReplyTo(null);
      setText("");
      setMobileShowThread(true);
      setShowEmojiPicker(false);
      setPinnedBarExpanded(false);
      joinRoom(roomId);
      if (!dbLoadedRoomsRef.current.has(roomId)) await fetchMessages(roomId);
      fetchPinnedMessages(roomId);
      markRoomAsRead(roomId);
      emitRead(roomId);
      clearRoomUnread(roomId);
    },
    [
      setActiveRoomId,
      joinRoom,
      fetchMessages,
      fetchPinnedMessages,
      markRoomAsRead,
      emitRead,
      clearRoomUnread,
      dbLoadedRoomsRef,
    ],
  );

  // User search for new conversation
  useEffect(() => {
    if (!userSearch.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await api.get(
          `/get-all-users?search=${encodeURIComponent(userSearch)}&limit=10`,
        );
        const users = res.data.data?.users || res.data.data || [];
        setSearchResults(users.filter((u) => u.id !== user?.id));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, user?.id]);

  const handleStartConversation = useCallback(
    async (targetUser) => {
      setUserSearch("");
      setSearchResults([]);
      const room = await startConversation(targetUser.id);
      await openRoom(room);
    },
    [startConversation, openRoom],
  );

  // Typing
  const handleTextChange = useCallback(
    (e) => {
      setText(e.target.value);
      if (!activeRoomId) return;
      if (!isTypingRef.current) {
        isTypingRef.current = true;
        emitTyping(activeRoomId);
      }
      clearTimeout(typingTimerRef.current ?? undefined);
      typingTimerRef.current = setTimeout(() => {
        isTypingRef.current = false;
        emitStopTyping(activeRoomId);
      }, 1500);
    },
    [activeRoomId, emitTyping, emitStopTyping],
  );

  const handleSend = useCallback(() => {
    if (!activeRoomId || (!text.trim() && !replyTo)) return;
    sendMessage({
      roomId: activeRoomId,
      content: text.trim(),
      type: "text",
      replyTo: replyTo?._id || null,
    });
    setText("");
    setReplyTo(null);
    isTypingRef.current = false;
    emitStopTyping(activeRoomId);
    setShowEmojiPicker(false);
  }, [activeRoomId, text, replyTo, sendMessage, emitStopTyping]);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    },
    [handleSend],
  );

  const handleEmojiClick = useCallback((emojiData) => {
    setText((prev) => prev + emojiData.emoji);
  }, []);

  // File upload — derive message type from MIME
  const handleFileSelect = useCallback(
    async (e) => {
      const file = e.target.files?.[0];
      if (!file || !activeRoomId) return;
      setUploading(true);
      try {
        const formData = new FormData();
        formData.append("file", file);
        const res = await apiClient.post(API_ENDPOINTS.UPLOAD_FILE, formData);
        const { fileUrl, fileName, fileMimeType, fileSize } = res.data.data;
        const type = getMessageType(fileMimeType);
        sendMessage({
          roomId: activeRoomId,
          content: fileName,
          type,
          fileUrl,
          fileName,
          fileMimeType,
          fileSize,
        });
      } catch (err) {
        console.error("Chat file upload failed:", err);
      } finally {
        setUploading(false);
        e.target.value = "";
      }
    },
    [activeRoomId, sendMessage],
  );

  // Infinite scroll (load older messages)
  const handleMessagesScroll = useCallback(
    (e) => {
      if (
        e.target.scrollTop === 0 &&
        activeMessages.length >= 50 &&
        !loadingMessages
      ) {
        const oldest = activeMessages[0]?.createdAt;
        if (oldest) fetchMessages(activeRoomId, oldest);
      }
    },
    [activeMessages, loadingMessages, fetchMessages, activeRoomId],
  );

  // Pin / unpin message
  const handlePinMessage = useCallback(
    async (msg) => {
      if (!activeRoomId) return;
      try {
        await pinMessage(msg._id, activeRoomId);
      } catch (err: any) {
        setAlert({
          open: true,
          message:
            err?.response?.data?.message || "Could not pin this message.",
          severity: "error",
        });
      }
    },
    [pinMessage, activeRoomId, setAlert],
  );

  const handleUnpinMessage = useCallback(
    async (msg) => {
      if (!activeRoomId) return;
      try {
        await unpinMessage(msg._id, activeRoomId);
      } catch (err: any) {
        setAlert({
          open: true,
          message:
            err?.response?.data?.message || "Could not unpin this message.",
          severity: "error",
        });
      }
    },
    [unpinMessage, activeRoomId, setAlert],
  );

  // Delete message
  const handleDeleteMessage = useCallback(async () => {
    if (!deleteTargetMsg) return;
    try {
      await deleteMessage(deleteTargetMsg._id, activeRoomId);
    } catch (err) {
      console.error("Delete message failed:", err);
    } finally {
      setDeleteTargetMsg(null);
    }
  }, [deleteTargetMsg, deleteMessage, activeRoomId]);

  // Delete conversation
  const handleDeleteConversation = useCallback(async () => {
    if (!activeRoomId) return;
    try {
      await deleteConversation(activeRoomId);
      setActiveRoomId(null);
      setMobileShowThread(false);
    } catch (err) {
      console.error("Delete conversation failed:", err);
    } finally {
      setDeleteConvConfirm(false);
      setHeaderMenuAnchor(null);
    }
  }, [activeRoomId, deleteConversation, setActiveRoomId]);

  const isDark = theme === "dark";

  return (
    <div className={`chat-root ${isDark ? "dark" : "light"}`}>
      <ConversationsPanel
        mobileShowThread={mobileShowThread}
        userSearch={userSearch}
        setUserSearch={setUserSearch}
        searching={searching}
        searchResults={searchResults}
        onStartConversation={handleStartConversation}
        loadingConversations={loadingConversations}
        conversations={conversations}
        myUserId={user?.id}
        activeRoomId={activeRoomId}
        onOpenRoom={openRoom}
        unreadCounts={unreadCounts}
      />

      {/* right panel */}
      <div
        className={`chat-right-panel ${mobileShowThread ? "mobile-visible" : ""}`}
      >
        {!activeRoomId ? (
          <div className="chat-empty-state">
            <Typography variant="h6" color="text.secondary">
              Select a conversation
            </Typography>
            <Typography variant="body2" color="text.secondary">
              Choose a conversation from the left or search for a colleague.
            </Typography>
          </div>
        ) : (
          <>
            <ThreadHeader
              otherUser={otherUser}
              headerMenuAnchor={headerMenuAnchor}
              setHeaderMenuAnchor={setHeaderMenuAnchor}
              onBack={() => {
                setMobileShowThread(false);
                setActiveRoomId(null);
              }}
              onDeleteChatClick={() => setDeleteConvConfirm(true)}
            />

            {activePinnedMessages.length > 0 && (
              <PinnedMessagesBar
                activePinnedMessages={activePinnedMessages}
                pinnedBarExpanded={pinnedBarExpanded}
                setPinnedBarExpanded={setPinnedBarExpanded}
                resolveParticipantName={resolveParticipantName}
                onJumpToMessage={jumpToMessage}
                onUnpinMessage={handleUnpinMessage}
              />
            )}

            <MessagesArea
              isDark={isDark}
              loadingMessages={loadingMessages}
              activeMessages={activeMessages}
              activeTypingUsers={activeTypingUsers}
              resolveParticipantName={resolveParticipantName}
              currentUserId={user?.id}
              onScroll={handleMessagesScroll}
              onReply={(m, senderName) => setReplyTo({ ...m, senderName })}
              onDelete={setDeleteTargetMsg}
              onPin={handlePinMessage}
              onUnpin={handleUnpinMessage}
              onJumpToMessage={jumpToMessage}
              activeRoomParticipants={activeRoomParticipants}
              onImageClick={setLightboxUrl}
              messagesEndRef={messagesEndRef}
            />

            {replyTo && (
              <ReplyBar replyTo={replyTo} onCancel={() => setReplyTo(null)} />
            )}

            <MessageInputArea
              isDark={isDark}
              fileInputRef={fileInputRef}
              uploading={uploading}
              onFileSelect={handleFileSelect}
              showEmojiPicker={showEmojiPicker}
              setShowEmojiPicker={setShowEmojiPicker}
              emojiPickerRef={emojiPickerRef}
              onEmojiClick={handleEmojiClick}
              text={text}
              onTextChange={handleTextChange}
              onKeyDown={handleKeyDown}
              onSend={handleSend}
            />
          </>
        )}
      </div>

      <ImageLightboxDialog
        lightboxUrl={lightboxUrl}
        onClose={() => setLightboxUrl(null)}
      />

      <DeleteMessageDialog
        open={Boolean(deleteTargetMsg)}
        onCancel={() => setDeleteTargetMsg(null)}
        onConfirm={handleDeleteMessage}
      />

      <DeleteConversationDialog
        open={deleteConvConfirm}
        onCancel={() => setDeleteConvConfirm(false)}
        onConfirm={handleDeleteConversation}
      />
    </div>
  );
}

export default Chat;
