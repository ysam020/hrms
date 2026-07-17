import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import LeaveBalance from "@web/features/dashboard/LeaveBalance";
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
const renderLeaveBalance = () =>
  render(
    <MemoryRouter future={future}>
      <LeaveBalance />
    </MemoryRouter>,
  );

function mockData(summary: Record<string, any> | undefined, isLoading = false) {
  mockUseDashboard.mockReturnValue({
    data: { attendanceSummary: summary },
    loading: { attendanceSummary: isLoading },
    refetch: vi.fn(),
  });
}

describe("LeaveBalance", () => {
  beforeEach(() => {
    mockNavigate.mockClear();
  });

  it("defaults every stat to 0 when there is no attendance summary yet", () => {
    mockData(undefined);
    renderLeaveBalance();
    expect(screen.getAllByText("0").length).toBeGreaterThan(0);
    // remainingCorrections defaults to 0, maxCorrectionsPerMonth defaults to 5
    expect(
      screen.getByText((_, el) => el?.textContent === "0/5 left"),
    ).toBeInTheDocument();
  });

  it("renders the actual stat values from the summary", () => {
    mockData({
      paidLeaves: 3,
      unpaidLeaves: 1,
      presents: 18,
      holidays: 2,
      weekOffs: 4,
    });
    renderLeaveBalance();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("18")).toBeInTheDocument();
  });

  it("shows remaining/max corrections", () => {
    mockData({
      correctionsUsed: 2,
      remainingCorrections: 3,
      maxCorrectionsPerMonth: 5,
    });
    renderLeaveBalance();
    expect(
      screen.getByText((_, el) => el?.textContent === "3/5 left"),
    ).toBeInTheDocument();
  });

  it("caps the correction progress bar at 100% when usage exceeds the max", () => {
    mockData({
      correctionsUsed: 8,
      remainingCorrections: 0,
      maxCorrectionsPerMonth: 5,
    });
    renderLeaveBalance();
    const bar = document.querySelector('[role="progressbar"]');
    expect(bar).toHaveAttribute("aria-valuenow", "100");
  });

  it("treats a zero max-corrections config as 0% instead of dividing by zero", () => {
    mockData({
      correctionsUsed: 0,
      remainingCorrections: 0,
      maxCorrectionsPerMonth: 0,
    });
    renderLeaveBalance();
    const bar = document.querySelector('[role="progressbar"]');
    expect(bar).toHaveAttribute("aria-valuenow", "0");
  });

  it("shows an indeterminate progress bar while loading", () => {
    mockData(undefined, true);
    renderLeaveBalance();
    const bar = document.querySelector('[role="progressbar"]');
    expect(bar).not.toHaveAttribute("aria-valuenow");
  });

  it("navigates to attendance when Apply is clicked", () => {
    mockData({});
    renderLeaveBalance();
    fireEvent.click(screen.getByText("Apply"));
    expect(mockNavigate).toHaveBeenCalledWith("/attendance");
  });
});
