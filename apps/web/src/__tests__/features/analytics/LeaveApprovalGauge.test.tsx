import { render, screen } from "@testing-library/react";
import LeaveApprovalGauge from "@web/features/analytics/charts/LeaveApprovalGauge";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/components/SafeApexChart", () => ({
  default: ({ series }: any) => (
    <div data-testid="apex-chart">
      <span data-testid="series">{JSON.stringify(series)}</span>
    </div>
  ),
}));

describe("LeaveApprovalGauge", () => {
  it("shows a loading state while fetching", () => {
    mockUseFetchData.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    render(<LeaveApprovalGauge theme="light" />);
    expect(screen.getByText("Loading approval data...")).toBeInTheDocument();
  });

  it("shows an empty state when total is zero", () => {
    mockUseFetchData.mockReturnValue({
      data: { total: 0 },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<LeaveApprovalGauge theme="light" />);
    expect(screen.getByText("No data available")).toBeInTheDocument();
  });

  it("renders the approval rate as the gauge series and the breakdown stats", async () => {
    mockUseFetchData.mockReturnValue({
      data: {
        approvalRate: 75,
        approved: 15,
        pending: 3,
        rejected: 2,
        total: 20,
      },
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    render(<LeaveApprovalGauge theme="light" />);

    expect(
      JSON.parse((await screen.findByTestId("series")).textContent!),
    ).toEqual([75]);
    expect(screen.getByText("15")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("20")).toBeInTheDocument();
  });
});
