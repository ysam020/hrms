import { render, screen } from "@testing-library/react";
import HiringFunnel from "@web/features/analytics/charts/HiringFunnel";
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

describe("HiringFunnel", () => {
  it("shows an empty state when applied is undefined", () => {
    mockUseFetchData.mockReturnValue({
      data: {},
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<HiringFunnel theme="light" />);
    expect(
      screen.getByText("No hiring funnel data available"),
    ).toBeInTheDocument();
  });

  it("builds the three funnel stages from the raw counts object", async () => {
    mockUseFetchData.mockReturnValue({
      data: {
        applied: 100,
        interviewing: 30,
        interviewingRate: 38,
        hired: 8,
        hireRate: 8,
        rejected: 12,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<HiringFunnel theme="light" />);

    expect(screen.getByText("Hiring Funnel")).toBeInTheDocument();
    const series = await screen.findByTestId("series");
    expect(JSON.parse(series.textContent!)).toEqual([
      { name: "Applications", data: [100, 30, 8] },
    ]);
    expect(screen.getByText("Applied")).toBeInTheDocument();
    expect(screen.getByText("38% conversion")).toBeInTheDocument();
    expect(screen.getByText("8% conversion")).toBeInTheDocument();
    expect(screen.getByText("Rejected")).toBeInTheDocument();
    expect(screen.getByText("12")).toBeInTheDocument();
  });

  it("does not render a conversion rate for the Applied stage (rate is always null)", () => {
    mockUseFetchData.mockReturnValue({
      data: { applied: 5 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<HiringFunnel theme="light" />);
    expect(screen.queryByText("0% conversion")).not.toBeInTheDocument();
  });

  it("defaults missing stage counts to 0", async () => {
    mockUseFetchData.mockReturnValue({
      data: { applied: 5 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<HiringFunnel theme="light" />);
    const series = await screen.findByTestId("series");
    expect(JSON.parse(series.textContent!)).toEqual([
      { name: "Applications", data: [5, 0, 0] },
    ]);
  });
});
