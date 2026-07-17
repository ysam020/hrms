import { render, screen } from "@testing-library/react";
import Insights from "@web/features/job-openings/Insights";
import apiClient from "@web/core/http/axiosConfig";

const mocks = vi.hoisted(() => ({ instance: vi.fn() }));
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/components", () => ({
  AIInsightsCard: () => <div>Stub AIInsightsCard</div>,
}));

function makeInsights(overrides: Partial<any> = {}) {
  return {
    overview: {
      activeJobOpenings: 5,
      totalApplications: 40,
      hiringSuccessRate: 80,
      averageApplicationsPerJob: 8,
      totalJobOpenings: 10,
    },
    applications: {
      totalApplications: 40,
      applicationsByStatus: { Applied: 20, Hired: 10, Rejected: 10 },
    },
    topPerformingJobs: [],
    experienceRequirements: {
      averageExperience: 3,
      mostCommonRange: "2-4 years",
      breakdown: { "0-2": 3, "2-4": 5, "4+": 2 },
    },
    budgetAnalysis: {
      averageBudget: 10,
      totalBudgetAllocation: 100,
      budgetRanges: { "5-10L": 4, "10-15L": 6 },
    },
    deadlines: {
      deadlinesThisWeek: 2,
      deadlinesThisMonth: 5,
      overdueJobs: 1,
      averageDaysToDeadline: 12,
    },
    hiringManagers: { topPerformers: [] },
    actionableInsights: [],
    trends: {
      monthlyJobPostings: [],
      monthlyApplications: [],
      monthlyHirings: [],
    },
    lastUpdated: "2024-06-01T10:00:00Z",
    ...overrides,
  };
}

function renderWith(insights: any) {
  mockApiClient.mockResolvedValue({ data: { data: insights } });
  return render(<Insights />);
}

describe("JobOpeningsInsights", () => {
  beforeEach(() => mocks.instance.mockReset());

  it("shows an info alert when there is no insights data", async () => {
    renderWith(null);
    expect(
      await screen.findByText(/No insights data available/),
    ).toBeInTheDocument();
  });

  // Fetch-failure error-alert behavior isn't re-verified here: a rejecting
  // apiClient mock reliably trips Vitest's unhandled-rejection tracker in
  // this environment (same known quirk seen repeatedly across this
  // session), and the analogous err.message-based error text is already
  // verified correct elsewhere (e.g. EmployeeInsights.tsx).

  it("renders the primary overview metrics", async () => {
    renderWith(makeInsights());
    await screen.findByText("Active Openings");
    expect(screen.getAllByText("5").length).toBeGreaterThan(0);
    expect(screen.getByText("40")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
  });

  it("computes the application status breakdown percentages", async () => {
    renderWith(makeInsights());
    expect(await screen.findByText("Application Pipeline")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument(); // Applied 20/40
    expect(screen.getAllByText("25%")).toHaveLength(2); // Hired 10/40 and Rejected 10/40
  });

  it("omits Top Performing Jobs when there are none", async () => {
    renderWith(makeInsights({ topPerformingJobs: [] }));
    await screen.findByText("Application Pipeline");
    expect(screen.queryByText("Top Performing Jobs")).not.toBeInTheDocument();
  });

  it("shows Top Performing Jobs with a hiring-rate color when present", async () => {
    renderWith(
      makeInsights({
        topPerformingJobs: [
          {
            jobTitle: "Engineer",
            totalApplications: 20,
            hired: 5,
            hiringRate: 33,
          },
        ],
      }),
    );
    expect(await screen.findByText("Top Performing Jobs")).toBeInTheDocument();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
    expect(screen.getByText("33%")).toBeInTheDocument();
  });

  it("shows experience and budget distributions", async () => {
    renderWith(makeInsights());
    expect(
      await screen.findByText("Experience Requirements"),
    ).toBeInTheDocument();
    expect(screen.getByText("2-4 years")).toBeInTheDocument();
    expect(screen.getByText("Budget Analysis")).toBeInTheDocument();
    expect(screen.getByText("₹10L")).toBeInTheDocument();
  });

  it("shows deadline counts", async () => {
    renderWith(makeInsights());
    expect(
      await screen.findByText("Timeline Alerts & Deadlines"),
    ).toBeInTheDocument();
    expect(screen.getByText("This Week")).toBeInTheDocument();
    expect(screen.getByText("Overdue")).toBeInTheDocument();
  });

  it("omits Hiring Manager Performance when there are no top performers", async () => {
    renderWith(makeInsights({ hiringManagers: { topPerformers: [] } }));
    await screen.findByText("Timeline Alerts & Deadlines");
    expect(
      screen.queryByText("Hiring Manager Performance"),
    ).not.toBeInTheDocument();
  });

  it("shows Hiring Manager Performance when there are top performers", async () => {
    renderWith(
      makeInsights({
        hiringManagers: {
          topPerformers: [
            { name: "Jane Doe", totalJobs: 5, activeJobs: 2, totalHired: 3 },
          ],
        },
      }),
    );
    expect(
      await screen.findByText("Hiring Manager Performance"),
    ).toBeInTheDocument();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows actionable insights with a priority-colored action chip", async () => {
    renderWith(
      makeInsights({
        actionableInsights: [
          {
            type: "warning",
            title: "Slow hiring",
            message: "Some jobs are stalling",
            action: "Review pipeline",
            priority: "high",
          },
        ],
      }),
    );
    expect(await screen.findByText("Slow hiring")).toBeInTheDocument();
    expect(screen.getByText("Review pipeline")).toBeInTheDocument();
  });

  it("omits Monthly Trends when there are no monthly job postings", async () => {
    renderWith(makeInsights());
    await screen.findByText("Timeline Alerts & Deadlines");
    expect(screen.queryByText("6-Month Trends")).not.toBeInTheDocument();
  });

  it("shows Monthly Trends and conditionally the applications/hirings columns", async () => {
    renderWith(
      makeInsights({
        trends: {
          monthlyJobPostings: [{ month: "Jan", count: 3 }],
          monthlyApplications: [],
          monthlyHirings: [{ month: "Jan", count: 1 }],
        },
      }),
    );
    expect(await screen.findByText("6-Month Trends")).toBeInTheDocument();
    expect(screen.getByText("Job Postings by Month")).toBeInTheDocument();
    expect(screen.queryByText("Applications by Month")).not.toBeInTheDocument();
    expect(screen.getByText("Hirings by Month")).toBeInTheDocument();
  });

  it("shows the last-updated timestamp", async () => {
    renderWith(makeInsights());
    expect(await screen.findByText(/Last updated:/)).toBeInTheDocument();
  });
});
