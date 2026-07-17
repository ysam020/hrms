import { render, screen } from "@testing-library/react";
import EmployeeDepartments from "@web/features/analytics/charts/EmployeeDepartments";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("react-apexcharts", () => ({
  default: ({ series, options }: any) => (
    <div data-testid="apex-chart">
      <span data-testid="series">{JSON.stringify(series)}</span>
      <span data-testid="total">
        {options.plotOptions.pie.donut.labels.total.formatter()}
      </span>
    </div>
  ),
}));

describe("EmployeeDepartments", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmployeeDepartments theme="light" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an empty state when there is no data", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmployeeDepartments theme="light" />);
    expect(
      screen.getByText("No department data available"),
    ).toBeInTheDocument();
  });

  it("builds the donut series and sums the total for the center label", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { _id: "Engineering", count: "7" },
        { _id: "Sales", count: "3" },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmployeeDepartments theme="light" />);

    expect(
      JSON.parse((await screen.findByTestId("series")).textContent!),
    ).toEqual([7, 3]);
    expect((await screen.findByTestId("total")).textContent).toBe("10");
  });
});
