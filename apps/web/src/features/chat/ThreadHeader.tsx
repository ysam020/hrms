import { Suspense } from "react";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import IconButton from "@mui/material/IconButton";
import Menu from "@mui/material/Menu";
import MenuItem from "@mui/material/MenuItem";
import { ArrowBackIcon, DeleteIcon, MoreVertIcon } from "./chatIcons";

export function ThreadHeader({
  otherUser,
  headerMenuAnchor,
  setHeaderMenuAnchor,
  onBack,
  onDeleteChatClick,
}: {
  otherUser: string | null;
  headerMenuAnchor: HTMLElement | null;
  setHeaderMenuAnchor: (el: HTMLElement | null) => void;
  onBack: () => void;
  onDeleteChatClick: () => void;
}) {
  return (
    <div className="chat-thread-header">
      <div className="chat-thread-header-left">
        <IconButton
          className="chat-back-btn"
          size="small"
          aria-label="Back to conversations"
          onClick={onBack}
        >
          <Suspense fallback={null}>
            <ArrowBackIcon fontSize="small" aria-hidden="true" />
          </Suspense>
        </IconButton>
        <Avatar sx={{ width: 36, height: 36, fontSize: 14, mr: 1 }}>
          {otherUser?.[0]?.toUpperCase()}
        </Avatar>
        <Typography variant="subtitle1" fontWeight={700} lineHeight={1.2}>
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
              onDeleteChatClick();
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
  );
}
