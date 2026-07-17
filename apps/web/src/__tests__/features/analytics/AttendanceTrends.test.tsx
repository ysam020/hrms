import { render, screen } from "@testing-library/react";
import AttendanceTrends from "@web/features/analytics/charts/AttendanceTrends";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/components/SafeApexChart", () => ({
  default: ({ series, options }: any) => (
    <div data-testid="apex-chart">
      <span data-testid="series">{JSON.stringify(series)}</span>
      <span data-testid="categories">
        {JSON.stringify(options.xaxis.categories)}
      </span>
    </div>
  ),
}));

describe("AttendanceTrends", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<AttendanceTrends theme="light" />);
    expect(
      screen.getByText("Loading attendance trends..."),
    ).toBeInTheDocument();
  });

  it("shows an empty state when there is no data", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AttendanceTrends theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("builds year-month categories and rounds attendance rate to 1 decimal", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        {
          _id: { year: 2024, month: 6 },
          attendanceRate: 87.456,
          avgWorkingHours: 8.2,
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AttendanceTrends theme="light" />);

    expect(
      JSON.parse((await screen.findByTestId("categories")).textContent!),
    ).toEqual(["2024-06"]);
    const series = JSON.parse(
      (await screen.findByTestId("series")).textContent!,
    );
    expect(series[0]).toEqual({
      name: "Attendance Rate",
      type: "area",
      data: [87.5],
    });
    expect(series[1]).toEqual({
      name: "Avg Working Hours",
      type: "line",
      data: [8.2],
    });
  });

  it("defaults a null attendance rate to 0 and missing working hours to 0", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        {
          _id: { year: 2024, month: 1 },
          attendanceRate: null,
          avgWorkingHours: undefined,
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<AttendanceTrends theme="light" />);
    const series = JSON.parse(
      (await screen.findByTestId("series")).textContent!,
    );
    expect(series[0].data).toEqual([0]);
    expect(series[1].data).toEqual([0]);
  });
});
