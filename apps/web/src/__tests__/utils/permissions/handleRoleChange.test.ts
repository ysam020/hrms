import handleRoleChange from "@web/shared/utils/permissions/handleRoleChange";

function makeSetters() {
  return {
    setSelectedRole: vi.fn(),
    setPermissions: vi.fn(),
    setIsSuperUser: vi.fn(),
    setHasChanges: vi.fn(),
  };
}

describe("handleRoleChange", () => {
  it("merges role permissions with original user permissions and dedupes", () => {
    const s = makeSetters();
    const role = {
      name: "Manager",
      permissions: ["Leave:approve:team", "Leave:view:team"],
    };
    const original = ["Leave:view:team", "Attendance:view:self"];

    handleRoleChange(
      { value: role },
      s.setSelectedRole,
      s.setPermissions,
      s.setIsSuperUser,
      s.setHasChanges,
      original,
    );

    expect(s.setSelectedRole).toHaveBeenCalledWith(role);
    const merged = s.setPermissions.mock.calls[0][0];
    expect(new Set(merged)).toEqual(
      new Set([
        "Leave:approve:team",
        "Leave:view:team",
        "Attendance:view:self",
      ]),
    );
  });

  it("sets isSuperUser true when the merged permissions include the wildcard grant", () => {
    const s = makeSetters();
    const role = { name: "SuperRole", permissions: ["*:*:*"] };

    handleRoleChange(
      { value: role },
      s.setSelectedRole,
      s.setPermissions,
      s.setIsSuperUser,
      s.setHasChanges,
      [],
    );

    expect(s.setIsSuperUser).toHaveBeenCalledWith(true);
  });

  it("sets isSuperUser false when neither role nor original permissions include the wildcard", () => {
    const s = makeSetters();
    const role = { name: "Manager", permissions: ["Leave:view:team"] };

    handleRoleChange(
      { value: role },
      s.setSelectedRole,
      s.setPermissions,
      s.setIsSuperUser,
      s.setHasChanges,
      [],
    );

    expect(s.setIsSuperUser).toHaveBeenCalledWith(false);
  });

  it("falls back to the original user permissions when the role is deselected (no permissions on the value)", () => {
    const s = makeSetters();
    const original = ["Leave:view:team"];

    handleRoleChange(
      { value: null },
      s.setSelectedRole,
      s.setPermissions,
      s.setIsSuperUser,
      s.setHasChanges,
      original,
    );

    expect(s.setPermissions).toHaveBeenCalledWith(original);
    expect(s.setIsSuperUser).toHaveBeenCalledWith(false);
  });

  it("flags hasChanges as false when the merged set is identical to the original (order-independent)", () => {
    const s = makeSetters();
    const role = {
      name: "SameRole",
      permissions: ["Attendance:view:self", "Leave:view:team"],
    };
    const original = ["Leave:view:team", "Attendance:view:self"];

    handleRoleChange(
      { value: role },
      s.setSelectedRole,
      s.setPermissions,
      s.setIsSuperUser,
      s.setHasChanges,
      original,
    );

    expect(s.setHasChanges).toHaveBeenCalledWith(false);
  });

  it("flags hasChanges as true when the merged set differs from the original", () => {
    const s = makeSetters();
    const role = { name: "Manager", permissions: ["Leave:approve:team"] };
    const original = ["Leave:view:team"];

    handleRoleChange(
      { value: role },
      s.setSelectedRole,
      s.setPermissions,
      s.setIsSuperUser,
      s.setHasChanges,
      original,
    );

    expect(s.setHasChanges).toHaveBeenCalledWith(true);
  });

  it("falls back to hasChanges=true when originalUserPermissions is falsy", () => {
    const s = makeSetters();
    const role = { name: "Manager", permissions: ["Leave:view:team"] };

    handleRoleChange(
      { value: role },
      s.setSelectedRole,
      s.setPermissions,
      s.setIsSuperUser,
      s.setHasChanges,
      undefined,
    );

    expect(s.setHasChanges).toHaveBeenCalledWith(true);
  });
});
