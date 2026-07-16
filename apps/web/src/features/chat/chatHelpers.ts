export function getOtherParticipant(room, myUserId) {
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

export function formatTime(dateStr) {
  if (!dateStr) return "";
  return new Date(dateStr).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateSeparator(dateStr) {
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

export function formatConvTime(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr);
  const now = new Date();
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays === 0) return formatTime(dateStr);
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return d.toLocaleDateString([], { weekday: "short" });
  return d.toLocaleDateString([], { day: "2-digit", month: "short" });
}

export function formatFileSize(bytes) {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getMessageType(mime) {
  if (!mime) return "file";
  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  return "file";
}

export const FIRST_URL_RE = /https?:\/\/\S+/;

// Scrolls to a message already rendered in the thread and briefly flashes
// it so it's easy to spot. Returns whether it was found — callers that can
// page in older history (see `jumpToMessage` in Chat()) use this to decide
// whether to keep loading further back, WhatsApp-style.
export function flashMessage(messageId: string | undefined): boolean {
  if (!messageId) return false;
  const el = document.getElementById(`chat-msg-${messageId}`);
  if (!el) return false;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.classList.add("chat-msg-highlight");
  setTimeout(() => el.classList.remove("chat-msg-highlight"), 1500);
  return true;
}
