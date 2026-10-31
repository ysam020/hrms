import {
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import axios from "axios";
import { AnimatePresence, motion } from "framer-motion";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ChatUnreadContext } from "@web/app/providers/ChatUnreadContext";
import useChat from "@web/shared/hooks/useChat";
import { API_ENDPOINTS } from "@web/shared/constants/apiEndpoints";
import {
  formatConvTime,
  formatDateSeparator,
  formatFileSize,
  formatTime,
  getMessageType,
  getOtherParticipant,
} from "@web/features/chat/chatHelpers";
import { useFileViewUrl } from "@web/features/chat/useFileViewUrl";
import { duration, ease } from "@next/motion";
import {
  Avatar,
  Button,
  ConfirmDialog,
  Icon,
  IconButton,
  Menu,
  Page,
  SearchField,
  Skeleton,
  Spinner,
  type MenuEntry,
} from "@next/ui";
import { apiClient, errorMessage } from "@next/lib/api";
import { useIsCompact } from "@next/lib/hooks";
import { readableCase } from "@next/lib/format";
import s from "./chat.module.css";

// Chat (Classic's features/chat). All socket and REST behaviour is Classic's
// useChat hook; helpers, the presigned upload flow and signed file URLs are
// Classic's too. This file is the conversation list, thread and composer.

type Msg = any;
type Room = any;

const previewOf = (m: Msg | undefined) =>
  !m
    ? "No messages yet"
    : m.isDeleted
      ? "Message deleted"
      : m.type === "text"
        ? m.content
        : m.type === "image"
          ? "Photo"
          : m.type === "video"
            ? "Video"
            : m.fileName || "File";

function personOf(room: Room, myId?: string) {
  const otherId = room?.participants?.find((p: string) => p !== myId);
  return room?.participantDetails?.find(
    (p: any) => p.id === otherId || p._id === otherId,
  );
}

/** Scroll to a rendered message and flash it (Classic's flashMessage, with this app's class). */
function flash(id?: string) {
  const el = id && document.getElementById(`chat-msg-${id}`);
  if (!el) return false;
  // Scroll the message list only; scrollIntoView would also scroll the page.
  const box = el.closest<HTMLElement>('[role="log"]');
  if (box)
    box.scrollTo({
      top:
        box.scrollTop +
        el.getBoundingClientRect().top -
        box.getBoundingClientRect().top -
        box.clientHeight / 2 +
        el.clientHeight / 2,
      behavior: "smooth",
    });
  el.setAttribute("data-flash", "");
  setTimeout(() => el.removeAttribute("data-flash"), 1500);
  return true;
}

function Attachment({ msg }: { msg: Msg }) {
  const url = useFileViewUrl(msg._id, Boolean(msg.fileUrl));
  if (msg.type === "image")
    return url ? (
      <a href={url} target="_blank" rel="noreferrer" className={s.media}>
        <img src={url} alt={msg.fileName || "Image"} loading="lazy" />
      </a>
    ) : (
      <Skeleton width={220} height={160} />
    );
  if (msg.type === "video")
    return url ? (
      <video className={s.media} src={url} controls preload="metadata" />
    ) : (
      <Skeleton width={220} height={140} />
    );
  return (
    <a
      href={url ?? undefined}
      target="_blank"
      rel="noreferrer"
      className={s.file}
      aria-disabled={!url}
    >
      <Icon name="doc" size={22} />
      <span style={{ display: "grid", minWidth: 0 }}>
        <span className="px-truncate">{msg.fileName || "File"}</span>
        <span className={s.fileMeta}>{formatFileSize(msg.fileSize)}</span>
      </span>
    </a>
  );
}

function Bubble({
  msg,
  mine,
  read,
  replyName,
  onReply,
  onPin,
  onDelete,
  onJump,
  groupStart = true,
  groupEnd = true,
}: {
  msg: Msg;
  mine: boolean;
  groupStart?: boolean;
  groupEnd?: boolean;
  read: boolean;
  replyName: string;
  onReply: () => void;
  onPin: () => void;
  onDelete: () => void;
  onJump: (id: string) => void;
}) {
  const [menu, setMenu] = useState(false);
  const anchor = useRef<HTMLButtonElement>(null);
  const items: MenuEntry[] = msg.isDeleted
    ? []
    : [
        { label: "Reply", icon: "chat", onSelect: onReply },
        { label: msg.isPinned ? "Unpin" : "Pin", icon: "pin", onSelect: onPin },
        ...(msg.type === "text"
          ? [
              {
                label: "Copy",
                icon: "doc" as const,
                onSelect: () => navigator.clipboard?.writeText(msg.content),
              },
            ]
          : []),
        ...(mine
          ? [
              { separator: true } as MenuEntry,
              {
                label: "Delete",
                icon: "trash" as const,
                tone: "danger" as const,
                onSelect: onDelete,
              },
            ]
          : []),
      ];
  return (
    <div
      id={`chat-msg-${msg._id}`}
      className={s.msgRow}
      data-mine={mine || undefined}
      data-start={groupStart || undefined}
      data-end={groupEnd || undefined}
    >
      <div className={s.bubble} data-deleted={msg.isDeleted || undefined}>
        {msg.isPinned && !msg.isDeleted && (
          <span className={s.pinned}>
            <Icon name="pin" size={12} /> Pinned
          </span>
        )}
        {msg.replyTo && (
          <button
            type="button"
            className={s.quote}
            onClick={() => onJump(msg.replyTo._id)}
          >
            <span className={s.quoteName}>{replyName}</span>
            <span className="px-truncate">
              {msg.replyTo.isDeleted
                ? "Message deleted"
                : msg.replyTo.content || msg.replyTo.fileName || "File"}
            </span>
          </button>
        )}
        {msg.isDeleted ? (
          <span className={s.deleted}>Message deleted</span>
        ) : (
          <>
            {msg.type !== "text" && msg.fileUrl && <Attachment msg={msg} />}
            {(msg.type === "text" ||
              (msg.content && msg.content !== msg.fileName)) && (
              <p className={s.text}>{msg.content}</p>
            )}
          </>
        )}
        {groupEnd ? (
          <span className={s.time}>
            {formatTime(msg.createdAt)}
            {mine && !msg.isDeleted && (
              <span aria-label={read ? "Read" : "Sent"}>
                {read ? " · Read" : ""}
              </span>
            )}
          </span>
        ) : (
          <span className="px-sr-only">{formatTime(msg.createdAt)}</span>
        )}
      </div>
      {items.length > 0 && (
        <>
          <IconButton
            ref={anchor}
            icon="more"
            label="Message actions"
            className={s.msgMore}
            onClick={() => setMenu(true)}
          />
          <Menu
            open={menu}
            onClose={() => setMenu(false)}
            anchorRef={anchor}
            label="Message actions"
            items={items}
            placement={mine ? "bottom-end" : "bottom-start"}
          />
        </>
      )}
    </div>
  );
}

export default function Chat() {
  const { user } = useContext(UserContext);
  const { setAlert } = useContext(AlertContext);
  const { clearRoomUnread } = useContext(ChatUnreadContext);
  const compact = useIsCompact();
  const chat = useChat();
  // Chat is a fixed-height surface; with the page locked, nothing (a focus,
  // a late image) can scroll the window and push the header out of view.
  useEffect(() => {
    const root = document.documentElement;
    root.setAttribute("data-px-chat", "");
    window.scrollTo(0, 0);
    return () => root.removeAttribute("data-px-chat");
  }, []);
  const {
    conversations,
    messages,
    activeRoomId,
    setActiveRoomId,
    typingUsers,
    unreadCounts,
    pinnedMessages,
    loadingConversations,
    loadingMessages,
    fetchMessages,
    fetchPinnedMessages,
    dbLoadedRoomsRef,
    startConversation,
    markRoomAsRead,
    joinRoom,
    sendMessage,
    emitTyping,
    emitStopTyping,
    emitRead,
  } = chat;

  const [text, setText] = useState("");
  const [replyTo, setReplyTo] = useState<Msg | null>(null);
  const [uploading, setUploading] = useState(false);
  const [query, setQuery] = useState("");
  const [people, setPeople] = useState<any[]>([]);
  const [searching, setSearching] = useState(false);
  const [deleteMsg, setDeleteMsg] = useState<Msg | null>(null);
  const [deleteRoom, setDeleteRoom] = useState(false);
  const [roomMenu, setRoomMenu] = useState(false);
  const [pinIndex, setPinIndex] = useState(0);
  const roomMenuRef = useRef<HTMLButtonElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const typingTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isTyping = useRef(false);

  const room = useMemo(
    () => conversations.find((c: Room) => c._id === activeRoomId),
    [conversations, activeRoomId],
  );
  const thread: Msg[] = useMemo(
    () => (activeRoomId ? messages[activeRoomId] : null) || [],
    [messages, activeRoomId],
  );
  const pins: Msg[] = useMemo(
    () => (activeRoomId ? pinnedMessages[activeRoomId] : null) || [],
    [pinnedMessages, activeRoomId],
  );
  const nameOf = useCallback(
    (id: string) => {
      if (id === user?.id) return "You";
      const d = room?.participantDetails?.find(
        (p: any) => p.id === id || p._id === id,
      );
      return d
        ? `${d.first_name || ""} ${d.last_name || ""}`.trim() ||
            d.username ||
            ""
        : "";
    },
    [room, user?.id],
  );
  const typing: string[] = (
    (activeRoomId ? typingUsers[activeRoomId] : null) || []
  ).map((id: string) => nameOf(id) || "Someone");
  const other = room ? getOtherParticipant(room, user?.id) : "";
  const otherPerson = room ? personOf(room, user?.id) : null;

  // Scroll rules: a newly opened conversation starts at its latest message;
  // loading older history keeps the reader's place; a new message (or the
  // typing indicator) follows only when the reader is already at the bottom
  // or sent it themselves — reading back through history is never yanked.
  const scrollBox = useRef<HTMLDivElement>(null);
  const nearBottom = useRef(true);
  const shape = useRef({ room: "", first: "", last: "", height: 0 });
  useLayoutEffect(() => {
    const el = scrollBox.current;
    const prev = shape.current;
    const first = thread[0]?._id ?? "";
    const lastMsg = thread[thread.length - 1];
    const last = lastMsg?._id ?? "";
    if (!el) return;
    if (prev.room !== activeRoomId) {
      el.scrollTop = el.scrollHeight;
      nearBottom.current = true;
    } else if (first !== prev.first && last === prev.last && prev.height) {
      // Older messages were prepended: hold the visible message in place.
      el.scrollTop += el.scrollHeight - prev.height;
    } else if (
      nearBottom.current ||
      (last !== prev.last && lastMsg?.senderId === user?.id)
    ) {
      el.scrollTop = el.scrollHeight;
    }
    shape.current = {
      room: activeRoomId ?? "",
      first,
      last,
      height: el.scrollHeight,
    };
  }, [thread, typing.length, activeRoomId, user?.id]);

  // People search for a new conversation (Classic's /get-all-users query).
  useEffect(() => {
    if (!query.trim()) return setPeople([]);
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await apiClient.get(
          `/get-all-users?search=${encodeURIComponent(query)}&limit=10`,
        );
        const list = res.data.data?.users || res.data.data || [];
        setPeople(list.filter((u: any) => u.id !== user?.id));
      } catch {
        setPeople([]);
      } finally {
        setSearching(false);
      }
    }, 300);
    return () => clearTimeout(t);
  }, [query, user?.id]);

  const openRoom = useCallback(
    async (conv: Room) => {
      const id = conv._id;
      setActiveRoomId(id);
      setReplyTo(null);
      setText("");
      setPinIndex(0);
      joinRoom(id);
      if (!dbLoadedRoomsRef.current.has(id)) await fetchMessages(id);
      fetchPinnedMessages(id);
      markRoomAsRead(id);
      emitRead(id);
      clearRoomUnread(id);
      if (!compact)
        requestAnimationFrame(() =>
          inputRef.current?.focus({ preventScroll: true }),
        );
    },
    [
      setActiveRoomId,
      joinRoom,
      fetchMessages,
      fetchPinnedMessages,
      markRoomAsRead,
      emitRead,
      clearRoomUnread,
      dbLoadedRoomsRef,
      compact,
    ],
  );

  const start = async (person: any) => {
    setQuery("");
    setPeople([]);
    try {
      await openRoom(await startConversation(person.id));
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  };

  const stopTyping = () => {
    isTyping.current = false;
    if (activeRoomId) emitStopTyping(activeRoomId);
  };
  const onType = (v: string) => {
    setText(v);
    if (!activeRoomId) return;
    if (!isTyping.current) {
      isTyping.current = true;
      emitTyping(activeRoomId);
    }
    if (typingTimer.current) clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(stopTyping, 1500);
  };
  const send = () => {
    if (!activeRoomId || (!text.trim() && !replyTo)) return;
    sendMessage({
      roomId: activeRoomId,
      content: text.trim(),
      type: "text",
      replyTo: replyTo?._id || null,
    });
    setText("");
    setReplyTo(null);
    stopTyping();
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      send();
    } else if (e.key === "Escape" && replyTo) {
      e.stopPropagation();
      setReplyTo(null);
    }
  };

  // Same presigned-URL flow Classic uses: signed PUT to S3, then send fileUrl.
  const upload = async (file?: File) => {
    if (!file || !activeRoomId) return;
    setUploading(true);
    try {
      const { data } = await apiClient.post(
        API_ENDPOINTS.UPLOAD_PRESIGNED_URL,
        {
          fileName: file.name,
          fileType: file.type,
          folder: "chat",
          username: user?.username,
        },
      );
      const { url, fileUrl } = data.data;
      await axios.put(url, file, { headers: { "Content-Type": file.type } });
      sendMessage({
        roomId: activeRoomId,
        content: file.name,
        type: getMessageType(file.type),
        fileUrl,
        fileName: file.name,
        fileMimeType: file.type,
        fileSize: file.size,
      });
    } catch (err) {
      setAlert({
        open: true,
        message: `“${file.name}” couldn’t be sent. ${errorMessage(err)}`,
        severity: "error",
      });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Jump to a reply/pin target, paging older history until it appears (Classic's jumpToMessage).
  const jump = useCallback(
    async (id?: string) => {
      if (!id || !activeRoomId || flash(id)) return;
      let cursor = thread[0]?.createdAt;
      for (let guard = 0; cursor && guard < 20; guard++) {
        const older = await fetchMessages(activeRoomId, cursor);
        if (!older?.length) break;
        await new Promise((r) => requestAnimationFrame(() => r(null)));
        if (flash(id)) return;
        cursor = older[0]?.createdAt;
      }
    },
    [activeRoomId, thread, fetchMessages],
  );

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    if (
      e.currentTarget.scrollTop === 0 &&
      thread.length >= 50 &&
      !loadingMessages &&
      thread[0]?.createdAt
    )
      fetchMessages(activeRoomId, thread[0].createdAt);
  };

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
    } catch (err) {
      setAlert({ open: true, message: errorMessage(err), severity: "error" });
    }
  };

  const showList = !compact || !activeRoomId;
  const showThread = !compact || Boolean(activeRoomId);
  const pin = pins[Math.min(pinIndex, pins.length - 1)];

  const list = (
    <aside className={s.list} aria-label="Conversations" data-tour="chat-list">
      <div className={s.listSearch}>
        <SearchField
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          label="New message to…"
          data-tour="chat-search"
        />
      </div>
      {query.trim() ? (
        <ul className={s.rooms} aria-label="People">
          {searching && people.length === 0 && (
            <li className={s.hint}>
              <Spinner label="Searching…" size="small" showLabel />
            </li>
          )}
          {!searching && people.length === 0 && (
            <li className={s.hint}>No one matches “{query}”.</li>
          )}
          {people.map((p) => {
            const name =
              `${p.first_name || ""} ${p.last_name || ""}`.trim() || p.username;
            return (
              <li key={p.id}>
                <button
                  type="button"
                  className={s.room}
                  onClick={() => start(p)}
                >
                  <Avatar
                    name={name}
                    src={p.employee_photo || undefined}
                    size={36}
                  />
                  <span className={s.roomText}>
                    <span className="px-headline px-truncate">
                      {readableCase(name)}
                    </span>
                    <span className="px-meta px-truncate">
                      {p.designation || p.email || p.username}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : loadingConversations && conversations.length === 0 ? (
        <div style={{ padding: 12, display: "grid", gap: 8 }}>
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} height={48} />
          ))}
        </div>
      ) : conversations.length === 0 ? (
        <p className={s.hint}>
          No conversations yet. Search for someone above to start one.
        </p>
      ) : (
        <ul className={s.rooms}>
          {conversations.map((c: Room) => {
            const name = getOtherParticipant(c, user?.id);
            const unread = unreadCounts[c._id] || 0;
            return (
              <li key={c._id}>
                <button
                  type="button"
                  className={s.room}
                  aria-current={c._id === activeRoomId || undefined}
                  onClick={() => openRoom(c)}
                  aria-label={`${name}${unread ? `, ${unread} unread` : ""}`}
                >
                  <Avatar
                    name={name}
                    src={personOf(c, user?.id)?.employee_photo || undefined}
                    size={36}
                  />
                  <span className={s.roomText}>
                    <span className={s.roomTop}>
                      <span className="px-headline px-truncate">
                        {readableCase(name)}
                      </span>
                      <span className="px-meta">
                        {formatConvTime(
                          c.lastActivity || c.lastMessage?.createdAt,
                        )}
                      </span>
                    </span>
                    <span className={s.roomBottom}>
                      <span className="px-meta px-truncate">
                        {previewOf(c.lastMessage)}
                      </span>
                      {unread > 0 && (
                        <span className={s.unread}>
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </aside>
  );

  let lastDay = "";
  const threadPane = (
    <section
      className={s.thread}
      aria-label={room ? `Conversation with ${other}` : "Conversation"}
    >
      {!room ? (
        <div className={s.emptyThread}>
          <Icon name="chat" size={40} />
          <p className="px-headline">Select a conversation</p>
          <p className="px-meta">Or search for someone to start a new one.</p>
        </div>
      ) : (
        <>
          <header className={s.threadHead}>
            {compact && (
              <IconButton
                icon="chevronLeft"
                label="All conversations"
                onClick={() => setActiveRoomId(null)}
              />
            )}
            <Avatar
              name={other}
              src={otherPerson?.employee_photo || undefined}
              size={32}
            />
            <span style={{ display: "grid", minWidth: 0, flex: 1 }}>
              <span className="px-headline px-truncate">
                {readableCase(other)}
              </span>
              <span className="px-meta" aria-live="polite">
                {typing.length > 0
                  ? "typing…"
                  : otherPerson?.designation || " "}
              </span>
            </span>
            <IconButton
              ref={roomMenuRef}
              icon="more"
              label="Conversation actions"
              onClick={() => setRoomMenu(true)}
            />
            <Menu
              open={roomMenu}
              onClose={() => setRoomMenu(false)}
              anchorRef={roomMenuRef}
              label="Conversation actions"
              items={[
                {
                  label: "Delete Conversation",
                  icon: "trash",
                  tone: "danger" as const,
                  onSelect: () => setDeleteRoom(true),
                },
              ]}
            />
          </header>
          <AnimatePresence initial={false}>
            {pin && (
              <motion.button
                type="button"
                key="pins"
                className={s.pinBar}
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: duration.fast, ease: ease.standard }}
                onClick={() => {
                  jump(pin._id);
                  setPinIndex((i) => (i + 1) % pins.length);
                }}
                aria-label={`Pinned message ${Math.min(pinIndex, pins.length - 1) + 1} of ${pins.length}. Show it.`}
              >
                <Icon name="pin" size={14} />
                <span className="px-truncate">
                  {pin.isDeleted
                    ? "Message deleted"
                    : pin.content || pin.fileName || "File"}
                </span>
                {pins.length > 1 && (
                  <span className="px-meta px-num">
                    {Math.min(pinIndex, pins.length - 1) + 1}/{pins.length}
                  </span>
                )}
              </motion.button>
            )}
          </AnimatePresence>
          <div
            ref={scrollBox}
            className={s.messages}
            onScroll={onScroll}
            role="log"
            aria-label="Messages"
            aria-live="polite"
          >
            {loadingMessages && thread.length === 0 ? (
              <div
                style={{ display: "grid", placeItems: "center", padding: 32 }}
              >
                <Spinner label="Loading messages" size="large" />
              </div>
            ) : (
              thread.map((m, i) => {
                const day = formatDateSeparator(m.createdAt);
                const sep = day !== lastDay;
                lastDay = day;
                const mine = m.senderId === user?.id;
                // Consecutive messages from one sender within 5 minutes form
                // a group: joined corners, one timestamp at the end.
                const near = (a?: any, b?: any) =>
                  Boolean(
                    a &&
                    b &&
                    a.senderId === b.senderId &&
                    formatDateSeparator(a.createdAt) ===
                      formatDateSeparator(b.createdAt) &&
                    Math.abs(
                      new Date(b.createdAt).getTime() -
                        new Date(a.createdAt).getTime(),
                    ) <
                      5 * 60_000,
                  );
                const groupStart = !near(thread[i - 1], m);
                const groupEnd = !near(m, thread[i + 1]);
                return (
                  <div key={m._id}>
                    {sep && <div className={s.day}>{day}</div>}
                    <Bubble
                      msg={m}
                      mine={mine}
                      groupStart={groupStart}
                      groupEnd={groupEnd}
                      read={(room.participants || []).some(
                        (p: string) =>
                          p !== m.senderId && m.readBy?.includes(p),
                      )}
                      replyName={m.replyTo ? nameOf(m.replyTo.senderId) : ""}
                      onReply={() => {
                        setReplyTo(m);
                        inputRef.current?.focus({ preventScroll: true });
                      }}
                      onPin={() =>
                        act(() =>
                          m.isPinned
                            ? chat.unpinMessage(m._id, activeRoomId)
                            : chat.pinMessage(m._id, activeRoomId),
                        )
                      }
                      onDelete={() => setDeleteMsg(m)}
                      onJump={jump}
                    />
                  </div>
                );
              })
            )}
            {typing.length > 0 && (
              <div className={s.msgRow}>
                <div
                  className={`${s.bubble} ${s.typing}`}
                  aria-label={`${typing.join(", ")} typing`}
                >
                  <span />
                  <span />
                  <span />
                </div>
              </div>
            )}
            <div ref={endRef} />
          </div>
          <footer className={s.composer}>
            <AnimatePresence initial={false}>
              {replyTo && (
                <motion.div
                  key="reply"
                  className={s.replyBar}
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: duration.fast, ease: ease.standard }}
                >
                  <span style={{ display: "grid", minWidth: 0, flex: 1 }}>
                    <span className={s.quoteName}>
                      Replying to {nameOf(replyTo.senderId)}
                    </span>
                    <span className="px-meta px-truncate">
                      {previewOf(replyTo)}
                    </span>
                  </span>
                  <IconButton
                    icon="x"
                    label="Cancel reply"
                    onClick={() => setReplyTo(null)}
                  />
                </motion.div>
              )}
            </AnimatePresence>
            <div className={s.inputRow}>
              <input
                ref={fileRef}
                type="file"
                hidden
                onChange={(e) => upload(e.target.files?.[0])}
              />
              <IconButton
                icon="plus"
                label="Attach a file"
                disabled={uploading}
                onClick={() => fileRef.current?.click()}
              />
              <textarea
                ref={inputRef}
                className={s.input}
                rows={1}
                value={text}
                placeholder={uploading ? "Sending file…" : "Message"}
                aria-label={`Message ${other}`}
                onChange={(e) => onType(e.target.value)}
                onKeyDown={onKey}
                onBlur={stopTyping}
              />
              <Button
                variant="primary"
                icon="arrowRight"
                disabled={!text.trim() && !replyTo}
                onClick={send}
                aria-label="Send"
                className={s.send}
              >
                Send
              </Button>
            </div>
          </footer>
        </>
      )}
    </section>
  );

  return (
    <Page title="Chat" width="full">
      <div className={s.chat} data-compact={compact || undefined}>
        {showList && list}
        {showThread && threadPane}
      </div>
      <ConfirmDialog
        open={deleteMsg !== null}
        onClose={() => setDeleteMsg(null)}
        onConfirm={() =>
          act(() => chat.deleteMessage(deleteMsg._id, activeRoomId)).finally(
            () => setDeleteMsg(null),
          )
        }
        title="Delete this message?"
        description="It’s removed for everyone in the conversation."
        confirmLabel="Delete"
      />
      <ConfirmDialog
        open={deleteRoom}
        onClose={() => setDeleteRoom(false)}
        onConfirm={() =>
          act(async () => {
            await chat.deleteConversation(activeRoomId);
            setActiveRoomId(null);
          }).finally(() => setDeleteRoom(false))
        }
        title={`Delete your conversation with ${other}?`}
        description="All messages in it are removed."
        confirmLabel="Delete"
      />
    </Page>
  );
}
