import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import Analytics from "@web/features/analytics/Analytics";
import { ThemeContext } from "@web/app/providers/ThemeContext";

vi.mock("@web/features/analytics/charts/LeaveApprovalGauge", () => ({
  default: () => <div>Chart:LeaveApprovalGauge</div>,
}));
vi.mock("@web/features/analytics/charts/AttendanceTrends", () => ({
  default: () => <div>Chart:AttendanceTrends</div>,
}));
vi.mock("@web/features/analytics/charts/WorkingHoursHistogram", () => ({
  default: () => <div>Chart:WorkingHoursHistogram</div>,
}));
vi.mock("@web/features/analytics/charts/LeaveTypeBar", () => ({
  default: () => <div>Chart:LeaveTypeBar</div>,
}));
vi.mock("@web/features/analytics/charts/LeavePatternHeatmap", () => ({
  default: () => <div>Chart:LeavePatternHeatmap</div>,
}));
vi.mock("@web/features/analytics/charts/JobStatusPie", () => ({
  default: () => <div>Chart:JobStatusPie</div>,
}));
vi.mock("@web/features/analytics/charts/ApplicationsByRole", () => ({
  default: () => <div>Chart:ApplicationsByRole</div>,
}));
vi.mock("@web/features/analytics/charts/HiringFunnel", () => ({
  default: () => <div>Chart:HiringFunnel</div>,
}));
vi.mock("@web/features/analytics/charts/HiringManagerTable", () => ({
  default: () => <div>Chart:HiringManagerTable</div>,
}));
vi.mock("@web/features/analytics/charts/SalaryDistributionBox", () => ({
  default: () => <div>Chart:SalaryDistributionBox</div>,
}));
vi.mock("@web/features/analytics/charts/CompensationBreakdown", () => ({
  default: () => <div>Chart:CompensationBreakdown</div>,
}));
vi.mock("@web/features/analytics/charts/SalaryByDesignation", () => ({
  default: () => <div>Chart:SalaryByDesignation</div>,
}));
vi.mock("@web/features/analytics/charts/SalaryBandsHistogram", () => ({
  default: () => <div>Chart:SalaryBandsHistogram</div>,
}));
vi.mock("@web/features/analytics/charts/EmployeeStatusPie", () => ({
  default: () => <div>Chart:EmployeeStatusPie</div>,
}));
vi.mock("@web/features/analytics/charts/EmploymentTypeBreakdown", () => ({
  default: () => <div>Chart:EmploymentTypeBreakdown</div>,
}));
vi.mock("@web/features/analytics/charts/TenureDistribution", () => ({
  default: () => <div>Chart:TenureDistribution</div>,
}));
vi.mock("@web/features/analytics/charts/HeadcountGrowth", () => ({
  default: () => <div>Chart:HeadcountGrowth</div>,
}));
vi.mock("@web/features/analytics/charts/EmployeeDepartments", () => ({
  default: () => <div>Chart:EmployeeDepartments</div>,
}));
vi.mock("@web/features/analytics/charts/EmployeeDesignations", () => ({
  default: () => <div>Chart:EmployeeDesignations</div>,
}));
vi.mock("@web/features/analytics/charts/AgeDistribution", () => ({
  default: () => <div>Chart:AgeDistribution</div>,
}));
vi.mock("@web/features/analytics/charts/JoiningInfo", () => ({
  default: () => <div>Chart:JoiningInfo</div>,
}));

function renderAnalytics(path = "/analytics") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeContext.Provider
        value={{ theme: "light", toggleTheme: vi.fn() } as any}
      >
        <Analytics />
      </ThemeContext.Provider>
    </MemoryRouter>,
  );
}

describe("Analytics", () => {
  it("shows all four tabs", () => {
    renderAnalytics();
    expect(screen.getByRole("tab", { name: "Workforce" })).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Leave & Attendance" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("tab", { name: "Recruitment" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Salary" })).toBeInTheDocument();
  });

  it("shows the Workforce charts by default", async () => {
    renderAnalytics();
    expect(
      await screen.findByText("Chart:EmployeeStatusPie"),
    ).toBeInTheDocument();
    expect(screen.getByText("Chart:HeadcountGrowth")).toBeInTheDocument();
  });

  it("switches to the Recruitment tab's own set of charts", async () => {
    renderAnalytics();
    fireEvent.click(screen.getByRole("tab", { name: "Recruitment" }));
    expect(await screen.findByText("Chart:JobStatusPie")).toBeInTheDocument();
    expect(screen.getByText("Chart:HiringFunnel")).toBeInTheDocument();
  });

  it("switches to the Salary tab's own set of charts", async () => {
    renderAnalytics();
    fireEvent.click(screen.getByRole("tab", { name: "Salary" }));
    expect(
      await screen.findByText("Chart:SalaryDistributionBox"),
    ).toBeInTheDocument();
    expect(screen.getByText("Chart:SalaryBandsHistogram")).toBeInTheDocument();
  });
});
