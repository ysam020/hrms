import hasPermission from "@web/shared/utils/permissions/hasPermission";
import { isOwnerOrAdmin } from "@web/shared/utils/permissions/navAccess";

// Who may decide leave requests. These only choose which buttons appear;
// the gateway enforces the same rules on every request.

interface Subject {
  id?: string;
  isSuperUser?: boolean;
  tenantRole?: string;
  permissions?: string[];
}

/** Owners/admins, or Leave:approve at team or all scope. */
export function canManageLeaves(user: Subject | null | undefined): boolean {
  return (
    isOwnerOrAdmin(user ?? null) ||
    hasPermission(
      "Leave",
      "approve",
      "all",
      user?.isSuperUser,
      user?.permissions || [],
    ) ||
    hasPermission(
      "Leave",
      "approve",
      "team",
      user?.isSuperUser,
      user?.permissions || [],
    )
  );
}

/** A manager may act on someone else's request (superusers on their own too). */
export function canActOnLeave(
  user: Subject | null | undefined,
  request: { userId?: string },
): boolean {
  return (
    canManageLeaves(user) &&
    Boolean(user?.isSuperUser || request.userId !== user?.id)
  );
}
