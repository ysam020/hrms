import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SalaryManagement from "@web/features/salary/SalaryManagement";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

vi.mock("@web/core/http/axiosConfig", () => ({ default: vi.fn() }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

function employee(overrides: Partial<any> = {}) {
  return {
    id: "e1",
    first_name: "Jane",
    middle_name: "",
    last_name: "Doe",
    department: "Engineering",
    designation: "Engineer",
    ...overrides,
  };
}

function renderList(setAlert = vi.fn()) {
  render(
    <MemoryRouter>
      <AlertContext.Provider value={{ setAlert } as any}>
        <SalaryManagement />
      </AlertContext.Provider>
    </MemoryRouter>,
  );
  return { setAlert };
}

describe("SalaryManagement", () => {
  beforeEach(() => {
    mockApiClient.mockReset();
    mockNavigate.mockReset();
  });

  it("shows an empty state when there are no employees", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { kycs: [], pagination: { totalCount: 0 } } },
    });
    renderList();
    expect(await screen.findByText("No employees found")).toBeInTheDocument();
  });

  it("lists employees with name, department, and designation", async () => {
    mockApiClient.mockResolvedValue({
      data: { data: { kycs: [employee()], pagination: { totalCount: 1 } } },
    });
    renderList();
    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("Engineer")).toBeInTheDocument();
  });

  it("navigates to the employee's salary detail page on row click", async () => {
    mockApiClient.mockResolvedValue({
      data: {
        data: {
          kycs: [employee({ id: "e42" })],
          pagination: { totalCount: 1 },
        },
      },
    });
    renderList();
    fireEvent.click(await screen.findByText("Jane Doe"));
    expect(mockNavigate).toHaveBeenCalledWith("/payroll/salary-management/e42");
  });

  it("debounces the search box before triggering a refetch", async () => {
    vi.useFakeTimers();
    mockApiClient.mockResolvedValue({
      data: { data: { kycs: [employee()], pagination: { totalCount: 1 } } },
    });
    renderList();
    await vi.waitFor(() =>
      expect(screen.queryByText("Jane Doe")).toBeInTheDocument(),
    );
    mockApiClient.mockClear();

    fireEvent.change(screen.getByPlaceholderText("Search employees…"), {
      target: { value: "jane" },
    });
    expect(mockApiClient).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    await vi.waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        expect.stringContaining("search=jane"),
      ),
    );
    vi.useRealTimers();
  });
});
