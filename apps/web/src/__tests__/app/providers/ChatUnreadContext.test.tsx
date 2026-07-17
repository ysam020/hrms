import { renderHook, waitFor, act } from "@testing-library/react";
import {
  ChatUnreadProvider,
  ChatUnreadContext,
} from "@web/app/providers/ChatUnreadContext";
import { UserContext } from "@web/app/providers/UserContext";
import { SocketContext } from "@web/app/providers/SocketContext";
import { useApiClient } from "@web/shared/hooks/useApiClient";
import { useContext } from "react";

vi.mock("@web/shared/hooks/useApiClient");
const mockUseApiClient = useApiClient as unknown as ReturnType<typeof vi.fn>;

function makeSocket() {
  const handlers: Record<string, (...args: any[]) => void> = {};
  return {
    handlers,
    on: (event: string, cb: any) => (handlers[event] = cb),
    off: vi.fn(),
  };
}

function wrapperFor(
  user: { id?: string } | null,
  socket: ReturnType<typeof makeSocket> | null,
  connected: boolean,
) {
  const socketRef = { current: socket };
  return ({ children }: { children: React.ReactNode }) => (
    <UserContext.Provider
      value={{ user, setUser: vi.fn(), handleLogout: vi.fn() } as any}
    >
      <SocketContext.Provider value={socket ? { socketRef, connected } : null}>
        <ChatUnreadProvider>{children}</ChatUnreadProvider>
      </SocketContext.Provider>
    </UserContext.Provider>
  );
}

function useChatUnread() {
  return useContext(ChatUnreadContext);
}

describe("ChatUnreadContext", () => {
  let mockGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.clearAllMocks();
    mockGet = vi.fn().mockResolvedValue({ data: { data: {} } });
    mockUseApiClient.mockReturnValue({ get: mockGet });
  });

  it("defaults to zero unread with no-op clearRoomUnread outside any provider", () => {
    const { result } = renderHook(() => useChatUnread());
    expect(result.current.totalUnread).toBe(0);
  });

  it("does not fetch unread counts when there is no user", async () => {
    renderHook(() => useChatUnread(), {
      wrapper: wrapperFor(null, makeSocket(), true),
    });
    await waitFor(() => expect(mockGet).not.toHaveBeenCalled());
  });

  it("does not fetch until the socket is connected", async () => {
    renderHook(() => useChatUnread(), {
      wrapper: wrapperFor({ id: "u1" }, makeSocket(), false),
    });
    await waitFor(() => expect(mockGet).not.toHaveBeenCalled());
  });

  it("fetches unread counts once connected and sums them into totalUnread", async () => {
    mockGet.mockResolvedValue({ data: { data: { room1: 2, room2: 3 } } });
    const { result } = renderHook(() => useChatUnread(), {
      wrapper: wrapperFor({ id: "u1" }, makeSocket(), true),
    });
    await waitFor(() => expect(result.current.totalUnread).toBe(5));
  });

  it("increments the room's unread count when a chat:message event arrives from someone else", async () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useChatUnread(), {
      wrapper: wrapperFor({ id: "u1" }, socket, true),
    });
    await waitFor(() => expect(socket.handlers["chat:message"]).toBeDefined());

    act(() =>
      socket.handlers["chat:message"]({ chatRoom: "room1", senderId: "u2" }),
    );

    await waitFor(() => expect(result.current.totalUnread).toBe(1));
  });

  it("does not count a message the current user sent themselves", async () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useChatUnread(), {
      wrapper: wrapperFor({ id: "u1" }, socket, true),
    });
    await waitFor(() => expect(socket.handlers["chat:message"]).toBeDefined());

    act(() =>
      socket.handlers["chat:message"]({ chatRoom: "room1", senderId: "u1" }),
    );

    expect(result.current.totalUnread).toBe(0);
  });

  it("resets a room's unread count to zero on a chat:read event from the current user", async () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useChatUnread(), {
      wrapper: wrapperFor({ id: "u1" }, socket, true),
    });
    await waitFor(() => expect(socket.handlers["chat:message"]).toBeDefined());
    act(() =>
      socket.handlers["chat:message"]({ chatRoom: "room1", senderId: "u2" }),
    );
    await waitFor(() => expect(result.current.totalUnread).toBe(1));

    act(() => socket.handlers["chat:read"]({ roomId: "room1", reader: "u1" }));

    await waitFor(() => expect(result.current.totalUnread).toBe(0));
  });

  it("ignores a chat:read event for a different reader", async () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useChatUnread(), {
      wrapper: wrapperFor({ id: "u1" }, socket, true),
    });
    await waitFor(() => expect(socket.handlers["chat:message"]).toBeDefined());
    act(() =>
      socket.handlers["chat:message"]({ chatRoom: "room1", senderId: "u2" }),
    );
    await waitFor(() => expect(result.current.totalUnread).toBe(1));

    act(() =>
      socket.handlers["chat:read"]({ roomId: "room1", reader: "someone-else" }),
    );

    expect(result.current.totalUnread).toBe(1);
  });

  it("clearRoomUnread manually zeroes out a room", async () => {
    const socket = makeSocket();
    const { result } = renderHook(() => useChatUnread(), {
      wrapper: wrapperFor({ id: "u1" }, socket, true),
    });
    await waitFor(() => expect(socket.handlers["chat:message"]).toBeDefined());
    act(() =>
      socket.handlers["chat:message"]({ chatRoom: "room1", senderId: "u2" }),
    );
    await waitFor(() => expect(result.current.totalUnread).toBe(1));

    act(() => result.current.clearRoomUnread("room1"));

    expect(result.current.totalUnread).toBe(0);
  });

  it("cleans up socket listeners on unmount", async () => {
    const socket = makeSocket();
    const { unmount } = renderHook(() => useChatUnread(), {
      wrapper: wrapperFor({ id: "u1" }, socket, true),
    });
    await waitFor(() => expect(socket.handlers["chat:message"]).toBeDefined());

    unmount();

    expect(socket.off).toHaveBeenCalledWith(
      "chat:message",
      expect.any(Function),
    );
    expect(socket.off).toHaveBeenCalledWith("chat:read", expect.any(Function));
  });
});
