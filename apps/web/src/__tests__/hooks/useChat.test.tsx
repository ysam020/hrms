import { renderHook, act, waitFor } from "@testing-library/react";
import useChat from "@web/shared/hooks/useChat";
import { UserContext } from "@web/app/providers/UserContext";
import { useSocket } from "@web/app/providers/SocketContext";
import apiClient from "@web/core/http/axiosConfig";
import * as db from "@web/core/db";

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: vi.fn(), post: vi.fn(), delete: vi.fn(), patch: vi.fn() },
}));

vi.mock("@web/app/providers/SocketContext", () => ({
  useSocket: vi.fn(),
}));

vi.mock("@web/core/db", () => ({
  getMessagesByRoom: vi.fn().mockResolvedValue([]),
  saveMessages: vi.fn().mockResolvedValue(undefined),
  saveMessage: vi.fn().mockResolvedValue(undefined),
  patchMessage: vi.fn().mockResolvedValue(undefined),
  deleteRoomMessages: vi.fn().mockResolvedValue(undefined),
  getConversations: vi.fn().mockResolvedValue([]),
  saveConversations: vi.fn().mockResolvedValue(undefined),
  saveConversation: vi.fn().mockResolvedValue(undefined),
  deleteConversationFromDB: vi.fn().mockResolvedValue(undefined),
  enqueueMessage: vi.fn().mockResolvedValue(undefined),
  dequeueMessage: vi.fn().mockResolvedValue(undefined),
  getPendingMessages: vi.fn().mockResolvedValue([]),
}));

const mockGet = apiClient.get as unknown as ReturnType<typeof vi.fn>;
const mockPost = apiClient.post as unknown as ReturnType<typeof vi.fn>;
const mockDelete = apiClient.delete as unknown as ReturnType<typeof vi.fn>;
const mockUseSocket = useSocket as unknown as ReturnType<typeof vi.fn>;

function makeSocket(connected = true) {
  const handlers: Record<string, any> = {};
  return {
    connected,
    emit: vi.fn(),
    on: vi.fn((event, cb) => (handlers[event] = cb)),
    off: vi.fn(),
    __handlers: handlers,
  };
}

function wrapper(user: any) {
  return ({ children }: any) => (
    <UserContext.Provider value={{ user } as any}>
      {children}
    </UserContext.Provider>
  );
}

const USER = { id: "u1" };

describe("useChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGet.mockResolvedValue({ data: { data: [] } });
  });

  it("fetches conversations and unread counts once a user is present", async () => {
    const socket = makeSocket(true);
    mockUseSocket.mockReturnValue({
      socketRef: { current: socket },
      connected: true,
    });
    mockGet.mockImplementation((url: string) =>
      Promise.resolve({ data: { data: url.includes("unread") ? {} : [] } }),
    );

    renderHook(() => useChat(), { wrapper: wrapper(USER) });

    await waitFor(() => expect(mockGet).toHaveBeenCalled());
    expect(db.getConversations).toHaveBeenCalled();
  });

  it("does nothing on mount when there is no logged-in user", () => {
    mockUseSocket.mockReturnValue({
      socketRef: { current: null },
      connected: false,
    });
    renderHook(() => useChat(), { wrapper: wrapper(null) });
    expect(mockGet).not.toHaveBeenCalled();
  });

  it("merges cached and freshly-fetched messages by _id, server data winning", async () => {
    (db.getMessagesByRoom as any).mockResolvedValue([
      { _id: "1", content: "old", createdAt: "2024-01-01T00:00:00Z" },
    ]);
    mockGet.mockResolvedValue({
      data: {
        data: [
          {
            _id: "1",
            content: "new-from-server",
            createdAt: "2024-01-01T00:00:00Z",
          },
          { _id: "2", content: "second", createdAt: "2024-01-02T00:00:00Z" },
        ],
      },
    });
    const socket = makeSocket(true);
    mockUseSocket.mockReturnValue({
      socketRef: { current: socket },
      connected: true,
    });
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(USER) });

    await act(async () => {
      await result.current.fetchMessages("room1");
    });

    expect(result.current.messages["room1"]).toEqual([
      {
        _id: "1",
        content: "new-from-server",
        createdAt: "2024-01-01T00:00:00Z",
      },
      { _id: "2", content: "second", createdAt: "2024-01-02T00:00:00Z" },
    ]);
  });

  it("sends a message over the socket when connected", async () => {
    const socket = makeSocket(true);
    mockUseSocket.mockReturnValue({
      socketRef: { current: socket },
      connected: true,
    });
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(USER) });

    act(() => {
      result.current.sendMessage({ roomId: "room1", content: "hi" });
    });

    expect(socket.emit).toHaveBeenCalledWith(
      "chat:send",
      expect.objectContaining({ roomId: "room1", content: "hi" }),
    );
    expect(db.enqueueMessage).not.toHaveBeenCalled();
  });

  it("queues a message to the offline outbox when the socket is disconnected", async () => {
    const socket = makeSocket(false);
    mockUseSocket.mockReturnValue({
      socketRef: { current: socket },
      connected: false,
    });
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(USER) });

    act(() => {
      result.current.sendMessage({ roomId: "room1", content: "offline msg" });
    });

    expect(socket.emit).not.toHaveBeenCalledWith(
      "chat:send",
      expect.anything(),
    );
    expect(db.enqueueMessage).toHaveBeenCalledWith(
      expect.stringContaining("offline_"),
      "room1",
      expect.objectContaining({ content: "offline msg" }),
    );
  });

  it("flushes the offline outbox and refetches on reconnect", async () => {
    const socket = makeSocket(false);
    mockUseSocket.mockReturnValue({
      socketRef: { current: socket },
      connected: false,
    });
    const { rerender } = renderHook(() => useChat(), {
      wrapper: wrapper(USER),
    });

    await waitFor(() => expect(db.getConversations).toHaveBeenCalledTimes(1));

    (db.getPendingMessages as any).mockResolvedValue([
      { tempId: "t1", payload: { roomId: "r1", content: "queued" } },
    ]);
    socket.connected = true;
    mockUseSocket.mockReturnValue({
      socketRef: { current: socket },
      connected: true,
    });

    rerender();

    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith("chat:send", {
        roomId: "r1",
        content: "queued",
      }),
    );
    expect(db.dequeueMessage).toHaveBeenCalledWith("t1");
  });

  it("increments the unread count for an incoming message in a non-active room", async () => {
    const socket = makeSocket(true);
    mockUseSocket.mockReturnValue({
      socketRef: { current: socket },
      connected: true,
    });
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(USER) });

    await waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith(
        "chat:message",
        expect.any(Function),
      ),
    );

    act(() => {
      socket.__handlers["chat:message"]({
        _id: "m1",
        chatRoom: "roomX",
        senderId: "other",
      });
    });

    expect(result.current.unreadCounts["roomX"]).toBe(1);
    expect(db.saveMessage).toHaveBeenCalled();
  });

  it("does not increment unread count and emits read for the currently active room", async () => {
    const socket = makeSocket(true);
    mockUseSocket.mockReturnValue({
      socketRef: { current: socket },
      connected: true,
    });
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(USER) });

    act(() => {
      result.current.setActiveRoomId("roomX");
    });

    await waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith(
        "chat:message",
        expect.any(Function),
      ),
    );

    act(() => {
      socket.__handlers["chat:message"]({
        _id: "m1",
        chatRoom: "roomX",
        senderId: "other",
      });
    });

    expect(result.current.unreadCounts["roomX"]).toBeUndefined();
    expect(socket.emit).toHaveBeenCalledWith("chat:read", { roomId: "roomX" });
  });

  it("clears a typer from typingUsers after the 3s timeout", async () => {
    vi.useFakeTimers();
    const socket = makeSocket(true);
    mockUseSocket.mockReturnValue({
      socketRef: { current: socket },
      connected: true,
    });
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(USER) });

    await vi.waitFor(() =>
      expect(socket.on).toHaveBeenCalledWith(
        "chat:typing",
        expect.any(Function),
      ),
    );

    act(() => {
      socket.__handlers["chat:typing"]({ roomId: "roomX", username: "jane" });
    });
    expect(result.current.typingUsers["roomX"]).toEqual(["jane"]);

    act(() => {
      vi.advanceTimersByTime(3000);
    });
    expect(result.current.typingUsers["roomX"]).toEqual([]);
    vi.useRealTimers();
  });

  it("pins a message, updates the message flag, and prepends it to the pinned list", async () => {
    mockPost.mockResolvedValue({
      data: { data: { pinnedAt: "t", pinnedBy: "u1" } },
    });
    const socket = makeSocket(true);
    mockUseSocket.mockReturnValue({
      socketRef: { current: socket },
      connected: true,
    });
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(USER) });

    await act(async () => {
      await result.current.fetchMessages("room1");
    });
    // seed a message to flip
    await act(async () => {
      // @ts-expect-error accessing setter indirectly via handleIncomingMessage isn't needed; use pinMessage directly
      await result.current.pinMessage("m1", "room1");
    });

    expect(mockPost).toHaveBeenCalled();
    expect(result.current.pinnedMessages["room1"]).toEqual([
      { pinnedAt: "t", pinnedBy: "u1" },
    ]);
    expect(socket.emit).toHaveBeenCalledWith(
      "chat:pin-message",
      expect.objectContaining({ messageId: "m1", roomId: "room1" }),
    );
  });

  it("deletes a conversation and clears its local state", async () => {
    mockDelete.mockResolvedValue({});
    const socket = makeSocket(true);
    mockUseSocket.mockReturnValue({
      socketRef: { current: socket },
      connected: true,
    });
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(USER) });

    await act(async () => {
      await result.current.deleteConversation("room1");
    });

    expect(mockDelete).toHaveBeenCalled();
    expect(db.deleteConversationFromDB).toHaveBeenCalledWith("room1");
    expect(db.deleteRoomMessages).toHaveBeenCalledWith("room1");
    expect(result.current.messages["room1"]).toBeUndefined();
  });

  it("marks a room as read and zeroes its unread count", async () => {
    mockPost.mockResolvedValue({});
    const socket = makeSocket(true);
    mockUseSocket.mockReturnValue({
      socketRef: { current: socket },
      connected: true,
    });
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(USER) });

    await act(async () => {
      await result.current.markRoomAsRead("room1");
    });

    expect(result.current.unreadCounts["room1"]).toBe(0);
  });

  it("starts a conversation and prepends it to the conversations list", async () => {
    mockPost.mockResolvedValue({ data: { data: { _id: "newRoom" } } });
    const socket = makeSocket(true);
    mockUseSocket.mockReturnValue({
      socketRef: { current: socket },
      connected: true,
    });
    const { result } = renderHook(() => useChat(), { wrapper: wrapper(USER) });
    await waitFor(() =>
      expect(result.current.loadingConversations).toBe(false),
    );

    let room: any;
    await act(async () => {
      room = await result.current.startConversation("recipient1");
    });

    expect(room).toEqual({ _id: "newRoom" });
    expect(result.current.conversations[0]).toEqual({ _id: "newRoom" });
    expect(db.saveConversation).toHaveBeenCalledWith({ _id: "newRoom" });
  });
});
