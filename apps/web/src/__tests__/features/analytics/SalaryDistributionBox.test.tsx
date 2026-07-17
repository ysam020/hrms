import { render, screen } from "@testing-library/react";
import SalaryDistributionBox from "@web/features/analytics/charts/SalaryDistributionBox";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("react-apexcharts", () => ({
  default: ({ series }: any) => (
    <div data-testid="apex-chart">
      <span data-testid="series">{JSON.stringify(series)}</span>
    </div>
  ),
}));

describe("SalaryDistributionBox", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<SalaryDistributionBox theme="light" />);
    expect(
      screen.getByText("Loading salary distribution..."),
    ).toBeInTheDocument();
  });

  it("shows an empty state when there is no data", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SalaryDistributionBox theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("builds a 5-point box-plot [min, mid-low, avg, mid-high, max] per department", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        {
          department: "Engineering",
          minSalary: 400000,
          avgSalary: 700000,
          maxSalary: 1000000,
          employeeCount: 5,
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SalaryDistributionBox theme="light" />);

    const series = JSON.parse(
      (await screen.findByTestId("series")).textContent!,
    );
    expect(series[0].data[0]).toEqual({
      x: "Engineering",
      y: [400000, 550000, 700000, 850000, 1000000],
    });
  });

  it("renders a summary card per department, capped at the first 4", () => {
    mockUseFetchData.mockReturnValue({
      data: Array.from({ length: 6 }, (_, i) => ({
        department: `Dept ${i}`,
        minSalary: 100,
        avgSalary: 100 * 100000,
        maxSalary: 100,
        employeeCount: 1,
      })),
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SalaryDistributionBox theme="light" />);

    expect(screen.getByText("Dept 0")).toBeInTheDocument();
    expect(screen.getByText("Dept 3")).toBeInTheDocument();
    expect(screen.queryByText("Dept 4")).not.toBeInTheDocument();
  });
});
