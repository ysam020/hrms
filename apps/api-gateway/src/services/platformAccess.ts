/**
 * Praesto Platform Console access. A grant needs all of:
 *  - the request's tenant (from the signed token) is Praesto's own
 *    organisation (PLATFORM_TENANT_ID) — nothing about any other
 *    organisation counts, whatever role or permissions the user holds there;
 *  - the user's record still belongs to that organisation and isn't a
 *    blocked (former) employee;
 *  - the action: the platform org's owner and its superusers hold every
 *    PraestoAdmin action; anyone else needs each `PraestoAdmin:<action>`
 *    permission granted explicitly. An admin role alone grants nothing here
 *    (unlike the support queue): billing data is need-to-know.
 *
 * Evaluated against the database on every request, so revoking a permission
 * (Permissions editor in the Praesto org) takes effect immediately.
 */
import { BLOCKED_EMPLOYEE_STATUSES } from "@hrms/common";
import { isPlatformTenant } from "../config/platform";
import { loadUserAccess } from "./userAccess";

export const PLATFORM_ADMIN_ACTIONS = [
  "view_overview",
  "view_tenants",
  "view_billing",
  "manage_billing",
  "view_audit_logs",
  // Website sales leads: personal contact details, so need-to-know too.
  "view_leads",
  "manage_leads",
] as const;
export type PlatformAdminAction = (typeof PLATFORM_ADMIN_ACTIONS)[number];

export const platformPermission = (action: PlatformAdminAction) =>
  `PraestoAdmin:${action}`;

export async function platformAdminGrants(user: {
  userId: string;
  tenantId: string | null;
  tenantRole?: string | null;
}): Promise<PlatformAdminAction[]> {
  if (!isPlatformTenant(user.tenantId)) return [];
  const record = await loadUserAccess(user.userId, { tenantScoped: false });
  if (!record || record.tenantId !== user.tenantId) return [];
  if (BLOCKED_EMPLOYEE_STATUSES.includes(record.employeeStatus)) return [];
  const permissions: string[] = record.permissions ?? [];
  if (
    user.tenantRole === "owner" ||
    record.isSuperUser ||
    permissions.includes("*:*:*")
  )
    return [...PLATFORM_ADMIN_ACTIONS];
  return PLATFORM_ADMIN_ACTIONS.filter((a) =>
    permissions.includes(platformPermission(a)),
  );
}
