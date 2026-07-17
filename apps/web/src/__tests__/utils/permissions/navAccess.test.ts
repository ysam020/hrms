import {
  canManagePermissions,
  isOwnerOrAdmin,
  canViewAnalytics,
  isHrOrAbove,
  canAccessJobOpenings,
  canManageSalary,
  canApproveAdvances,
  canManageReviews,
  canAccessSettings,
} from "@web/shared/utils/permissions/navAccess";

const member = { tenantRole: "member", permissions: [] as string[] };
const owner = { tenantRole: "owner", permissions: [] as string[] };
const admin = { tenantRole: "admin", permissions: [] as string[] };
const hr = { tenantRole: "hr", permissions: [] as string[] };
const superUser = {
  tenantRole: "member",
  isSuperUser: true,
  permissions: [] as string[],
};

describe("navAccess", () => {
  describe("null/undefined user", () => {
    it.each([
      ["canManagePermissions", canManagePermissions],
      ["isOwnerOrAdmin", isOwnerOrAdmin],
      ["canViewAnalytics", canViewAnalytics],
      ["isHrOrAbove", isHrOrAbove],
      ["canAccessJobOpenings", canAccessJobOpenings],
      ["canManageSalary", canManageSalary],
      ["canApproveAdvances", canApproveAdvances],
      ["canManageReviews", canManageReviews],
      ["canAccessSettings", canAccessSettings],
    ] as const)("%s returns false for a null user", (_name, fn) => {
      expect(fn(null)).toBe(false);
    });
  });

  describe("superuser bypass", () => {
    it.each([
      ["canManagePermissions", canManagePermissions],
      ["isOwnerOrAdmin", isOwnerOrAdmin],
      ["canViewAnalytics", canViewAnalytics],
      ["isHrOrAbove", isHrOrAbove],
      ["canAccessJobOpenings", canAccessJobOpenings],
      ["canManageSalary", canManageSalary],
      ["canApproveAdvances", canApproveAdvances],
      ["canManageReviews", canManageReviews],
      ["canAccessSettings", canAccessSettings],
    ] as const)(
      "%s returns true for a superuser regardless of role/permissions",
      (_name, fn) => {
        expect(fn(superUser)).toBe(true);
      },
    );
  });

  describe("isOwnerOrAdmin / canViewAnalytics", () => {
    it("is true for owner and admin, false for hr and member", () => {
      expect(isOwnerOrAdmin(owner)).toBe(true);
      expect(isOwnerOrAdmin(admin)).toBe(true);
      expect(isOwnerOrAdmin(hr)).toBe(false);
      expect(isOwnerOrAdmin(member)).toBe(false);
    });

    it("canViewAnalytics mirrors isOwnerOrAdmin (no dedicated permission grant exists)", () => {
      expect(canViewAnalytics(owner)).toBe(true);
      expect(canViewAnalytics(hr)).toBe(false);
      expect(
        canViewAnalytics({
          tenantRole: "member",
          permissions: ["Analytics:view:-"],
        }),
      ).toBe(false);
    });
  });

  describe("isHrOrAbove", () => {
    it("is true for owner, admin, and hr, false for member", () => {
      expect(isHrOrAbove(owner)).toBe(true);
      expect(isHrOrAbove(admin)).toBe(true);
      expect(isHrOrAbove(hr)).toBe(true);
      expect(isHrOrAbove(member)).toBe(false);
    });
  });

  describe("canManagePermissions", () => {
    it("is false for owner/admin without the explicit grant (role alone is not enough)", () => {
      expect(canManagePermissions(owner)).toBe(false);
    });

    it("is true when the explicit manage_role_permissions grant is present", () => {
      expect(
        canManagePermissions({
          tenantRole: "member",
          permissions: ["Permissions:manage_role_permissions:-"],
        }),
      ).toBe(true);
    });
  });

  describe("canAccessJobOpenings", () => {
    it("is true for hr-or-above without any explicit permission", () => {
      expect(canAccessJobOpenings(hr)).toBe(true);
    });

    it("is true for a member holding any JobOpenings:* permission", () => {
      expect(
        canAccessJobOpenings({
          tenantRole: "member",
          permissions: ["JobOpenings:view:-"],
        }),
      ).toBe(true);
    });

    it("is false for a member with unrelated permissions", () => {
      expect(
        canAccessJobOpenings({
          tenantRole: "member",
          permissions: ["Leave:view:self"],
        }),
      ).toBe(false);
    });
  });

  describe("canManageSalary", () => {
    it("is true for hr-or-above without an explicit permission", () => {
      expect(canManageSalary(hr)).toBe(true);
    });

    it("is true for a member holding view_salaries", () => {
      expect(
        canManageSalary({
          tenantRole: "member",
          permissions: ["SalaryManagement:view_salaries:-"],
        }),
      ).toBe(true);
    });

    it("is true for a member holding update_salary", () => {
      expect(
        canManageSalary({
          tenantRole: "member",
          permissions: ["SalaryManagement:update_salary:-"],
        }),
      ).toBe(true);
    });

    it("is false for a member with neither grant", () => {
      expect(canManageSalary(member)).toBe(false);
    });
  });

  describe("canApproveAdvances", () => {
    it("is true for hr-or-above, and for a member with approve_advance", () => {
      expect(canApproveAdvances(hr)).toBe(true);
      expect(
        canApproveAdvances({
          tenantRole: "member",
          permissions: ["SalaryManagement:approve_advance:-"],
        }),
      ).toBe(true);
    });

    it("is false for a plain member", () => {
      expect(canApproveAdvances(member)).toBe(false);
    });
  });

  describe("canManageReviews", () => {
    it("is true for hr-or-above, and for a member with manage_cycles", () => {
      expect(canManageReviews(hr)).toBe(true);
      expect(
        canManageReviews({
          tenantRole: "member",
          permissions: ["PerformanceReview:manage_cycles:-"],
        }),
      ).toBe(true);
    });

    it("is false for a plain member", () => {
      expect(canManageReviews(member)).toBe(false);
    });
  });

  describe("canAccessSettings", () => {
    it("is true for owner/admin", () => {
      expect(canAccessSettings(owner)).toBe(true);
    });

    it("is false for hr alone (settings is owner/admin-gated, not hr)", () => {
      expect(canAccessSettings(hr)).toBe(false);
    });

    it.each([
      "Organisation:edit_company_info:-",
      "Organisation:edit_organisation_settings:-",
      "Organisation:approve_join_requests:-",
    ])("is true for a member holding %s", (permission) => {
      expect(
        canAccessSettings({ tenantRole: "member", permissions: [permission] }),
      ).toBe(true);
    });

    it("is true for a member via subscription access (Subscription:* permission)", () => {
      expect(
        canAccessSettings({
          tenantRole: "member",
          permissions: ["Subscription:manage:-"],
        }),
      ).toBe(true);
    });

    it("is false for a plain member with unrelated permissions", () => {
      expect(canAccessSettings(member)).toBe(false);
    });
  });
});
