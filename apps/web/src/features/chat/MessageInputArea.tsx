import { Suspense } from "react";
import IconButton from "@mui/material/IconButton";
import TextField from "@mui/material/TextField";
import CircularProgress from "@mui/material/CircularProgress";
import Tooltip from "@mui/material/Tooltip";
import EmojiPicker, { EmojiStyle } from "emoji-picker-react";
import { AttachFileIcon, EmojiEmotionsIcon, SendIcon } from "./chatIcons";

export function MessageInputArea({
  isDark,
  fileInputRef,
  uploading,
  onFileSelect,
  showEmojiPicker,
  setShowEmojiPicker,
  emojiPickerRef,
  onEmojiClick,
  text,
  onTextChange,
  onKeyDown,
  onSend,
}: {
  isDark: boolean;
  fileInputRef: React.MutableRefObject<HTMLInputElement | null>;
  uploading: boolean;
  onFileSelect: (e: React.ChangeEvent<HTMLInputElement>) => void;
  showEmojiPicker: boolean;
  setShowEmojiPicker: (update: (v: boolean) => boolean) => void;
  emojiPickerRef: React.MutableRefObject<HTMLDivElement | null>;
  onEmojiClick: (emojiData: any) => void;
  text: string;
  onTextChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
}) {
  return (
    <div className="chat-input-area">
      <input
        type="file"
        ref={fileInputRef}
        style={{ display: "none" }}
        onChange={onFileSelect}
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
              showEmojiPicker ? "Close emoji picker" : "Open emoji picker"
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
              onEmojiClick={onEmojiClick}
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
        onChange={onTextChange}
        onKeyDown={onKeyDown}
        className="chat-text-field"
        variant="outlined"
      />

      <Tooltip title="Send (Enter)">
        <span>
          <IconButton
            onClick={onSend}
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
  );
}
