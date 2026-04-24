import togglePermission from "@web/shared/utils/permissions/togglePermission";

const setup = (initial: string[] = [], original?: string[]) => {
  const setPermissions = vi.fn();
  const setHasChanges = vi.fn();
  return { setPermissions, setHasChanges, initial, original };
};

describe("togglePermission", () => {
  // ── Superuser guard ────────────────────────────────────────────────────────

  it("does nothing when isSuperUser is true", () => {
    const { setPermissions, setHasChanges, initial } = setup([
      "Leave:view:self",
    ]);
    togglePermission(
      "Leave",
      "view",
      "self",
      true,
      initial,
      setPermissions,
      setHasChanges,
    );
    expect(setPermissions).not.toHaveBeenCalled();
    expect(setHasChanges).not.toHaveBeenCalled();
  });

  // ── Scoped permissions (scope !== "-") ────────────────────────────────────

  it("adds a scoped permission when it is not present", () => {
    const { setPermissions, setHasChanges, initial } = setup([]);
    togglePermission(
      "Leave",
      "view",
      "self",
      false,
      initial,
      setPermissions,
      setHasChanges,
    );

    expect(setPermissions).toHaveBeenCalledWith(["Leave:view:self"]);
    expect(setHasChanges).toHaveBeenCalledWith(true);
  });

  it("removes a scoped permission when it is already present", () => {
    const { setPermissions, setHasChanges, initial } = setup([
      "Leave:view:self",
    ]);
    togglePermission(
      "Leave",
      "view",
      "self",
      false,
      initial,
      setPermissions,
      setHasChanges,
    );

    expect(setPermissions).toHaveBeenCalledWith([]);
  });

  it("only removes the exact scoped permission, leaving others intact", () => {
    const { setPermissions, setHasChanges, initial } = setup([
      "Leave:view:self",
      "Leave:view:team",
      "Attendance:mark_attendance:self",
    ]);
    togglePermission(
      "Leave",
      "view",
      "self",
      false,
      initial,
      setPermissions,
      setHasChanges,
    );

    const updated = setPermissions.mock.calls[0][0];
    expect(updated).not.toContain("Leave:view:self");
    expect(updated).toContain("Leave:view:team");
    expect(updated).toContain("Attendance:mark_attendance:self");
  });

  // ── Scopeless permissions (scope === "-") ─────────────────────────────────

  it("adds a scopeless permission (scope='-') when not present", () => {
    const { setPermissions, setHasChanges, initial } = setup([]);
    togglePermission(
      "Analytics",
      "view_employee_analytics",
      "-",
      false,
      initial,
      setPermissions,
      setHasChanges,
    );

    expect(setPermissions).toHaveBeenCalledWith([
      "Analytics:view_employee_analytics",
    ]);
  });

  it("removes a scopeless permission when already present", () => {
    const { setPermissions, setHasChanges, initial } = setup([
      "Analytics:view_employee_analytics",
    ]);
    togglePermission(
      "Analytics",
      "view_employee_analytics",
      "-",
      false,
      initial,
      setPermissions,
      setHasChanges,
    );

    expect(setPermissions).toHaveBeenCalledWith([]);
  });

  it("leaves other scopeless permissions intact on removal", () => {
    const { setPermissions, setHasChanges, initial } = setup([
      "Analytics:view_employee_analytics",
      "Policy:create",
    ]);
    togglePermission(
      "Policy",
      "create",
      "-",
      false,
      initial,
      setPermissions,
      setHasChanges,
    );

    const updated = setPermissions.mock.calls[0][0];
    expect(updated).not.toContain("Policy:create");
    expect(updated).toContain("Analytics:view_employee_analytics");
  });

  // ── setHasChanges logic ───────────────────────────────────────────────────

  it("setHasChanges(true) when originalUserPermissions is undefined", () => {
    const { setPermissions, setHasChanges, initial } = setup([]);
    togglePermission(
      "Leave",
      "apply",
      "self",
      false,
      initial,
      setPermissions,
      setHasChanges,
      undefined,
    );
    expect(setHasChanges).toHaveBeenCalledWith(true);
  });

  it("setHasChanges(false) when result matches original permissions", () => {
    const original = ["Leave:view:self"];
    // toggle self off → [] → not equal to original → hasChanges = true
    const { setPermissions, setHasChanges, initial } = setup(
      ["Leave:view:self"],
      original,
    );
    togglePermission(
      "Leave",
      "view",
      "self",
      false,
      initial,
      setPermissions,
      setHasChanges,
      original,
    );

    // result is [], original is ["Leave:view:self"] — they differ
    expect(setHasChanges).toHaveBeenCalledWith(true);
  });

  it("setHasChanges(false) when toggling back to original state", () => {
    const original = ["Leave:view:team"];
    // start with team + self; removing self brings us back to just team = original
    const { setPermissions, setHasChanges, initial } = setup(
      ["Leave:view:team", "Leave:view:self"],
      original,
    );
    togglePermission(
      "Leave",
      "view",
      "self",
      false,
      initial,
      setPermissions,
      setHasChanges,
      original,
    );

    expect(setHasChanges).toHaveBeenCalledWith(false);
  });

  it("does not mutate the original permissions array", () => {
    const initial = ["Leave:view:self"];
    const frozen = Object.freeze([...initial]);
    const { setPermissions, setHasChanges } = setup();

    expect(() =>
      togglePermission(
        "Leave",
        "apply",
        "self",
        false,
        frozen as string[],
        setPermissions,
        setHasChanges,
      ),
    ).not.toThrow();
  });
});
