import { render, screen } from "@testing-library/react";
import EmployeeDesignations from "@web/features/analytics/charts/EmployeeDesignations";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("react-apexcharts", () => ({
  default: ({ series, options }: any) => (
    <div data-testid="apex-chart">
      <span data-testid="series">{JSON.stringify(series)}</span>
      <span data-testid="categories">
        {JSON.stringify(options.xaxis.categories)}
      </span>
    </div>
  ),
}));

describe("EmployeeDesignations", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmployeeDesignations theme="light" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an empty state when there is no data", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmployeeDesignations theme="light" />);
    expect(
      screen.getByText("No designation data available"),
    ).toBeInTheDocument();
  });

  it("prefers 'designation' over '_id' for the category label, falling back to 'Unknown'", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { designation: "Engineer", count: 4 },
        { _id: "Sales Rep", count: 2 },
        { count: 1 },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<EmployeeDesignations theme="light" />);

    expect(
      JSON.parse((await screen.findByTestId("categories")).textContent!),
    ).toEqual(["Engineer", "Sales Rep", "Unknown"]);
    expect(
      JSON.parse((await screen.findByTestId("series")).textContent!),
    ).toEqual([{ name: "Employees", data: [4, 2, 1] }]);
  });
});
