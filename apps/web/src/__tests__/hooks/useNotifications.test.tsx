import { renderHook, waitFor, act } from "@testing-library/react";
import useNotifications from "@web/shared/hooks/useNotifications";
import { UserContext } from "@web/app/providers/UserContext";

// ── Core mocks ────────────────────────────────────────────────────────────────

const mockApiClient = vi.fn();

vi.mock("@web/core/http/axiosConfig", () => ({
  default: (...args: any[]) => mockApiClient(...args),
}));

const mockGetNotifications = vi.fn().mockResolvedValue([]);
const mockSaveNotifications = vi.fn().mockResolvedValue(undefined);
const mockSaveNotification = vi.fn().mockResolvedValue(undefined);
const mockPruneNotifications = vi.fn().mockResolvedValue(undefined);

vi.mock("@web/core/db", () => ({
  getNotifications: (...a: any[]) => mockGetNotifications(...a),
  saveNotifications: (...a: any[]) => mockSaveNotifications(...a),
  saveNotification: (...a: any[]) => mockSaveNotification(...a),
  pruneNotifications: (...a: any[]) => mockPruneNotifications(...a),
}));

// Mutable socket ref so tests can control the socket
const socketRef = { current: null as any };

vi.mock("@web/app/providers/SocketContext", () => ({
  useSocket: () => ({ socketRef }),
}));

// ── Wrapper helpers ───────────────────────────────────────────────────────────

const makeWrapper =
  (user: any) =>
  ({ children }: any) => (
    <UserContext.Provider value={{ user, setUser: vi.fn() } as any}>
      {children}
    </UserContext.Provider>
  );

const noUserWrapper = makeWrapper(null);
const authedWrapper = makeWrapper({ username: "alice" });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("useNotifications – initial state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockApiClient.mockResolvedValue({ data: { data: [] } });
  });

  it("starts with loading=true when a user is present", async () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: authedWrapper,
    });
    // loading starts true before the async fetch completes
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
  });

  it("starts with an empty notifications array", () => {
    mockApiClient.mockReturnValue(new Promise(() => {})); // never resolves
    const { result } = renderHook(() => useNotifications(), {
      wrapper: authedWrapper,
    });
    expect(result.current.notifications).toEqual([]);
  });

  it("does not fetch when user is null", () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: noUserWrapper,
    });
    expect(mockApiClient).not.toHaveBeenCalled();
    expect(result.current.loading).toBe(true); // stays in initial state
  });
});

describe("useNotifications – API fetch", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    socketRef.current = null;
  });

  it("populates notifications from the API response", async () => {
    const freshNotifs = [
      { _id: "n1", message: "Hello", title: "T1", timeStamp: "2024-01-01" },
    ];
    mockGetNotifications.mockResolvedValue([]);
    mockApiClient.mockResolvedValue({ data: { data: freshNotifs } });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: authedWrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]._id).toBe("n1");
  });

  it("shows cached notifications immediately before the API resolves", async () => {
    const cached = [
      { _id: "c1", message: "Cached", title: "C", timeStamp: "x" },
    ];
    mockGetNotifications.mockResolvedValue(cached);

    let resolveApi: (v: any) => void;
    mockApiClient.mockReturnValue(
      new Promise((r) => {
        resolveApi = r;
      }),
    );

    const { result } = renderHook(() => useNotifications(), {
      wrapper: authedWrapper,
    });

    await waitFor(() => expect(result.current.notifications).toHaveLength(1));
    expect(result.current.notifications[0]._id).toBe("c1");

    // Resolve the API and let the microtask queue flush inside act
    await act(async () => {
      resolveApi!({ data: { data: [] } });
    });
  });

  it("normalises notification fields (id→_id, body→message, createdAt→timeStamp)", async () => {
    const raw = [{ id: "x1", body: "Msg", createdAt: "2024-01-01" }];
    mockGetNotifications.mockResolvedValue([]);
    mockApiClient.mockResolvedValue({ data: { data: raw } });

    const { result } = renderHook(() => useNotifications(), {
      wrapper: authedWrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));
    const n = result.current.notifications[0];
    expect(n._id).toBe("x1");
    expect(n.message).toBe("Msg");
    expect(n.timeStamp).toBe("2024-01-01");
  });

  it("persists fresh notifications to IndexedDB", async () => {
    mockGetNotifications.mockResolvedValue([]);
    mockApiClient.mockResolvedValue({ data: { data: [] } });

    renderHook(() => useNotifications(), { wrapper: authedWrapper });

    await waitFor(() => expect(mockSaveNotifications).toHaveBeenCalled());
  });

  it("ignores CanceledError from aborted requests", async () => {
    const err = Object.assign(new Error("canceled"), { name: "CanceledError" });
    mockGetNotifications.mockResolvedValue([]);
    mockApiClient.mockRejectedValue(err);

    const { result } = renderHook(() => useNotifications(), {
      wrapper: authedWrapper,
    });

    // loading stays true because the hook returns early on CanceledError
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current.notifications).toEqual([]);
  });
});

describe("useNotifications – socket events", () => {
  const makeSocket = () => {
    const listeners: Record<string, Function[]> = {};
    return {
      on: (event: string, cb: Function) => {
        listeners[event] = [...(listeners[event] ?? []), cb];
      },
      off: (event: string, cb: Function) => {
        listeners[event] = (listeners[event] ?? []).filter((f) => f !== cb);
      },
      emit: (event: string, data: any) => {
        (listeners[event] ?? []).forEach((cb) => cb(data));
      },
      _listeners: listeners,
    };
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNotifications.mockResolvedValue([]);
    mockApiClient.mockResolvedValue({ data: { data: [] } });
  });

  it("adds a new notification when socket emits 'notification'", async () => {
    const socket = makeSocket();
    socketRef.current = socket;

    const { result } = renderHook(() => useNotifications(), {
      wrapper: authedWrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      socket.emit("notification", {
        _id: "sn1",
        title: "Socket Notif",
        message: "Hello",
        timeStamp: "2024-01-01",
      });
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]._id).toBe("sn1");
  });

  it("deduplicates notifications with the same _id", async () => {
    const socket = makeSocket();
    socketRef.current = socket;

    const { result } = renderHook(() => useNotifications(), {
      wrapper: authedWrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    const notif = {
      _id: "dup1",
      title: "T",
      message: "M",
      timeStamp: "2024-01-01",
    };

    act(() => {
      socket.emit("notification", notif);
      socket.emit("notification", notif); // duplicate
    });

    expect(
      result.current.notifications.filter((n) => n._id === "dup1"),
    ).toHaveLength(1);
  });

  it("removes socket listeners on unmount", async () => {
    const socket = makeSocket();
    socketRef.current = socket;

    const { result, unmount } = renderHook(() => useNotifications(), {
      wrapper: authedWrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    unmount();

    // Emitting after unmount should not update state
    act(() => {
      socket.emit("notification", {
        _id: "after-unmount",
        title: "T",
        message: "M",
        timeStamp: "now",
      });
    });

    // No listeners → should not change anything
    expect(socket._listeners["notification"]?.length ?? 0).toBe(0);
  });
});

describe("useNotifications – setNotifications / setLoading exposed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetNotifications.mockResolvedValue([]);
    mockApiClient.mockResolvedValue({ data: { data: [] } });
  });

  it("exposes setNotifications to manually update the list", async () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: authedWrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setNotifications([
        { _id: "manual1", title: "T", message: "M", timeStamp: "x" },
      ]);
    });

    expect(result.current.notifications).toHaveLength(1);
    expect(result.current.notifications[0]._id).toBe("manual1");
  });

  it("exposes setLoading to manually toggle the loading state", async () => {
    const { result } = renderHook(() => useNotifications(), {
      wrapper: authedWrapper,
    });

    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      result.current.setLoading(true);
    });
    expect(result.current.loading).toBe(true);
  });
});
