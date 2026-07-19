import { isValidPermission, partitionPermissions } from "../permissionCatalog";

describe("isValidPermission", () => {
  it("accepts a known module:action pair with no scope suffix", () => {
    expect(isValidPermission("EmployeeManagement:view")).toBe(true);
  });

  it("accepts a known module:action:scope triple", () => {
    expect(isValidPermission("Attendance:view:team")).toBe(true);
  });

  it("rejects a scope not offered for that action", () => {
    // Attendance:view only offers self/team/all — mark_attendance only offers self.
    expect(isValidPermission("Attendance:mark_attendance:team")).toBe(false);
  });

  it("rejects an unknown module", () => {
    expect(isValidPermission("NotARealModule:view")).toBe(false);
  });

  it("rejects an unknown action on a known module", () => {
    expect(isValidPermission("Attendance:delete_everything")).toBe(false);
  });

  it("rejects a scope-less string for an action that requires an explicit scope", () => {
    expect(isValidPermission("Attendance:view")).toBe(false);
  });

  it("accepts the superuser wildcard", () => {
    expect(isValidPermission("*:*:*")).toBe(true);
  });

  it("rejects a partial/forged wildcard", () => {
    expect(isValidPermission("*:*")).toBe(false);
    expect(isValidPermission("EmployeeManagement:*")).toBe(false);
  });

  it("rejects non-string values", () => {
    expect(isValidPermission(null)).toBe(false);
    expect(isValidPermission(undefined)).toBe(false);
    expect(isValidPermission(123)).toBe(false);
    expect(isValidPermission({ module: "Attendance" })).toBe(false);
    expect(isValidPermission(["Attendance:view:all"])).toBe(false);
  });

  it("rejects the empty string and whitespace-only strings", () => {
    expect(isValidPermission("")).toBe(false);
    expect(isValidPermission("   ")).toBe(false);
  });

  it("is case-sensitive — a differently-cased valid string is rejected", () => {
    expect(isValidPermission("employeemanagement:view")).toBe(false);
    expect(isValidPermission("EmployeeManagement:VIEW")).toBe(false);
  });
});

describe("partitionPermissions", () => {
  it("splits a mixed list into valid and invalid buckets", () => {
    const result = partitionPermissions([
      "EmployeeManagement:view",
      "NotReal:thing",
      "Attendance:view:all",
      42,
    ]);
    expect(result.valid).toEqual([
      "EmployeeManagement:view",
      "Attendance:view:all",
    ]);
    expect(result.invalid).toEqual(["NotReal:thing", 42]);
  });

  it("returns an all-valid result with an empty invalid array", () => {
    const result = partitionPermissions([
      "*:*:*",
      "Holidays:add",
      "Holidays:delete",
    ]);
    expect(result.valid).toHaveLength(3);
    expect(result.invalid).toEqual([]);
  });

  it("returns an all-invalid result with an empty valid array", () => {
    const result = partitionPermissions(["bogus", "also-bogus"]);
    expect(result.valid).toEqual([]);
    expect(result.invalid).toEqual(["bogus", "also-bogus"]);
  });

  it("handles an empty input array", () => {
    expect(partitionPermissions([])).toEqual({ valid: [], invalid: [] });
  });

  it("preserves duplicates rather than de-duplicating", () => {
    const result = partitionPermissions(["Holidays:add", "Holidays:add"]);
    expect(result.valid).toEqual(["Holidays:add", "Holidays:add"]);
  });
});
