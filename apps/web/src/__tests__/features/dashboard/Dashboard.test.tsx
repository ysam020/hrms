import { render, screen } from "@testing-library/react";
import Dashboard from "@web/features/dashboard/Dashboard";
import { UserContext } from "@web/app/providers/UserContext";
import { ThemeContext } from "@web/app/providers/ThemeContext";

vi.mock("@web/app/providers/DashboardContext", () => ({
  DashboardProvider: ({ children }: any) => <>{children}</>,
  useDashboard: () => ({ data: {}, loading: {}, refetch: vi.fn() }),
}));

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

function renderDashboard() {
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
  it("renders all widgets in the fixed default arrangement", async () => {
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
});
