import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { Suspense, useContext } from "react";
import { AlertContext } from "@web/app/providers/AlertContext";

// ── Heavy page mocks ────────────────────────────────────────────────────────
vi.mock("@web/pages/HomePage", () => ({
  default: () => {
    const { setAlert } = useContext(AlertContext);
    return (
      <div data-testid="home-page">
        Home
        <button
          onClick={() =>
            setAlert({ open: true, message: "Test alert", severity: "success" })
          }
        >
          trigger-alert
        </button>
      </div>
    );
  },
}));
vi.mock("@web/features/auth/LoginPage", () => ({
  default: () => <div data-testid="login-page">Login</div>,
}));
vi.mock("@web/features/auth/OrgSetupPage", () => ({
  default: () => {
    const location = useLocation();
    return (
      <div data-testid="org-setup-page">
        OrgSetup startAtStep={String((location.state as any)?.startAtStep)}
      </div>
    );
  },
}));
vi.mock("@web/pages/CareersPage", () => ({
  default: () => <div data-testid="careers-page">Careers</div>,
}));
vi.mock("@web/pages/JobApplicationPage", () => ({
  default: () => <div data-testid="job-application-page">Apply</div>,
}));
vi.mock("@web/features/layout/modals/BroadcastModal", () => ({
  default: () => null,
}));

// ── Infrastructure mocks ────────────────────────────────────────────────────
vi.mock("@web/shared/components/DomMagnifier", () => ({
  default: (props: any) => (
    <div data-testid="dom-magnifier">enabled={String(props.enabled)}</div>
  ),
}));
vi.mock("@web/shared/components/ProfilerOverlay", () => ({
  default: () => null,
}));

vi.mock("@web/app/App.scss", () => ({}));

const mockGetAccessToken = vi.fn();
const mockPerformRefresh = vi.fn();
const mockSetUnauthorizedHandler = vi.fn();
const mockApiGet = vi.fn();

vi.mock("@web/core/http/axiosConfig", () => ({
  default: { get: (...a: any[]) => mockApiGet(...a) },
  getAccessToken: () => mockGetAccessToken(),
  performRefresh: () => mockPerformRefresh(),
  setUnauthorizedHandler: (...a: any[]) => mockSetUnauthorizedHandler(...a),
  setPaymentRequiredHandler: vi.fn(),
  cancelAllPendingRequests: vi.fn(),
  invalidateCsrfToken: vi.fn(),
}));

// Socket / chat providers don't matter for routing tests
vi.mock("@web/app/providers/SocketContext", () => ({
  SocketProvider: ({ children }: any) => <>{children}</>,
  useSocket: () => ({ socketRef: { current: null }, connected: false }),
}));
vi.mock("@web/app/providers/ChatUnreadContext", () => ({
  ChatUnreadProvider: ({ children }: any) => <>{children}</>,
}));

// Disable broadcast-channel: jsdom doesn't support it
vi.mock("@web/shared/hooks/useBroadcastApi", () => ({
  default: () => vi.fn(),
}));

import App from "@web/app/App";

const routerFuture = {
  v7_startTransition: true,
  v7_relativeSplatPath: true,
};

const renderApp = (path = "/") =>
  render(
    <MemoryRouter initialEntries={[path]} future={routerFuture}>
      <Suspense fallback={<div data-testid="suspense-fallback" />}>
        <App />
      </Suspense>
    </MemoryRouter>,
  );

describe("App – boot spinner", () => {
  it("shows a spinner while the session check is pending", () => {
    // keep the profile call hanging forever
    mockGetAccessToken.mockReturnValue(null);
    mockPerformRefresh.mockReturnValue(new Promise(() => {}));

    renderApp();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });
});

describe("App – unauthenticated routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockReturnValue(null);
    mockPerformRefresh.mockResolvedValue("token");
    mockApiGet.mockResolvedValue({ data: { success: false } });
  });

  it("redirects to /login when the user has no valid session", async () => {
    renderApp("/");
    await waitFor(() =>
      expect(screen.getByTestId("login-page")).toBeInTheDocument(),
    );
  });

  it("renders LoginPage directly when navigating to /login", async () => {
    renderApp("/login");
    await waitFor(() =>
      expect(screen.getByTestId("login-page")).toBeInTheDocument(),
    );
  });

  it("renders CareersPage at /careers/:slug without authentication", async () => {
    renderApp("/careers/acme-co");
    await waitFor(() =>
      expect(screen.getByTestId("careers-page")).toBeInTheDocument(),
    );
  });

  it("renders JobApplicationPage at /careers/:slug/apply/:id without auth", async () => {
    renderApp("/careers/acme-co/apply/abc123");
    await waitFor(() =>
      expect(screen.getByTestId("job-application-page")).toBeInTheDocument(),
    );
  });
});

describe("App – authenticated routing", () => {
  const fakeUser = { _id: "u1", name: "Alice" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockReturnValue("valid-token");
    mockApiGet.mockResolvedValue({
      data: { success: true, data: { user: fakeUser } },
    });
  });

  it("renders HomePage when the user is authenticated", async () => {
    renderApp("/");
    await waitFor(() =>
      expect(screen.getByTestId("home-page")).toBeInTheDocument(),
    );
  });

  it("redirects from /login to / when the user is already authenticated", async () => {
    renderApp("/login");
    await waitFor(() =>
      expect(screen.getByTestId("home-page")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("login-page")).not.toBeInTheDocument();
  });

  it("renders HomePage for any private path when authenticated", async () => {
    renderApp("/profile");
    await waitFor(() =>
      expect(screen.getByTestId("home-page")).toBeInTheDocument(),
    );
  });
});

describe("App – token handling on boot", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calls performRefresh when no access token is stored", async () => {
    mockGetAccessToken.mockReturnValue(null);
    mockPerformRefresh.mockResolvedValue("new-token");
    mockApiGet.mockResolvedValue({ data: { success: false } });

    renderApp();
    await waitFor(() =>
      expect(screen.getByTestId("login-page")).toBeInTheDocument(),
    );
    expect(mockPerformRefresh).toHaveBeenCalled();
  });

  it("skips performRefresh and uses stored token directly", async () => {
    mockGetAccessToken.mockReturnValue("stored-token");
    mockApiGet.mockResolvedValue({ data: { success: false } });

    renderApp();
    await waitFor(() =>
      expect(screen.getByTestId("login-page")).toBeInTheDocument(),
    );
    expect(mockPerformRefresh).not.toHaveBeenCalled();
  });

  it("shows login page when performRefresh fails", async () => {
    mockGetAccessToken.mockReturnValue(null);
    mockPerformRefresh.mockRejectedValue(new Error("Refresh failed"));

    renderApp();
    await waitFor(() =>
      expect(screen.getByTestId("login-page")).toBeInTheDocument(),
    );
  });
});

function makeToken(payload: Record<string, any>) {
  return `header.${btoa(JSON.stringify(payload))}.sig`;
}

describe("App – token-payload boot routing", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("routes to /org-setup when the token payload marks pendingSetup", async () => {
    mockGetAccessToken.mockReturnValue(makeToken({ pendingSetup: true }));

    renderApp("/");
    await waitFor(() =>
      expect(screen.getByTestId("org-setup-page")).toBeInTheDocument(),
    );
    expect(mockApiGet).not.toHaveBeenCalled();
  });

  it("routes to /org-setup at step 2 when orgSetupComplete is false", async () => {
    mockGetAccessToken.mockReturnValue(
      makeToken({ tenantId: "t1", orgSetupComplete: false }),
    );

    renderApp("/");
    const orgSetup = await screen.findByTestId("org-setup-page");
    expect(orgSetup).toHaveTextContent("startAtStep=2");
  });
});

describe("App – magnifier and escape key handling", () => {
  const fakeUser = { _id: "u1", name: "Alice" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockReturnValue("valid-token");
    mockApiGet.mockResolvedValue({
      data: { success: true, data: { user: fakeUser } },
    });
  });

  it("toggles the DOM magnifier on Alt+M and off again on Escape", async () => {
    renderApp("/");
    await waitFor(() =>
      expect(screen.getByTestId("home-page")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("dom-magnifier")).toHaveTextContent(
      "enabled=false",
    );

    fireEvent.keyDown(window, { altKey: true, code: "KeyM" });
    expect(screen.getByTestId("dom-magnifier")).toHaveTextContent(
      "enabled=true",
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.getByTestId("dom-magnifier")).toHaveTextContent(
      "enabled=false",
    );
  });
});

describe("App – alert banner", () => {
  const fakeUser = { _id: "u1", name: "Alice" };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGetAccessToken.mockReturnValue("valid-token");
    mockApiGet.mockResolvedValue({
      data: { success: true, data: { user: fakeUser } },
    });
  });

  it("auto-dismisses a success alert after its severity-based duration", async () => {
    vi.useFakeTimers();
    renderApp("/");
    await vi.waitFor(() =>
      expect(screen.getByTestId("home-page")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("trigger-alert"));
    expect(screen.getByText("Test alert")).toBeInTheDocument();

    vi.advanceTimersByTime(3000);
    await vi.waitFor(() =>
      expect(screen.queryByText("Test alert")).not.toBeInTheDocument(),
    );
    vi.useRealTimers();
  });

  it("closes the alert immediately via its own close button", async () => {
    renderApp("/");
    await waitFor(() =>
      expect(screen.getByTestId("home-page")).toBeInTheDocument(),
    );

    fireEvent.click(screen.getByText("trigger-alert"));
    expect(screen.getByText("Test alert")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close"));
    await waitFor(() =>
      expect(screen.queryByText("Test alert")).not.toBeInTheDocument(),
    );
  });
});
