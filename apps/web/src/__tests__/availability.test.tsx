import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ReactNode } from "react";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import { SocketContext } from "@web/app/providers/SocketContext";
import {
  PresenceProvider,
  useWatchPresence,
} from "@next/features/presence/PresenceProvider";
import {
  PresenceAvatar,
  PresenceDot,
} from "@next/features/presence/PresenceIndicator";
import { MyStatusButton } from "@next/features/presence/StatusPicker";
import {
  presenceStore,
  type PresenceView,
} from "@next/features/presence/model";

// Employee availability on the web (docs/presence.md): the picker, optimistic
// saves with rollback, accessible indicators, live socket updates and the
// idle signal. The gateway is replaced by hand-answered axios calls and a
// fake socket.

const api = {
  get: vi.fn(),
  put: vi.fn(),
  post: vi.fn(),
  delete: vi.fn(),
};
vi.mock("@next/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@next/lib/api")>();
  return {
    ...actual,
    apiClient: {
      get: (...a: any[]) => api.get(...a),
      put: (...a: any[]) => api.put(...a),
      post: (...a: any[]) => api.post(...a),
      delete: (...a: any[]) => api.delete(...a),
    },
  };
});

const view = (over: Partial<PresenceView> = {}): PresenceView => ({
  userId: "me",
  availability: "available",
  status: "available",
  connectivity: "online",
  source: "default",
  message: null,
  expiresAt: null,
  workMode: null,
  lastSeenAt: null,
  revision: 1,
  at: 1000,
  ...over,
});
const own = (over: Partial<PresenceView> = {}) => ({
  ...view(over),
  previous: null,
  timeZone: null,
});
const ok = (data: unknown) => Promise.resolve({ data: { data } });

function fakeSocket() {
  const handlers: Record<string, (...a: any[]) => void> = {};
  return {
    connected: true,
    handlers,
    on: vi.fn((e: string, fn: any) => (handlers[e] = fn)),
    off: vi.fn((e: string) => delete handlers[e]),
    emit: vi.fn(),
  };
}

const setAlert = vi.fn();
function renderWith(ui: ReactNode, socket = fakeSocket()) {
  const utils = render(
    <UserContext.Provider value={{ user: { id: "me" } } as any}>
      <AlertContext.Provider value={{ setAlert } as any}>
        <SocketContext.Provider
          value={{ socketRef: { current: socket as any }, connected: true }}
        >
          <PresenceProvider>{ui}</PresenceProvider>
        </SocketContext.Provider>
      </AlertContext.Provider>
    </UserContext.Provider>,
  );
  return { ...utils, socket };
}

beforeEach(() => {
  vi.useRealTimers();
  Object.values(api).forEach((f) => f.mockReset());
  setAlert.mockReset();
  presenceStore.clear();
  api.get.mockImplementation(() =>
    ok({
      presence: own(),
      config: { idleAfterSeconds: 60, heartbeatSeconds: 25 },
    }),
  );
});

describe("status selector", () => {
  it("opens, picks a status with a message and saves it", async () => {
    api.put.mockImplementation((_url: string, body: any) =>
      ok({
        presence: own({
          availability: body.availability,
          status: body.availability,
          message: body.message,
          source: "manual",
          revision: 2,
        }),
      }),
    );
    renderWith(<MyStatusButton />);
    const button = await screen.findByRole("button", { name: /available/i });

    fireEvent.click(button);
    const dialog = await screen.findByRole("dialog", { name: "Set status" });
    const busy = screen.getByRole("radio", { name: "Busy" });
    expect(screen.getByRole("radio", { name: "Available" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    fireEvent.click(busy);
    expect(busy).toHaveAttribute("aria-checked", "true");
    fireEvent.change(screen.getByLabelText(/message/i), {
      target: { value: "Quarterly report" },
    });
    fireEvent.change(screen.getByLabelText(/clear after/i), {
      target: { value: "1h" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(dialog).not.toBeInTheDocument());
    expect(api.put).toHaveBeenCalledWith("/presence/me", {
      availability: "busy",
      message: "Quarterly report",
      duration: "1h",
      timeZone: expect.any(String),
    });
    expect(screen.getByRole("button", { name: /busy/i })).toHaveTextContent(
      "Quarterly report",
    );
  });

  it("arrow keys move through statuses (one tab stop)", async () => {
    renderWith(<MyStatusButton />);
    fireEvent.click(await screen.findByRole("button", { name: /available/i }));
    const available = await screen.findByRole("radio", { name: "Available" });
    expect(available).toHaveAttribute("tabindex", "0");
    expect(screen.getByRole("radio", { name: "Busy" })).toHaveAttribute(
      "tabindex",
      "-1",
    );
    fireEvent.keyDown(available, { key: "ArrowDown" });
    expect(screen.getByRole("radio", { name: "Busy" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("shows the change at once and rolls it back if saving fails", async () => {
    let fail!: (e: unknown) => void;
    api.put.mockImplementation(() => new Promise((_res, rej) => (fail = rej)));
    renderWith(<MyStatusButton />);
    fireEvent.click(await screen.findByRole("button", { name: /available/i }));
    fireEvent.click(
      await screen.findByRole("radio", { name: "Do Not Disturb" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    // Optimistic: the button already says Do Not Disturb.
    await waitFor(() =>
      expect(
        screen.getAllByRole("button", { name: /do not disturb/i }).length,
      ).toBeGreaterThan(0),
    );

    await act(async () => {
      fail({ response: { data: { message: "Network down" } } });
    });
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /^available/i }),
      ).toBeInTheDocument(),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error" }),
    );
  });

  it("is a bottom sheet on phones", async () => {
    const original = window.matchMedia;
    window.matchMedia = ((q: string) => ({
      ...original(q),
      matches: q.includes("max-width: 639px"),
    })) as typeof window.matchMedia;
    try {
      renderWith(<MyStatusButton />);
      fireEvent.click(
        await screen.findByRole("button", { name: /available/i }),
      );
      const sheet = await screen.findByRole("dialog", { name: "Set Status" });
      expect(sheet).toHaveAttribute("data-edge", "bottom");
    } finally {
      window.matchMedia = original;
    }
  });
});

describe("indicators", () => {
  it("name the status for assistive tech and never rely on colour alone", () => {
    render(
      <>
        <PresenceDot status="dnd" />
        <PresenceDot status="offline" />
        <PresenceDot status="busy" decorative />
      </>,
    );
    const dnd = screen.getByRole("img", { name: "Do Not Disturb" });
    expect(dnd).toHaveAttribute("data-glyph", "minus");
    expect(dnd).toHaveAttribute("title", "Do Not Disturb");
    expect(screen.getByRole("img", { name: "Offline" })).toHaveAttribute(
      "data-glyph",
      "ring",
    );
    // A decorative dot next to written text isn't announced twice.
    expect(screen.getAllByRole("img")).toHaveLength(2);
  });
});

function Colleague() {
  useWatchPresence(["u2"]);
  return <PresenceAvatar userId="u2" name="Bilal Khan" />;
}

describe("live presence", () => {
  it("watches on connect, then follows updates and ignores stale ones", async () => {
    const { socket } = renderWith(<Colleague />);
    await waitFor(() =>
      expect(socket.emit).toHaveBeenCalledWith(
        "presence:watch",
        { userIds: ["u2"] },
        expect.any(Function),
      ),
    );
    const ack = socket.emit.mock.calls.find(
      (c) => c[0] === "presence:watch",
    )![2];
    act(() =>
      ack({
        ok: true,
        presence: [
          view({
            userId: "u2",
            availability: "busy",
            status: "busy",
            revision: 3,
          }),
        ],
      }),
    );
    expect(
      screen.getByRole("img", { name: /bilal khan: busy/i }),
    ).toBeInTheDocument();

    // Newer revision: the person changed status.
    act(() =>
      socket.handlers["presence:update"](
        view({
          userId: "u2",
          availability: "meeting",
          status: "meeting",
          revision: 4,
          at: 2000,
        }),
      ),
    );
    expect(
      screen.getByRole("img", { name: /bilal khan: in a meeting/i }),
    ).toBeInTheDocument();

    // A late event from before that change, and a duplicate, are ignored.
    act(() => {
      socket.handlers["presence:update"](
        view({ userId: "u2", status: "available", revision: 3, at: 5000 }),
      );
      socket.handlers["presence:update"](
        view({
          userId: "u2",
          availability: "meeting",
          status: "meeting",
          revision: 4,
          at: 2000,
        }),
      );
    });
    expect(
      screen.getByRole("img", { name: /bilal khan: in a meeting/i }),
    ).toBeInTheDocument();
  });

  it("registers one socket listener, however often it re-renders", async () => {
    const { socket, rerender } = renderWith(<Colleague />);
    await screen.findByRole("img", { hidden: true }).catch(() => null);
    rerender(
      <UserContext.Provider value={{ user: { id: "me" } } as any}>
        <AlertContext.Provider value={{ setAlert } as any}>
          <SocketContext.Provider
            value={{ socketRef: { current: socket as any }, connected: true }}
          >
            <PresenceProvider>
              <Colleague />
            </PresenceProvider>
          </SocketContext.Provider>
        </AlertContext.Provider>
      </UserContext.Provider>,
    );
    const ons = socket.on.mock.calls.filter((c) => c[0] === "presence:update");
    const offs = socket.off.mock.calls.filter(
      (c) => c[0] === "presence:update",
    );
    expect(ons.length - offs.length).toBe(1);
  });
});

describe("activity", () => {
  it("goes idle after the threshold without input, and back on input — sending only the state", async () => {
    vi.useFakeTimers({ toFake: ["setInterval", "clearInterval", "Date"] });
    const { socket } = renderWith(<span />);
    await act(async () => {
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(api.get).toHaveBeenCalledWith("/presence/me", expect.anything()),
    );
    // Let the config (60 s idle) land, then stay still for over a minute.
    await act(async () => {
      vi.advanceTimersByTime(75_000);
    });
    expect(socket.emit).toHaveBeenCalledWith("presence:heartbeat", {
      state: "idle",
    });

    socket.emit.mockClear();
    fireEvent.pointerDown(window, { clientX: 10, clientY: 20 });
    expect(socket.emit).toHaveBeenCalledWith("presence:heartbeat", {
      state: "active",
    });
    for (const [, payload] of socket.emit.mock.calls)
      expect(Object.keys(payload)).toEqual(["state"]);
  });
});
