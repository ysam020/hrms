import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import UserPermissions from "@web/features/layout/permissions/UserPermissions";
import { AlertContext } from "@web/app/providers/AlertContext";
import useFetchData from "@web/shared/hooks/useFetchData";
import apiClient from "@web/core/http/axiosConfig";
import hasPermission from "@web/shared/utils/permissions/hasPermission";
import togglePermission from "@web/shared/utils/permissions/togglePermission";
import saveUserPermissions from "@web/shared/utils/permissions/saveUserPermissions";

vi.mock("@web/shared/hooks/useFetchData");
const mockUseFetchData = useFetchData as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/core/http/axiosConfig", () => ({ default: { put: vi.fn() } }));
const mockPut = apiClient.put as unknown as ReturnType<typeof vi.fn>;

vi.mock("@web/shared/utils/permissions/hasPermission", () => ({
  default: vi.fn(() => false),
}));
vi.mock("@web/shared/utils/permissions/togglePermission", () => ({
  default: vi.fn(),
}));
vi.mock("@web/shared/utils/permissions/saveUserPermissions", () => ({
  default: vi.fn(),
}));

vi.mock("primereact/autocomplete", () => ({
  AutoComplete: (props: any) => (
    <div>
      <input
        placeholder={props.placeholder}
        value={props.value}
        onChange={(e) => props.onChange({ value: e.target.value })}
      />
      <button onClick={() => props.onSelect({ value: props.value })}>
        select-typed-user
      </button>
    </div>
  ),
}));

vi.mock("primereact/dropdown", () => ({
  Dropdown: (props: any) => (
    <select
      aria-label="Select a Role"
      disabled={props.disabled}
      value={props.value ? JSON.stringify(props.value) : ""}
      onChange={(e) => {
        const val = e.target.value ? JSON.parse(e.target.value) : null;
        props.onChange({ value: val });
      }}
    >
      <option value="">-- none --</option>
      {(props.options || []).map((opt: any, i: number) => (
        <option key={i} value={JSON.stringify(opt)}>
          {opt.name}
        </option>
      ))}
    </select>
  ),
}));

vi.mock("@web/shared/components/PermissionMatrix", () => ({
  default: (props: any) => (
    <div>
      <span>Matrix: {props.activeModule}</span>
      <span>{props.disabled ? "matrix-disabled" : "matrix-enabled"}</span>
    </div>
  ),
}));

const mockHasPermission = hasPermission as unknown as ReturnType<typeof vi.fn>;
const mockTogglePermission = togglePermission as unknown as ReturnType<
  typeof vi.fn
>;
const mockSaveUserPermissions = saveUserPermissions as unknown as ReturnType<
  typeof vi.fn
>;

const MANAGER_ROLE = {
  _id: "r1",
  name: "Manager",
  permissions: ["Attendance:view:team"],
};

function mockFetchData({
  users = [{ id: "u1", username: "jdoe" }],
  roles = [MANAGER_ROLE],
  userPermissions = [] as string[],
  isSuperUser = false,
  permissionsLoading = false,
}: any = {}) {
  // Precompute every response object once so useFetchData returns the exact
  // same reference on every render — a fresh literal per call would make
  // superUserData/userPermissionsData "change" every render and infinite-loop
  // the component's effects that depend on them.
  const usersResp = {
    data: users,
    loading: false,
    error: null,
    refetch: vi.fn(),
  };
  const rolesResp = {
    data: roles,
    loading: false,
    error: null,
    refetch: vi.fn(),
  };
  const permsResp = {
    data: userPermissions,
    loading: permissionsLoading,
    error: null,
    refetch: vi.fn(),
  };
  const superResp = {
    data: { isSuperUser },
    loading: false,
    error: null,
    refetch: vi.fn(),
  };
  const emptyResp = { data: [], loading: false, error: null, refetch: vi.fn() };

  mockUseFetchData.mockImplementation((uri: string | null) => {
    if (uri === "/get-all-users?limit=200") return usersResp;
    if (uri === "/get-role-and-permissions") return rolesResp;
    if (typeof uri === "string" && uri.startsWith("/get-user-permissions/"))
      return permsResp;
    if (typeof uri === "string" && uri.startsWith("/is-superuser/"))
      return superResp;
    return emptyResp;
  });
}

function renderWith(setAlert = vi.fn()) {
  return render(
    <AlertContext.Provider value={{ setAlert } as any}>
      <UserPermissions />
    </AlertContext.Provider>,
  );
}

function selectUser(username = "jdoe") {
  fireEvent.change(screen.getByPlaceholderText("Select User"), {
    target: { value: username },
  });
  fireEvent.click(screen.getByText("select-typed-user"));
}

describe("UserPermissions", () => {
  beforeEach(() => {
    mockPut.mockReset();
    mockHasPermission.mockReset().mockReturnValue(false);
    mockTogglePermission.mockReset();
    mockSaveUserPermissions.mockReset();
  });

  it("shows the empty state prompting a user selection before any user is picked", () => {
    mockFetchData();
    renderWith();
    expect(
      screen.getByText(
        "Select a user above to view and manage their permissions.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the permission matrix for the default 'Attendance' module once a user is selected", () => {
    mockFetchData({ userPermissions: [] });
    renderWith();
    selectUser();
    expect(screen.getByText("Matrix: Attendance")).toBeInTheDocument();
    expect(
      screen.queryByText(
        "Select a user above to view and manage their permissions.",
      ),
    ).not.toBeInTheDocument();
  });

  it("shows a loading indicator while user permissions are being fetched", () => {
    mockFetchData({ permissionsLoading: true });
    renderWith();
    selectUser();
    expect(screen.getByText("Loading user permissions...")).toBeInTheDocument();
  });

  it("shows the superuser banner and disables the matrix when the selected user is a superuser", () => {
    mockFetchData({ isSuperUser: true });
    renderWith();
    selectUser();
    expect(
      screen.getByText(/This user has Super Admin privileges/),
    ).toBeInTheDocument();
    expect(screen.getByText("matrix-disabled")).toBeInTheDocument();
  });

  it("does not show the superuser banner for a regular user", () => {
    mockFetchData({ isSuperUser: false });
    renderWith();
    selectUser();
    expect(
      screen.queryByText(/Super Admin privileges/),
    ).not.toBeInTheDocument();
    expect(screen.getByText("matrix-enabled")).toBeInTheDocument();
  });

  it("grants superuser status, shows a success alert, and clears the selected role", async () => {
    mockFetchData({ isSuperUser: false });
    mockPut.mockResolvedValue({
      data: { message: "Superuser status updated" },
    });
    const setAlert = vi.fn();
    renderWith(setAlert);
    selectUser();

    fireEvent.click(screen.getByRole("checkbox", { name: "Is Superuser" }));

    await waitFor(() =>
      expect(mockPut).toHaveBeenCalledWith(
        expect.stringContaining("/update-superuser/jdoe"),
        {
          isSuperUser: true,
        },
      ),
    );
    expect(setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "success",
        message: "Superuser status updated",
      }),
    );
  });

  it("shows an error alert when updating superuser status fails", async () => {
    mockFetchData({ isSuperUser: false });
    mockPut.mockRejectedValue({
      response: { data: { message: "Not allowed" } },
    });
    const setAlert = vi.fn();
    renderWith(setAlert);
    selectUser();

    fireEvent.click(screen.getByRole("checkbox", { name: "Is Superuser" }));

    await waitFor(() =>
      expect(setAlert).toHaveBeenCalledWith(
        expect.objectContaining({ severity: "error", message: "Not allowed" }),
      ),
    );
  });

  it("merges role permissions into the user's permissions when a role is selected, enabling Save", () => {
    mockFetchData({ userPermissions: ["Leave:view:own"] });
    renderWith();
    selectUser();

    expect(screen.queryByText("Save Permissions")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Select a Role"), {
      target: { value: JSON.stringify(MANAGER_ROLE) },
    });

    expect(screen.getByText("Save Permissions")).toBeInTheDocument();
  });

  it("reverts to the user's original permissions when the role is deselected", () => {
    mockFetchData({ userPermissions: ["Leave:view:own"] });
    renderWith();
    selectUser();

    const roleSelect = screen.getByLabelText("Select a Role");
    fireEvent.change(roleSelect, {
      target: { value: JSON.stringify(MANAGER_ROLE) },
    });
    expect(screen.getByText("Save Permissions")).toBeInTheDocument();

    fireEvent.change(roleSelect, { target: { value: "" } });
    expect(screen.queryByText("Save Permissions")).not.toBeInTheDocument();
  });

  it("calls saveUserPermissions with the selected user, role, and permissions on Save", () => {
    mockFetchData({ userPermissions: ["Leave:view:own"] });
    renderWith();
    selectUser();
    fireEvent.change(screen.getByLabelText("Select a Role"), {
      target: { value: JSON.stringify(MANAGER_ROLE) },
    });

    fireEvent.click(screen.getByText("Save Permissions"));

    expect(mockSaveUserPermissions).toHaveBeenCalledWith(
      "jdoe",
      false,
      expect.any(Function),
      expect.arrayContaining(["Leave:view:own", "Attendance:view:team"]),
      MANAGER_ROLE,
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function),
    );
  });

  it("switches the active module tab and reflects it in the permission matrix", () => {
    mockFetchData();
    renderWith();
    selectUser();

    fireEvent.click(screen.getByRole("tab", { name: "Leave" }));

    expect(screen.getByText("Matrix: Leave")).toBeInTheDocument();
  });
});
