import { render, screen } from "@testing-library/react";
import MyWorkspace from "@web/features/dashboard/MyWorkspace";
import { UserContext } from "@web/app/providers/UserContext";
import { useDashboard } from "@web/app/providers/DashboardContext";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@web/app/providers/DashboardContext", () => ({
  useDashboard: vi.fn(),
}));
const mockUseDashboard = useDashboard as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/features/dashboard/my-workspace/AttendanceTodaySection", () => ({
  AttendanceTodaySection: (props: any) => (
    <div>
      <span>workingHours:{props.workingHoursToday ?? "null"}</span>
      <span>checkIn:{props.todayRecord?.checkIn ?? "none"}</span>
    </div>
  ),
}));
vi.mock("@web/features/dashboard/my-workspace/MonthStatsSection", () => ({
  MonthStatsSection: (props: any) => (
    <div>
      <span>corrColor:{props.corrColor}</span>
      <span>correctionPct:{props.correctionPct}</span>
      <span>pendingCount:{props.pendingCount}</span>
    </div>
  ),
}));
vi.mock("@web/features/dashboard/my-workspace/QuickActionsSection", () => ({
  QuickActionsSection: () => <div>QuickActions</div>,
}));
vi.mock("@web/features/dashboard/my-workspace/UpcomingEventsSection", () => ({
  UpcomingEventsSection: (props: any) => (
    <div>
      {props.upcoming.map((u: any, i: number) => (
        <span key={i}>{u.label}</span>
      ))}
    </div>
  ),
}));

function renderWith(data: any = {}, user: any = { first_name: "Jane" }) {
  mockUseDashboard.mockReturnValue({
    data,
    loading: {
      attendances: false,
      attendanceSummary: false,
      pendingLeaves: false,
      calendarEvents: false,
      holidays: false,
    },
  });
  return render(
    <UserContext.Provider value={{ user } as any}>
      <MyWorkspace isDark={false} />
    </UserContext.Provider>,
  );
}

describe("MyWorkspace", () => {
  it("greets the user by first name, falling back to username then 'there'", () => {
    renderWith({}, { first_name: "Jane" });
    expect(screen.getByText("Jane 👋")).toBeInTheDocument();

    renderWith({}, { username: "jdoe" });
    expect(screen.getByText("jdoe 👋")).toBeInTheDocument();

    renderWith({}, null);
    expect(screen.getByText("there 👋")).toBeInTheDocument();
  });

  it("shows designation and department joined when both are present", () => {
    renderWith(
      {},
      { first_name: "Jane", designation: "Engineer", department: "Platform" },
    );
    expect(screen.getByText("Engineer · Platform")).toBeInTheDocument();
  });

  it("finds today's attendance record from the attendances list", () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    renderWith({
      attendances: [{ date: `${todayStr}T00:00:00`, checkIn: "09:00" }],
    });
    expect(screen.getByText("checkIn:09:00")).toBeInTheDocument();
  });

  it("computes working hours today from check-in/check-out", () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    renderWith({
      attendances: [
        {
          date: todayStr,
          checkIn: `${todayStr}T09:00:00`,
          checkOut: `${todayStr}T17:30:00`,
        },
      ],
    });
    expect(screen.getByText("workingHours:8h 30m")).toBeInTheDocument();
  });

  it("does not compute working hours when check-out is missing", () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    renderWith({
      attendances: [{ date: todayStr, checkIn: `${todayStr}T09:00:00` }],
    });
    expect(screen.getByText("workingHours:null")).toBeInTheDocument();
  });

  it("colors the correction bar green under 60%, amber from 60%, and red at 100%", () => {
    renderWith({
      attendanceSummary: { correctionsUsed: 1, maxCorrectionsPerMonth: 5 },
    });
    expect(screen.getByText("corrColor:#10b981")).toBeInTheDocument();

    renderWith({
      attendanceSummary: { correctionsUsed: 3, maxCorrectionsPerMonth: 5 },
    });
    expect(screen.getByText("corrColor:#f59e0b")).toBeInTheDocument();

    renderWith({
      attendanceSummary: { correctionsUsed: 5, maxCorrectionsPerMonth: 5 },
    });
    expect(screen.getByText("corrColor:#ef4444")).toBeInTheDocument();
  });

  it("passes through the pending-leaves count", () => {
    renderWith({ pendingLeaves: [{}, {}, {}] });
    expect(screen.getByText("pendingCount:3")).toBeInTheDocument();
  });

  it("merges and sorts upcoming events and holidays, capped at 8, dropping past ones", () => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const future = (n: number) => {
      const d = new Date();
      d.setDate(d.getDate() + n);
      return d.toISOString().slice(0, 10);
    };
    renderWith({
      calendarEvents: [
        { date: future(3), title: "Later event" },
        { date: "2000-01-01", title: "Past event" },
      ],
      holidays: [{ date: future(1), name: "Sooner holiday" }],
    });
    const labels = ["Later event", "Sooner holiday"];
    labels.forEach((l) => expect(screen.getByText(l)).toBeInTheDocument());
    expect(screen.queryByText("Past event")).not.toBeInTheDocument();
  });
});
