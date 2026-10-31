import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { useEffect, useState, type ReactNode } from "react";
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { UserContext } from "@web/app/providers/UserContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import {
  WalkthroughProvider,
  useWalkthrough,
  type WalkthroughApi,
} from "@next/walkthrough/WalkthroughProvider";
import type { ProgressStore } from "@next/walkthrough/persistence";
import { emptyState } from "@next/walkthrough/engine";
import {
  APP_TOUR,
  STATE_SCHEMA,
  type TourModuleDef,
  type WalkthroughState,
} from "@next/walkthrough/types";

// The runner end to end, in a router: navigating between routes, waiting
// for targets, skipping missing ones, pausing, resuming and finishing.
// Joyride is replaced by a stub that renders our tooltip for the step, so
// the test exercises the walkthrough's own orchestration.

const fixture: TourModuleDef[] = [
  {
    id: "alpha",
    label: "Alpha",
    summary: "",
    route: "/a",
    steps: [
      { id: "one", target: "a1", title: "Alpha one", content: "First" },
      { id: "two", target: "a2", title: "Alpha two", content: "Second" },
    ],
  },
  {
    id: "beta",
    label: "Beta",
    summary: "",
    route: "/b",
    steps: [
      { id: "one", target: "b1", title: "Beta one", content: "Third" },
      {
        id: "gone",
        target: "not-rendered",
        title: "Missing",
        content: "Never shown",
        timeout: 150,
      },
      { id: "two", target: "b2", title: "Beta two", content: "Last" },
    ],
  },
];

vi.mock("@next/walkthrough/registry", () => ({
  MODULES: fixture,
  canReach: () => true,
  matchesRoute: (p: string, r: string | null) =>
    !r || p === r || p.startsWith(`${r}/`),
}));

const joyride = vi.hoisted(() => ({
  throwOn: null as string | null,
  targets: [] as any[],
}));
vi.mock("react-joyride", () => ({
  EVENTS: { TARGET_NOT_FOUND: "error:target_not_found" },
  Joyride: ({ steps, tooltipComponent: T }: any) => {
    joyride.targets.push(steps[0].target);
    if (joyride.throwOn === steps[0].id)
      throw new TypeError(
        "Cannot read properties of null (reading 'parentNode')",
      );
    return (
      <T
        step={steps[0]}
        tooltipProps={{ role: "alertdialog", "aria-modal": true }}
      />
    );
  },
}));

const rect = {
  width: 100,
  height: 20,
  top: 0,
  left: 0,
  right: 100,
  bottom: 20,
  x: 0,
  y: 0,
  toJSON() {},
};

function fakeStore(initial: WalkthroughState | null = null) {
  return {
    load: vi.fn(async () => initial),
    save: vi.fn(),
    flush: vi.fn(async () => {}),
    clear: vi.fn(async () => {}),
    dispose: vi.fn(),
  } as unknown as ProgressStore & { save: ReturnType<typeof vi.fn> };
}

const probe: {
  api?: WalkthroughApi;
  path?: string;
  go?: (to: string) => void;
} = {};
function Probe() {
  probe.api = useWalkthrough()!;
  probe.path = useLocation().pathname;
  const navigate = useNavigate();
  useEffect(() => {
    probe.go = navigate;
  }, [navigate]);
  return null;
}

const pages = (
  <Routes>
    <Route
      path="/a"
      element={
        <div>
          <p data-tour="a1">A1</p>
          <p data-tour="a2">A2</p>
        </div>
      }
    />
    <Route
      path="/b"
      element={
        <div>
          <p data-tour="b1">B1</p>
          <p data-tour="b2">B2</p>
        </div>
      }
    />
    <Route path="/elsewhere" element={<p>Elsewhere</p>} />
    <Route path="/swap" element={<Swapping />} />
  </Routes>
);

/** Shows a loading row, then swaps in the real one (a list loading). */
function Swapping() {
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLoaded(true), 300);
    return () => clearTimeout(t);
  }, []);
  return loaded ? (
    <p data-tour="a1" id="loaded">
      Loaded
    </p>
  ) : (
    <p data-tour="a1" id="loading">
      Loading
    </p>
  );
}

const setAlert = vi.fn();
const alice = { id: "u-alice", tenantId: "t-1", tenantRole: "employee" };

function Harness({
  user = alice,
  storeFor,
  children = pages,
}: {
  user?: any;
  storeFor: (scope: string) => ProgressStore;
  children?: ReactNode;
}) {
  return (
    <UserContext.Provider value={{ user } as any}>
      <AlertContext.Provider value={{ setAlert } as any}>
        <WalkthroughProvider storeFor={storeFor}>
          {children}
          <Probe />
        </WalkthroughProvider>
      </AlertContext.Provider>
    </UserContext.Provider>
  );
}

function mount(initial: WalkthroughState | null = null, path = "/a") {
  const store = fakeStore(initial);
  const utils = render(
    <MemoryRouter initialEntries={[path]}>
      <Harness storeFor={() => store} />
    </MemoryRouter>,
  );
  return { store, ...utils };
}

const ready = () => waitFor(() => expect(probe.api?.ready).toBe(true));
const tip = (title: string) =>
  screen.findByRole("heading", { name: title }, { timeout: 3000 });
const next = () =>
  fireEvent.click(screen.getByRole("button", { name: /^(Next|Finish)$/ }));

beforeEach(() => {
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockReturnValue(
    rect as DOMRect,
  );
  setAlert.mockClear();
  sessionStorage.clear();
});
afterEach(() => vi.restoreAllMocks());

describe("walkthrough runner", () => {
  it("keeps running when a step's page redirects itself to a sub-page", async () => {
    const store = fakeStore(null);
    render(
      <MemoryRouter initialEntries={["/elsewhere"]}>
        <Harness storeFor={() => store}>
          <Routes>
            <Route path="/a" element={<Navigate to="/a/details" replace />} />
            <Route
              path="/a/details"
              element={
                <div>
                  <p data-tour="a1">A1</p>
                  <p data-tour="a2">A2</p>
                </div>
              }
            />
            <Route path="/elsewhere" element={<p>Elsewhere</p>} />
          </Routes>
        </Harness>
      </MemoryRouter>,
    );
    await ready();
    await act(() => probe.api!.start(APP_TOUR));
    await tip("Alpha one");
    expect(probe.path).toBe("/a/details");
    next();
    await tip("Alpha two");
    expect(probe.api!.state.tours.app.status).toBe("running");
    expect(setAlert).not.toHaveBeenCalledWith(
      expect.objectContaining({ severity: "info" }),
    );
  });

  it("re-finds a target the page replaced after it was shown", async () => {
    const saved: WalkthroughState = {
      ...emptyState(),
      active: APP_TOUR,
      tours: {
        app: {
          status: "running",
          stepId: "alpha.one",
          seen: [],
          skipped: [],
          lastRoute: null,
          updatedAt: new Date().toISOString(),
        },
      },
    };
    // alpha.one's route is /a; serve the swapping page there instead.
    const store = fakeStore(saved);
    render(
      <MemoryRouter initialEntries={["/a"]}>
        <Harness storeFor={() => store}>
          <Routes>
            <Route path="/a" element={<Swapping />} />
          </Routes>
        </Harness>
      </MemoryRouter>,
    );
    await tip("Alpha one");
    await waitFor(() => expect(joyride.targets.at(-1)?.id).toBe("loaded"), {
      timeout: 3000,
    });
    expect(joyride.targets.at(-1).isConnected).toBe(true);
    expect(screen.getByRole("alertdialog")).toBeInTheDocument();
  });

  it("pauses the tour instead of crashing the page when Joyride throws", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    joyride.throwOn = "alpha.one";
    mount();
    await ready();
    await act(() => probe.api!.start(APP_TOUR));
    await waitFor(() =>
      expect(probe.api!.state.tours.app.status).toBe("paused"),
    );
    expect(screen.getByText("A1")).toBeInTheDocument(); // the page survives
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "warning" }),
    );
    joyride.throwOn = null;
    spy.mockRestore();
  });

  it("does nothing until a tour is started", async () => {
    mount();
    await ready();
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(probe.api!.state.active).toBeNull();
  });

  it("walks across routes, skips a missing target, and completes", async () => {
    const { store } = mount();
    await ready();
    await act(() => probe.api!.start(APP_TOUR));

    await tip("Alpha one");
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Alpha · Step 1 of 2");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "1",
    );
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuemax",
      "5",
    );

    next();
    await tip("Alpha two");
    next();
    await tip("Beta one");
    expect(probe.path).toBe("/b"); // navigated with the router

    next();
    // "Missing" never renders: skipped after its timeout, on to the next.
    await tip("Beta two");
    expect(screen.queryByText("Never shown")).toBeNull();
    expect(probe.api!.state.tours.app.skipped).toContain("beta.gone");

    next(); // Finish
    await waitFor(() =>
      expect(probe.api!.state.tours.app.status).toBe("completed"),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success" }),
    );
    expect(store.save).toHaveBeenCalled();
  });

  it("goes back, and ignores a double click", async () => {
    mount();
    await ready();
    await act(() => probe.api!.start(APP_TOUR));
    await tip("Alpha one");
    const nextBtn = screen.getByRole("button", { name: "Next" });
    fireEvent.click(nextBtn);
    fireEvent.click(nextBtn);
    await tip("Alpha two");
    expect(probe.api!.state.tours.app.stepId).toBe("alpha.two");

    fireEvent.click(screen.getByRole("button", { name: "Back" }));
    await tip("Alpha one");
  });

  it("moves with the arrow keys", async () => {
    mount();
    await ready();
    await act(() => probe.api!.start(APP_TOUR));
    await tip("Alpha one");
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "ArrowRight" });
    await tip("Alpha two");
    fireEvent.keyDown(screen.getByRole("alertdialog"), { key: "ArrowLeft" });
    await tip("Alpha one");
  });

  it("pauses on Escape and resumes at the same step", async () => {
    mount();
    await ready();
    await act(() => probe.api!.start(APP_TOUR));
    await tip("Alpha one");
    next();
    await tip("Alpha two");

    fireEvent.keyDown(document.body, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(probe.api!.state.tours.app).toMatchObject({
      status: "paused",
      stepId: "alpha.two",
    });

    await act(() => probe.api!.start(APP_TOUR));
    await tip("Alpha two");
  });

  it("pauses from the × button and when the whole tour is ended", async () => {
    mount();
    await ready();
    await act(() => probe.api!.start(APP_TOUR));
    await tip("Alpha one");
    fireEvent.click(screen.getByRole("button", { name: "Pause tour" }));
    await waitFor(() =>
      expect(probe.api!.state.tours.app.status).toBe("paused"),
    );

    await act(() => probe.api!.start(APP_TOUR));
    await tip("Alpha one");
    fireEvent.click(screen.getByRole("button", { name: "End Tour" }));
    await waitFor(() =>
      expect(probe.api!.state.tours.app.status).toBe("dismissed"),
    );
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });

  it("pauses instead of dragging the person back when they navigate away", async () => {
    mount();
    await ready();
    await act(() => probe.api!.start(APP_TOUR));
    await tip("Alpha one");
    act(() => probe.go!("/elsewhere"));
    await waitFor(() =>
      expect(probe.api!.state.tours.app.status).toBe("paused"),
    );
    expect(probe.path).toBe("/elsewhere");
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "info" }),
    );
  });

  it("restores a tour running at refresh, navigating to its route", async () => {
    const saved: WalkthroughState = {
      ...emptyState(),
      schema: STATE_SCHEMA,
      active: APP_TOUR,
      tours: {
        app: {
          status: "running",
          stepId: "beta.one",
          seen: ["alpha.one", "alpha.two"],
          skipped: [],
          lastRoute: "/b",
          updatedAt: new Date().toISOString(),
        },
      },
    };
    mount(saved, "/a");
    await tip("Beta one");
    expect(probe.path).toBe("/b");
    expect(screen.getByRole("progressbar")).toHaveAttribute(
      "aria-valuenow",
      "3",
    );
  });

  it("recovers from a saved step that no longer exists", async () => {
    const saved: WalkthroughState = {
      ...emptyState(),
      active: APP_TOUR,
      tours: {
        app: {
          status: "running",
          stepId: "beta.removed-in-v2",
          seen: [],
          skipped: [],
          lastRoute: null,
          updatedAt: new Date().toISOString(),
        },
      },
    };
    mount(saved);
    // Resumes at the start of the step's module.
    await tip("Beta one");
  });

  it("starts a single module's tour on its own", async () => {
    mount();
    await ready();
    await act(() => probe.api!.start("beta"));
    await tip("Beta one");
    expect(screen.getByRole("alertdialog")).toHaveTextContent("1 of 3");
    expect(probe.api!.state.tours.app).toBeUndefined();
  });

  it("never shows one person's progress to another", async () => {
    const aliceState: WalkthroughState = {
      ...emptyState(),
      active: APP_TOUR,
      tours: {
        app: {
          status: "paused",
          stepId: "alpha.two",
          seen: ["alpha.one"],
          skipped: [],
          lastRoute: "/a",
          updatedAt: new Date().toISOString(),
        },
      },
    };
    const stores: Record<string, ProgressStore> = {
      "t-1:u-alice": fakeStore(aliceState),
      "t-1:u-bob": fakeStore(null),
    };
    const storeFor = vi.fn((scope: string) => stores[scope]);
    const { rerender } = render(
      <MemoryRouter initialEntries={["/a"]}>
        <Harness storeFor={storeFor} />
      </MemoryRouter>,
    );
    await waitFor(() =>
      expect(probe.api!.state.tours.app?.stepId).toBe("alpha.two"),
    );
    rerender(
      <MemoryRouter initialEntries={["/a"]}>
        <Harness user={{ id: "u-bob", tenantId: "t-1" }} storeFor={storeFor} />
      </MemoryRouter>,
    );
    await ready();
    expect(probe.api!.state.tours).toEqual({});
    expect(storeFor).toHaveBeenLastCalledWith("t-1:u-bob");
    expect((stores["t-1:u-alice"] as any).dispose).toHaveBeenCalled();
  });
});

describe("anchorFor", () => {
  it("anchors a tall table's tooltip to its header row, and leaves short targets alone", async () => {
    const { anchorFor } = await import("@next/walkthrough/Runner");
    document.body.innerHTML =
      '<div id="wrap"><table><thead id="head"><tr><th>A</th></tr></thead><tbody><tr><td>1</td></tr></tbody></table></div><p id="short">x</p>';
    vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(
      function (this: Element) {
        const h = this.id === "head" || this.id === "short" ? 40 : 4000;
        return { ...rect, height: h, bottom: h } as DOMRect;
      },
    );
    expect(anchorFor(document.getElementById("wrap")!).id).toBe("head");
    const short = document.getElementById("short")!;
    expect(anchorFor(short)).toBe(short);
  });
});

describe("placementFor", () => {
  it("opens sidebar tooltips to the right and turns auto into below", async () => {
    const { placementFor } = await import("@next/walkthrough/Runner");
    document.body.innerHTML =
      '<div data-px-sidebar><ul><li id="nav">Today</li></ul></div><h1 id="title">Today</h1>';
    const nav = document.getElementById("nav")!;
    const title = document.getElementById("title")!;
    expect(placementFor("auto", nav)).toBe("right");
    expect(placementFor("bottom", nav)).toBe("right");
    expect(placementFor("auto", title)).toBe("bottom");
    expect(placementFor("top", title)).toBe("top");
    expect(placementFor("center", nav)).toBe("center");
  });
});
