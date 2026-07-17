import saveUserPermissions from "@web/shared/utils/permissions/saveUserPermissions";
import apiClient from "@web/core/http/axiosConfig";

// saveUserPermissions.tsx both calls `apiClient.put(...)` and calls the
// default export directly as a function (`apiClient(GET_USER_PERMISSIONS(...))`),
// so the mock must be a callable function that also carries a `.put` method.
vi.mock("@web/core/http/axiosConfig", () => {
  const fn = vi.fn();
  (fn as any).put = vi.fn();
  return { default: fn };
});

const mockApiClient = apiClient as unknown as ReturnType<typeof vi.fn> & {
  put: ReturnType<typeof vi.fn>;
};

function makeCallbacks() {
  return {
    setSaving: vi.fn(),
    setHasChanges: vi.fn(),
    setAlert: vi.fn(),
    setPermissions: vi.fn(),
    setOriginalUserPermissions: vi.fn(),
  };
}

describe("saveUserPermissions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does nothing when there is no selected user", async () => {
    const cb = makeCallbacks();
    await saveUserPermissions(
      null,
      false,
      cb.setSaving,
      [],
      null,
      cb.setHasChanges,
      cb.setAlert,
      cb.setPermissions,
      cb.setOriginalUserPermissions,
    );
    expect(cb.setSaving).not.toHaveBeenCalled();
  });

  it("does nothing when the target user is a superuser", async () => {
    const cb = makeCallbacks();
    await saveUserPermissions(
      "user-1",
      true,
      cb.setSaving,
      [],
      null,
      cb.setHasChanges,
      cb.setAlert,
      cb.setPermissions,
      cb.setOriginalUserPermissions,
    );
    expect(cb.setSaving).not.toHaveBeenCalled();
  });

  it("saves permissions, shows success, and refreshes from the server on 200", async () => {
    mockApiClient.put.mockResolvedValue({ status: 200 });
    mockApiClient.mockResolvedValue({
      data: { data: ["Leave:view:self"] },
    });
    const cb = makeCallbacks();

    await saveUserPermissions(
      "user-1",
      false,
      cb.setSaving,
      ["Leave:view:self"],
      { name: "Manager" },
      cb.setHasChanges,
      cb.setAlert,
      cb.setPermissions,
      cb.setOriginalUserPermissions,
    );

    expect(cb.setSaving).toHaveBeenNthCalledWith(1, true);
    expect(mockApiClient.put).toHaveBeenCalledWith("/save-user-permissions", {
      permissions: ["Leave:view:self"],
      selectedUser: "user-1",
      selectedRole: "Manager",
    });
    expect(cb.setHasChanges).toHaveBeenCalledWith(false);
    expect(cb.setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "success" }),
    );
    expect(cb.setPermissions).toHaveBeenCalledWith(["Leave:view:self"]);
    expect(cb.setOriginalUserPermissions).toHaveBeenCalledWith([
      "Leave:view:self",
    ]);
    expect(cb.setSaving).toHaveBeenLastCalledWith(false);
  });

  it("omits selectedRole from the payload when no role is selected", async () => {
    mockApiClient.put.mockResolvedValue({ status: 200 });
    mockApiClient.mockResolvedValue({ data: { data: [] } });
    const cb = makeCallbacks();

    await saveUserPermissions(
      "user-1",
      false,
      cb.setSaving,
      [],
      null,
      cb.setHasChanges,
      cb.setAlert,
      cb.setPermissions,
      cb.setOriginalUserPermissions,
    );

    expect(mockApiClient.put).toHaveBeenCalledWith("/save-user-permissions", {
      permissions: [],
      selectedUser: "user-1",
    });
  });

  it("shows a warning (not an error) when the save succeeds but the refresh fetch fails", async () => {
    mockApiClient.put.mockResolvedValue({ status: 200 });
    mockApiClient.mockRejectedValue(new Error("refresh failed"));
    const cb = makeCallbacks();

    await saveUserPermissions(
      "user-1",
      false,
      cb.setSaving,
      ["Leave:view:self"],
      null,
      cb.setHasChanges,
      cb.setAlert,
      cb.setPermissions,
      cb.setOriginalUserPermissions,
    );

    expect(cb.setHasChanges).toHaveBeenCalledWith(false); // save itself succeeded
    expect(cb.setAlert).toHaveBeenLastCalledWith(
      expect.objectContaining({ severity: "warning" }),
    );
  });

  it("shows an error alert when the save call returns a non-200 status", async () => {
    mockApiClient.put.mockResolvedValue({ status: 500 });
    const cb = makeCallbacks();

    await saveUserPermissions(
      "user-1",
      false,
      cb.setSaving,
      [],
      null,
      cb.setHasChanges,
      cb.setAlert,
      cb.setPermissions,
      cb.setOriginalUserPermissions,
    );

    expect(cb.setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ severity: "error" }),
    );
    expect(cb.setHasChanges).not.toHaveBeenCalled();
    expect(cb.setSaving).toHaveBeenLastCalledWith(false);
  });

  it("shows the network-error-specific message when the request fails with a Network Error", async () => {
    mockApiClient.put.mockRejectedValue(new Error("Network Error"));
    const cb = makeCallbacks();

    await saveUserPermissions(
      "user-1",
      false,
      cb.setSaving,
      [],
      null,
      cb.setHasChanges,
      cb.setAlert,
      cb.setPermissions,
      cb.setOriginalUserPermissions,
    );

    expect(cb.setAlert).toHaveBeenCalledWith(
      expect.objectContaining({
        severity: "error",
        message: expect.stringContaining("submitted when you are back online"),
      }),
    );
  });

  it("prefers the server-provided error message when present", async () => {
    const err: any = new Error("request failed");
    err.response = { data: { message: "Permission denied by server" } };
    mockApiClient.put.mockRejectedValue(err);
    const cb = makeCallbacks();

    await saveUserPermissions(
      "user-1",
      false,
      cb.setSaving,
      [],
      null,
      cb.setHasChanges,
      cb.setAlert,
      cb.setPermissions,
      cb.setOriginalUserPermissions,
    );

    expect(cb.setAlert).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Permission denied by server" }),
    );
  });

  it("always resets setSaving(false) even after an error", async () => {
    mockApiClient.put.mockRejectedValue(new Error("boom"));
    const cb = makeCallbacks();

    await saveUserPermissions(
      "user-1",
      false,
      cb.setSaving,
      [],
      null,
      cb.setHasChanges,
      cb.setAlert,
      cb.setPermissions,
      cb.setOriginalUserPermissions,
    );

    expect(cb.setSaving).toHaveBeenLastCalledWith(false);
  });
});
