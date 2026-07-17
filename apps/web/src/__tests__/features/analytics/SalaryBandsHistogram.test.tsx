import { render, screen } from "@testing-library/react";
import SalaryBandsHistogram from "@web/features/analytics/charts/SalaryBandsHistogram";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("react-apexcharts", () => ({
  default: () => <div data-testid="apex-chart" />,
}));

describe("SalaryBandsHistogram", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<SalaryBandsHistogram theme="light" />);
    expect(screen.getByText("Loading salary bands...")).toBeInTheDocument();
  });

  it("shows an empty state when there is no data", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SalaryBandsHistogram theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("computes the total headcount, the count-weighted overall average, and the most common band", () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { range: "0-5L", count: 2, avgSalary: 300000 },
        { range: "5-10L", count: 8, avgSalary: 700000 },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SalaryBandsHistogram theme="light" />);

    expect(screen.getByText("10")).toBeInTheDocument(); // total employees
    expect(screen.getByText("2 / 8")).toBeInTheDocument(); // bands occupied
    // most common band: 5-10L (count 8 > 2)
    expect(screen.getByText("5-10L")).toBeInTheDocument();
    // weighted avg = (300000*2 + 700000*8) / 10 = 620000 -> 6.20L
    expect(screen.getByText(/Overall Avg: ₹6\.20L/)).toBeInTheDocument();
  });
});
