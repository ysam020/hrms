import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import Badge from "@mui/material/Badge";
import { formatConvTime, getOtherParticipant } from "./chatHelpers";

export function ConversationItem({
  conv,
  myUserId,
  isActive,
  onClick,
  unread,
}) {
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
