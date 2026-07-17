import { render, screen } from "@testing-library/react";
import EmploymentTypeBreakdown from "@web/features/analytics/charts/EmploymentTypeBreakdown";
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

describe("EmploymentTypeBreakdown", () => {
  it("shows a loading message while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmploymentTypeBreakdown theme="light" />);
    expect(
      screen.getByText("Loading employment type data..."),
    ).toBeInTheDocument();
  });

  it("shows 'No data available' when totalEmployees is falsy", () => {
    mockUseFetchData.mockReturnValue({
      data: { totalEmployees: 0 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmploymentTypeBreakdown theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("builds the [wfh, office] series from the response", async () => {
    mockUseFetchData.mockReturnValue({
      data: { wfhCount: 4, officeCount: 16, totalEmployees: 20 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmploymentTypeBreakdown theme="light" />);
    const series = await screen.findByTestId("series");
    expect(JSON.parse(series.textContent!)).toEqual([4, 16]);
  });

  it("defaults non-finite counts to 0 instead of NaN", async () => {
    mockUseFetchData.mockReturnValue({
      data: { wfhCount: NaN, officeCount: undefined, totalEmployees: 5 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmploymentTypeBreakdown theme="light" />);
    const series = await screen.findByTestId("series");
    expect(JSON.parse(series.textContent!)).toEqual([0, 0]);
  });
});
