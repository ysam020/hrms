import { render, screen } from "@testing-library/react";
import LeavePatternHeatmap from "@web/features/analytics/charts/LeavePatternHeatmap";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("react-apexcharts", () => ({
  default: ({ series, options }: any) => (
    <div data-testid="apex-chart">
      <span data-testid="series">{JSON.stringify(series)}</span>
      <span data-testid="ranges">
        {JSON.stringify(options.plotOptions.heatmap.colorScale.ranges)}
      </span>
    </div>
  ),
}));

describe("LeavePatternHeatmap", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<LeavePatternHeatmap theme="light" />);
    expect(screen.getByText("Loading leave patterns...")).toBeInTheDocument();
  });

  it("shows an empty state when there is no data", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<LeavePatternHeatmap theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("maps month/count pairs into a single heatmap series with x/y points", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { month: "2024-01", count: 2 },
        { month: "2024-02", count: 8 },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<LeavePatternHeatmap theme="light" />);

    expect(
      JSON.parse((await screen.findByTestId("series")).textContent!),
    ).toEqual([
      {
        name: "Leave Applications",
        data: [
          { x: "2024-01", y: 2 },
          { x: "2024-02", y: 8 },
        ],
      },
    ]);
  });

  it("scales the Low/Medium/High color-scale ranges off the maximum count in the data", async () => {
    mockUseFetchData.mockReturnValue({
      data: [{ month: "2024-01", count: 10 }],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<LeavePatternHeatmap theme="light" />);

    const ranges = JSON.parse(
      (await screen.findByTestId("ranges")).textContent!,
    );
    expect(ranges[0]).toMatchObject({ from: 0, to: 3, name: "Low" });
    expect(ranges[2]).toMatchObject({ from: 7, to: 10, name: "High" });
  });

  it("floors the color-scale range at 1 when every count is zero", async () => {
    mockUseFetchData.mockReturnValue({
      data: [{ month: "2024-01", count: 0 }],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<LeavePatternHeatmap theme="light" />);
    const ranges = JSON.parse(
      (await screen.findByTestId("ranges")).textContent!,
    );
    expect(ranges[2].to).toBe(1);
  });
});
