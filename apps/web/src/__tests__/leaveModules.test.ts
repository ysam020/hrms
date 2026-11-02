import {
  canActOnLeave,
  canManageLeaves,
} from "@next/features/attendance/utils/leaveRules";

// The leave list's rules and HTTP calls, extracted from Attendance.tsx so
// they can be tested without rendering the screen.

const apiGet = vi.fn();
const apiPut = vi.fn();
vi.mock("@next/lib/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@next/lib/api")>();
  return {
    ...actual,
    apiClient: {
      get: (...a: unknown[]) => apiGet(...a),
      put: (...a: unknown[]) => apiPut(...a),
    },
  };
});

describe("leave rules", () => {
  const manager = {
    id: "m",
    tenantRole: "employee",
    permissions: ["Leave:approve:team"],
  };
  it("owners/admins and Leave:approve holders may manage", () => {
    expect(canManageLeaves({ tenantRole: "owner" })).toBe(true);
    expect(canManageLeaves(manager)).toBe(true);
    expect(
      canManageLeaves({
        tenantRole: "employee",
        permissions: ["Leave:view:all"],
      }),
    ).toBe(false);
    expect(canManageLeaves(null)).toBe(false);
  });
  it("nobody acts on their own request, superusers excepted", () => {
    expect(canActOnLeave(manager, { userId: "e1" })).toBe(true);
    expect(canActOnLeave(manager, { userId: "m" })).toBe(false);
    expect(canActOnLeave({ id: "s", isSuperUser: true }, { userId: "s" })).toBe(
      true,
    );
  });
});

describe("leave service", () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPut.mockReset();
  });

  it("builds the same query and normalises the response", async () => {
    const { listLeaveApplications } =
      await import("@next/features/attendance/services/leaveService");
    apiGet.mockResolvedValue({
      data: {
        data: { records: [{ id: "l1" }], pagination: { totalCount: 7 } },
      },
    });
    const page = await listLeaveApplications({
      page: 2,
      limit: 25,
      status: "Pending",
      futureOnly: true,
      search: "asha",
    });
    expect(apiGet.mock.calls[0]![0]).toBe(
      "/get-leave-applications?page=2&limit=25&status=Pending&futureOnly=true&search=asha",
    );
    expect(page).toEqual({ data: [{ id: "l1" }], totalCount: 7 });
  });

  it("treats success:false as a failure with the server's message", async () => {
    const { updateLeaveStatus } =
      await import("@next/features/attendance/services/leaveService");
    apiPut.mockResolvedValue({
      data: { success: false, message: "Already decided." },
    });
    await expect(updateLeaveStatus("l1", "approve")).rejects.toThrow(
      "Already decided.",
    );
    expect(apiPut).toHaveBeenCalledWith("/update-leave-status", {
      leaveId: "l1",
      action: "approve",
    });
  });

  it("reports bulk outcomes", async () => {
    const { bulkUpdateLeaveStatus } =
      await import("@next/features/attendance/services/leaveService");
    apiPut.mockResolvedValue({
      data: {
        message: "2 updated.",
        data: { succeeded: ["a"], failed: ["b"] },
      },
    });
    expect(await bulkUpdateLeaveStatus(["a", "b"], "reject")).toEqual({
      succeeded: ["a"],
      failed: ["b"],
      message: "2 updated.",
    });
  });
});
