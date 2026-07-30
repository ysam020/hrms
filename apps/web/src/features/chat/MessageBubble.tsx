import { Suspense, useState, type ComponentType } from "react";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import _Linkify from "react-linkify";
import { FileTypeIcon } from "./FileTypeIcon";
import { LinkPreview } from "./LinkPreview";
import { useFileViewUrl } from "./useFileViewUrl";
import { FIRST_URL_RE, formatFileSize, formatTime } from "./chatHelpers";
import {
  DeleteIcon,
  DoneAllIcon,
  DoneIcon,
  MoreVertIcon,
  PushPinIcon,
  PushPinOutlinedIcon,
  ReplyIcon,
} from "./chatIcons";

// react-linkify is an old CJS alpha; esbuild may expose the module namespace
// object instead of .default — normalise across both interop modes.
const Linkify: ComponentType<any> = (_Linkify as any).default ?? _Linkify;

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

export function MessageBubble({
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

  const hasFile = !msg.isDeleted && msg.type !== "text" && Boolean(msg.fileUrl);
  const fileViewUrl = useFileViewUrl(msg._id, hasFile);

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

          {msg.type === "image" &&
            (fileViewUrl ? (
              <img
                src={fileViewUrl}
                alt={msg.fileName || "Image"}
                className="chat-image-preview"
                onClick={() => onImageClick(fileViewUrl)}
              />
            ) : (
              <div className="chat-media-loading chat-image-preview" />
            ))}

          {msg.type === "video" && (
            <div className="chat-video-wrap">
              {fileViewUrl ? (
                <video
                  src={fileViewUrl}
                  controls
                  className="chat-video-preview"
                  preload="metadata"
                />
              ) : (
                <div className="chat-media-loading chat-video-preview" />
              )}
              {msg.fileName && (
                <Typography variant="caption" className="chat-media-filename">
                  {msg.fileName}
                </Typography>
              )}
            </div>
          )}

          {msg.type === "file" && (
            <a
              href={fileViewUrl || undefined}
              target="_blank"
              rel="noreferrer"
              className="chat-file-card"
              onClick={(e) => {
                if (!fileViewUrl) e.preventDefault();
              }}
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
