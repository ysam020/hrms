import { Suspense } from "react";
import Avatar from "@mui/material/Avatar";
import Typography from "@mui/material/Typography";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import InputAdornment from "@mui/material/InputAdornment";
import Divider from "@mui/material/Divider";
import { ConversationItem } from "./ConversationItem";
import { SearchIcon } from "./chatIcons";

export function ConversationsPanel({
  mobileShowThread,
  userSearch,
  setUserSearch,
  searching,
  searchResults,
  onStartConversation,
  loadingConversations,
  conversations,
  myUserId,
  activeRoomId,
  onOpenRoom,
  unreadCounts,
}: {
  mobileShowThread: boolean;
  userSearch: string;
  setUserSearch: (v: string) => void;
  searching: boolean;
  searchResults: any[];
  onStartConversation: (u: any) => void;
  loadingConversations: boolean;
  conversations: any[];
  myUserId: string | undefined;
  activeRoomId: string | null;
  onOpenRoom: (conv: any) => void;
  unreadCounts: Record<string, number>;
}) {
  return (
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
                onClick={() => onStartConversation(u)}
                role="button"
                tabIndex={0}
                aria-label={`Start conversation with ${u.fullName || u.username}`}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onStartConversation(u);
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
              myUserId={myUserId}
              isActive={conv._id === activeRoomId}
              onClick={onOpenRoom}
              unread={unreadCounts[conv._id] || 0}
            />
          ))
        )}
      </div>
    </div>
  );
}
