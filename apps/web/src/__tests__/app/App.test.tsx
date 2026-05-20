import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { Suspense } from "react";

// ── Heavy page mocks ────────────────────────────────────────────────────────
vi.mock("@web/pages/HomePage", () => ({
  default: () => <div data-testid="home-page">Home</div>,
}));
vi.mock("@web/features/auth/LoginPage", () => ({
  default: () => <div data-testid="login-page">Login</div>,
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
vi.mock("@web/shared/components/DomMagnifier", () => ({ default: () => null }));
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

  it("renders CareersPage at /careers without authentication", async () => {
    renderApp("/careers");
    await waitFor(() =>
      expect(screen.getByTestId("careers-page")).toBeInTheDocument(),
    );
  });

  it("renders JobApplicationPage at /careers/apply/:id without auth", async () => {
    renderApp("/careers/apply/abc123");
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
