import { Suspense } from "react";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import {
  CloseIcon,
  ExpandLessIcon,
  ExpandMoreIcon,
  PushPinIcon,
} from "./chatIcons";

export function PinnedMessagesBar({
  activePinnedMessages,
  pinnedBarExpanded,
  setPinnedBarExpanded,
  resolveParticipantName,
  onJumpToMessage,
  onUnpinMessage,
}: {
  activePinnedMessages: any[];
  pinnedBarExpanded: boolean;
  setPinnedBarExpanded: (update: (v: boolean) => boolean) => void;
  resolveParticipantName: (senderId: string) => string;
  onJumpToMessage: (messageId: string | undefined) => void;
  onUnpinMessage: (msg: any) => void;
}) {
  return (
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
        <Typography variant="caption" fontWeight={600} sx={{ flex: 1 }}>
          {activePinnedMessages.length === 1
            ? "1 Pinned Message"
            : `${activePinnedMessages.length} Pinned Messages`}
        </Typography>
        <Suspense fallback={null}>
          {pinnedBarExpanded ? (
            <ExpandLessIcon sx={{ fontSize: 18 }} aria-hidden="true" />
          ) : (
            <ExpandMoreIcon sx={{ fontSize: 18 }} aria-hidden="true" />
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
          onClick={() => onJumpToMessage(pm._id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              onJumpToMessage(pm._id);
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
            <Typography variant="caption" noWrap sx={{ display: "block" }}>
              {pm.content || pm.fileName || "File"}
            </Typography>
          </div>
          <IconButton
            size="small"
            aria-label="Unpin message"
            onClick={(e) => {
              e.stopPropagation();
              onUnpinMessage(pm);
            }}
          >
            <Suspense fallback={null}>
              <CloseIcon sx={{ fontSize: 14 }} aria-hidden="true" />
            </Suspense>
          </IconButton>
        </div>
      ))}
    </div>
  );
}
