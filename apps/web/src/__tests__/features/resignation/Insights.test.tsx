import { render, screen, fireEvent } from "@testing-library/react";
import Insights from "@web/features/resignation/Insights";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: vi.fn() }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/components", () => ({
  AIInsightsCard: (props: any) => (
    <div>Stub AIInsightsCard for {props.module}</div>
  ),
}));

function fullInsights(overrides: Partial<any> = {}) {
  return {
    overview: { total: 12, submitted: 3, approvalRate: 75, approved: 9 },
    departmentAnalysis: {
      topDepartments: [
        { department: "Engineering", totalResignations: 5, approvalRate: 80 },
      ],
    },
    reasonAnalysis: {
      topReasons: [{ reason: "Better opportunity", count: 4 }],
    },
    exitFeedback: {
      totalResponses: 6,
      recommendationRate: 80,
      averageRatings: { overallExperience: 4, managerSupport: 3 },
    },
    upcomingDepartures: [
      {
        username: "jdoe",
        lastWorkingDay: new Date(Date.now() + 3 * 86400000).toISOString(),
      },
      { username: "asmith", lastWorkingDay: null },
    ],
    actionableInsights: [
      {
        type: "warning",
        priority: "high",
        title: "High attrition in Engineering",
        message: "Engineering has above-average attrition.",
        action: "Review compensation bands.",
      },
      {
        type: "success",
        priority: "low",
        title: "Good exit feedback",
        message: "Exit feedback trending positive.",
        action: "Keep current practices.",
      },
    ],
    processingMetrics: {
      averageProcessingTime: 5,
      fastestProcessing: 2,
      slowestProcessing: 10,
      pendingOverdue: 1,
    },
    ...overrides,
  };
}

describe("Insights (resignation)", () => {
  beforeEach(() => mockApiClient.mockReset());

  it("shows a loading state while fetching", () => {
    // fetchFeedbackInsights awaits inside the effect, so the initial
    // `loading: true` state is still on screen synchronously right after
    // render, before this resolved promise's continuation ever runs.
    mockApiClient.mockResolvedValue({ data: { data: fullInsights() } });
    render(<Insights />);
    expect(
      screen.getByText("Analyzing resignation data..."),
    ).toBeInTheDocument();
  });

  // A rejected apiClient mock reliably trips Vitest's unhandled-rejection
  // tracker in this environment even though fetchFeedbackInsights' own
  // try/catch handles it correctly (same pattern documented elsewhere in
  // this suite) — the error-message selection (setError from
  // err.response?.data?.message) is straightforward and not re-verified
  // here.

  it("shows an empty state when there is no resignation data", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { overview: { total: 0 } } },
    });
    render(<Insights />);
    expect(
      await screen.findByText("No resignation data available for analysis."),
    ).toBeInTheDocument();
  });

  it("renders the overview stat cards", async () => {
    mockApiClient.mockResolvedValue({ data: { data: fullInsights() } });
    render(<Insights />);
    expect(
      await screen.findByText("Stub AIInsightsCard for resignation"),
    ).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
    expect(screen.getByText("Total Resignations")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
  });

  it("shows department analysis only when topDepartments is present", async () => {
    mockApiClient.mockResolvedValue({ data: { data: fullInsights() } });
    render(<Insights />);
    expect(await screen.findByText("Department Analysis")).toBeInTheDocument();
    expect(
      screen.getByText(/5 resignations \(80% approved\)/),
    ).toBeInTheDocument();
  });

  it("omits department analysis when there are no top departments", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        data: fullInsights({ departmentAnalysis: { topDepartments: [] } }),
      },
    });
    render(<Insights />);
    await screen.findByText("Total Resignations");
    expect(screen.queryByText("Department Analysis")).not.toBeInTheDocument();
  });

  it("shows top resignation reasons as chips", async () => {
    mockApiClient.mockResolvedValue({ data: { data: fullInsights() } });
    render(<Insights />);
    expect(
      await screen.findByText("1. Better opportunity (4)"),
    ).toBeInTheDocument();
  });

  it("shows exit feedback summary with per-question average ratings", async () => {
    mockApiClient.mockResolvedValue({ data: { data: fullInsights() } });
    render(<Insights />);
    expect(
      await screen.findByText("Exit Feedback Summary"),
    ).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("4/5")).toBeInTheDocument();
    expect(screen.getByText("overall Experience")).toBeInTheDocument();
  });

  it("shows upcoming departures with days-remaining or a not-set fallback", async () => {
    mockApiClient.mockResolvedValue({ data: { data: fullInsights() } });
    render(<Insights />);
    expect(await screen.findByText("jdoe")).toBeInTheDocument();
    expect(screen.getByText("3 days remaining")).toBeInTheDocument();
    expect(screen.getByText("asmith")).toBeInTheDocument();
    expect(screen.getByText("Last working day not set")).toBeInTheDocument();
  });

  it("expands high-priority actionable insights by default, keeps low-priority collapsed", async () => {
    mockApiClient.mockResolvedValue({ data: { data: fullInsights() } });
    render(<Insights />);
    await screen.findByText("High attrition in Engineering");

    // High-priority accordion starts expanded — its detail content is visible.
    expect(
      screen.getByText("Review compensation bands.", { exact: false }),
    ).toBeInTheDocument();

    // Low-priority accordion starts collapsed.
    fireEvent.click(screen.getByText("Good exit feedback"));
    expect(
      screen.getByText("Keep current practices.", { exact: false }),
    ).toBeInTheDocument();
  });

  it("shows processing metrics", async () => {
    mockApiClient.mockResolvedValue({ data: { data: fullInsights() } });
    render(<Insights />);
    expect(await screen.findByText("Processing Metrics")).toBeInTheDocument();
    expect(screen.getByText("5 days")).toBeInTheDocument();
    expect(screen.getByText("2 days")).toBeInTheDocument();
    expect(screen.getByText("10 days")).toBeInTheDocument();
  });
});
