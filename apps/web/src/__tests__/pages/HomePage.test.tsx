import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import HomePage from "@web/pages/HomePage";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { AlertContext } from "@web/app/providers/AlertContext";
import useNotifications from "@web/shared/hooks/useNotifications";
import useSpotlightModal from "@web/shared/hooks/useSpotlightModal";
import { refreshFcmToken } from "@web/shared/utils/pushNotifications/refreshFcmToken";

vi.mock("@web/shared/hooks/useNotifications", () => ({ default: vi.fn() }));
const mockUseNotifications = useNotifications as unknown as ReturnType<
  typeof vi.fn
>;

vi.mock("@web/shared/hooks/useSpotlightModal", () => ({ default: vi.fn() }));
const mockUseSpotlightModal = useSpotlightModal as unknown as ReturnType<
  typeof vi.fn
>;

vi.mock("@web/shared/utils/pushNotifications/refreshFcmToken", () => ({
  refreshFcmToken: vi.fn(),
}));

vi.mock("@web/app/router/routesConfig", () => ({
  default: () => [
    {
      path: "/",
      element: <div>Stub Dashboard</div>,
      moduleTags: [],
      spotlightOnly: false,
    },
  ],
}));

vi.mock("@web/features/layout/AppbarComponent", () => ({
  default: (props: any) => (
    <div>
      Stub AppbarComponent
      <button onClick={() => props.setMobileOpen(true)}>toggle-mobile</button>
      <button onClick={() => props.setOpenActivityDrawer(true)}>
        open-activity
      </button>
      <button onClick={() => props.setOpenNotificationDrawer(true)}>
        open-notification
      </button>
      <button onClick={() => props.handleOpen()}>open-spotlight</button>
    </div>
  ),
}));
vi.mock("@web/features/layout/DrawerComponent", () => ({
  default: (props: any) => (
    <div>Stub DrawerComponent mobileOpen={String(props.mobileOpen)}</div>
  ),
}));
vi.mock("@web/features/layout/AuditLogs", () => ({
  default: (props: any) => (props.open ? <div>Stub ActivityDrawer</div> : null),
}));
vi.mock("@web/features/layout/NotificationDrawer", () => ({
  default: (props: any) =>
    props.open ? <div>Stub NotificationDrawer</div> : null,
}));
vi.mock("@web/shared/components/NotificationConsentDrawer", () => ({
  default: (props: any) =>
    props.showConsentDrawer ? <div>Stub ConsentDrawer</div> : null,
}));
vi.mock("@web/features/layout/modals/SpotlightModal", () => ({
  default: (props: any) => (props.open ? <div>Stub SpotlightModal</div> : null),
}));
vi.mock("@web/app/router/UnAuthorisedRoute", () => ({
  default: () => <div>Stub UnAuthorisedRoute</div>,
}));
vi.mock("@web/features/chatbot/Chatbot", () => ({
  default: () => <div>Stub ChatbotFab</div>,
}));
vi.mock("@web/features/onboarding/OnboardingModals", () => ({
  default: () => <div>Stub OnboardingModals</div>,
}));

function renderHomePage({
  user = { id: "u1", fcmTokens: [] },
  showSidebar = true,
  handleOpen = vi.fn(),
  handleClose = vi.fn(),
  spotlightOpen = false,
} = {}) {
  mockUseNotifications.mockReturnValue({
    notifications: [],
    setNotifications: vi.fn(),
    loading: false,
    setLoading: vi.fn(),
  });
  mockUseSpotlightModal.mockReturnValue({
    open: spotlightOpen,
    handleOpen,
    handleClose,
  });

  return render(
    <MemoryRouter initialEntries={["/"]}>
      <ThemeContext.Provider
        value={{ theme: "light", toggleTheme: vi.fn() } as any}
      >
        <UserContext.Provider value={{ user } as any}>
          <AlertContext.Provider value={{ setAlert: vi.fn() } as any}>
            <HomePage showSidebar={showSidebar} setShowSidebar={vi.fn()} />
          </AlertContext.Provider>
        </UserContext.Provider>
      </ThemeContext.Provider>
    </MemoryRouter>,
  );
}

describe("HomePage", () => {
  beforeEach(() => vi.clearAllMocks());

  it("renders the appbar and routed page content", async () => {
    renderHomePage();
    expect(await screen.findByText("Stub AppbarComponent")).toBeInTheDocument();
    expect(screen.getByText("Stub Dashboard")).toBeInTheDocument();
  });

  it("renders the sidebar drawer when showSidebar is true", async () => {
    renderHomePage({ showSidebar: true });
    expect(await screen.findByText(/Stub DrawerComponent/)).toBeInTheDocument();
  });

  it("hides the sidebar drawer when showSidebar is false", async () => {
    renderHomePage({ showSidebar: false });
    await screen.findByText("Stub AppbarComponent");
    expect(screen.queryByText(/Stub DrawerComponent/)).not.toBeInTheDocument();
  });

  it("opens the activity drawer via the appbar callback", async () => {
    renderHomePage();
    await screen.findByText("Stub AppbarComponent");
    expect(screen.queryByText("Stub ActivityDrawer")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("open-activity"));
    expect(await screen.findByText("Stub ActivityDrawer")).toBeInTheDocument();
  });

  it("opens the notification drawer via the appbar callback", async () => {
    renderHomePage();
    await screen.findByText("Stub AppbarComponent");

    fireEvent.click(screen.getByText("open-notification"));
    expect(
      await screen.findByText("Stub NotificationDrawer"),
    ).toBeInTheDocument();
  });

  it("triggers the spotlight modal's handleOpen via the appbar callback", async () => {
    const handleOpen = vi.fn();
    renderHomePage({ handleOpen });
    await screen.findByText("Stub AppbarComponent");

    fireEvent.click(screen.getByText("open-spotlight"));
    expect(handleOpen).toHaveBeenCalled();
  });

  it("shows the spotlight modal when useSpotlightModal reports it open", async () => {
    renderHomePage({ spotlightOpen: true });
    expect(await screen.findByText("Stub SpotlightModal")).toBeInTheDocument();
  });

  it("refreshes the FCM token once per session when the user's fcmTokens are known", async () => {
    renderHomePage({ user: { id: "u1", fcmTokens: [] } });
    await screen.findByText("Stub AppbarComponent");
    expect(refreshFcmToken).toHaveBeenCalledTimes(1);
  });

  it("does not attempt an FCM refresh before the user's fcmTokens are loaded", async () => {
    renderHomePage({ user: { id: "u1" } });
    await screen.findByText("Stub AppbarComponent");
    expect(refreshFcmToken).not.toHaveBeenCalled();
  });

  it("renders the chatbot and onboarding modals", async () => {
    renderHomePage();
    expect(await screen.findByText("Stub ChatbotFab")).toBeInTheDocument();
    expect(screen.getByText("Stub OnboardingModals")).toBeInTheDocument();
  });

  it("falls back to UnAuthorisedRoute for an unmatched path", async () => {
    mockUseNotifications.mockReturnValue({
      notifications: [],
      setNotifications: vi.fn(),
      loading: false,
      setLoading: vi.fn(),
    });
    mockUseSpotlightModal.mockReturnValue({
      open: false,
      handleOpen: vi.fn(),
      handleClose: vi.fn(),
    });
    render(
      <MemoryRouter initialEntries={["/no-such-route"]}>
        <ThemeContext.Provider
          value={{ theme: "light", toggleTheme: vi.fn() } as any}
        >
          <UserContext.Provider
            value={{ user: { id: "u1", fcmTokens: [] } } as any}
          >
            <AlertContext.Provider value={{ setAlert: vi.fn() } as any}>
              <HomePage showSidebar setShowSidebar={vi.fn()} />
            </AlertContext.Provider>
          </UserContext.Provider>
        </ThemeContext.Provider>
      </MemoryRouter>,
    );
    expect(
      await screen.findByText("Stub UnAuthorisedRoute"),
    ).toBeInTheDocument();
  });
});
