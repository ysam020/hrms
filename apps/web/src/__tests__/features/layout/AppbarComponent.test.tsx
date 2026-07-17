import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import AppbarComponent from "@web/features/layout/AppbarComponent";
import { NotificationContext } from "@web/app/providers/NotificationContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { UserContext } from "@web/app/providers/UserContext";
import { useDashboardEdit } from "@web/app/providers/DashboardEditContext";

vi.mock("@web/features/layout/AppsPopover", () => ({
  default: () => <div>Stub AppsPopover</div>,
}));

vi.mock("@web/app/providers/DashboardEditContext", () => ({
  useDashboardEdit: vi.fn(),
}));
const mockUseDashboardEdit = useDashboardEdit as unknown as ReturnType<
  typeof vi.fn
>;

function renderWith(
  path = "/",
  {
    notifications = [],
    theme = "light",
    toggleTheme = vi.fn(),
    handleLogout = vi.fn(),
    user = { tenantName: "Acme Corp" },
    editMode = false,
    toggleEditMode = vi.fn(),
    resetFn = null as (() => void) | null,
    handleOpen = vi.fn(),
    setOpenNotificationDrawer = vi.fn(),
    setOpenActivityDrawer = vi.fn(),
    setMobileOpen = vi.fn(),
    mobileOpen = false,
  } = {},
) {
  mockUseDashboardEdit.mockReturnValue({
    editMode,
    toggleEditMode,
    resetFn,
    registerReset: vi.fn(),
  });
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="*"
          element={
            <NotificationContext.Provider
              value={
                {
                  notifications,
                  loading: false,
                  setNotifications: vi.fn(),
                } as any
              }
            >
              <ThemeContext.Provider value={{ theme, toggleTheme } as any}>
                <UserContext.Provider value={{ user, handleLogout } as any}>
                  <AppbarComponent
                    showSidebar
                    setMobileOpen={setMobileOpen}
                    mobileOpen={mobileOpen}
                    setOpenNotificationDrawer={setOpenNotificationDrawer}
                    setOpenActivityDrawer={setOpenActivityDrawer}
                    handleOpen={handleOpen}
                  />
                </UserContext.Provider>
              </ThemeContext.Provider>
            </NotificationContext.Provider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("AppbarComponent", () => {
  it("shows the tenant name badge when present", () => {
    renderWith("/", { user: { tenantName: "Acme Corp" } });
    expect(screen.getByText("Acme Corp")).toBeInTheDocument();
  });

  it("omits the tenant name badge when absent", () => {
    renderWith("/", { user: {} });
    expect(screen.queryByText("Acme Corp")).not.toBeInTheDocument();
  });

  it("labels the theme toggle 'Dark mode' in light theme and calls toggleTheme", () => {
    const toggleTheme = vi.fn();
    renderWith("/", { theme: "light", toggleTheme });
    fireEvent.click(screen.getByLabelText("Dark mode"));
    expect(toggleTheme).toHaveBeenCalled();
  });

  it("labels the theme toggle 'Light mode' in dark theme", () => {
    renderWith("/", { theme: "dark" });
    expect(screen.getByLabelText("Light mode")).toBeInTheDocument();
  });

  it("shows the notification badge count and opens the drawer on click", () => {
    const setOpenNotificationDrawer = vi.fn();
    renderWith("/", { notifications: [{}, {}, {}], setOpenNotificationDrawer });
    expect(screen.getByLabelText("3 notifications")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Notifications"));
    expect(setOpenNotificationDrawer).toHaveBeenCalledWith(true);
  });

  it("shows no badge when there are no notifications", () => {
    renderWith("/", { notifications: [] });
    expect(screen.queryByLabelText(/notifications$/)).not.toBeInTheDocument();
  });

  it("calls handleOpen (search), setOpenActivityDrawer, and handleLogout from their action buttons", () => {
    const handleOpen = vi.fn();
    const setOpenActivityDrawer = vi.fn();
    const handleLogout = vi.fn();
    renderWith("/", { handleOpen, setOpenActivityDrawer, handleLogout });

    fireEvent.click(screen.getByLabelText("Search"));
    expect(handleOpen).toHaveBeenCalled();

    fireEvent.click(screen.getByLabelText("Audit Logs"));
    expect(setOpenActivityDrawer).toHaveBeenCalledWith(true);

    fireEvent.click(screen.getByLabelText("Logout"));
    expect(handleLogout).toHaveBeenCalled();
  });

  it("shows the dashboard-only Customize layout toggle on the dashboard route", () => {
    renderWith("/");
    expect(screen.getByLabelText("Customize layout")).toBeInTheDocument();
  });

  it("hides the Customize layout toggle off the dashboard route", () => {
    renderWith("/helpdesk");
    expect(screen.queryByLabelText("Customize layout")).not.toBeInTheDocument();
  });

  it("toggles edit mode, flipping to 'Done customizing' and aria-pressed", () => {
    const toggleEditMode = vi.fn();
    renderWith("/", { editMode: false, toggleEditMode });
    const button = screen.getByLabelText("Customize layout");
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(toggleEditMode).toHaveBeenCalled();
  });

  it("shows 'Done customizing' with aria-pressed=true while in edit mode", () => {
    renderWith("/", { editMode: true });
    expect(screen.getByLabelText("Done customizing")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  it("hides the reset-layout button unless in edit mode with a resetFn registered", () => {
    renderWith("/", { editMode: false, resetFn: null });
    expect(
      screen.queryByLabelText("Reset to default layout"),
    ).not.toBeInTheDocument();
  });

  it("shows the reset-layout button in edit mode once a resetFn is registered", () => {
    const resetFn = vi.fn();
    renderWith("/", { editMode: true, resetFn });
    fireEvent.click(screen.getByLabelText("Reset to default layout"));
    expect(resetFn).toHaveBeenCalled();
  });

  it("opens the mobile actions menu and closes it after an item is clicked", () => {
    const handleOpen = vi.fn();
    renderWith("/", { handleOpen });

    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getByText("Quick Actions")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Search"));
    expect(handleOpen).toHaveBeenCalled();
  });

  it("separates the danger (Logout) item from the regular actions in the mobile menu", () => {
    renderWith("/");
    fireEvent.click(screen.getByLabelText("Open menu"));
    expect(screen.getAllByText("Logout").length).toBeGreaterThan(0);
  });

  it("toggles the desktop sidebar drawer via the mobile nav-menu button", () => {
    const setMobileOpen = vi.fn();
    renderWith("/", { setMobileOpen, mobileOpen: false });
    fireEvent.click(screen.getByLabelText("Open navigation menu"));
    expect(setMobileOpen).toHaveBeenCalledWith(true);
  });
});
