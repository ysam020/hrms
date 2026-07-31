import { render, screen } from "@testing-library/react";
import ApplicationsByRole from "@web/features/analytics/charts/ApplicationsByRole";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("react-apexcharts", () => ({
  default: ({ series, height }: any) => (
    <div data-testid="apex-chart">
      <span data-testid="series">{JSON.stringify(series)}</span>
      <span data-testid="height">{height}</span>
    </div>
  ),
}));

describe("ApplicationsByRole", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<ApplicationsByRole theme="light" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an empty state when there is no data", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ApplicationsByRole theme="light" />);
    expect(
      screen.getByText("No applications data available"),
    ).toBeInTheDocument();
  });

  it("builds a 4-series stacked breakdown per job role, defaulting missing counts to 0", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        {
          jobTitle: "Engineer",
          totalApplications: 10,
          interviewing: 5,
          hired: 3,
          rejected: 1,
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ApplicationsByRole theme="light" />);

    expect(
      JSON.parse((await screen.findByTestId("series")).textContent!),
    ).toEqual([
      { name: "Total Applications", data: [10] },
      { name: "Interviewing", data: [5] },
      { name: "Hired", data: [3] },
      { name: "Rejected", data: [1] },
    ]);
  });

  it("grows the chart height with the number of job roles, with a floor of 400px", async () => {
    mockUseFetchData.mockReturnValue({
      data: Array.from({ length: 10 }, (_, i) => ({
        jobTitle: `Role ${i}`,
        totalApplications: 1,
      })),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<ApplicationsByRole theme="light" />);
    expect((await screen.findByTestId("height")).textContent).toBe(
      String(10 * 60),
    );
  });
});
