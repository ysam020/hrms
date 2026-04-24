import {
  fromPermissionsArray,
  hasPermissionFromMask,
  SUPERUSER_MASK,
} from "@web/shared/utils/permissions/PermissionBitmask";

// ─── fromPermissionsArray ──────────────────────────────────────────────────

describe("fromPermissionsArray", () => {
  it("returns 0n for an empty array", () => {
    expect(fromPermissionsArray([])).toBe(0n);
  });

  it("returns 0n for null/undefined input", () => {
    expect(fromPermissionsArray(null)).toBe(0n);
    expect(fromPermissionsArray(undefined)).toBe(0n);
  });

  it("returns a non-zero mask for a valid scoped permission", () => {
    const mask = fromPermissionsArray(["Attendance:mark_attendance:self"]);
    expect(mask).not.toBe(0n);
  });

  it("returns a non-zero mask for a valid scopeless permission", () => {
    const mask = fromPermissionsArray(["Analytics:view_employee_analytics"]);
    expect(mask).not.toBe(0n);
  });

  it("different scopes of the same action produce different bits", () => {
    const selfMask = fromPermissionsArray(["Attendance:view:self"]);
    const teamMask = fromPermissionsArray(["Attendance:view:team"]);
    const allMask = fromPermissionsArray(["Attendance:view:all"]);

    expect(selfMask).not.toBe(teamMask);
    expect(teamMask).not.toBe(allMask);
    expect(selfMask).not.toBe(allMask);
  });

  it("combining permissions produces the OR of individual masks", () => {
    const selfMask = fromPermissionsArray(["Attendance:view:self"]);
    const teamMask = fromPermissionsArray(["Attendance:view:team"]);
    const combined = fromPermissionsArray([
      "Attendance:view:self",
      "Attendance:view:team",
    ]);

    expect(combined).toBe(selfMask | teamMask);
  });

  it("silently skips unknown module:action strings", () => {
    const mask = fromPermissionsArray(["Unknown:nonexistent:scope"]);
    expect(mask).toBe(0n);
  });

  it("silently skips malformed strings with no colon", () => {
    const mask = fromPermissionsArray(["nocolonstring"]);
    expect(mask).toBe(0n);
  });

  it("includes only known permissions and ignores unknown ones", () => {
    const mask = fromPermissionsArray([
      "Attendance:mark_attendance:self",
      "Garbage:stuff:here",
    ]);
    const attendanceMask = fromPermissionsArray([
      "Attendance:mark_attendance:self",
    ]);
    expect(mask).toBe(attendanceMask);
  });

  it("scopeless permission ignores any trailing scope", () => {
    // Analytics:view_employee_analytics is scopeless; :self suffix should not match
    const withScope = fromPermissionsArray([
      "Analytics:view_employee_analytics:self",
    ]);
    const scopeless = fromPermissionsArray([
      "Analytics:view_employee_analytics",
    ]);
    // the ":self" variant won't find a scope bit so it falls through to scopelessBit
    // both resolve the same way — either both 0 or both the scopeless bit
    expect(withScope).toBe(scopeless);
  });

  it("SUPERUSER_MASK covers all defined permission bits", () => {
    // Every individual permission bit should be contained within SUPERUSER_MASK
    const perms = [
      "Attendance:mark_attendance:self",
      "Leave:apply:self",
      "Analytics:view_employee_analytics",
      "Permissions:create_role",
      "ResignationProcess:resign:self",
      "Policy:create",
    ];
    for (const perm of perms) {
      const bit = fromPermissionsArray([perm]);
      expect((SUPERUSER_MASK & bit) === bit).toBe(true);
    }
  });
});

// ─── hasPermissionFromMask ─────────────────────────────────────────────────

describe("hasPermissionFromMask", () => {
  it("returns true when the exact scoped permission bit is set", () => {
    const mask = fromPermissionsArray(["Leave:view:team"]);
    expect(hasPermissionFromMask(mask, "Leave", "view", "team")).toBe(true);
  });

  it("returns false when a different scope bit is set", () => {
    const mask = fromPermissionsArray(["Leave:view:team"]);
    expect(hasPermissionFromMask(mask, "Leave", "view", "self")).toBe(false);
    expect(hasPermissionFromMask(mask, "Leave", "view", "all")).toBe(false);
  });

  it("returns true for a scopeless permission using '-'", () => {
    const mask = fromPermissionsArray(["Analytics:view_employee_analytics"]);
    expect(
      hasPermissionFromMask(mask, "Analytics", "view_employee_analytics", "-"),
    ).toBe(true);
  });

  it("returns false for a scopeless permission when mask is 0", () => {
    expect(
      hasPermissionFromMask(0n, "Analytics", "view_employee_analytics", "-"),
    ).toBe(false);
  });

  it("returns false for an unknown module", () => {
    const mask = fromPermissionsArray(["Attendance:view:all"]);
    expect(hasPermissionFromMask(mask, "Unknown", "view", "all")).toBe(false);
  });

  it("returns false for an unknown action on a known module", () => {
    const mask = fromPermissionsArray(["Attendance:view:all"]);
    expect(hasPermissionFromMask(mask, "Attendance", "fly", "all")).toBe(false);
  });

  it("does not grant 'all' scope when only 'self' is in mask", () => {
    const mask = fromPermissionsArray(["Attendance:view:self"]);
    expect(hasPermissionFromMask(mask, "Attendance", "view", "all")).toBe(
      false,
    );
  });

  it("returns true for multiple permissions — each checked independently", () => {
    const mask = fromPermissionsArray([
      "Leave:apply:self",
      "Leave:view:team",
      "Permissions:create_role",
    ]);
    expect(hasPermissionFromMask(mask, "Leave", "apply", "self")).toBe(true);
    expect(hasPermissionFromMask(mask, "Leave", "view", "team")).toBe(true);
    expect(hasPermissionFromMask(mask, "Permissions", "create_role", "-")).toBe(
      true,
    );
    expect(hasPermissionFromMask(mask, "Leave", "view", "all")).toBe(false);
  });

  it("treats null scope the same as '-' (scopeless check)", () => {
    const mask = fromPermissionsArray(["Policy:create"]);
    expect(hasPermissionFromMask(mask, "Policy", "create", null)).toBe(true);
  });
});
