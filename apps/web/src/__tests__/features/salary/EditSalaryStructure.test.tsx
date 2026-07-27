import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import EditSalaryStructure from "@web/features/salary/EditSalaryStructure";
import useFetchData from "@web/shared/hooks/useFetchData";
import apiClient from "@web/core/http/axiosConfig";
import { AlertContext } from "@web/app/providers/AlertContext";
import { API_ENDPOINTS } from "@web/shared/constants";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/core/http/axiosConfig", () => {
  const fn: any = vi.fn();
  fn.get = vi.fn();
  fn.post = vi.fn();
  return { default: fn };
});
const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const mockSetAlert = vi.fn();
const future = { v7_startTransition: true, v7_relativeSplatPath: true };

function renderComponent() {
  return render(
    <MemoryRouter initialEntries={["/salary/u1"]} future={future}>
      <AlertContext.Provider value={{ setAlert: mockSetAlert } as any}>
        <Routes>
          <Route path="/salary/:userId" element={<EditSalaryStructure />} />
        </Routes>
      </AlertContext.Provider>
    </MemoryRouter>,
  );
}

const USER_DATA = {
  salary: 60000,
  salaryStructure: { basicPay: 30000, hra: 15000, conveyance: 5000 },
  workState: "MH",
};

const SALARY_COMPONENTS = [
  { code: "BASIC", name: "Basic Pay", type: "earning", calcType: "fixed" },
  { code: "HRA", name: "HRA", type: "earning", calcType: "fixed" },
  {
    code: "CONVEYANCE",
    name: "Conveyance",
    type: "earning",
    calcType: "fixed",
  },
  {
    code: "PF",
    name: "PF",
    type: "deduction",
    calcType: "percent_of_basic",
    percentOf: "basic",
    percentValue: 12,
  },
];

function mockAllApiCalls({
  existingSalaryData = null,
}: { existingSalaryData?: any } = {}) {
  mockApiClient.get.mockImplementation((url: string) => {
    if (url === API_ENDPOINTS.LIST_SALARY_COMPONENTS) {
      return Promise.resolve({ data: { data: SALARY_COMPONENTS } });
    }
    if (url === API_ENDPOINTS.LIST_PT_SLABS) {
      return Promise.resolve({ data: { data: [] } });
    }
    return Promise.resolve({ data: { data: null } });
  });
  mockApiClient.mockImplementation((url: string) => {
    if (typeof url === "string" && url.includes("get-user-salary")) {
      return Promise.resolve({ data: { data: existingSalaryData } });
    }
    if (typeof url === "string" && url.includes("attendance-summary")) {
      return Promise.resolve({
        data: {
          data: {
            presents: 20,
            late: 0,
            halfDays: 0,
            holidays: 4,
            weekOffs: 4,
            wfh: 0,
            paidLeaves: 2,
          },
        },
      });
    }
    return Promise.resolve({ data: { data: null } });
  });
}

describe("EditSalaryStructure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAllApiCalls();
  });

  it("shows a loading spinner while the user data is loading", () => {
    mockUseFetchData.mockReturnValue({
      data: null,
      loading: true,
      error: null,
      refetch: vi.fn(),
    });
    renderComponent();
    expect(screen.getByRole("progressbar")).toBeInTheDocument();
  });

  it("renders in view mode with the gross salary chip reflecting the selected period, not userData.salary", async () => {
    mockUseFetchData.mockReturnValue({
      data: USER_DATA,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockAllApiCalls({
      existingSalaryData: {
        basicPay: 30000,
        hra: 15000,
        conveyance: 5000,
        pf: 3600,
      },
    });
    renderComponent();
    await waitFor(() =>
      expect(screen.getByText("Salary Structure")).toBeInTheDocument(),
    );
    // Gross must come from this period's own structure (30000+15000+5000
    // earnings = 50000), not userData.salary (60000, the employee's
    // overall/latest salary) — those can legitimately differ, e.g. right
    // after a raise that hasn't touched this specific past period.
    await waitFor(() =>
      expect(screen.getByText("Gross: ₹50000")).toBeInTheDocument(),
    );
    expect(screen.getByText("Edit")).toBeInTheDocument();
  });

  it("switches to edit mode and loads existing salary data when Edit is clicked", async () => {
    mockUseFetchData.mockReturnValue({
      data: USER_DATA,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockAllApiCalls({
      existingSalaryData: {
        basicPay: 30000,
        hra: 15000,
        conveyance: 5000,
        pf: 3600,
      },
    });
    renderComponent();
    await waitFor(() => expect(screen.getByText("Edit")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Edit"));

    await waitFor(() =>
      expect(screen.getByText("Edit Salary Structure")).toBeInTheDocument(),
    );
    expect(screen.getByText("Save")).toBeInTheDocument();
    expect(screen.getByText("Cancel")).toBeInTheDocument();
  });

  it("returns to view mode without saving when Cancel is clicked", async () => {
    mockUseFetchData.mockReturnValue({
      data: USER_DATA,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderComponent();
    await waitFor(() => expect(screen.getByText("Edit")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() => expect(screen.getByText("Cancel")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Cancel"));

    await waitFor(() =>
      expect(screen.getByText("Salary Structure")).toBeInTheDocument(),
    );
    expect(mockApiClient.post).not.toHaveBeenCalled();
  });

  it("posts the component breakdown to UPDATE_SALARY and exits edit mode on save", async () => {
    mockUseFetchData.mockReturnValue({
      data: USER_DATA,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockApiClient.post.mockResolvedValue({
      data: { message: "Salary updated." },
    });
    renderComponent();
    await waitFor(() => expect(screen.getByText("Edit")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() => expect(screen.getByText("Save")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(mockApiClient.post).toHaveBeenCalledWith(
        API_ENDPOINTS.UPDATE_SALARY,
        expect.objectContaining({
          userId: "u1",
          salaryStructure: {
            components: expect.arrayContaining([
              expect.objectContaining({ code: "BASIC" }),
            ]),
          },
        }),
      ),
    );
    await waitFor(() =>
      expect(mockSetAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "success",
          message: "Salary updated.",
        }),
      ),
    );
    await waitFor(() =>
      expect(screen.getByText("Salary Structure")).toBeInTheDocument(),
    );
  });

  it("shows the server error message when saving fails", async () => {
    mockUseFetchData.mockReturnValue({
      data: USER_DATA,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    mockApiClient.post.mockRejectedValue({
      response: { data: { message: "Invalid salary structure" } },
    });
    renderComponent();
    await waitFor(() => expect(screen.getByText("Edit")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() => expect(screen.getByText("Save")).toBeInTheDocument());

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(mockSetAlert).toHaveBeenCalledWith(
        expect.objectContaining({
          severity: "error",
          message: "Invalid salary structure",
        }),
      ),
    );
    // Stays in edit mode on failure.
    expect(screen.getByText("Edit Salary Structure")).toBeInTheDocument();
  });

  it("changes the selected month/year via the date picker and refetches for that month", async () => {
    mockUseFetchData.mockReturnValue({
      data: USER_DATA,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderComponent();
    await waitFor(() =>
      expect(screen.getByText("Salary Structure")).toBeInTheDocument(),
    );

    const combobox = screen.getByRole("combobox") as HTMLInputElement;
    const initialValue = combobox.value;
    mockApiClient.mockClear();

    fireEvent.click(document.querySelector(".p-datepicker-trigger")!);
    const monthButtons = document.querySelectorAll(".p-monthpicker-month");
    expect(monthButtons.length).toBeGreaterThan(0);
    fireEvent.click(monthButtons[2]); // March

    await waitFor(() => expect(combobox.value).not.toBe(initialValue));
    expect(combobox.value).toMatch(/^03\/\d{4}$/);
    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        expect.stringContaining("get-user-salary/u1"),
      ),
    );
  });

  it("disables the date picker while in edit mode", async () => {
    mockUseFetchData.mockReturnValue({
      data: USER_DATA,
      loading: false,
      error: null,
      refetch: vi.fn(),
    });
    renderComponent();
    await waitFor(() => expect(screen.getByText("Edit")).toBeInTheDocument());
    fireEvent.click(screen.getByText("Edit"));
    await waitFor(() => expect(screen.getByText("Save")).toBeInTheDocument());

    expect(screen.getByRole("combobox")).toBeDisabled();
  });
});
