import { render, screen, fireEvent } from "@testing-library/react";
import AttendanceInsights from "@web/features/attendance/Insights";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("primereact/dropdown", () => ({
  Dropdown: (props: any) => (
    <select
      aria-label={props.placeholder}
      value={props.value ?? ""}
      onChange={(e) => props.onChange({ value: e.target.value })}
    >
      {(props.options || []).map((opt: any) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@web/shared/components", () => ({
  AIInsightsCard: (props: any) => (
    <div>Stub AIInsightsCard for {props.module}</div>
  ),
}));

describe("AttendanceInsights", () => {
  it("shows a spinner while loading", () => {
    mockUseFetchData.mockReturnValue({ data: null, loading: true });
    const { container } = render(<AttendanceInsights />);
    expect(
      container.querySelector(".MuiCircularProgress-root"),
    ).toBeInTheDocument();
  });

  it("shows an info alert when there is no data", () => {
    mockUseFetchData.mockReturnValue({ data: null, loading: false });
    render(<AttendanceInsights />);
    expect(
      screen.getByText(/No attendance insights available/),
    ).toBeInTheDocument();
  });

  it("renders primary metrics, status distribution, and risk assessment", () => {
    mockUseFetchData.mockReturnValue({
      data: {
        primaryMetrics: {
          overallAttendanceRate: 92,
          averageWorkingHours: 8.5,
          correctionRate: 3,
          automationRate: 76,
          statusDistribution: {
            present: 20,
            halfDay: 2,
            leave: 1,
            weekOff: 4,
            holiday: 1,
          },
        },
        employeeRiskAssessment: [
          {
            userId: "u1",
            employeeName: "Jane Doe",
            department: "Engineering",
            riskLevel: "High",
            attendanceRate: 60,
            avgWorkingHours: 6,
            correctionFrequency: 10,
            riskScore: 35,
          },
        ],
        teamPerformance: [
          {
            department: "Engineering",
            employeeCount: 12,
            attendanceRate: 88,
            avgWorkingHours: 8,
            correctionRate: 2,
          },
        ],
        trendAnalysis: {
          trendDirection: "improving",
          weeklyTrends: [
            { week: 1, attendanceRate: 80 },
            { week: 2, attendanceRate: 90 },
          ],
        },
        attendancePatterns: {
          peakHours: [{ hour: 9, count: 15 }],
        },
      },
      loading: false,
    });

    render(<AttendanceInsights />);

    expect(screen.getByText("Attendance Insights")).toBeInTheDocument();
    expect(screen.getByText("92%")).toBeInTheDocument();
    expect(screen.getByText("8.5h")).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getAllByText("Engineering").length).toBeGreaterThan(0);
    expect(screen.getByText("High")).toBeInTheDocument();
    expect(screen.getByText("Week 1")).toBeInTheDocument();
    expect(screen.getByText("9:00")).toBeInTheDocument();
    expect(screen.getByText("15 arrivals")).toBeInTheDocument();
    expect(
      screen.getByText("Stub AIInsightsCard for attendance"),
    ).toBeInTheDocument();
  });

  it("falls back to zero/defaults when metrics are missing and hides optional sections", () => {
    mockUseFetchData.mockReturnValue({
      data: { primaryMetrics: {}, employeeRiskAssessment: [] },
      loading: false,
    });
    render(<AttendanceInsights />);

    expect(screen.getAllByText("0%").length).toBeGreaterThan(0);
    expect(
      screen.getByText("No risk assessment data available"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("No weekly trend data available"),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("Team Performance by Department"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("Peak Arrival Hours")).not.toBeInTheDocument();
  });

  it("re-fetches insights when the period dropdown changes", () => {
    mockUseFetchData.mockReturnValue({
      data: { primaryMetrics: {} },
      loading: false,
    });
    render(<AttendanceInsights />);

    fireEvent.change(screen.getByLabelText("Select Period"), {
      target: { value: "last_month" },
    });

    expect(mockUseFetchData).toHaveBeenLastCalledWith(
      "/attendance-insights?period=last_month",
      "get",
      ["last_month"],
      null,
      "Failed to fetch attendance insights",
    );
  });
});
