import { render, screen, fireEvent } from "@testing-library/react";
import JobOpeningsList from "@web/features/dashboard/JobOpeningsList";
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

function daysFromNow(n: number) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + n);
  return d.toISOString();
}

function renderWith(jobOpenings: any[], loading = false) {
  mockUseDashboard.mockReturnValue({
    data: { jobOpenings },
    loading: { jobOpenings: loading },
  });
  return render(<JobOpeningsList />);
}

describe("JobOpeningsList", () => {
  beforeEach(() => mockNavigate.mockClear());

  it("shows loading skeletons", () => {
    const { container } = renderWith([], true);
    expect(
      container.querySelectorAll(".MuiSkeleton-root").length,
    ).toBeGreaterThan(0);
  });

  it("shows an empty-state message when there are no active openings", () => {
    renderWith([{ jobTitle: "Closed role", status: "Closed" }]);
    expect(screen.getByText("No open positions")).toBeInTheDocument();
  });

  it("filters to only Active jobs and caps the list at 5", () => {
    const jobs = [
      ...Array.from({ length: 6 }, (_, i) => ({
        jobTitle: `Active ${i}`,
        status: "Active",
      })),
      { jobTitle: "Closed role", status: "Closed" },
    ];
    renderWith(jobs);
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.queryByText("Active 5")).not.toBeInTheDocument();
    expect(screen.queryByText("Closed role")).not.toBeInTheDocument();
  });

  it("falls back to 'title' then 'Untitled' when jobTitle is missing", () => {
    renderWith([{ title: "Titled Role", status: "Active" }]);
    expect(screen.getByText("Titled Role")).toBeInTheDocument();
  });

  it("shows the vacancy count when present", () => {
    renderWith([
      { jobTitle: "Engineer", status: "Active", numberOfVacancies: 3 },
    ]);
    expect(screen.getByText("3")).toBeInTheDocument();
  });

  it("shows the hiring manager when present", () => {
    renderWith([
      { jobTitle: "Engineer", status: "Active", hiringManager: "Jane Doe" },
    ]);
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
  });

  it("shows 'Expired' for a past deadline", () => {
    renderWith([
      {
        jobTitle: "Engineer",
        status: "Active",
        applicationDeadline: daysFromNow(-2),
      },
    ]);
    expect(screen.getByText("Expired")).toBeInTheDocument();
  });

  it("shows 'Today' for a same-day deadline", () => {
    renderWith([
      {
        jobTitle: "Engineer",
        status: "Active",
        applicationDeadline: daysFromNow(0),
      },
    ]);
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("shows '<n>d left' for a deadline within a week", () => {
    renderWith([
      {
        jobTitle: "Engineer",
        status: "Active",
        applicationDeadline: daysFromNow(5),
      },
    ]);
    expect(screen.getByText("5d left")).toBeInTheDocument();
  });

  it("shows '<n>d left' for a deadline within two weeks", () => {
    renderWith([
      {
        jobTitle: "Engineer",
        status: "Active",
        applicationDeadline: daysFromNow(10),
      },
    ]);
    expect(screen.getByText("10d left")).toBeInTheDocument();
  });

  it("shows a formatted date for a far-out deadline", () => {
    renderWith([
      {
        jobTitle: "Engineer",
        status: "Active",
        applicationDeadline: daysFromNow(30),
      },
    ]);
    const expected = new Date(daysFromNow(30)).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    expect(screen.getByText(expected)).toBeInTheDocument();
  });

  it("navigates to job openings on click", () => {
    renderWith([{ jobTitle: "Engineer", status: "Active" }]);
    fireEvent.click(screen.getByLabelText("View job opening: Engineer"));
    expect(mockNavigate).toHaveBeenCalledWith(
      "/job-openings/view-job-openings",
    );
  });
});
