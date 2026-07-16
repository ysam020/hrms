import { Fragment } from "react";
import Typography from "@mui/material/Typography";
import CircularProgress from "@mui/material/CircularProgress";
import { MessageBubble } from "./MessageBubble";
import { TypingIndicator } from "./TypingIndicator";
import { formatDateSeparator } from "./chatHelpers";

export function MessagesArea({
  isDark,
  loadingMessages,
  activeMessages,
  activeTypingUsers,
  resolveParticipantName,
  currentUserId,
  onScroll,
  onReply,
  onDelete,
  onPin,
  onUnpin,
  onJumpToMessage,
  activeRoomParticipants,
  onImageClick,
  messagesEndRef,
}: {
  isDark: boolean;
  loadingMessages: boolean;
  activeMessages: any[];
  activeTypingUsers: string[];
  resolveParticipantName: (senderId: string) => string;
  currentUserId: string | undefined;
  onScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  onReply: (msg: any, senderName: string) => void;
  onDelete: (msg: any) => void;
  onPin: (msg: any) => void;
  onUnpin: (msg: any) => void;
  onJumpToMessage: (messageId: string | undefined) => void;
  activeRoomParticipants: string[];
  onImageClick: (url: string) => void;
  messagesEndRef: React.MutableRefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      className="chat-messages-area"
      onScroll={onScroll}
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
          const showDateSeparator = !!dateKey && dateKey !== lastDateKey;
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
                isMine={msg.senderId === currentUserId}
                onReply={(m) => onReply(m, senderName)}
                onDelete={onDelete}
                onPin={onPin}
                onUnpin={onUnpin}
                onJumpToMessage={onJumpToMessage}
                roomParticipants={activeRoomParticipants}
                onImageClick={onImageClick}
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
  );
}
