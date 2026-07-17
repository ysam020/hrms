import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import RolePermissionsModal from "@web/features/layout/permissions/RolePermissionsModal";
import { AlertContext } from "@web/app/providers/AlertContext";
import useFetchData from "@web/shared/hooks/useFetchData";
import apiClient from "@web/core/http/axiosConfig";
import { permissionStructure } from "@web/assets/data/permissionStructure";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/core/http/axiosConfig", () => ({ default: { put: vi.fn() } }));
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/components/PermissionMatrix", () => ({
  default: (props: any) => (
    <div>
      <span data-testid="active-module">{props.activeModule}</span>
      <span data-testid="is-checked-wildcard">
        {String(props.isChecked("Attendance", "view", "own"))}
      </span>
      <span data-testid="is-checked-dash-scope">
        {String(props.isChecked("JobOpenings", "manage", "-"))}
      </span>
      <button onClick={() => props.onToggle("Attendance", "view", "own")}>
        toggle-attendance-view
      </button>
      <button onClick={() => props.onToggle("JobOpenings", "manage", "-")}>
        toggle-joboopenings-manage
      </button>
    </div>
  ),
}));

const firstModule = Object.keys(permissionStructure).sort((a, b) => {
  const aDisplay = a.replace(/([A-Z])/g, " $1").trim();
  const bDisplay = b.replace(/([A-Z])/g, " $1").trim();
  return aDisplay.localeCompare(bDisplay);
})[0];

function mockFetch({ data = { permissions: [] }, loading = false } = {}) {
  mockUseFetchData.mockReturnValue({
    data,
    loading,
    error: null,
    refetch: vi.fn(),
  });
}

function renderWith({
  open = true,
  roleId = "r1",
  roleName = "Manager",
  setAlert = vi.fn(),
  handleClose = vi.fn(),
} = {}) {
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <RolePermissionsModal
        open={open}
        roleId={roleId}
        roleName={roleName}
        handleClose={handleClose}
      />
    </AlertContext.Provider>,
  );
}

describe("RolePermissionsModal", () => {
  beforeEach(() => {
    mockPut.mockReset();
    vi.useRealTimers();
  });

  it("renders nothing when closed", () => {
    mockFetch();
    renderWith({ open: false });
    expect(
      screen.queryByText(/Manage Permissions for/),
    ).not.toBeInTheDocument();
  });

  it("shows a loading spinner and no matrix while permissions are fetching", () => {
    mockFetch({ loading: true });
    renderWith();
    expect(screen.queryByTestId("active-module")).not.toBeInTheDocument();
  });

  it("shows the role name in the header and defaults to the first module alphabetically", () => {
    mockFetch();
    renderWith({ roleName: "Manager" });
    expect(
      screen.getByText("Manage Permissions for: Manager"),
    ).toBeInTheDocument();
    expect(screen.getByTestId("active-module").textContent).toBe(firstModule);
  });

  it("switches the active module when a different tab is clicked", () => {
    mockFetch();
    renderWith();
    const otherModule = Object.keys(permissionStructure).find(
      (m) => m !== firstModule,
    )!;
    const otherLabel = otherModule.replace(/([A-Z])/g, " $1").trim();

    fireEvent.click(screen.getByRole("tab", { name: otherLabel }));

    expect(screen.getByTestId("active-module").textContent).toBe(otherModule);
  });

  it("treats the '*:*:*' wildcard as granting every permission", () => {
    mockFetch({ data: { permissions: ["*:*:*"] } });
    renderWith();
    expect(screen.getByTestId("is-checked-wildcard").textContent).toBe("true");
    expect(screen.getByTestId("is-checked-dash-scope").textContent).toBe(
      "true",
    );
  });

  it("builds a module:action (no scope) permission string when scope is '-'", () => {
    mockFetch({ data: { permissions: ["JobOpenings:manage"] } });
    renderWith();
    expect(screen.getByTestId("is-checked-dash-scope").textContent).toBe(
      "true",
    );
    expect(screen.getByTestId("is-checked-wildcard").textContent).toBe("false");
  });

  it("accepts a plain array response as well as a { permissions } object", () => {
    mockFetch({ data: ["Attendance:view:own"] });
    renderWith();
    expect(screen.getByTestId("is-checked-wildcard").textContent).toBe("true");
  });

  it("hides the Save button until a permission is toggled", () => {
    mockFetch({ data: { permissions: [] } });
    renderWith();
    expect(screen.queryByText("Save Permissions")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("toggle-attendance-view"));

    expect(screen.getByText("Save Permissions")).toBeInTheDocument();
  });

  it("removes a permission that is already granted when toggled again", () => {
    mockFetch({ data: { permissions: ["Attendance:view:own"] } });
    renderWith();
    expect(screen.getByTestId("is-checked-wildcard").textContent).toBe("true");

    fireEvent.click(screen.getByText("toggle-attendance-view"));

    expect(screen.getByTestId("is-checked-wildcard").textContent).toBe("false");
  });

  it("saves the updated permission list and shows a delayed success alert", async () => {
    vi.useFakeTimers();
    mockPut.mockResolvedValue({});
    const setAlert = vi.fn();
    mockFetch({ data: { permissions: [] } });
    renderWith({ setAlert });

    fireEvent.click(screen.getByText("toggle-attendance-view"));
    fireEvent.click(screen.getByRole("button", { name: "Save Permissions" }));

    await vi.waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(expect.any(String), {
        permissions: ["Attendance:view:own"],
      }),
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Permissions updated successfully",
      }),
    );
    // Save button disappears once hasChanges resets
    expect(screen.queryByText("Save Permissions")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("shows a delayed network-specific error message on save failure", async () => {
    vi.useFakeTimers();
    mockPut.mockRejectedValue(new Error("Network Error"));
    const setAlert = vi.fn();
    mockFetch({ data: { permissions: [] } });
    renderWith({ setAlert });

    fireEvent.click(screen.getByText("toggle-attendance-view"));
    fireEvent.click(screen.getByRole("button", { name: "Save Permissions" }));

    await vi.waitFor(() => expect(mockPut).toHaveBeenCalled());
    await vi.advanceTimersByTimeAsync(100);

    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message:
          "Network Error, your details will be submitted when you are back online",
      }),
    );
    vi.useRealTimers();
  });

  it("closes the modal via Cancel", () => {
    mockFetch();
    const handleClose = vi.fn();
    renderWith({ handleClose });
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(handleClose).toHaveBeenCalled();
  });
});
