import { render, screen } from "@testing-library/react";
import LeaveTypeBar from "@web/features/analytics/charts/LeaveTypeBar";
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

describe("LeaveTypeBar", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<LeaveTypeBar theme="light" />);
    expect(screen.getByText("Loading leave type data...")).toBeInTheDocument();
  });

  it("shows an empty state when there is no data", () => {
    mockUseFetchData.mockReturnValue({
      data: [],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<LeaveTypeBar theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("builds separate Applications and Total Days series from the leave-type breakdown", async () => {
    mockUseFetchData.mockReturnValue({
      data: [
        { _id: "Sick", count: 4, totalDays: 10 },
        { _id: "Casual", count: 2, totalDays: 3 },
      ],
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<LeaveTypeBar theme="light" />);

    expect(
      JSON.parse((await screen.findByTestId("series")).textContent!),
    ).toEqual([
      { name: "Applications", data: [4, 2] },
      { name: "Total Days", data: [10, 3] },
    ]);
    expect(
      JSON.parse((await screen.findByTestId("categories")).textContent!),
    ).toEqual(["Sick", "Casual"]);
  });
});
