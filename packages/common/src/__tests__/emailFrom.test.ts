import { PLATFORM_FROM, tenantFrom, tenantReplyTo } from "../emailFrom";

describe("tenantFrom", () => {
  it("uses the tenant name alone as the display name — no HR suffix/prefix, no personal name", () => {
    expect(tenantFrom("Acme Corp")).toBe('"Acme Corp" <hr@praesto.in>');
  });

  it("never appends or prepends 'HR' regardless of what's in the tenant name", () => {
    const from = tenantFrom("Bonami Foods");
    expect(from).not.toContain("HR");
  });
});

describe("PLATFORM_FROM", () => {
  it("is the fixed Praesto platform identity, not tenant- or person-specific", () => {
    expect(PLATFORM_FROM).toBe('"Praesto" <noreply@praesto.in>');
  });
});

describe("tenantReplyTo", () => {
  it("returns the tenant's helpEmail when set", () => {
    expect(tenantReplyTo("support@acme.example")).toBe("support@acme.example");
  });

  it("returns undefined when helpEmail is null/undefined/empty", () => {
    expect(tenantReplyTo(null)).toBeUndefined();
    expect(tenantReplyTo(undefined)).toBeUndefined();
    expect(tenantReplyTo("")).toBeUndefined();
  });
});
