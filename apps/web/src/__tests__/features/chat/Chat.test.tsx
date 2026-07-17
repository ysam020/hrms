import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import Chat from "@web/features/chat/Chat";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { ChatUnreadContext } from "@web/app/providers/ChatUnreadContext";
import useChat from "@web/shared/hooks/useChat";
import { useApiClient } from "@web/shared/hooks/useApiClient";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/shared/hooks/useChat");
const mockUseChat = useChat as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/hooks/useApiClient");
const mockUseApiClient = useApiClient as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/core/http/axiosConfig", () => ({ default: { post: vi.fn() } }));
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/features/chat/ConversationsPanel", () => ({
  ConversationsPanel: (props: any) => (
    <div>
      <input
        aria-label="user-search"
        value={props.userSearch}
        onChange={(e) => props.setUserSearch(e.target.value)}
      />
      <button onClick={() => props.onStartConversation({ id: "u2" })}>
        start-conversation
      </button>
      <button onClick={() => props.onOpenRoom({ _id: "room1" })}>
        open-room
      </button>
    </div>
  ),
}));

vi.mock("@web/features/chat/ThreadHeader", () => ({
  ThreadHeader: (props: any) => (
    <div>
      <span>other:{props.otherUser}</span>
      <button onClick={props.onBack}>back</button>
      <button onClick={props.onDeleteChatClick}>delete-chat-click</button>
    </div>
  ),
}));

vi.mock("@web/features/chat/PinnedMessagesBar", () => ({
  PinnedMessagesBar: (props: any) => (
    <div>
      <span>pinned:{props.activePinnedMessages.length}</span>
      <button onClick={() => props.onUnpinMessage({ _id: "pm1" })}>
        unpin-from-bar
      </button>
    </div>
  ),
}));

vi.mock("@web/features/chat/MessagesArea", () => ({
  MessagesArea: (props: any) => (
    <div>
      <span>messages:{props.activeMessages.length}</span>
      <button onClick={() => props.onScroll({ target: { scrollTop: 0 } })}>
        scroll-top
      </button>
      <button onClick={() => props.onReply({ _id: "m1" }, "Jane")}>
        reply
      </button>
      <button onClick={() => props.onDelete({ _id: "m1" })}>mark-delete</button>
      <button onClick={() => props.onPin({ _id: "m1" })}>pin</button>
      <button onClick={() => props.onUnpin({ _id: "m1" })}>unpin</button>
      <button onClick={() => props.onImageClick("https://x/img.png")}>
        image-click
      </button>
    </div>
  ),
}));

vi.mock("@web/features/chat/ReplyBar", () => ({
  ReplyBar: (props: any) => (
    <div>
      <span>replying-to:{props.replyTo.senderName}</span>
      <button onClick={props.onCancel}>cancel-reply</button>
    </div>
  ),
}));

vi.mock("@web/features/chat/MessageInputArea", () => ({
  MessageInputArea: (props: any) => (
    <div>
      <input
        aria-label="message-text"
        value={props.text}
        onChange={props.onTextChange}
        onKeyDown={props.onKeyDown}
      />
      <input
        aria-label="file-input"
        type="file"
        onChange={props.onFileSelect}
        ref={props.fileInputRef}
      />
      <button onClick={props.onSend}>send</button>
      <button onClick={() => props.onEmojiClick({ emoji: "😀" })}>
        pick-emoji
      </button>
    </div>
  ),
}));

describe("Chat", () => {
  let chatApi: any;
  const setAlert = vi.fn();
  const clearRoomUnread = vi.fn();

  function makeChatApi(overrides: Partial<any> = {}) {
    return {
      conversations: [],
      messages: {},
      activeRoomId: null,
      setActiveRoomId: vi.fn(),
      typingUsers: {},
      unreadCounts: {},
      pinnedMessages: {},
      loadingConversations: false,
      loadingMessages: false,
      fetchMessages: vi.fn().mockResolvedValue([]),
      fetchPinnedMessages: vi.fn(),
      dbLoadedRoomsRef: { current: new Set() },
      startConversation: vi.fn().mockResolvedValue({ _id: "room1" }),
      markRoomAsRead: vi.fn(),
      deleteMessage: vi.fn().mockResolvedValue(undefined),
      deleteConversation: vi.fn().mockResolvedValue(undefined),
      pinMessage: vi.fn().mockResolvedValue(undefined),
      unpinMessage: vi.fn().mockResolvedValue(undefined),
      joinRoom: vi.fn(),
      sendMessage: vi.fn(),
      emitTyping: vi.fn(),
      emitStopTyping: vi.fn(),
      emitRead: vi.fn(),
      ...overrides,
    };
  }

  function renderChat(chatOverrides: Partial<any> = {}) {
    chatApi = makeChatApi(chatOverrides);
    mockUseChat.mockReturnValue(chatApi);
    return render(
      <UserContext.Provider value={{ user: { id: "me" } } as any}>
        <ThemeContext.Provider value={{ theme: "light" } as any}>
          <AlertContext.Provider value={{ setAlert } as any}>
            <ChatUnreadContext.Provider
              value={{ totalUnread: 0, clearRoomUnread }}
            >
              <Chat />
            </ChatUnreadContext.Provider>
          </AlertContext.Provider>
        </ThemeContext.Provider>
      </UserContext.Provider>,
    );
  }

  beforeEach(() => {
    vi.useRealTimers();
    setAlert.mockReset();
    clearRoomUnread.mockReset();
    mockPost.mockReset();
    mockUseApiClient.mockReturnValue({
      get: vi.fn().mockResolvedValue({ data: { data: [] } }),
    });
  });

  it("shows the empty-selection state when no room is active", () => {
    renderChat();
    expect(screen.getByText("Select a conversation")).toBeInTheDocument();
  });

  it("opens a room: sets active room, joins it, fetches messages once, marks read", async () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
    });
    fireEvent.click(screen.getByText("open-room"));

    expect(chatApi.setActiveRoomId).toHaveBeenCalledWith("room1");
    expect(chatApi.joinRoom).toHaveBeenCalledWith("room1");
    await waitFor(() =>
      expect(chatApi.fetchMessages).toHaveBeenCalledWith("room1"),
    );
    expect(chatApi.fetchPinnedMessages).toHaveBeenCalledWith("room1");
    expect(chatApi.markRoomAsRead).toHaveBeenCalledWith("room1");
    expect(chatApi.emitRead).toHaveBeenCalledWith("room1");
    expect(clearRoomUnread).toHaveBeenCalledWith("room1");
  });

  it("skips re-fetching messages for a room already loaded from the local DB", async () => {
    const dbLoadedRoomsRef = { current: new Set(["room1"]) };
    renderChat({ dbLoadedRoomsRef });
    fireEvent.click(screen.getByText("open-room"));
    await waitFor(() => expect(chatApi.joinRoom).toHaveBeenCalled());
    expect(chatApi.fetchMessages).not.toHaveBeenCalled();
  });

  it("starts a new conversation and opens the resulting room", async () => {
    renderChat();
    fireEvent.click(screen.getByText("start-conversation"));
    await waitFor(() =>
      expect(chatApi.startConversation).toHaveBeenCalledWith("u2"),
    );
    await waitFor(() => expect(chatApi.joinRoom).toHaveBeenCalledWith("room1"));
  });

  it("does not render the thread panel content when no room is active, even with conversations present", () => {
    renderChat({ conversations: [{ _id: "room1" }] });
    expect(screen.queryByText(/other:/)).not.toBeInTheDocument();
  });

  it("shows the thread header with the resolved other participant once a room is active", () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [
        {
          _id: "room1",
          participants: ["me", "u2"],
          participantDetails: [
            { id: "u2", first_name: "Jane", last_name: "Doe" },
          ],
        },
      ],
    });
    expect(screen.getByText("other:Jane Doe")).toBeInTheDocument();
  });

  it("going back clears the active room and hides the thread on mobile", () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
    });
    fireEvent.click(screen.getByText("back"));
    expect(chatApi.setActiveRoomId).toHaveBeenCalledWith(null);
  });

  it("sends a text message and clears the input/typing state", () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
    });
    fireEvent.change(screen.getByLabelText("message-text"), {
      target: { value: "Hello" },
    });
    fireEvent.click(screen.getByText("send"));

    expect(chatApi.sendMessage).toHaveBeenCalledWith({
      roomId: "room1",
      content: "Hello",
      type: "text",
      replyTo: null,
    });
    expect(chatApi.emitStopTyping).toHaveBeenCalledWith("room1");
  });

  it("does not send an empty message with no active reply", () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
    });
    fireEvent.click(screen.getByText("send"));
    expect(chatApi.sendMessage).not.toHaveBeenCalled();
  });

  it("sends on Enter but not on Shift+Enter", () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
    });
    const input = screen.getByLabelText("message-text");
    fireEvent.change(input, { target: { value: "Hi" } });

    fireEvent.keyDown(input, { key: "Enter", shiftKey: true });
    expect(chatApi.sendMessage).not.toHaveBeenCalled();

    fireEvent.keyDown(input, { key: "Enter", shiftKey: false });
    expect(chatApi.sendMessage).toHaveBeenCalled();
  });

  it("emits typing on the first keystroke", () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
    });
    fireEvent.change(screen.getByLabelText("message-text"), {
      target: { value: "H" },
    });
    expect(chatApi.emitTyping).toHaveBeenCalledWith("room1");
  });

  it("appends the selected emoji to the message text", () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
    });
    fireEvent.change(screen.getByLabelText("message-text"), {
      target: { value: "Hi " },
    });
    fireEvent.click(screen.getByText("pick-emoji"));
    expect(screen.getByLabelText("message-text")).toHaveValue("Hi 😀");
  });

  it("uploads a selected file and sends it with the derived message type", async () => {
    mockPost.mockResolvedValue({
      data: {
        data: {
          fileUrl: "https://x/img.png",
          fileName: "img.png",
          fileMimeType: "image/png",
          fileSize: 100,
        },
      },
    });
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
    });
    const file = new File(["x"], "img.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("file-input"), {
      target: { files: [file] },
    });

    await waitFor(() =>
      expect(chatApi.sendMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          roomId: "room1",
          type: "image",
          fileName: "img.png",
        }),
      ),
    );
  });

  it("shows a reply bar after replying and cancels it back out", () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
    });
    fireEvent.click(screen.getByText("reply"));
    expect(screen.getByText("replying-to:Jane")).toBeInTheDocument();

    fireEvent.click(screen.getByText("cancel-reply"));
    expect(screen.queryByText("replying-to:Jane")).not.toBeInTheDocument();
  });

  it("opens the delete-message confirmation and confirms it", async () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
    });
    fireEvent.click(screen.getByText("mark-delete"));
    expect(screen.getByText("Delete Message")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() =>
      expect(chatApi.deleteMessage).toHaveBeenCalledWith("m1", "room1"),
    );
  });

  it("opens the delete-conversation confirmation from the header and confirms it", async () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
    });
    fireEvent.click(screen.getByText("delete-chat-click"));
    expect(screen.getByText("Delete Chat")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Delete"));
    await waitFor(() =>
      expect(chatApi.deleteConversation).toHaveBeenCalledWith("room1"),
    );
    expect(chatApi.setActiveRoomId).toHaveBeenCalledWith(null);
  });

  it("pins a message", async () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
    });
    fireEvent.click(screen.getByText("pin"));
    await waitFor(() =>
      expect(chatApi.pinMessage).toHaveBeenCalledWith("m1", "room1"),
    );
  });

  it("shows an error alert with the server message when pinning fails", async () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
      pinMessage: vi.fn().mockRejectedValue({
        response: { data: { message: "Pin limit reached" } },
      }),
    });
    fireEvent.click(screen.getByText("pin"));
    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Pin limit reached",
        }),
      ),
    );
  });

  it("unpins a message from within the thread and from the pinned bar", async () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
      pinnedMessages: { room1: [{ _id: "pm1" }] },
    });
    fireEvent.click(screen.getByText("unpin"));
    await waitFor(() =>
      expect(chatApi.unpinMessage).toHaveBeenCalledWith("m1", "room1"),
    );

    fireEvent.click(screen.getByText("unpin-from-bar"));
    await waitFor(() =>
      expect(chatApi.unpinMessage).toHaveBeenCalledWith("pm1", "room1"),
    );
  });

  it("hides the pinned bar when there are no pinned messages", () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
      pinnedMessages: {},
    });
    expect(screen.queryByText(/pinned:/)).not.toBeInTheDocument();
  });

  it("shows the pinned bar once there are pinned messages for the active room", () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
      pinnedMessages: { room1: [{ _id: "pm1" }] },
    });
    expect(screen.getByText("pinned:1")).toBeInTheDocument();
  });

  it("opens the image lightbox when a message image is clicked", () => {
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
    });
    fireEvent.click(screen.getByText("image-click"));
    expect(screen.getByAltText("Preview")).toHaveAttribute(
      "src",
      "https://x/img.png",
    );
  });

  it("triggers loading older messages on scroll-to-top once 50+ messages are loaded", () => {
    const messages = {
      room1: Array.from({ length: 50 }, (_, i) => ({
        _id: `m${i}`,
        createdAt: `2024-06-0${(i % 9) + 1}T00:00:00Z`,
      })),
    };
    renderChat({
      activeRoomId: "room1",
      conversations: [{ _id: "room1", participants: ["me", "u2"] }],
      messages,
    });
    fireEvent.click(screen.getByText("scroll-top"));
    expect(chatApi.fetchMessages).toHaveBeenCalledWith(
      "room1",
      messages.room1[0].createdAt,
    );
  });
});
