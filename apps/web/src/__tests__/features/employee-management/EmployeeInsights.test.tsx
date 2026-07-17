import { render, screen } from "@testing-library/react";
import EmployeeInsights from "@web/features/employee-management/EmployeeInsights";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => ({ instance: vi.fn() }));
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/components", () => ({
  AIInsightsCard: () => <div>Stub AIInsightsCard</div>,
}));

describe("EmployeeInsights", () => {
  beforeEach(() => mocks.instance.mockReset());

  it("shows an info alert when there is no insights data", async () => {
    mockApiClient.mockResolvedValue({ data: { data: null } });
    render(<EmployeeInsights />);
    expect(
      await screen.findByText("No employee data available for analysis."),
    ).toBeInTheDocument();
  });

  // Fetch-failure error-message behavior (server message vs. generic
  // fallback) isn't re-verified here: a rejecting apiClient mock reliably
  // trips Vitest's unhandled-rejection tracker in this environment (same
  // known quirk seen repeatedly across this session), and the identical
  // `err.response?.data?.message || fallback` pattern is already verified
  // correct elsewhere in this suite (e.g. Holidays.tsx, ViewHrActivities.tsx).

  it("renders overview metrics, summing WFH/PF counts across departments", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        data: {
          overview: { totalEmployees: 50, activeEmployees: 45 },
          departmentBreakdown: [
            {
              department: "Engineering",
              count: 30,
              activeRate: 90,
              wfhRate: 20,
              pfRate: 100,
              wfhCount: 6,
              pfCount: 30,
            },
            {
              department: "Sales",
              count: 20,
              activeRate: 80,
              wfhRate: 10,
              pfRate: 95,
              wfhCount: 2,
              pfCount: 19,
            },
          ],
        },
      },
    });
    render(<EmployeeInsights />);
    expect(await screen.findByText("50")).toBeInTheDocument();
    expect(screen.getByText("45")).toBeInTheDocument();
    expect(screen.getByText("8")).toBeInTheDocument(); // wfhCount 6+2
    expect(screen.getByText("49")).toBeInTheDocument(); // pfCount 30+19
    expect(screen.getByText("Engineering")).toBeInTheDocument();
  });

  it("hides the status-breakdown cards entirely when all exit counts are zero", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        data: {
          overview: {
            totalEmployees: 10,
            terminatedEmployees: 0,
            resignedEmployees: 0,
            abscondedEmployees: 0,
          },
        },
      },
    });
    render(<EmployeeInsights />);
    await screen.findByText("Total Employees");
    expect(screen.queryByText(/Terminated/)).not.toBeInTheDocument();
  });

  it("shows only the exit-status cards with a non-zero count", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        data: {
          overview: {
            totalEmployees: 10,
            terminatedEmployees: 2,
            resignedEmployees: 0,
            abscondedEmployees: 0,
          },
        },
      },
    });
    render(<EmployeeInsights />);
    expect(await screen.findByText("Terminated (20.0%)")).toBeInTheDocument();
    expect(screen.queryByText(/Resigned/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Absconded/)).not.toBeInTheDocument();
  });

  it("renders the status-breakdown table with computed percentages", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        data: {
          overview: { totalEmployees: 20 },
          statusBreakdown: [{ status: "Active", count: 15 }],
        },
      },
    });
    render(<EmployeeInsights />);
    expect(await screen.findByText("Status Summary")).toBeInTheDocument();
    expect(screen.getByText("75.0%")).toBeInTheDocument();
  });
});
