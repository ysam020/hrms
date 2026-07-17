import { render, screen } from "@testing-library/react";
import TenureDistribution from "@web/features/analytics/charts/TenureDistribution";
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

describe("TenureDistribution", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<TenureDistribution theme="light" />);
    expect(screen.getByText("Loading tenure data...")).toBeInTheDocument();
  });

  it("shows an empty state when there is no data", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<TenureDistribution theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("builds employee-count series with tenure-bucket categories", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { _id: "0-1yr", count: 12 },
        { _id: "1-3yr", count: 8 },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<TenureDistribution theme="light" />);

    expect(
      JSON.parse((await screen.findByTestId("series")).textContent!),
    ).toEqual([{ name: "Employees", data: [12, 8] }]);
    expect(
      JSON.parse((await screen.findByTestId("categories")).textContent!),
    ).toEqual(["0-1yr", "1-3yr"]);
  });
});
