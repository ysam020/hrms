import { render, screen } from "@testing-library/react";
import HiringManagerTable from "@web/features/analytics/charts/HiringManagerTable";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

describe("HiringManagerTable", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<HiringManagerTable theme="light" />);
    expect(
      screen.getByText("Loading manager performance..."),
    ).toBeInTheDocument();
  });

  it("shows an info alert when there is no data", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<HiringManagerTable theme="light" />);
    expect(
      screen.getByText("No hiring manager data available"),
    ).toBeInTheDocument();
  });

  it("renders each manager's stats, falling back to 'Unknown' for a missing name", () => {
    mockUseFetchData.mockReturnValue({
      data: [
        {
          hiringManager: "Jane Doe",
          totalJobs: 5,
          activeJobs: 2,
          closedJobs: 3,
          successRate: 80,
        },
        {
          hiringManager: null,
          totalJobs: 1,
          activeJobs: 1,
          closedJobs: 0,
          successRate: 40,
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<HiringManagerTable theme="light" />);

    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Unknown")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("40%")).toBeInTheDocument();
  });
});
