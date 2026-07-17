import { render, screen } from "@testing-library/react";
import CompensationBreakdown from "@web/features/analytics/charts/CompensationBreakdown";
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

describe("CompensationBreakdown", () => {
  it("shows a loading message while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<CompensationBreakdown theme="light" />);
    expect(
      screen.getByText("Loading compensation data..."),
    ).toBeInTheDocument();
  });

  it("shows 'No data available' when employeeCount is falsy", () => {
    mockUseFetchData.mockReturnValue({
      data: { employeeCount: 0 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<CompensationBreakdown theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("builds one series per salary component from the response", async () => {
    mockUseFetchData.mockReturnValue({
      data: {
        employeeCount: 10,
        avgBasicPay: 30000,
        avgHRA: 15000,
        avgConveyance: 1600,
        avgPF: 3600,
        avgESI: 500,
        avgPT: 200,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<CompensationBreakdown theme="light" />);

    const series = await screen.findByTestId("series");
    expect(JSON.parse(series.textContent!)).toEqual([
      { name: "Basic Pay", data: [30000] },
      { name: "HRA", data: [15000] },
      { name: "Conveyance", data: [1600] },
      { name: "PF", data: [3600] },
      { name: "ESI", data: [500] },
      { name: "PT", data: [200] },
    ]);
  });

  it("defaults missing component averages to 0", async () => {
    mockUseFetchData.mockReturnValue({
      data: { employeeCount: 5, avgBasicPay: 20000 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<CompensationBreakdown theme="light" />);
    const series = await screen.findByTestId("series");
    expect(JSON.parse(series.textContent!)[1]).toEqual({
      name: "HRA",
      data: [0],
    });
  });

  it("shows the employee count and formatted average total (in lakhs) in the header", () => {
    mockUseFetchData.mockReturnValue({
      data: { employeeCount: 10, avgBasicPay: 200000, avgHRA: 100000 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<CompensationBreakdown theme="light" />);
    // total = 300000 -> "3.00L"
    expect(screen.getByText(/10 employees.*3\.00L/)).toBeInTheDocument();
  });
});
