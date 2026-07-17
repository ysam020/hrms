import { render, screen } from "@testing-library/react";
import AgeDistribution from "@web/features/analytics/charts/AgeDistribution";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("react-apexcharts", () => ({
  default: ({ series, options }: any) => (
    <div data-testid="apex-chart">
      <span data-testid="series">{JSON.stringify(series)}</span>
      <span data-testid="labels">{JSON.stringify(options.labels)}</span>
    </div>
  ),
}));

describe("AgeDistribution", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<AgeDistribution theme="light" />);
    expect(screen.queryByText("Age Distribution")).not.toBeInTheDocument();
  });

  it("shows an empty state when there is no data", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AgeDistribution theme="light" />);
    expect(
      screen.getByText("No age distribution data available"),
    ).toBeInTheDocument();
  });

  it("derives chart labels from age_group/ageGroup/_id, defaulting to Unknown", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { age_group: "18-25", count: 10 },
        { ageGroup: "26-35", count: 20 },
        { _id: "36-45", count: 5 },
        { count: 3 },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AgeDistribution theme="light" />);
    const labels = await screen.findByTestId("labels");
    expect(JSON.parse(labels.textContent!)).toEqual([
      "18-25",
      "26-35",
      "36-45",
      "Unknown",
    ]);
  });

  it("maps missing counts to 0 in the series", async () => {
    mockUseFetchData.mockReturnValue({
      data: [{ age_group: "18-25" }, { age_group: "26-35", count: 7 }],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AgeDistribution theme="light" />);
    const series = await screen.findByTestId("series");
    expect(JSON.parse(series.textContent!)).toEqual([0, 7]);
  });
});
