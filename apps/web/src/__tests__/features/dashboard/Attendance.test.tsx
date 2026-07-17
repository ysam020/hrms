import { render, screen, fireEvent } from "@testing-library/react";
import Attendance from "@web/features/dashboard/Attendance";
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

function renderWith(attendanceSummary: any, loading = false) {
  mockUseDashboard.mockReturnValue({
    data: { attendanceSummary },
    loading: { attendanceSummary: loading },
  });
  return render(<Attendance />);
}

describe("Attendance", () => {
  beforeEach(() => mockNavigate.mockClear());

  it("shows skeletons while loading and disables the click/keyboard affordance", () => {
    const { container } = renderWith(null, true);
    expect(
      container.querySelectorAll(".MuiSkeleton-root").length,
    ).toBeGreaterThan(0);
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders each attendance stat once loaded", () => {
    renderWith({
      presents: 20,
      leaves: 2,
      paidLeaves: 1,
      unpaidLeaves: 0,
      holidays: 3,
      weekOffs: 4,
      remainingCorrections: 3,
      maxCorrectionsPerMonth: 4,
      correctionsUsed: 1,
    });
    expect(screen.getByText("20")).toBeInTheDocument();
    expect(screen.getByText("Presents")).toBeInTheDocument();
  });

  it("shows an error-toned message when no corrections remain", () => {
    renderWith({
      remainingCorrections: 0,
      maxCorrectionsPerMonth: 4,
      correctionsUsed: 4,
    });
    expect(
      screen.getByText("No corrections remaining (4/4 used)"),
    ).toBeInTheDocument();
  });

  it("shows a singular warning message with exactly one correction remaining", () => {
    renderWith({
      remainingCorrections: 1,
      maxCorrectionsPerMonth: 4,
      correctionsUsed: 3,
    });
    expect(
      screen.getByText("1 correction remaining (3/4 used)"),
    ).toBeInTheDocument();
  });

  it("shows a plural info message with multiple corrections remaining", () => {
    renderWith({
      remainingCorrections: 3,
      maxCorrectionsPerMonth: 4,
      correctionsUsed: 1,
    });
    expect(
      screen.getByText("3 corrections remaining (1/4 used)"),
    ).toBeInTheDocument();
  });

  it("navigates to attendance on click and on Enter, once loaded", () => {
    renderWith({
      remainingCorrections: 2,
      maxCorrectionsPerMonth: 4,
      correctionsUsed: 2,
    });
    fireEvent.click(screen.getByRole("button"));
    expect(mockNavigate).toHaveBeenCalledWith("/attendance");

    fireEvent.keyDown(screen.getByRole("button"), { key: "Enter" });
    expect(mockNavigate).toHaveBeenCalledTimes(2);
  });
});
