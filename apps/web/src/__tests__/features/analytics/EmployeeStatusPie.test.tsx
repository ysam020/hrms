import { render, screen } from "@testing-library/react";
import EmployeeStatusPie from "@web/features/analytics/charts/EmployeeStatusPie";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("react-apexcharts", () => ({
  default: ({ series, options }: any) => (
    <div data-testid="apex-chart">
      <span data-testid="series">{JSON.stringify(series)}</span>
      <span data-testid="colors">{JSON.stringify(options.colors)}</span>
    </div>
  ),
}));

describe("EmployeeStatusPie", () => {
  it("shows a loading message while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmployeeStatusPie theme="light" />);
    expect(screen.getByText("Loading employee status...")).toBeInTheDocument();
  });

  it("shows 'No data available' for an empty series", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmployeeStatusPie theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("maps each status to its designated color and falls back to gray for an unknown status", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { _id: "Active", count: 10 },
        { _id: "Resigned", count: 2 },
        { _id: "SomeNewStatus", count: 1 },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmployeeStatusPie theme="light" />);

    const colors = await screen.findByTestId("colors");
    expect(JSON.parse(colors.textContent!)).toEqual([
      "#4caf50",
      "#2196f3",
      "#9e9e9e",
    ]);
  });

  it("shows the total employee count in the header chip", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { _id: "Active", count: 10 },
        { _id: "Resigned", count: 5 },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmployeeStatusPie theme="light" />);
    expect(screen.getByText("15 total")).toBeInTheDocument();
  });
});
