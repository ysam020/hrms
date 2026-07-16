import Typography from "@mui/material/Typography";

export function TypingIndicator({ names }) {
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
