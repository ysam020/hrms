import { render, screen } from "@testing-library/react";
import SalaryByDesignation from "@web/features/analytics/charts/SalaryByDesignation";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("react-apexcharts", () => ({
  default: ({ series, options, height }: any) => (
    <div data-testid="apex-chart">
      <span data-testid="series">{JSON.stringify(series)}</span>
      <span data-testid="categories">
        {JSON.stringify(options.xaxis.categories)}
      </span>
      <span data-testid="height">{height}</span>
    </div>
  ),
}));

describe("SalaryByDesignation", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<SalaryByDesignation theme="light" />);
    expect(
      screen.getByText("Loading salary by designation..."),
    ).toBeInTheDocument();
  });

  it("shows an empty state when there is no data", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SalaryByDesignation theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("sorts designations by average salary descending before building the chart", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        {
          designation: "Junior Dev",
          avgSalary: 500000,
          minSalary: 400000,
          maxSalary: 600000,
          employeeCount: 5,
        },
        {
          designation: "Manager",
          avgSalary: 1500000,
          minSalary: 1200000,
          maxSalary: 1800000,
          employeeCount: 2,
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SalaryByDesignation theme="light" />);

    expect(
      JSON.parse((await screen.findByTestId("categories")).textContent!),
    ).toEqual(["Manager", "Junior Dev"]);
    expect(
      JSON.parse((await screen.findByTestId("series")).textContent!),
    ).toEqual([{ name: "Average Salary", data: [1500000, 500000] }]);
  });

  it("grows the chart height with the number of designations, with a floor of 350px", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        {
          designation: "Only Role",
          avgSalary: 100,
          minSalary: 100,
          maxSalary: 100,
          employeeCount: 1,
        },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<SalaryByDesignation theme="light" />);
    expect((await screen.findByTestId("height")).textContent).toBe("350");
  });
});
