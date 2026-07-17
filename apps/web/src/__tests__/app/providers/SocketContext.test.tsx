import { renderHook, waitFor, act } from "@testing-library/react";
import {
  SocketProvider,
  useSocket,
  SocketContext,
} from "@web/app/providers/SocketContext";
import { UserContext } from "@web/app/providers/UserContext";
import { getAccessToken } from "@web/core/http/axiosConfig";

const mockSocket = {
  handlers: {} as Record<string, (...args: any[]) => void>,
  on(event: string, cb: (...args: any[]) => void) {
    this.handlers[event] = cb;
  },
  disconnect: vi.fn(),
  connect: vi.fn(),
  emit: vi.fn(),
};
const mockIo = vi.fn(() => mockSocket);

vi.mock("socket.io-client", () => ({
  io: (...args: any[]) => mockIo(...args),
}));

vi.mock("@web/core/http/axiosConfig", () => ({
  getAccessToken: vi.fn(),
}));

const mockGetAccessToken = getAccessToken as unknown as ReturnType<
  typeof vi.fn
>;

function wrapperFor(user: { id?: string } | null) {
  return ({ children }: { children: React.ReactNode }) => (
    <UserContext.Provider
      value={{ user, setUser: vi.fn(), handleLogout: vi.fn() } as any}
    >
      <SocketProvider>{children}</SocketProvider>
    </UserContext.Provider>
  );
}

describe("SocketContext", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSocket.handlers = {};
    mockGetAccessToken.mockReturnValue("access-tok");
  });

  it("throws when useSocket is called outside the provider", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => renderHook(() => useSocket())).toThrow(
      "useSocket must be used inside SocketProvider",
    );
    spy.mockRestore();
  });

  it("does not connect when there is no user", async () => {
    renderHook(() => useSocket(), { wrapper: wrapperFor(null) });
    await waitFor(() => expect(mockIo).not.toHaveBeenCalled());
  });

  it("does not connect when there is no access token yet", async () => {
    mockGetAccessToken.mockReturnValue(null);
    renderHook(() => useSocket(), { wrapper: wrapperFor({ id: "u1" }) });
    await waitFor(() => expect(mockIo).not.toHaveBeenCalled());
  });

  it("connects with the access token once a user is present", async () => {
    renderHook(() => useSocket(), { wrapper: wrapperFor({ id: "u1" }) });
    await waitFor(() => expect(mockIo).toHaveBeenCalled());
    expect(mockIo).toHaveBeenCalledWith(
      undefined, // VITE_SERVER_URL unset in test env
      expect.objectContaining({ auth: { token: "access-tok" } }),
    );
  });

  it("flips connected to true when the socket's 'connect' event fires", async () => {
    const { result } = renderHook(() => useSocket(), {
      wrapper: wrapperFor({ id: "u1" }),
    });
    await waitFor(() => expect(mockIo).toHaveBeenCalled());

    act(() => mockSocket.handlers.connect());

    await waitFor(() => expect(result.current.connected).toBe(true));
  });

  it("flips connected to false when the socket disconnects", async () => {
    const { result } = renderHook(() => useSocket(), {
      wrapper: wrapperFor({ id: "u1" }),
    });
    await waitFor(() => expect(mockIo).toHaveBeenCalled());
    act(() => mockSocket.handlers.connect());
    await waitFor(() => expect(result.current.connected).toBe(true));

    act(() => mockSocket.handlers.disconnect("transport close"));

    await waitFor(() => expect(result.current.connected).toBe(false));
  });

  it("schedules a reconnect after an unexpected disconnect (not a client-initiated one)", async () => {
    vi.useFakeTimers();
    renderHook(() => useSocket(), { wrapper: wrapperFor({ id: "u1" }) });
    await vi.waitFor(() => expect(mockIo).toHaveBeenCalled());

    act(() => mockSocket.handlers.disconnect("transport close"));
    act(() => vi.advanceTimersByTime(3000));

    expect(mockSocket.connect).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("does not schedule a reconnect for a client-initiated disconnect", async () => {
    vi.useFakeTimers();
    renderHook(() => useSocket(), { wrapper: wrapperFor({ id: "u1" }) });
    await vi.waitFor(() => expect(mockIo).toHaveBeenCalled());

    act(() => mockSocket.handlers.disconnect("io client disconnect"));
    act(() => vi.advanceTimersByTime(5000));

    expect(mockSocket.connect).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("disconnects the socket on unmount", async () => {
    const { unmount } = renderHook(() => useSocket(), {
      wrapper: wrapperFor({ id: "u1" }),
    });
    await waitFor(() => expect(mockIo).toHaveBeenCalled());

    unmount();

    expect(mockSocket.disconnect).toHaveBeenCalled();
  });

  it("exposes a socketRef pointing at the connected socket instance", async () => {
    const { result } = renderHook(() => useSocket(), {
      wrapper: wrapperFor({ id: "u1" }),
    });
    await waitFor(() =>
      expect(result.current.socketRef.current).toBe(mockSocket),
    );
  });
});
