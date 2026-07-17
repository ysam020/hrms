import hasSubscriptionAccess from "@web/shared/utils/permissions/hasSubscriptionAccess";

describe("hasSubscriptionAccess", () => {
  it("returns false for a null user", () => {
    expect(hasSubscriptionAccess(null)).toBe(false);
  });

  it("returns true for a superuser", () => {
    expect(hasSubscriptionAccess({ isSuperUser: true })).toBe(true);
  });

  it("returns true for tenantRole owner and admin", () => {
    expect(hasSubscriptionAccess({ tenantRole: "owner" })).toBe(true);
    expect(hasSubscriptionAccess({ tenantRole: "admin" })).toBe(true);
  });

  it("returns false for tenantRole hr or member with no explicit permission", () => {
    expect(hasSubscriptionAccess({ tenantRole: "hr" })).toBe(false);
    expect(hasSubscriptionAccess({ tenantRole: "member" })).toBe(false);
  });

  it("returns true for a member holding any Subscription:* permission", () => {
    expect(
      hasSubscriptionAccess({
        tenantRole: "member",
        permissions: ["Subscription:view:-"],
      }),
    ).toBe(true);
  });

  it("returns false for a member with unrelated permissions", () => {
    expect(
      hasSubscriptionAccess({
        tenantRole: "member",
        permissions: ["Leave:view:self"],
      }),
    ).toBe(false);
  });
});
