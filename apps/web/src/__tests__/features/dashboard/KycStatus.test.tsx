import { render, screen, fireEvent } from "@testing-library/react";
import KycStatus from "@web/features/dashboard/KycStatus";
import { useDashboard } from "@web/app/providers/DashboardContext";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@web/app/providers/DashboardContext", () => ({
  useDashboard: vi.fn(),
}));
const mockUseDashboard = useDashboard as unknown as ReturnType<typeof vi.fn>;

describe("KycStatus", () => {
  beforeEach(() => mockNavigate.mockClear());

  it("shows a dash for each stat when there is no overview data", () => {
    mockUseDashboard.mockReturnValue({
      data: {},
      loading: { kycInsights: false },
    });
    render(<KycStatus />);
    expect(screen.getAllByText("—")).toHaveLength(4);
  });

  it("renders each KYC stat, formatting completion rate as a rounded percentage", () => {
    mockUseDashboard.mockReturnValue({
      data: {
        kycInsights: {
          overview: {
            approvedKyc: 30,
            pendingKyc: 5,
            rejectedKyc: 2,
            completionRate: 81.6,
          },
        },
      },
      loading: { kycInsights: false },
    });
    render(<KycStatus />);
    expect(screen.getByText("30")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("2")).toBeInTheDocument();
    expect(screen.getByText("82%")).toBeInTheDocument();
  });

  it("shows skeletons while loading", () => {
    mockUseDashboard.mockReturnValue({
      data: {},
      loading: { kycInsights: true },
    });
    const { container } = render(<KycStatus />);
    expect(container.querySelectorAll(".MuiSkeleton-root").length).toBe(4);
  });

  it("navigates to KYC insights on click and on Enter", () => {
    mockUseDashboard.mockReturnValue({
      data: {},
      loading: { kycInsights: false },
    });
    render(<KycStatus />);
    fireEvent.click(screen.getByLabelText("View KYC status"));
    expect(mockNavigate).toHaveBeenCalledWith("/kyc/insights");

    fireEvent.keyDown(screen.getByLabelText("View KYC status"), {
      key: "Enter",
    });
    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });
});
