import hasPermission from "./hasPermission";
import hasSubscriptionAccess from "./hasSubscriptionAccess";

type NavUser = {
  isSuperUser?: boolean;
  tenantRole?: string;
  permissions?: string[];
} | null;

/** Superusers and holders of the dedicated "manage role permissions" grant. */
export const canManagePermissions = (user: NavUser): boolean =>
  Boolean(
    user?.isSuperUser ||
    hasPermission(
      "Permissions",
      "manage_role_permissions",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    ),
  );

/** Superusers and org owners/admins — no dedicated Analytics permission exists yet. */
export const canViewAnalytics = (user: NavUser): boolean =>
  Boolean(
    user?.isSuperUser || ["owner", "admin"].includes(user?.tenantRole ?? ""),
  );

/**
 * Superusers and owner/admin/hr — gates management-visibility screens
 * (Insights/analytics/reports) that HR staff need for their job, not just
 * owners/admins. Mirrors the server-side requireHrPrivileged middleware.
 */
export const isHrOrAbove = (user: NavUser): boolean =>
  Boolean(
    user?.isSuperUser ||
    ["owner", "admin", "hr"].includes(user?.tenantRole ?? ""),
  );

/** Superusers, owner/admin/hr, and holders of any JobOpenings:* permission grant. */
export const canAccessJobOpenings = (user: NavUser): boolean =>
  Boolean(
    isHrOrAbove(user) ||
    user?.permissions?.some((p) => p.startsWith("JobOpenings:")),
  );

/**
 * Superusers, owner/admin/hr, and holders of the SalaryManagement
 * view_salaries/update_salary permissions. Mirrors the server-side
 * canManageSalary check in the salary handler.
 */
export const canManageSalary = (user: NavUser): boolean =>
  Boolean(
    isHrOrAbove(user) ||
    hasPermission(
      "SalaryManagement",
      "view_salaries",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    ) ||
    hasPermission(
      "SalaryManagement",
      "update_salary",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    ),
  );

/**
 * Superusers, owner/admin/hr, and holders of SalaryManagement:approve_advance.
 * Mirrors the server-side canApproveAdvances check in the payroll handler.
 */
export const canApproveAdvances = (user: NavUser): boolean =>
  Boolean(
    isHrOrAbove(user) ||
    hasPermission(
      "SalaryManagement",
      "approve_advance",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    ),
  );

/**
 * Superusers, owner/admin/hr, and holders of PerformanceReview:manage_cycles.
 * Mirrors the server-side canManageReviews check in the performanceReview handler.
 */
export const canManageReviews = (user: NavUser): boolean =>
  Boolean(
    isHrOrAbove(user) ||
    hasPermission(
      "PerformanceReview",
      "manage_cycles",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    ),
  );

/** Mirrors the server-side isPrivileged check in updateTenantSettings. */
export const canAccessSettings = (user: NavUser): boolean =>
  Boolean(
    user?.isSuperUser ||
    ["owner", "admin"].includes(user?.tenantRole ?? "") ||
    hasPermission(
      "Organisation",
      "edit_company_info",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    ) ||
    hasPermission(
      "Organisation",
      "edit_organisation_settings",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    ) ||
    hasPermission(
      "Organisation",
      "approve_join_requests",
      "-",
      user?.isSuperUser,
      user?.permissions || [],
    ) ||
    hasSubscriptionAccess(user),
  );
