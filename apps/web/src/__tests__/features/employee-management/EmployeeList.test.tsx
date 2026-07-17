import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import EmployeeList from "@web/features/employee-management/EmployeeList";
import { AlertContext } from "@web/app/providers/AlertContext";
import apiClient from "@web/core/http/axiosConfig";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

const mocks = vi.hoisted(() => ({ instance: vi.fn() }));
vi.mock("@web/core/http/axiosConfig", () => ({ default: mocks.instance }));
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn>;

function makeEmployee(overrides: Partial<any> = {}) {
  return {
    username: "jdoe",
    first_name: "Jane",
    middle_name: "",
    last_name: "Doe",
    department: "Engineering",
    designation: "SWE",
    ...overrides,
  };
}

function renderWith(
  employees: any[],
  { setAlert = vi.fn(), totalCount = employees.length } = {},
) {
  mockApiClient.mockResolvedValue({
    data: { data: { kycs: employees, pagination: { totalCount } } },
  });
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <EmployeeList />
    </AlertContext.Provider>,
  );
}

describe("EmployeeList", () => {
  beforeEach(() => {
    mocks.instance.mockReset();
    mockNavigate.mockClear();
  });

  it("renders employee rows with formatted name and department", async () => {
    renderWith([makeEmployee()]);
    expect(await screen.findByText("Jane Doe (jdoe)")).toBeInTheDocument();
    expect(screen.getByText("Engineering")).toBeInTheDocument();
    expect(screen.getByText("SWE")).toBeInTheDocument();
  });

  it("shows an empty message when there are no employees", async () => {
    renderWith([]);
    expect(await screen.findByText("No employees found")).toBeInTheDocument();
  });

  it("navigates to the employee's detail page when a row is clicked", async () => {
    renderWith([makeEmployee()]);
    await screen.findByText("Jane Doe (jdoe)");

    fireEvent.click(screen.getByText("Jane Doe (jdoe)"));

    expect(mockNavigate).toHaveBeenCalledWith("/employee-management/jdoe");
  });

  it("debounces the search filter before refetching", async () => {
    vi.useFakeTimers();
    renderWith([makeEmployee()]);
    await vi.waitFor(() => expect(mocks.instance).toHaveBeenCalled());
    mocks.instance.mockClear();

    fireEvent.change(screen.getByPlaceholderText("Search employees…"), {
      target: { value: "jane" },
    });
    expect(mocks.instance).not.toHaveBeenCalled();

    vi.advanceTimersByTime(400);
    vi.useRealTimers();
    await waitFor(() =>
      expect(mocks.instance).toHaveBeenCalledWith(
        expect.stringContaining("search=jane"),
      ),
    );
  });
});
