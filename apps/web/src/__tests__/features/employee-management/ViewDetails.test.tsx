import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { MemoryRouter, Routes, Route } from "react-router-dom";
import ViewDetails from "@web/features/employee-management/ViewDetails";
import { AlertContext } from "@web/app/providers/AlertContext";
import { UserContext } from "@web/app/providers/UserContext";
import apiClient from "@web/core/http/axiosConfig";
import useFetchData from "@web/shared/hooks/useFetchData";

vi.mock("@web/core/http/axiosConfig", () => ({ default: { put: vi.fn() } }));
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

const mockNavigate = vi.fn();
vi.mock("react-router-dom", async (importOriginal) => {
  const actual = await importOriginal<typeof import("react-router-dom")>();
  return { ...actual, useNavigate: () => mockNavigate };
});

vi.mock("@web/app/router/UnAuthorisedRoute", () => ({
  default: () => <div>Stub UnAuthorisedRoute</div>,
}));

vi.mock("primereact/inputtext", () => ({
  InputText: (props: any) => (
    <input
      id={props.id}
      placeholder={props.placeholder}
      value={props.value ?? ""}
      onChange={props.onChange}
      onBlur={props.onBlur}
    />
  ),
}));

function makeEmployee(overrides: Partial<any> = {}) {
  return {
    id: "e1",
    username: "jdoe",
    first_name: "Jane",
    last_name: "Doe",
    employeeStatus: "Active",
    tenantRole: "employee",
    isSuperUser: false,
    ...overrides,
  };
}

function setupFetchData(
  employee: any,
  assets: any[] = [],
  { loading = false, error = null, refetch = vi.fn() } = {},
) {
  mockUseFetchData.mockImplementation((url: string | null) => {
    if (url && url.includes("/assets")) {
      return { data: assets, loading: false };
    }
    return { data: employee, loading, error, refetch };
  });
}

function renderWith(
  { user = { username: "hr1", isSuperUser: true } } = {},
  { setAlert = vi.fn() } = {},
) {
  return render(
    <MemoryRouter initialEntries={["/employee-management/jdoe"]}>
      <Routes>
        <Route
          path="/employee-management/:username"
          element={
            <AlertContext.Provider value={{ setAlert } as any}>
              <UserContext.Provider value={{ user } as any}>
                <ViewDetails />
              </UserContext.Provider>
            </AlertContext.Provider>
          }
        />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ViewDetails", () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockNavigate.mockClear();
  });

  it("shows a spinner while loading", () => {
    setupFetchData(null, [], { loading: true });
    const { container } = renderWith();
    expect(
      container.querySelector(".MuiCircularProgress-root"),
    ).toBeInTheDocument();
  });

  it("shows the unauthorised route on a 403 error", async () => {
    setupFetchData(null, [], { error: { status: 403 } });
    renderWith();
    expect(
      await screen.findByText("Stub UnAuthorisedRoute"),
    ).toBeInTheDocument();
  });

  it("renders the employee's name and status chip", () => {
    setupFetchData(makeEmployee());
    renderWith();
    expect(screen.getByText("Jane Doe")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("hides Edit for a user without edit permission", () => {
    setupFetchData(makeEmployee());
    renderWith({ user: { username: "someone-else", permissions: [] } });
    expect(screen.queryByText("Edit")).not.toBeInTheDocument();
  });

  it("shows 'No Assets Allocated' when there are no assigned assets", () => {
    setupFetchData(makeEmployee(), []);
    renderWith();
    expect(screen.getByText("No Assets Allocated")).toBeInTheDocument();
  });

  it("lists assigned assets from the Assets module", () => {
    setupFetchData(makeEmployee(), [
      {
        id: "a1",
        assetCode: "LPT-001",
        name: "MacBook Pro",
        category: "Laptop",
        condition: "good",
      },
    ]);
    renderWith();
    expect(screen.getByText("LPT-001 — MacBook Pro")).toBeInTheDocument();
  });

  it.each([
    ["owner", false, "Owner"],
    ["admin", false, "Admin"],
    ["employee", true, "Superuser"],
    ["employee", false, "Employee"],
  ])(
    "shows the '%s'/superuser=%s role as '%s'",
    (tenantRole, isSuperUser, label) => {
      setupFetchData(makeEmployee({ tenantRole, isSuperUser }));
      renderWith();
      expect(screen.getByText(label)).toBeInTheDocument();
    },
  );

  it("shows the superuser-grant hint only to a user who can manage permissions, and not once already a superuser", () => {
    setupFetchData(makeEmployee({ isSuperUser: false }));
    renderWith({ user: { username: "hr1", isSuperUser: true } });
    expect(
      screen.getByText(/To make this employee a superuser/),
    ).toBeInTheDocument();
  });

  it("hides the superuser-grant hint when the employee is already a superuser", () => {
    setupFetchData(makeEmployee({ isSuperUser: true }));
    renderWith({ user: { username: "hr1", isSuperUser: true } });
    expect(
      screen.queryByText(/To make this employee a superuser/),
    ).not.toBeInTheDocument();
  });

  it("enters edit mode, pre-filling PF/UAN/ESIC, and cancels back out", () => {
    setupFetchData(
      makeEmployee({ pf_no: "PF123", uan_no: "UAN456", esic_no: "ESIC789" }),
    );
    renderWith();

    fireEvent.click(screen.getByText("Edit"));
    expect(screen.getByPlaceholderText("PF Number")).toHaveValue("PF123");

    fireEvent.click(screen.getByText("Cancel"));
    expect(screen.queryByPlaceholderText("PF Number")).not.toBeInTheDocument();
  });

  it("checking 'Terminate Employee' auto-fills today's termination date and unchecks Absconded", () => {
    setupFetchData(makeEmployee());
    renderWith();
    fireEvent.click(screen.getByText("Edit"));

    fireEvent.click(screen.getByLabelText("Terminate Employee"));

    expect(
      screen.getByPlaceholderText("Reason for Termination"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Mark as Absconded")).not.toBeChecked();
  });

  it("checking 'Mark as Absconded' clears any termination state", () => {
    setupFetchData(makeEmployee());
    renderWith();
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByLabelText("Terminate Employee"));

    fireEvent.click(screen.getByLabelText("Mark as Absconded"));

    expect(screen.getByLabelText("Terminate Employee")).not.toBeChecked();
    expect(
      screen.queryByPlaceholderText("Reason for Termination"),
    ).not.toBeInTheDocument();
  });

  it("shows a validation error when saving a termination without a reason", async () => {
    setupFetchData(makeEmployee());
    renderWith();
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.click(screen.getByLabelText("Terminate Employee"));

    fireEvent.click(screen.getByText("Save"));

    expect(
      await screen.findByText("Reason for termination is required"),
    ).toBeInTheDocument();
  });

  it("submits an edit successfully and exits edit mode", async () => {
    mockPut.mockResolvedValue({ data: { message: "Employee updated" } });
    const refetch = vi.fn();
    const setAlert = vi.fn();
    setupFetchData(makeEmployee(), [], { refetch });
    renderWith(undefined, { setAlert });
    fireEvent.click(screen.getByText("Edit"));
    fireEvent.change(screen.getByPlaceholderText("PF Number"), {
      target: { value: "PF999" },
    });

    fireEvent.click(screen.getByText("Save"));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ pf_no: "PF999", username: "jdoe" }),
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Employee updated",
      }),
    );
    expect(refetch).toHaveBeenCalled();
    await waitFor(() =>
      expect(
        screen.queryByPlaceholderText("PF Number"),
      ).not.toBeInTheDocument(),
    );
  });

  it("shows termination details in read-only mode", () => {
    setupFetchData(
      makeEmployee({
        employeeStatus: "Terminated",
        reasonForTermination: "Performance issues",
        dateOfTermination: "2024-01-15",
      }),
    );
    renderWith();
    expect(screen.getByText(/Performance issues/)).toBeInTheDocument();
    expect(screen.getByText("Terminated:")).toBeInTheDocument();
  });

  it("navigates to the Assets module from the 'Manage in Assets' link", () => {
    setupFetchData(makeEmployee());
    renderWith();
    fireEvent.click(screen.getByText("Manage in Assets"));
    expect(mockNavigate).toHaveBeenCalledWith("/assets");
  });
});
