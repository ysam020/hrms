import {
  Fragment,
  Suspense,
  lazy,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ComponentType,
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
import SlideUpTransition from "@web/shared/components/SlideUpTransition";
import DialogActions from "@mui/material/DialogActions";
import DialogContent from "@mui/material/DialogContent";
import DialogContentText from "@mui/material/DialogContentText";
import DialogTitle from "@mui/material/DialogTitle";
import Button from "@web/shared/components/Button";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import _Linkify from "react-linkify";
// react-linkify is an old CJS alpha; esbuild may expose the module namespace
// object instead of .default — normalise across both interop modes.
const Linkify: ComponentType<any> = (_Linkify as any).default ?? _Linkify;
import EmojiPicker, { EmojiStyle } from "emoji-picker-react";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ChatUnreadContext } from "@web/app/providers/ChatUnreadContext";
import useChat from "@web/shared/hooks/useChat";
import apiClient from "@web/core/http/axiosConfig";
import { useApiClient } from "@web/shared/hooks/useApiClient";
import "../../styles/chat.scss";
import { API_ENDPOINTS } from "@web/shared/constants";

// Lazy-loaded MUI icons
const SendIcon = lazy(() => import("@mui/icons-material/Send"));
const AttachFileIcon = lazy(() => import("@mui/icons-material/AttachFile"));
const SearchIcon = lazy(() => import("@mui/icons-material/Search"));
const CloseIcon = lazy(() => import("@mui/icons-material/Close"));
const ReplyIcon = lazy(() => import("@mui/icons-material/Reply"));
const InsertDriveFileIcon = lazy(
  () => import("@mui/icons-material/InsertDriveFile"),
);
const DoneAllIcon = lazy(() => import("@mui/icons-material/DoneAll"));
const DoneIcon = lazy(() => import("@mui/icons-material/Done"));
const ArrowBackIcon = lazy(() => import("@mui/icons-material/ArrowBack"));
const DeleteIcon = lazy(() => import("@mui/icons-material/Delete"));
const MoreVertIcon = lazy(() => import("@mui/icons-material/MoreVert"));
const PushPinIcon = lazy(() => import("@mui/icons-material/PushPin"));
const PushPinOutlinedIcon = lazy(
  () => import("@mui/icons-material/PushPinOutlined"),
);
const ExpandMoreIcon = lazy(() => import("@mui/icons-material/ExpandMore"));
const ExpandLessIcon = lazy(() => import("@mui/icons-material/ExpandLess"));
const EmojiEmotionsIcon = lazy(
  () => import("@mui/icons-material/EmojiEmotions"),
);
const PictureAsPdfIcon = lazy(() => import("@mui/icons-material/PictureAsPdf"));
const TableChartIcon = lazy(() => import("@mui/icons-material/TableChart"));
const ArticleIcon = lazy(() => import("@mui/icons-material/Article"));
const VideoFileIcon = lazy(() => import("@mui/icons-material/VideoFile"));

function getOtherParticipant(room, myUserId) {
  const otherId = room.participants?.find((p) => p !== myUserId);
  if (!otherId) return "Unknown";
  const detail = room.participantDetails?.find(
    (p) => p.id === otherId || p._id === otherId,
  );
  if (detail && (detail.first_name || detail.last_name || detail.username)) {
    return (
      `${detail.first_name || ""} ${detail.last_name || ""}`.trim() ||
      detail.username
    );
  }
  return "Unknown User";
}

function formatTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatDateSeparator(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const startOfDay = (x: Date) =>
    new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOfDay(now) - startOfDay(d)) / 86400000);
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  return d.toLocaleDateString([], {
    day: "numeric",
    month: "long",
    year: d.getFullYear() === now.getFullYear() ? undefined : "numeric",
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
      <Suspense fallback={null}>
        <InsertDriveFileIcon fontSize={size} />
      </Suspense>
    );
  if (mime === "application/pdf")
    return (
      <Suspense fallback={null}>
        <PictureAsPdfIcon fontSize={size} sx={{ color: "#e53935" }} />
      </Suspense>
    );
  if (mime.includes("sheet") || mime.includes("excel") || mime === "text/csv")
    return (
      <Suspense fallback={null}>
        <TableChartIcon fontSize={size} sx={{ color: "#2e7d32" }} />
      </Suspense>
    );
  if (mime.includes("word") || mime.includes("document"))
    return (
      <Suspense fallback={null}>
        <ArticleIcon fontSize={size} sx={{ color: "#1565c0" }} />
      </Suspense>
    );
  if (mime.startsWith("video/"))
    return (
      <Suspense fallback={null}>
        <VideoFileIcon fontSize={size} sx={{ color: "#6a1b9a" }} />
      </Suspense>
    );
  return (
    <Suspense fallback={null}>
      <InsertDriveFileIcon fontSize={size} />
    </Suspense>
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

// Scrolls to a message already rendered in the thread and briefly flashes
// it so it's easy to spot. Returns whether it was found — callers that can
// page in older history (see `jumpToMessage` in Chat()) use this to decide
// whether to keep loading further back, WhatsApp-style.
function flashMessage(messageId: string | undefined): boolean {
  if (!messageId) return false;
  const el = document.getElementById(`chat-msg-${messageId}`);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("chat-msg-highlight");
  setTimeout(() => el.classList.remove("chat-msg-highlight"), 1500);
  return true;
}

function MessageBubble({
  msg,
  isMine,
  onReply,
  onDelete,
  onPin,
  onUnpin,
  onJumpToMessage,
  roomParticipants,
  onImageClick,
  senderName = "",
  replyToSenderName = "",
}) {
  const [menuAnchor, setMenuAnchor] = useState<HTMLElement | null>(null);
  const isRead =
    isMine &&
    roomParticipants.some((p) => p !== msg.senderId && msg.readBy?.includes(p));

  if (msg.isDeleted) {
    return (
      <div
        id={`chat-msg-${msg._id}`}
        className={`chat-message-row ${isMine ? "mine" : "theirs"}`}
      >
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
            {senderName?.[0]?.toUpperCase()}
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

  const metaContent = (
    <>
      {msg.isPinned && (
        <Suspense fallback={null}>
          <PushPinIcon
            sx={{ fontSize: 12, opacity: 0.75, transform: "rotate(45deg)" }}
            aria-label="Pinned message"
          />
        </Suspense>
      )}
      <Typography variant="caption" component="span" className="chat-time">
        {formatTime(msg.createdAt)}
      </Typography>
      {isMine && (
        <Suspense fallback={null}>
          {isRead ? (
            <DoneAllIcon sx={{ fontSize: 14, ml: 0.25, color: "#53bdeb" }} />
          ) : (
            <DoneIcon sx={{ fontSize: 14, ml: 0.25 }} />
          )}
        </Suspense>
      )}
    </>
  );

  return (
    <div
      id={`chat-msg-${msg._id}`}
      className={`chat-message-row ${isMine ? "mine" : "theirs"}`}
    >
      {!isMine && (
        <Avatar
          sx={{
            width: 24,
            height: 24,
            fontSize: 11,
            mr: 0.5,
            alignSelf: "flex-end",
          }}
        >
          {senderName?.[0]?.toUpperCase()}
        </Avatar>
      )}
      <div className="chat-bubble-wrapper">
        {/* Reply preview */}
        {msg.replyTo && (
          <div
            className="chat-reply-preview"
            role="button"
            tabIndex={0}
            onClick={() => onJumpToMessage(msg.replyTo._id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onJumpToMessage(msg.replyTo._id);
              }
            }}
          >
            <Typography variant="caption" fontWeight={600}>
              {replyToSenderName}
            </Typography>
            <Typography variant="caption" noWrap sx={{ display: "block" }}>
              {msg.replyTo.isDeleted
                ? "🚫 Original message deleted"
                : msg.replyTo.content || msg.replyTo.fileName || "File"}
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
                sx={{
                  whiteSpace: "pre-wrap",
                  wordBreak: "break-word",
                  fontSize: 13,
                  lineHeight: 1.35,
                }}
              >
                <Linkify componentDecorator={linkifyDecorator}>
                  {msg.content}
                </Linkify>
                {/* Floated so it tucks to the right of the last line instead of
                    forcing its own row — falls to a new line only when the last
                    line has no room left. */}
                <span className="chat-meta chat-meta-inline">
                  {metaContent}
                </span>
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

          {msg.type !== "text" && (
            <div className="chat-meta">{metaContent}</div>
          )}
        </div>

        {/* Hover actions */}
        <div
          className={`chat-msg-actions ${isMine ? "actions-mine" : "actions-theirs"}`}
        >
          <div
            className="chat-action-btn"
            onClick={() => onReply(msg)}
            title="Reply"
            role="button"
            tabIndex={0}
            aria-label="Reply to message"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onReply(msg);
              }
            }}
          >
            <Suspense fallback={null}>
              <ReplyIcon sx={{ fontSize: 16 }} aria-hidden="true" />
            </Suspense>
          </div>
          <div
            className="chat-action-btn"
            onClick={(e) => setMenuAnchor(e.currentTarget)}
            title="More options"
            role="button"
            tabIndex={0}
            aria-label="More message options"
            aria-haspopup="menu"
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setMenuAnchor(e.currentTarget as unknown as HTMLElement);
              }
            }}
          >
            <Suspense fallback={null}>
              <MoreVertIcon sx={{ fontSize: 16 }} aria-hidden="true" />
            </Suspense>
          </div>
        </div>

        <Menu
          anchorEl={menuAnchor}
          open={Boolean(menuAnchor)}
          onClose={() => setMenuAnchor(null)}
        >
          <MenuItem
            onClick={() => {
              setMenuAnchor(null);
              msg.isPinned ? onUnpin(msg) : onPin(msg);
            }}
          >
            <Suspense fallback={null}>
              {msg.isPinned ? (
                <PushPinOutlinedIcon fontSize="small" sx={{ mr: 1 }} />
              ) : (
                <PushPinIcon fontSize="small" sx={{ mr: 1 }} />
              )}
            </Suspense>
            {msg.isPinned ? "Unpin message" : "Pin message"}
          </MenuItem>
          <MenuItem
            sx={{ color: "error.main" }}
            onClick={() => {
              setMenuAnchor(null);
              onDelete(msg);
            }}
          >
            <Suspense fallback={null}>
              <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
            </Suspense>
            Delete message
          </MenuItem>
        </Menu>
      </div>
    </div>
  );
}

function ConversationItem({ conv, myUserId, isActive, onClick, unread }) {
  const other = getOtherParticipant(conv, myUserId);
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
      role="button"
      tabIndex={0}
      aria-label={`${other}${unread > 0 ? `, ${unread} unread message${unread > 1 ? "s" : ""}` : ""}`}
      aria-current={isActive ? "true" : undefined}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick(conv);
        }
      }}
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
                  <Suspense fallback={null}>
                    <SearchIcon fontSize="small" />
                  </Suspense>
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
                  role="button"
                  tabIndex={0}
                  aria-label={`Start conversation with ${u.fullName || u.username}`}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      handleStartConversation(u);
                    }
                  }}
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
                myUserId={user?.id}
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
                  aria-label="Back to conversations"
                  onClick={() => {
                    setMobileShowThread(false);
                    setActiveRoomId(null);
                  }}
                >
                  <Suspense fallback={null}>
                    <ArrowBackIcon fontSize="small" aria-hidden="true" />
                  </Suspense>
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
                  aria-label="Chat options"
                  aria-haspopup="menu"
                  onClick={(e) => setHeaderMenuAnchor(e.currentTarget)}
                >
                  <Suspense fallback={null}>
                    <MoreVertIcon fontSize="small" aria-hidden="true" />
                  </Suspense>
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
                    <Suspense fallback={null}>
                      <DeleteIcon fontSize="small" sx={{ mr: 1 }} />
                    </Suspense>
                    Delete Chat
                  </MenuItem>
                </Menu>
              </div>
            </div>

            <Divider />

            {/* Pinned messages bar */}
            {activePinnedMessages.length > 0 && (
              <div className="chat-pinned-bar">
                <div
                  className="chat-pinned-bar-header"
                  role="button"
                  tabIndex={0}
                  aria-expanded={pinnedBarExpanded}
                  onClick={() => setPinnedBarExpanded((v) => !v)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setPinnedBarExpanded((v) => !v);
                    }
                  }}
                >
                  <Suspense fallback={null}>
                    <PushPinIcon
                      sx={{ fontSize: 14, transform: "rotate(45deg)" }}
                      aria-hidden="true"
                    />
                  </Suspense>
                  <Typography
                    variant="caption"
                    fontWeight={600}
                    sx={{ flex: 1 }}
                  >
                    {activePinnedMessages.length === 1
                      ? "1 Pinned Message"
                      : `${activePinnedMessages.length} Pinned Messages`}
                  </Typography>
                  <Suspense fallback={null}>
                    {pinnedBarExpanded ? (
                      <ExpandLessIcon
                        sx={{ fontSize: 18 }}
                        aria-hidden="true"
                      />
                    ) : (
                      <ExpandMoreIcon
                        sx={{ fontSize: 18 }}
                        aria-hidden="true"
                      />
                    )}
                  </Suspense>
                </div>
                {(pinnedBarExpanded
                  ? activePinnedMessages
                  : activePinnedMessages.slice(0, 1)
                ).map((pm: any) => (
                  <div
                    key={pm._id}
                    className="chat-pinned-bar-item"
                    role="button"
                    tabIndex={0}
                    onClick={() => jumpToMessage(pm._id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        jumpToMessage(pm._id);
                      }
                    }}
                  >
                    <div className="chat-pinned-bar-item-content">
                      <Typography
                        variant="caption"
                        fontWeight={600}
                        sx={{ display: "block" }}
                      >
                        {resolveParticipantName(pm.senderId)}
                      </Typography>
                      <Typography
                        variant="caption"
                        noWrap
                        sx={{ display: "block" }}
                      >
                        {pm.content || pm.fileName || "File"}
                      </Typography>
                    </div>
                    <IconButton
                      size="small"
                      aria-label="Unpin message"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleUnpinMessage(pm);
                      }}
                    >
                      <Suspense fallback={null}>
                        <CloseIcon sx={{ fontSize: 14 }} aria-hidden="true" />
                      </Suspense>
                    </IconButton>
                  </div>
                ))}
              </div>
            )}

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
              {(() => {
                let lastDateKey: string | null = null;
                return activeMessages.map((msg) => {
                  const senderName = resolveParticipantName(msg.senderId);
                  const dateKey = msg.createdAt
                    ? new Date(msg.createdAt).toDateString()
                    : null;
                  const showDateSeparator =
                    !!dateKey && dateKey !== lastDateKey;
                  lastDateKey = dateKey;
                  return (
                    <Fragment key={msg._id}>
                      {showDateSeparator && (
                        <div className="chat-date-separator">
                          <span>{formatDateSeparator(msg.createdAt)}</span>
                        </div>
                      )}
                      <MessageBubble
                        msg={msg}
                        isMine={msg.senderId === user?.id}
                        onReply={(m) => setReplyTo({ ...m, senderName })}
                        onDelete={setDeleteTargetMsg}
                        onPin={handlePinMessage}
                        onUnpin={handleUnpinMessage}
                        onJumpToMessage={jumpToMessage}
                        roomParticipants={activeRoomParticipants}
                        onImageClick={setLightboxUrl}
                        senderName={senderName}
                        replyToSenderName={
                          msg.replyTo
                            ? resolveParticipantName(msg.replyTo.senderId)
                            : ""
                        }
                      />
                    </Fragment>
                  );
                });
              })()}
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
                    Replying to {replyTo.senderName || replyTo.senderId}
                  </Typography>
                  <Typography variant="caption" noWrap>
                    {replyTo.content || replyTo.fileName || "File"}
                  </Typography>
                </div>
                <IconButton
                  size="small"
                  aria-label="Cancel reply"
                  onClick={() => setReplyTo(null)}
                >
                  <Suspense fallback={null}>
                    <CloseIcon fontSize="small" aria-hidden="true" />
                  </Suspense>
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
                    aria-label="Attach file"
                    className="chat-attach-btn"
                  >
                    <Suspense fallback={null}>
                      {uploading ? (
                        <CircularProgress size={18} aria-hidden="true" />
                      ) : (
                        <AttachFileIcon fontSize="small" aria-hidden="true" />
                      )}
                    </Suspense>
                  </IconButton>
                </span>
              </Tooltip>

              {/* Emoji */}
              <div className="chat-emoji-wrap" ref={emojiPickerRef}>
                <Tooltip title="Emoji">
                  <IconButton
                    onClick={() => setShowEmojiPicker((p) => !p)}
                    size="small"
                    aria-label={
                      showEmojiPicker
                        ? "Close emoji picker"
                        : "Open emoji picker"
                    }
                    aria-expanded={showEmojiPicker}
                    className="chat-attach-btn"
                  >
                    <Suspense fallback={null}>
                      <EmojiEmotionsIcon fontSize="small" aria-hidden="true" />
                    </Suspense>
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
                    aria-label="Send message"
                    className="chat-send-btn"
                  >
                    <Suspense fallback={null}>
                      <SendIcon fontSize="small" aria-hidden="true" />
                    </Suspense>
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
        slots={{ transition: SlideUpTransition }}
        transitionDuration={{ enter: 280, exit: 200 }}
      >
        <DialogContent sx={{ p: 0, bgcolor: "black", position: "relative" }}>
          <IconButton
            onClick={() => setLightboxUrl(null)}
            aria-label="Close image preview"
            sx={{
              position: "absolute",
              top: 8,
              right: 8,
              color: "white",
              zIndex: 1,
            }}
          >
            <Suspense fallback={null}>
              <CloseIcon aria-hidden="true" />
            </Suspense>
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
        slots={{ transition: SlideUpTransition }}
        transitionDuration={{ enter: 280, exit: 200 }}
      >
        <DialogTitle>Delete Message</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This message will be deleted for everyone. This cannot be undone.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant="ghost" onClick={() => setDeleteTargetMsg(null)}>
            Cancel
          </Button>
          <Button onClick={handleDeleteMessage} variant="danger">
            Delete
          </Button>
        </DialogActions>
      </Dialog>

      {/* delete conversation confirmation */}
      <Dialog
        open={deleteConvConfirm}
        onClose={() => setDeleteConvConfirm(false)}
        slots={{ transition: SlideUpTransition }}
        transitionDuration={{ enter: 280, exit: 200 }}
      >
        <DialogTitle>Delete Chat</DialogTitle>
        <DialogContent>
          <DialogContentText>
            This conversation will be removed from your list. The other
            participant will still have access to it.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button variant="ghost" onClick={() => setDeleteConvConfirm(false)}>
            Cancel
          </Button>
          <Button onClick={handleDeleteConversation} variant="danger">
            Delete
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
}

export default Chat;
