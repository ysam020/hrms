import React, {
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import Badge from "@mui/material/Badge";
import InputAdornment from "@mui/material/InputAdornment";
import Divider from "@mui/material/Divider";
import Dialog from "@mui/material/Dialog";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Button from "@mui/material/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import _Linkify from "react-linkify";
// react-linkify is an old CJS alpha; esbuild may expose the module namespace
// object instead of .default — normalise across both interop modes.
const Linkify: React.ComponentType<any> = (_Linkify as any).default ?? _Linkify;
import EmojiPicker, { EmojiStyle } from "emoji-picker-react";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { ChatUnreadContext } from "@web/app/providers/ChatUnreadContext";
import useChat from "@web/shared/hooks/useChat";
import apiClient from "@web/core/http/axiosConfig";
import { useApiClient } from "@web/shared/hooks/useApiClient";
import "../../styles/chat.scss";
import { API_ENDPOINTS } from "@web/shared/constants";

// Lazy-loaded MUI icons
const SendIcon = React.lazy(() => import("@mui/icons-material/Send"));
const AttachFileIcon = React.lazy(
  () => import("@mui/icons-material/AttachFile"),
);
const SearchIcon = React.lazy(() => import("@mui/icons-material/Search"));
const CloseIcon = React.lazy(() => import("@mui/icons-material/Close"));
const ReplyIcon = React.lazy(() => import("@mui/icons-material/Reply"));
const InsertDriveFileIcon = React.lazy(
  () => import("@mui/icons-material/InsertDriveFile"),
);
const DoneAllIcon = React.lazy(() => import("@mui/icons-material/DoneAll"));
const DoneIcon = React.lazy(() => import("@mui/icons-material/Done"));
const ArrowBackIcon = React.lazy(() => import("@mui/icons-material/ArrowBack"));
const DeleteIcon = React.lazy(() => import("@mui/icons-material/Delete"));
const MoreVertIcon = React.lazy(() => import("@mui/icons-material/MoreVert"));
const EmojiEmotionsIcon = React.lazy(
  () => import("@mui/icons-material/EmojiEmotions"),
);
const PictureAsPdfIcon = React.lazy(
  () => import("@mui/icons-material/PictureAsPdf"),
);
const TableChartIcon = React.lazy(
  () => import("@mui/icons-material/TableChart"),
);
const ArticleIcon = React.lazy(() => import("@mui/icons-material/Article"));
const VideoFileIcon = React.lazy(() => import("@mui/icons-material/VideoFile"));

function getOtherParticipant(room, myUsername) {
  return room.participants?.find((p) => p !== myUsername) || "Unknown";
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatConvTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return formatTime(dateStr);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function getMessageType(mime) {
  if (!mime) return "file";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

function FileTypeIcon({
  mime,
  size = "small" as "small" | "inherit" | "large" | "medium",
}) {
  if (!mime)
    return (
      <React.Suspense fallback={null}>
        <InsertDriveFileIcon fontSize={size} />
      </React.Suspense>
    );
  if (mime === "application/pdf")
    return (
      <React.Suspense fallback={null}>
        <PictureAsPdfIcon fontSize={size} sx={{ color: "#e53935" }} />
      </React.Suspense>
    );
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv")
    return (
      <React.Suspense fallback={null}>
        <TableChartIcon fontSize={size} sx={{ color: "#2e7d32" }} />
      </React.Suspense>
    );
  if (mime.includes("word") || mime.includes("document"))
    return (
      <React.Suspense fallback={null}>
        <ArticleIcon fontSize={size} sx={{ color: "#1565c0" }} />
      </React.Suspense>
    );
  if (mime.startsWith("video/"))
    return (
      <React.Suspense fallback={null}>
        <VideoFileIcon fontSize={size} sx={{ color: "#6a1b9a" }} />
      </React.Suspense>
    );
  return (
    <React.Suspense fallback={null}>
      <InsertDriveFileIcon fontSize={size} />
    </React.Suspense>
  );
}

const FIRST_URL_RE = /https?:\/\/\S+/;
const ogCache = new Map();

function LinkPreview({ url }) {
  const cleanUrl = url.replace(/[)>\].,'";]+$/, ""); // strip trailing punctuation
  const [og, setOg] = useState(
    ogCache.has(cleanUrl) ? ogCache.get(cleanUrl) : undefined,
  );

  useEffect(() => {
    if (ogCache.has(cleanUrl)) return;
    let cancelled = false;
    apiClient
      .get(API_ENDPOINTS.OG_PREVIEW(cleanUrl))
      .then((res) => {
        if (cancelled) return;
        const data = res.data.data;
        const result = data.title || data.image ? data : null;
        ogCache.set(cleanUrl, result);
        setOg(result);
      })
      .catch(() => {
        if (!cancelled) {
          ogCache.set(cleanUrl, null);
          setOg(null);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [cleanUrl]);

  if (og === undefined) return null; // still loading — don't show spinner inside bubble
  if (!og) return null;

  return (
    <a
      href={cleanUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="chat-link-preview"
    >
      {og.image && (
        <img
          src={og.image}
          alt=""
          className="chat-link-preview-img"
          onError={(e) => {
            (e.target as HTMLImageElement).style.display = "none";
          }}
        />
      )}
      <div className="chat-link-preview-body">
        {og.siteName && (
          <Typography variant="caption" className="chat-link-preview-site">
            {og.siteName}
          </Typography>
        )}
        {og.title && (
          <Typography variant="caption" className="chat-link-preview-title">
            {og.title}
          </Typography>
        )}
        {og.description && (
          <Typography variant="caption" className="chat-link-preview-desc">
            {og.description}
          </Typography>
        )}
      </div>
    </a>
  );
}

function TypingIndicator({ names }) {
  if (!names || names.length === 0) return null;
  const label =
    names.length === 1
      ? `${names[0]} is typing…`
      : `${names.join(", ")} are typing…`;
  return (
    <div className="chat-typing-indicator">
      <span className="typing-dot" />
      <span className="typing-dot" />
      <span className="typing-dot" />
      <Typography variant="caption" sx={{ ml: 0.75 }}>
        {label}
      </Typography>
    </div>
  );
}

function linkifyDecorator(href, text, key) {
  return (
    <a
      key={key}
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="chat-link"
    >
      {text}
    </a>
  );
}

function MessageBubble({
  msg,
  isMine,
  onReply,
  onDelete,
  roomParticipants,
  onImageClick,
}) {
  const isRead =
    isMine &&
    roomParticipants.some((p) => p !== msg.sender && msg.readBy?.includes(p));

  if (msg.isDeleted) {
    return (
      <div className={`chat-message-row ${isMine ? "mine" : "theirs"}`}>
        {!isMine && (
          <Avatar
            sx={{
              width: 28,
              height: 28,
              fontSize: 12,
              mr: 0.75,
              alignSelf: "flex-end",
            }}
          >
            {msg.sender?.[0]?.toUpperCase()}
          </Avatar>
        )}
        <div className="chat-bubble-wrapper">
          <div
            className={`chat-bubble chat-bubble-deleted ${isMine ? "bubble-mine" : "bubble-theirs"}`}
          >
            <Typography
              variant="caption"
              sx={{ fontStyle: "italic", opacity: 0.65 }}
            >
              🚫 This message was deleted
            </Typography>
          </div>
        </div>
      </div>
    );
  }

  const urlMatch =
    msg.type === "text" ? FIRST_URL_RE.exec(msg.content || "") : null;

  return (
    <div className={`chat-message-row ${isMine ? "mine" : "theirs"}`}>
      {!isMine && (
        <Avatar
          sx={{
            width: 28,
            height: 28,
            fontSize: 12,
            mr: 0.75,
            alignSelf: "flex-end",
          }}
        >
          {msg.sender?.[0]?.toUpperCase()}
        </Avatar>
      )}
      <div className="chat-bubble-wrapper">
        {/* Reply preview */}
        {msg.replyTo && (
          <div className="chat-reply-preview">
            <Typography variant="caption" fontWeight={600}>
              {msg.replyTo.sender}
            </Typography>
            <Typography variant="caption" noWrap sx={{ display: "block" }}>
              {msg.replyTo.content || msg.replyTo.fileName || "File"}
            </Typography>
          </div>
        )}

        {/* Bubble */}
        <div
          className={`chat-bubble ${isMine ? "bubble-mine" : "bubble-theirs"}`}
        >
          {msg.type === "text" && (
            <>
              <Typography
                variant="body2"
                sx={{ whiteSpace: "pre-wrap", wordBreak: "break-word" }}
              >
                <Linkify componentDecorator={linkifyDecorator}>
                  {msg.content}
                </Linkify>
              </Typography>
              {urlMatch && <LinkPreview url={urlMatch[0]} />}
            </>
          )}

          {msg.type === "image" && (
            <img
              src={msg.fileUrl}
              alt={msg.fileName || "Image"}
              className="chat-image-preview"
              onClick={() => onImageClick(msg.fileUrl)}
            />
          )}

          {msg.type === "video" && (
            <div className="chat-video-wrap">
              <video
                src={msg.fileUrl}
                controls
                className="chat-video-preview"
                preload="metadata"
              />
              {msg.fileName && (
                <Typography variant="caption" className="chat-media-filename">
                  {msg.fileName}
                </Typography>
              )}
            </div>
          )}

          {msg.type === "file" && (
            <a
              href={msg.fileUrl}
              target="_blank"
              rel="noreferrer"
              className="chat-file-card"
            >
              <div className="chat-file-card-icon">
                <FileTypeIcon mime={msg.fileMimeType} size="medium" />
              </div>
              <div className="chat-file-card-info">
                <span className="chat-file-card-name">
                  {msg.fileName || "File"}
                </span>
                {msg.fileSize && (
                  <span className="chat-file-card-size">
                    {formatFileSize(msg.fileSize)}
                  </span>
                )}
              </div>
            </a>
          )}

          <div className="chat-meta">
            <Typography variant="caption" className="chat-time">
              {formatTime(msg.createdAt)}
            </Typography>
            {isMine && (
              <React.Suspense fallback={null}>
                {isRead ? (
                  <DoneAllIcon
                    sx={{ fontSize: 14, ml: 0.25, color: "#53bdeb" }}
                  />
                ) : (
                  <DoneIcon sx={{ fontSize: 14, ml: 0.25 }} />
                )}
              </React.Suspense>
            )}
          </div>
        </div>

        {/* Hover actions */}
        <div
          className={`chat-msg-actions ${isMine ? "actions-mine" : "actions-theirs"}`}
        >
          <div
            className="chat-action-btn"
            onClick={() => onReply(msg)}
            title="Reply"
          >
            <React.Suspense fallback={null}>
              <ReplyIcon sx={{ fontSize: 16 }} />
            </React.Suspense>
          </div>
          {isMine && (
            <div
              className="chat-action-btn chat-action-delete"
              onClick={() => onDelete(msg)}
              title="Delete"
            >
              <React.Suspense fallback={null}>
                <DeleteIcon sx={{ fontSize: 16 }} />
              </React.Suspense>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function ConversationItem({ conv, myUsername, isActive, onClick, unread }) {
  const other = getOtherParticipant(conv, myUsername);
  const lastMsg = conv.lastMessage;
  const preview = lastMsg
    ? lastMsg.isDeleted
      ? "🚫 Message deleted"
      : lastMsg.type === "text"
        ? lastMsg.content
        : lastMsg.type === "image"
          ? "📷 Image"
          : lastMsg.type === "video"
            ? "🎥 Video"
            : `📎 ${lastMsg.fileName || "File"}`
    : "Start a conversation";

  return (
    <div
      className={`chat-conv-item ${isActive ? "active" : ""}`}
      onClick={() => onClick(conv)}
    >
      <Avatar sx={{ width: 44, height: 44, fontSize: 16, flexShrink: 0 }}>
        {other[0]?.toUpperCase()}
      </Avatar>
      <div className="chat-conv-info">
        <div className="chat-conv-header-row">
          <Typography variant="subtitle2" fontWeight={600} noWrap>
            {other}
          </Typography>
          <Typography variant="caption" className="chat-conv-time">
            {formatConvTime(conv.lastActivity)}
          </Typography>
        </div>
        <div className="chat-conv-preview-row">
          <Typography variant="caption" noWrap className="chat-conv-preview">
            {preview}
          </Typography>
          {unread > 0 && (
            <Badge
              badgeContent={unread}
              color="primary"
              max={99}
              className="chat-unread-badge"
            />
          )}
        </div>
      </div>
    </div>
  );
}

function Chat() {
  const { user } = useContext(UserContext);
  const { theme } = useContext(ThemeContext);
  const { clearRoomUnread } = useContext(ChatUnreadContext);
  const api = useApiClient();

  const {
    conversations,
    messages,
    activeRoomId,
    setActiveRoomId,
    typingUsers,
    unreadCounts,
    loadingConversations,
    loadingMessages,
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
  const activeRoomParticipants = useMemo(
    () => activeRoom?.participants || [],
    [activeRoom],
  );
  const activeTypingUsers = useMemo(
    () => (activeRoomId ? typingUsers[activeRoomId] : []) || [],
    [typingUsers, activeRoomId],
  );
  const otherUser = useMemo(
    () => (activeRoom ? getOtherParticipant(activeRoom, user?.username) : null),
    [activeRoom, user?.username],
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
      joinRoom(roomId);
      if (!dbLoadedRoomsRef.current.has(roomId)) await fetchMessages(roomId);
      markRoomAsRead(roomId);
      emitRead(roomId);
      clearRoomUnread(roomId);
    },
    [
      setActiveRoomId,
      joinRoom,
      fetchMessages,
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
        setSearchResults(users.filter((u) => u.username !== user?.username));
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [userSearch, user?.username]);

  const handleStartConversation = useCallback(
    async (targetUser) => {
      setUserSearch("");
      setSearchResults([]);
      const room = await startConversation(targetUser.username);
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
      {/* left panel */}
      <div
        className={`chat-left-panel ${mobileShowThread ? "mobile-hidden" : ""}`}
      >
        <div className="chat-search-wrap">
          <TextField
            fullWidth
            size="small"
            placeholder="Search people…"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <React.Suspense fallback={null}>
                    <SearchIcon fontSize="small" />
                  </React.Suspense>
                </InputAdornment>
              ),
              endAdornment: searching ? (
                <InputAdornment position="end">
                  <CircularProgress size={14} />
                </InputAdornment>
              ) : null,
            }}
            className="chat-search-field"
          />
          {searchResults.length > 0 && (
            <div className="chat-search-results">
              {searchResults.map((u) => (
                <div
                  key={u.username}
                  className="chat-search-result-item"
                  onClick={() => handleStartConversation(u)}
                >
                  <Avatar sx={{ width: 32, height: 32, fontSize: 13, mr: 1 }}>
                    {u.username?.[0]?.toUpperCase()}
                  </Avatar>
                  <div>
                    <Typography variant="body2" fontWeight={600}>
                      {u.fullName || u.username}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      @{u.username}
                    </Typography>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <Divider />

        <div className="chat-conv-list">
          {loadingConversations ? (
            <div className="chat-centered">
              <CircularProgress size={24} />
            </div>
          ) : conversations.length === 0 ? (
            <div className="chat-centered">
              <Typography variant="body2" color="text.secondary">
                No conversations yet.
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Search for a colleague to start chatting.
              </Typography>
            </div>
          ) : (
            conversations.map((conv) => (
              <ConversationItem
                key={conv._id}
                conv={conv}
                myUsername={user?.username}
                isActive={conv._id === activeRoomId}
                onClick={openRoom}
                unread={unreadCounts[conv._id] || 0}
              />
            ))
          )}
        </div>
      </div>

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
            {/* Header */}
            <div className="chat-thread-header">
              <div className="chat-thread-header-left">
                <IconButton
                  className="chat-back-btn"
                  size="small"
                  onClick={() => {
                    setMobileShowThread(false);
                    setActiveRoomId(null);
                  }}
                >
                  <React.Suspense fallback={null}>
                    <ArrowBackIcon fontSize="small" />
                  </React.Suspense>
                </IconButton>
                <Avatar sx={{ width: 36, height: 36, fontSize: 14, mr: 1 }}>
                  {otherUser?.[0]?.toUpperCase()}
                </Avatar>
                <Typography
                  variant="subtitle1"
                  fontWeight={700}
                  lineHeight={1.2}
                >
                  {otherUser}
                </Typography>
              </div>
              <div>
                <IconButton
                  size="small"
                  onClick={(e) => setHeaderMenuAnchor(e.currentTarget)}
                >
                  <React.Suspense fallback={null}>
                    <MoreVertIcon fontSize="small" />
                  </React.Suspense>
                </IconButton>
                <Menu
                  anchorEl={headerMenuAnchor}
                  open={Boolean(headerMenuAnchor)}
                  onClose={() => setHeaderMenuAnchor(null)}
                >
                  <MenuItem
                    sx={{ color: "error.main" }}
                    onClick={() => {
                      setHeaderMenuAnchor(null);
                      setDeleteConvConfirm(true);
                    }}
                  >
                    <React.Suspense fallback={null}>
                      <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
                    </React.Suspense>
                    Delete Chat
                  </MenuItem>
                </Menu>
              </div>
            </div>

            <Divider />

            {/* Messages area */}
            <div
              className="chat-messages-area"
              onScroll={handleMessagesScroll}
              style={{
                backgroundImage: isDark
                  ? `linear-gradient(rgba(11,20,26,0.82),rgba(11,20,26,0.82)),url(/assets/images/chat-bg.png)`
                  : `linear-gradient(rgba(255,255,255,0.55),rgba(255,255,255,0.55)),url(/assets/images/chat-bg.png)`,
                backgroundSize: "412.5px 749.25px",
                backgroundRepeat: "repeat",
                backgroundBlendMode: isDark ? "unset" : "luminosity",
                backgroundColor: isDark ? "#161717" : "#f1ebe3",
              }}
            >
              {loadingMessages && (
                <div className="chat-centered" style={{ padding: "8px 0" }}>
                  <CircularProgress size={20} />
                </div>
              )}
              {activeMessages.length === 0 && !loadingMessages && (
                <div className="chat-centered">
                  <Typography variant="body2" color="text.secondary">
                    No messages yet. Say hello!
                  </Typography>
                </div>
              )}
              {activeMessages.map((msg) => (
                <MessageBubble
                  key={msg._id}
                  msg={msg}
                  isMine={msg.sender === user?.username}
                  onReply={setReplyTo}
                  onDelete={setDeleteTargetMsg}
                  roomParticipants={activeRoomParticipants}
                  onImageClick={setLightboxUrl}
                />
              ))}
              {activeTypingUsers.length > 0 && (
                <TypingIndicator names={activeTypingUsers} />
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Reply bar */}
            {replyTo && (
              <div className="chat-reply-bar">
                <div className="chat-reply-bar-content">
                  <Typography
                    variant="caption"
                    fontWeight={700}
                    color="primary"
                  >
                    Replying to {replyTo.sender}
                  </Typography>
                  <Typography variant="caption" noWrap>
                    {replyTo.content || replyTo.fileName || "File"}
                  </Typography>
                </div>
                <IconButton size="small" onClick={() => setReplyTo(null)}>
                  <React.Suspense fallback={null}>
                    <CloseIcon fontSize="small" />
                  </React.Suspense>
                </IconButton>
              </div>
            )}

            {/* Input area */}
            <div className="chat-input-area">
              <input
                type="file"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleFileSelect}
                accept="image/*,video/mp4,video/webm,video/quicktime,.pdf,.doc,.docx,.txt,.xls,.xlsx,.csv"
              />

              <Tooltip title="Attach file">
                <span>
                  <IconButton
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    size="small"
                    className="chat-attach-btn"
                  >
                    <React.Suspense fallback={null}>
                      {uploading ? (
                        <CircularProgress size={18} />
                      ) : (
                        <AttachFileIcon fontSize="small" />
                      )}
                    </React.Suspense>
                  </IconButton>
                </span>
              </Tooltip>

              {/* Emoji */}
              <div className="chat-emoji-wrap" ref={emojiPickerRef}>
                <Tooltip title="Emoji">
                  <IconButton
                    onClick={() => setShowEmojiPicker((p) => !p)}
                    size="small"
                    className="chat-attach-btn"
                  >
                    <React.Suspense fallback={null}>
                      <EmojiEmotionsIcon fontSize="small" />
                    </React.Suspense>
                  </IconButton>
                </Tooltip>
                {showEmojiPicker && (
                  <div className="chat-emoji-picker">
                    <EmojiPicker
                      onEmojiClick={handleEmojiClick}
                      theme={isDark ? ("dark" as any) : ("light" as any)}
                      emojiStyle={EmojiStyle.NATIVE}
                      height={350}
                      width={300}
                      skinTonesDisabled
                      previewConfig={{ showPreview: false }}
                    />
                  </div>
                )}
              </div>

              {/* Text input */}
              <TextField
                fullWidth
                multiline
                maxRows={4}
                size="small"
                placeholder="Type a message… (Shift+Enter for new line)"
                value={text}
                onChange={handleTextChange}
                onKeyDown={handleKeyDown}
                className="chat-text-field"
                variant="outlined"
              />

              <Tooltip title="Send (Enter)">
                <span>
                  <IconButton
                    onClick={handleSend}
                    disabled={!text.trim() && !uploading}
                    color="primary"
                    className="chat-send-btn"
                  >
                    <React.Suspense fallback={null}>
                      <SendIcon fontSize="small" />
                    </React.Suspense>
                  </IconButton>
                </span>
              </Tooltip>
            </div>
          </>
        )}
      </div>

      {/* image lightbox */}
      <Dialog
        open={Boolean(lightboxUrl)}
        onClose={() => setLightboxUrl(null)}
        maxWidth="lg"
      >
        <DialogContent sx={{ p: 0, bgcolor: "black", position: "relative" }}>
          <IconButton
            onClick={() => setLightboxUrl(null)}
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              color: "white",
              zIndex: 1,
            }}
          >
            <React.Suspense fallback={null}>
              <CloseIcon />
            </React.Suspense>
          </IconButton>
          {lightboxUrl && (
            <img
              src={lightboxUrl}
              alt="Preview"
              style={{ maxWidth: "90vw", maxHeight: "85vh", display: "block" }}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* delete message confirmation */}
      <Dialog
        open={Boolean(deleteTargetMsg)}
        onClose={() => setDeleteTargetMsg(null)}
      >
        <DialogTitle>Delete Message</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This message will be deleted for everyone. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteTargetMsg(null)}>Cancel</Button>
          <Button
            onClick={handleDeleteMessage}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* delete conversation confirmation */}
      <Dialog
        open={deleteConvConfirm}
        onClose={() => setDeleteConvConfirm(false)}
      >
        <DialogTitle>Delete Chat</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This conversation will be removed from your list. The other
            participant will still have access to it.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteConvConfirm(false)}>Cancel</Button>
          <Button
            onClick={handleDeleteConversation}
            color="error"
            variant="contained"
          >
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default Chat;
