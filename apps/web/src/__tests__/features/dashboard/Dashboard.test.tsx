import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import Dashboard from "@web/features/dashboard/Dashboard";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";
import { useDashboardEdit } from "@web/app/providers/DashboardEditContext";

vi.mock("@web/app/providers/DashboardContext", () => ({
  DashboardProvider: ({ children }: any) => <>{children}</>,
  useDashboard: () => ({ data: {}, loading: {}, refetch: vi.fn() }),
}));

vi.mock("@web/app/providers/DashboardEditContext", () => ({
  useDashboardEdit: vi.fn(),
}));
const mockUseDashboardEdit = useDashboardEdit as unknown as ReturnType<
  typeof vi.fn
>;

vi.mock("@web/features/dashboard/HrActivities", () => ({
  default: () => <div>Stub HrActivities</div>,
}));
vi.mock("@web/features/dashboard/AttendanceCalendar", () => ({
  default: () => <div>Stub AttendanceCalendar</div>,
}));
vi.mock("@web/features/dashboard/QuickStats", () => ({
  default: () => <div>Stub QuickStats</div>,
}));
vi.mock("@web/features/dashboard/PendingApprovals", () => ({
  default: () => <div>Stub PendingApprovals</div>,
}));
vi.mock("@web/features/dashboard/MyWorkspace", () => ({
  default: () => <div>Stub MyWorkspace</div>,
}));
vi.mock("@web/features/dashboard/KycStatus", () => ({
  default: () => <div>Stub KycStatus</div>,
}));
vi.mock("@web/features/dashboard/JobOpeningsList", () => ({
  default: () => <div>Stub JobOpeningsList</div>,
}));
vi.mock("@web/features/dashboard/BirthdayAnniversary", () => ({
  default: () => <div>Stub BirthdayAnniversary</div>,
}));
vi.mock("@web/features/dashboard/DepartmentBreakdown", () => ({
  default: () => <div>Stub DepartmentBreakdown</div>,
}));
vi.mock("@web/features/dashboard/WorkforceStatus", () => ({
  default: () => <div>Stub WorkforceStatus</div>,
}));

function renderDashboard(editMode = false) {
  mockUseDashboardEdit.mockReturnValue({
    editMode,
    toggleEditMode: vi.fn(),
    resetFn: null,
    registerReset: vi.fn(),
  });
  return render(
    <UserContext.Provider value={{ user: { id: "u1" } } as any}>
      <ThemeContext.Provider
        value={{ theme: "light", toggleTheme: vi.fn() } as any}
      >
        <Dashboard />
      </ThemeContext.Provider>
    </UserContext.Provider>,
  );
}

describe("Dashboard", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("renders all default-visible widgets", async () => {
    renderDashboard();
    expect(await screen.findByText("Stub QuickStats")).toBeInTheDocument();
    expect(screen.getByText("Stub WorkforceStatus")).toBeInTheDocument();
    expect(screen.getByText("Stub AttendanceCalendar")).toBeInTheDocument();
    expect(screen.getByText("Stub HrActivities")).toBeInTheDocument();
    expect(screen.getByText("Stub PendingApprovals")).toBeInTheDocument();
    expect(screen.getByText("Stub KycStatus")).toBeInTheDocument();
    expect(screen.getByText("Stub JobOpeningsList")).toBeInTheDocument();
    expect(screen.getByText("Stub BirthdayAnniversary")).toBeInTheDocument();
    expect(screen.getByText("Stub DepartmentBreakdown")).toBeInTheDocument();
    // MyWorkspace renders in the always-visible sidebar (RightPanel)
    expect(screen.getByText("Stub MyWorkspace")).toBeInTheDocument();
  });

  it("hides the widget-visibility toolbar outside of edit mode", async () => {
    renderDashboard(false);
    await screen.findByText("Stub QuickStats");
    expect(screen.queryByText("Show / hide:")).not.toBeInTheDocument();
  });

  it("shows the widget-visibility toolbar in edit mode", async () => {
    renderDashboard(true);
    await screen.findByText("Stub QuickStats");
    expect(screen.getByText("Show / hide:")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "KYC Status" }),
    ).toBeInTheDocument();
  });

  it("hides a widget when its toggle chip is clicked in edit mode, and persists it", async () => {
    renderDashboard(true);
    await screen.findByText("Stub QuickStats");

    fireEvent.click(screen.getByRole("button", { name: "KYC Status" }));

    await waitFor(() =>
      expect(screen.queryByText("Stub KycStatus")).not.toBeInTheDocument(),
    );
    const stored = JSON.parse(localStorage.getItem("db_visibility_v12")!);
    expect(stored.kycStatus).toBe(false);
  });

  it("hides a widget via its card's Hide button in edit mode", async () => {
    renderDashboard(true);
    await screen.findByText("Stub QuickStats");

    fireEvent.click(screen.getByLabelText("Hide KYC Status widget"));

    await waitFor(() =>
      expect(screen.queryByText("Stub KycStatus")).not.toBeInTheDocument(),
    );
  });

  it("re-shows a hidden widget when the toolbar chip is clicked again", async () => {
    localStorage.setItem(
      "db_visibility_v12",
      JSON.stringify({
        quickStats: true,
        workforceStatus: true,
        attendanceCalendar: true,
        hrActivities: true,
        pendingApprovals: true,
        kycStatus: false,
        jobOpeningsList: true,
        birthdayAnniversary: true,
        departmentBreakdown: true,
      }),
    );
    renderDashboard(true);
    await screen.findByText("Stub QuickStats");
    expect(screen.queryByText("Stub KycStatus")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("KYC Status"));

    await waitFor(() =>
      expect(screen.getByText("Stub KycStatus")).toBeInTheDocument(),
    );
  });

  it("resets layout and visibility, clearing localStorage, via the reset button", async () => {
    localStorage.setItem(
      "db_visibility_v12",
      JSON.stringify({ quickStats: false }),
    );
    localStorage.setItem("db_layout_v14", JSON.stringify({ lg: [] }));
    renderDashboard(true);
    await screen.findByText("Show / hide:");

    fireEvent.click(screen.getByLabelText("Reset dashboard to default layout"));

    await waitFor(() =>
      expect(screen.getByText("Stub QuickStats")).toBeInTheDocument(),
    );
    expect(localStorage.getItem("db_layout_v14")).toBeNull();
    expect(localStorage.getItem("db_visibility_v12")).toBeNull();
  });

  it("falls back to the default visibility when localStorage has malformed JSON", async () => {
    localStorage.setItem("db_visibility_v12", "{not valid json");
    renderDashboard();
    expect(await screen.findByText("Stub QuickStats")).toBeInTheDocument();
    expect(screen.getByText("Stub KycStatus")).toBeInTheDocument();
  });
});
