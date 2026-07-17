import { render, screen } from "@testing-library/react";
import HeadcountGrowth from "@web/features/analytics/charts/HeadcountGrowth";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("react-apexcharts", () => ({
  default: ({ series, options }: any) => (
    <div data-testid="apex-chart">
      <span data-testid="series">{JSON.stringify(series)}</span>
      <span data-testid="categories">
        {JSON.stringify(options.xaxis.categories)}
      </span>
    </div>
  ),
}));

describe("HeadcountGrowth", () => {
  it("shows a loading message while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<HeadcountGrowth theme="light" />);
    expect(screen.getByText("Loading headcount data...")).toBeInTheDocument();
  });

  it("shows 'No data available' for an empty series", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<HeadcountGrowth theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("shows 'No data available' when data is null/undefined", () => {
    mockUseFetchData.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<HeadcountGrowth theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("builds month-year category labels and two series (joinings, cumulative)", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { monthName: "Jan", year: 2026, joinings: 5, cumulativeHeadcount: 100 },
        { monthName: "Feb", year: 2026, joinings: 3, cumulativeHeadcount: 103 },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<HeadcountGrowth theme="light" />);

    const categories = await screen.findByTestId("categories");
    expect(JSON.parse(categories.textContent!)).toEqual([
      "Jan 2026",
      "Feb 2026",
    ]);

    const series = await screen.findByTestId("series");
    const parsed = JSON.parse(series.textContent!);
    expect(parsed).toEqual([
      { name: "Monthly Joinings", data: [5, 3], type: "column" },
      { name: "Cumulative Headcount", data: [100, 103], type: "area" },
    ]);
  });
});
