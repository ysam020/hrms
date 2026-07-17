import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DepartmentBreakdown from "@web/features/dashboard/DepartmentBreakdown";
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
const renderComp = () =>
  render(
    <MemoryRouter future={future}>
      <DepartmentBreakdown />
    </MemoryRouter>,
  );

function mockData(
  departmentBreakdown: any[],
  totalEmployees = 0,
  isLoading = false,
) {
  mockUseDashboard.mockReturnValue({
    data: {
      employeeInsights: { departmentBreakdown, overview: { totalEmployees } },
    },
    loading: { employeeInsights: isLoading },
    refetch: vi.fn(),
  });
}

describe("DepartmentBreakdown", () => {
  beforeEach(() => mockNavigate.mockClear());

  it('shows "No department data" when the list is empty', () => {
    mockData([]);
    renderComp();
    expect(screen.getByText("No department data")).toBeInTheDocument();
  });

  it("renders only the first 8 departments even when more exist", () => {
    const depts = Array.from({ length: 12 }, (_, i) => ({
      department: `Dept ${i}`,
      count: 12 - i,
      activeRate: 80,
    }));
    mockData(depts);
    renderComp();
    expect(screen.getByText("Dept 0")).toBeInTheDocument();
    expect(screen.getByText("Dept 7")).toBeInTheDocument();
    expect(screen.queryByText("Dept 8")).not.toBeInTheDocument();
  });

  it("scales the second bar to half the width of the largest (first) department's bar", () => {
    mockData([
      { department: "Engineering", count: 40, activeRate: 95 },
      { department: "Sales", count: 20, activeRate: 90 },
    ]);
    renderComp();
    const counts = screen.getAllByText(/^(40|20)$/).map((el) => el.textContent);
    expect(counts).toEqual(["40", "20"]);
    // Bar tracks are the only elements with a percentage width computed
    // from `${pct}%` — confirm the DOM renders two distinct bar widths
    // (100% for the max, 50% for the half-sized one) rather than asserting
    // on MUI's emotion-generated class/style output directly.
    const widthValues = new Set(
      [...document.querySelectorAll<HTMLElement>("div")]
        .map((el) => getComputedStyle(el).width)
        .filter((w) => w.endsWith("%")),
    );
    expect(widthValues.has("100%")).toBe(true);
    expect(widthValues.has("50%")).toBe(true);
  });

  it("shows the total employee count in the header when not loading", () => {
    mockData([{ department: "Eng", count: 10, activeRate: 100 }], 55);
    renderComp();
    expect(screen.getByText("55 total")).toBeInTheDocument();
  });

  it("navigates to employee insights on click", () => {
    mockData([{ department: "Eng", count: 10, activeRate: 100 }]);
    renderComp();
    fireEvent.click(
      screen.getByLabelText("View department breakdown in employee management"),
    );
    expect(mockNavigate).toHaveBeenCalledWith("/employee-management/insights");
  });
});
