import { render, screen } from "@testing-library/react";
import WorkingHoursHistogram from "@web/features/analytics/charts/WorkingHoursHistogram";
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

describe("WorkingHoursHistogram", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<WorkingHoursHistogram theme="light" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an empty state when the response isn't a non-empty array", () => {
    mockUseFetchData.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<WorkingHoursHistogram theme="light" />);
    expect(
      screen.getByText("No working hours data available"),
    ).toBeInTheDocument();
  });

  it("builds an employee-count series with working-hours-range categories, defaulting missing counts to 0", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { _id: "0-4h", count: 2 },
        { _id: "4-8h", count: null },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<WorkingHoursHistogram theme="light" />);

    expect(
      JSON.parse((await screen.findByTestId("categories")).textContent!),
    ).toEqual(["0-4h", "4-8h"]);
    expect(
      JSON.parse((await screen.findByTestId("series")).textContent!),
    ).toEqual([{ name: "Employees", data: [2, 0] }]);
  });
});
