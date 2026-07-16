import { Suspense } from "react";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import { CloseIcon } from "./chatIcons";

export function ReplyBar({
  replyTo,
  onCancel,
}: {
  replyTo: any;
  onCancel: () => void;
}) {
  return (
    <div className="chat-reply-bar">
      <div className="chat-reply-bar-content">
        <Typography variant="caption" fontWeight={700} color="primary">
          Replying to {replyTo.senderName || replyTo.senderId}
        </Typography>
        <Typography variant="caption" noWrap>
          {replyTo.content || replyTo.fileName || "File"}
        </Typography>
      </div>
      <IconButton size="small" aria-label="Cancel reply" onClick={onCancel}>
        <Suspense fallback={null}>
          <CloseIcon fontSize="small" aria-hidden="true" />
        </Suspense>
      </IconButton>
    </div>
  );
}
