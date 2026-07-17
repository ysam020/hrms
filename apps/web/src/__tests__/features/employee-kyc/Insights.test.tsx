import { render, screen } from "@testing-library/react";
import Insights from "@web/features/employee-kyc/Insights";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => ({ instance: vi.fn() }));
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/components", () => ({
  AIInsightsCard: () => <div>Stub AIInsightsCard</div>,
}));

function renderWith(setAlert = vi.fn()) {
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <Insights />
    </AlertContext.Provider>,
  );
}

describe("KycInsights", () => {
  beforeEach(() => mocks.instance.mockReset());

  it("shows an info alert when there is no insights data", async () => {
    mockApiClient.mockResolvedValue({ data: { data: null } });
    renderWith();
    expect(
      await screen.findByText(
        "No KYC insights available. Please ensure employee data exists.",
      ),
    ).toBeInTheDocument();
  });

  it("renders the primary metrics from the overview", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        data: {
          overview: {
            completionRate: 82.567,
            pendingKyc: 5,
            totalEmployees: 40,
            approvedKyc: 30,
            rejectedKyc: 3,
            incompleteKyc: 2,
          },
          insights: { averageProcessingTime: 4 },
        },
      },
    });
    renderWith();
    expect(await screen.findByText("82.57%")).toBeInTheDocument();
    expect(screen.getByText("Total Employees")).toBeInTheDocument();
    expect(screen.getByText("40")).toBeInTheDocument();
  });

  it("defaults missing overview fields to 0", async () => {
    mockApiClient.mockResolvedValue({ data: { data: { overview: {} } } });
    renderWith();
    expect(await screen.findByText("0%")).toBeInTheDocument();
  });

  it("renders the detailed status breakdown only when provided", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        data: {
          overview: {},
          statusBreakdown: [{ status: "Approved", count: 12 }],
        },
      },
    });
    renderWith();
    expect(
      await screen.findByText("Detailed Status Breakdown"),
    ).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("omits the status breakdown section when it is empty", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { overview: {}, statusBreakdown: [] } },
    });
    renderWith();
    await screen.findByText("KYC Status Distribution");
    expect(
      screen.queryByText("Detailed Status Breakdown"),
    ).not.toBeInTheDocument();
  });

  it("renders the department breakdown table when provided", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        data: {
          overview: {},
          departmentBreakdown: [
            {
              department: "Engineering",
              total: 10,
              completionRate: 90,
              approved: 9,
              pending: 1,
              rejected: 0,
              incomplete: 0,
            },
          ],
        },
      },
    });
    renderWith();
    expect(
      await screen.findByText("Department-wise KYC Performance"),
    ).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("90%")).toBeInTheDocument();
  });

  it("shows only the most recent 10 completion-trend entries", async () => {
    const completionTrends = Array.from({ length: 15 }, (_, i) => ({
      date: `2024-01-${String(i + 1).padStart(2, "0")}`,
      completed: i,
    }));
    mockApiClient.mockResolvedValue({
      data: { data: { overview: {}, completionTrends } },
    });
    renderWith();
    await screen.findByText("Recent Completion Trends (Last 30 Days)");
    expect(screen.getByText("5 completed")).toBeInTheDocument();
    expect(screen.getByText("14 completed")).toBeInTheDocument();
    expect(screen.queryByText("0 completed")).not.toBeInTheDocument();
  });

  it("renders key insights and the last-updated timestamp when present", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        data: {
          overview: {},
          insights: {
            mostCommonStatus: "Approved",
            departmentWithHighestCompletion: "Engineering",
            averageProcessingTime: 3,
            documentCompletionRate: 95,
          },
          lastUpdated: "2024-06-01T10:00:00Z",
        },
      },
    });
    renderWith();
    expect(await screen.findByText("Key Insights")).toBeInTheDocument();
    expect(screen.getByText("Most Common Status")).toBeInTheDocument();
    expect(screen.getByText(/Last updated:/)).toBeInTheDocument();
  });
});
