import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import QuickStats from "@web/features/dashboard/QuickStats";
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

const future = { v7_startTransition: true, v7_relativeSplatPath: true };
const renderQuickStats = () =>
  render(
    <MemoryRouter future={future}>
      <QuickStats />
    </MemoryRouter>,
  );

const LOADED_STATE = {
  data: {
    holidays: [{ date: "2099-01-01" }, { date: "2000-01-01" }],
    jobOpenings: [
      { status: "Active" },
      { status: "Active" },
      { status: "Closed" },
    ],
    pendingLeaves: [{}, {}, {}],
    employeeInsights: { overview: { totalEmployees: 42 } },
  },
  loading: {
    employeeInsights: false,
    pendingLeaves: false,
    jobOpenings: false,
    holidays: false,
  },
  refetch: vi.fn(),
};

describe("QuickStats", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("shows a skeleton for any tile still loading", () => {
    mockUseDashboard.mockReturnValue({
      data: { holidays: [], jobOpenings: [], pendingLeaves: [] },
      loading: {
        employeeInsights: true,
        pendingLeaves: true,
        jobOpenings: true,
        holidays: true,
      },
      refetch: vi.fn(),
    });
    renderQuickStats();
    expect(
      screen.getByLabelText(/Total Employees: loading/),
    ).toBeInTheDocument();
  });

  it("counts only future-dated holidays as upcoming", () => {
    mockUseDashboard.mockReturnValue(LOADED_STATE);
    renderQuickStats();
    expect(screen.getByLabelText("Upcoming Holidays: 1")).toBeInTheDocument();
  });

  it("counts only Active job openings", () => {
    mockUseDashboard.mockReturnValue(LOADED_STATE);
    renderQuickStats();
    expect(screen.getByLabelText("Open Positions: 2")).toBeInTheDocument();
  });

  it("shows the pending leave count and total employee count", () => {
    mockUseDashboard.mockReturnValue(LOADED_STATE);
    renderQuickStats();
    expect(screen.getByLabelText("Pending Leaves: 3")).toBeInTheDocument();
    expect(screen.getByLabelText("Total Employees: 42")).toBeInTheDocument();
  });

  it("falls back to the loading aria-label when a non-loading value is still null", () => {
    // Note: the component's aria-label uses `stat.value ?? "loading"` (not
    // "—" like the visible Typography text) — a null-but-not-actually-loading
    // value is announced as "loading" to screen readers either way.
    mockUseDashboard.mockReturnValue({
      ...LOADED_STATE,
      data: { ...LOADED_STATE.data, employeeInsights: null },
    });
    renderQuickStats();
    expect(
      screen.getByLabelText("Total Employees: loading"),
    ).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("navigates to the tile's target path on click", () => {
    mockUseDashboard.mockReturnValue(LOADED_STATE);
    renderQuickStats();
    fireEvent.click(screen.getByLabelText("Pending Leaves: 3"));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/attendance/view-leave-applications",
    );
  });

  it("navigates on Enter key press for accessibility", () => {
    mockUseDashboard.mockReturnValue(LOADED_STATE);
    renderQuickStats();
    fireEvent.keyDown(screen.getByLabelText("Open Positions: 2"), {
      key: "Enter",
    });
    expect(mockNavigate).toHaveBeenCalledWith(
      "/job-openings/view-job-openings",
    );
  });
});
