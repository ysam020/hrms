import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import WorkforceStatus from "@web/features/dashboard/WorkforceStatus";
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
const future = { v7_startTransition: true, v7_relativeSplatPath: true };
const renderWorkforceStatus = () =>
  render(
    <MemoryRouter future={future}>
      <WorkforceStatus />
    </MemoryRouter>,
  );

describe("WorkforceStatus", () => {
  beforeEach(() => mockNavigate.mockClear());

  it("defaults every status count to 0 without overview data", () => {
    mockUseDashboard.mockReturnValue({
      data: {},
      loading: { employeeInsights: false },
      refetch: vi.fn(),
    });
    renderWorkforceStatus();
    expect(screen.getAllByText("0")).toHaveLength(4);
  });

  it("renders each status count from the overview", () => {
    mockUseDashboard.mockReturnValue({
      data: {
        employeeInsights: {
          overview: {
            activeEmployees: 42,
            resignedEmployees: 3,
            terminatedEmployees: 1,
            abscondedEmployees: 0,
          },
        },
      },
      loading: { employeeInsights: false },
      refetch: vi.fn(),
    });
    renderWorkforceStatus();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
    expect(screen.getByText("Absconded")).toBeInTheDocument();
  });

  it("navigates to employee insights on click", () => {
    mockUseDashboard.mockReturnValue({
      data: {},
      loading: { employeeInsights: false },
      refetch: vi.fn(),
    });
    renderWorkforceStatus();
    fireEvent.click(
      screen.getByLabelText("View workforce status in employee management"),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/employee-management/insights");
  });

  it("navigates on Enter key press", () => {
    mockUseDashboard.mockReturnValue({
      data: {},
      loading: { employeeInsights: false },
      refetch: vi.fn(),
    });
    renderWorkforceStatus();
    fireEvent.keyDown(
      screen.getByLabelText("View workforce status in employee management"),
      { key: "Enter" },
    );
    expect(mockNavigate).toHaveBeenCalledWith("/employee-management/insights");
  });
});
