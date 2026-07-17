import { render, screen } from "@testing-library/react";
import JobStatusPie from "@web/features/analytics/charts/JobStatusPie";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("react-apexcharts", () => ({
  default: ({ series, options }: any) => (
    <div data-testid="apex-chart">
      <span data-testid="series">{JSON.stringify(series)}</span>
      <span data-testid="labels">{JSON.stringify(options.labels)}</span>
      <span data-testid="colors">{JSON.stringify(options.colors)}</span>
    </div>
  ),
}));

describe("JobStatusPie", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<JobStatusPie theme="light" />);
    expect(screen.getByText("Loading job openings...")).toBeInTheDocument();
  });

  it("shows an empty state when there is no data", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<JobStatusPie theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("builds pie labels/series from status counts and totals them in the chip", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { _id: "Active", count: 5 },
        { _id: "Closed", count: 3 },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<JobStatusPie theme="light" />);

    expect(screen.getByText("8 total")).toBeInTheDocument();
    expect(
      JSON.parse((await screen.findByTestId("series")).textContent!),
    ).toEqual([5, 3]);
    expect(
      JSON.parse((await screen.findByTestId("labels")).textContent!),
    ).toEqual(["Active", "Closed"]);
  });

  it("maps known statuses to fixed colors and falls back to grey for unknown statuses", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { _id: "Active", count: 1 },
        { _id: "Mystery", count: 1 },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<JobStatusPie theme="light" />);
    expect(
      JSON.parse((await screen.findByTestId("colors")).textContent!),
    ).toEqual(["#4caf50", "#9e9e9e"]);
  });
});
