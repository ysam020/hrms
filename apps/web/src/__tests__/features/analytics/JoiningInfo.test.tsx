import { render, screen } from "@testing-library/react";
import JoiningInfo from "@web/features/analytics/charts/JoiningInfo";
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

describe("JoiningInfo", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<JoiningInfo theme="light" />);
    expect(screen.getByRole("status")).toBeInTheDocument();
  });

  it("shows an empty state when the response isn't a non-empty array", () => {
    mockUseFetchData.mockReturnValue({
      data: null,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<JoiningInfo theme="light" />);
    expect(screen.getByText("No joining data available")).toBeInTheDocument();
  });

  it("builds a joinings-count line series with formatted date categories", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { formattedDate: "Jan 2024", count: 3 },
        { formattedDate: "Feb 2024", count: 5 },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<JoiningInfo theme="light" />);

    expect(
      JSON.parse((await screen.findByTestId("categories")).textContent!),
    ).toEqual(["Jan 2024", "Feb 2024"]);
    expect(
      JSON.parse((await screen.findByTestId("series")).textContent!),
    ).toEqual([{ name: "Joinings", data: [3, 5] }]);
  });
});
