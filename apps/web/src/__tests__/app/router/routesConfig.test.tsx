import routesConfig from "@web/app/router/routesConfig";
import {
  canAccessSettings,
  canManagePermissions,
  canViewAnalytics,
  canAccessJobOpenings,
  isHrOrAbove,
  canManageSalary,
} from "@web/shared/utils/permissions/navAccess";
import hasSubscriptionAccess from "@web/shared/utils/permissions/hasSubscriptionAccess";

// routesConfig() returns the full flat list of routes (real + spotlight-only
// deep links) each optionally carrying a `checkAccess` predicate — the same
// function RequireAccess uses to gate the actual <Route> element. Verifying
// checkAccess wiring here catches a route accidentally gated by the wrong
// permission (or left ungated) without needing to render 25+ routes.
const routes = routesConfig();

function findRoute(path: string) {
  const route = routes.find((r: any) => r.path === path);
  if (!route) throw new Error(`No route found for path "${path}"`);
  return route;
}

describe("routesConfig", () => {
  it("returns a non-empty array where every route has a path and a name", () => {
    expect(routes.length).toBeGreaterThan(20);
    for (const route of routes) {
      expect(route.path).toEqual(expect.any(String));
      expect(route.name).toEqual(expect.any(String));
    }
  });

  it.each([
    ["/analytics/*", canViewAnalytics],
    ["/permissions/*", canManagePermissions],
    ["/subscription", hasSubscriptionAccess],
    ["/settings", canAccessSettings],
    ["/company-info", canAccessSettings],
    ["/org-settings", canAccessSettings],
    ["/job-openings/*", canAccessJobOpenings],
    ["/view-job-opening/:_id", canAccessJobOpenings],
    ["/payroll/salary-management/:userId", canManageSalary],
    ["/payroll/tax-declarations/:userId", isHrOrAbove],
    ["/reports/*", isHrOrAbove],
    ["/permissions/manage-roles", canManagePermissions],
    ["/permissions/user-permissions", canManagePermissions],
    ["/permissions/teams", canManagePermissions],
    ["/analytics/workforce", canViewAnalytics],
    ["/analytics/recruitment", canViewAnalytics],
    ["/analytics/salary", canViewAnalytics],
  ])(
    "gates %s behind the correct permission predicate",
    (path, expectedCheck) => {
      expect(findRoute(path).checkAccess).toBe(expectedCheck);
    },
  );

  it("leaves routes with no access restriction ungated (checkAccess undefined)", () => {
    for (const path of [
      "/",
      "/profile/*",
      "/calendar",
      "/help",
      "/chat",
      "/holidays",
    ]) {
      expect(findRoute(path).checkAccess).toBeUndefined();
    }
  });

  describe("WFH access (inline canAccessWfh predicate, gated by user.wfhEnabled)", () => {
    it("denies a user without wfhEnabled", () => {
      const check = findRoute("/wfh/*").checkAccess!;
      expect(check({ wfhEnabled: false })).toBe(false);
      expect(check({})).toBe(false);
      expect(check(null)).toBe(false);
    });

    it("allows a user with wfhEnabled", () => {
      const check = findRoute("/wfh/*").checkAccess!;
      expect(check({ wfhEnabled: true })).toBe(true);
    });

    it("applies the same predicate to the /wfh/requests spotlight entry", () => {
      expect(findRoute("/wfh/requests").checkAccess).toBe(
        findRoute("/wfh/*").checkAccess,
      );
    });
  });

  it("does not accidentally share a single checkAccess reference across unrelated permission tiers", () => {
    // canViewAnalytics and canManagePermissions must be distinct functions —
    // a copy/paste bug could wire the wrong one to a route (still passing an
    // "is it gated at all" check) without this.
    expect(canViewAnalytics).not.toBe(canManagePermissions);
    expect(findRoute("/analytics/*").checkAccess).not.toBe(
      findRoute("/permissions/*").checkAccess,
    );
  });
});
