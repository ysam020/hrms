import hasPermission from "@web/shared/utils/permissions/hasPermission";

describe("hasPermission", () => {
  // ── Superuser bypass ───────────────────────────────────────────────────────

  it("always returns true for a superuser regardless of permissions", () => {
    expect(hasPermission("Leave", "view", "self", true, [])).toBe(true);
  });

  it("superuser returns true even with an empty permissions array", () => {
    expect(
      hasPermission("Attendance", "mark_attendance", "self", true, []),
    ).toBe(true);
  });

  it("superuser returns true for unknown module/action", () => {
    expect(hasPermission("Unknown", "fly", "-", true, [])).toBe(true);
  });

  // ── Empty / falsy permissions ──────────────────────────────────────────────

  it("returns false for null permissions array", () => {
    expect(hasPermission("Leave", "view", "self", false, null)).toBe(false);
  });

  it("returns false for undefined permissions array", () => {
    expect(hasPermission("Leave", "view", "self", false, undefined)).toBe(
      false,
    );
  });

  it("returns false for empty permissions array", () => {
    expect(hasPermission("Leave", "view", "self", false, [])).toBe(false);
  });

  // ── Scoped permissions ────────────────────────────────────────────────────

  it("returns true when the exact permission is in the array", () => {
    expect(
      hasPermission("Leave", "view", "team", false, ["Leave:view:team"]),
    ).toBe(true);
  });

  it("returns false when only a different scope is present", () => {
    expect(
      hasPermission("Leave", "view", "all", false, ["Leave:view:self"]),
    ).toBe(false);
  });

  it("exact-match semantics: 'all' scope does not imply 'self'", () => {
    expect(
      hasPermission("Leave", "view", "self", false, ["Leave:view:all"]),
    ).toBe(false);
  });

  // ── Scopeless permissions ─────────────────────────────────────────────────

  it("returns true for a scopeless permission using '-'", () => {
    expect(
      hasPermission("Analytics", "view_employee_analytics", "-", false, [
        "Analytics:view_employee_analytics",
      ]),
    ).toBe(true);
  });

  it("returns false for scopeless permission when not in array", () => {
    expect(
      hasPermission("Analytics", "view_salary_analytics", "-", false, [
        "Analytics:view_employee_analytics",
      ]),
    ).toBe(false);
  });

  // ── WeakMap cache — same array reference ──────────────────────────────────

  it("returns consistent results for the same permissions reference", () => {
    const perms = ["Attendance:mark_attendance:self", "Leave:apply:self"];

    const result1 = hasPermission(
      "Attendance",
      "mark_attendance",
      "self",
      false,
      perms,
    );
    const result2 = hasPermission(
      "Attendance",
      "mark_attendance",
      "self",
      false,
      perms,
    );

    expect(result1).toBe(true);
    expect(result2).toBe(true);
  });

  it("caches by reference: different array with same content is re-computed", () => {
    const perms1 = ["Leave:view:self"];
    const perms2 = ["Leave:view:self"]; // same content, different reference

    expect(hasPermission("Leave", "view", "self", false, perms1)).toBe(true);
    expect(hasPermission("Leave", "view", "self", false, perms2)).toBe(true);
  });

  // ── Multiple permissions ──────────────────────────────────────────────────

  it("checks specific permission among many", () => {
    const perms = [
      "Leave:apply:self",
      "Leave:view:team",
      "Permissions:create_role",
      "Analytics:view_employee_analytics",
    ];

    expect(hasPermission("Leave", "apply", "self", false, perms)).toBe(true);
    expect(hasPermission("Leave", "view", "team", false, perms)).toBe(true);
    expect(hasPermission("Permissions", "create_role", "-", false, perms)).toBe(
      true,
    );
    expect(hasPermission("Leave", "view", "all", false, perms)).toBe(false);
    expect(hasPermission("Permissions", "delete_role", "-", false, perms)).toBe(
      false,
    );
  });

  // ── Unknown module / action ───────────────────────────────────────────────

  it("returns false for an unknown module even with a full permission array", () => {
    expect(
      hasPermission("Ghost", "haunt", "self", false, ["Ghost:haunt:self"]),
    ).toBe(false);
  });
});
