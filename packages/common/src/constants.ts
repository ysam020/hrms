export enum UserRoleEnum {
  ADMIN = "admin",
  EMPLOYEE = "employee",
  HR = "hr",
  MANAGER = "manager",
}

// TenantMembership.role / JWT tenantRole — distinct from the legacy,
// never-populated User.role field UserRoleEnum above describes (see the
// note in authenticate.ts on why tenantRole is the one that's actually
// meaningful for authorization). Previously each handler hardcoded its own
// `["owner","admin"]`/`["owner","admin","hr"]` literal with no shared
// source of truth — inconsistent fallbacks (some handlers omitted "hr")
// were only discoverable by reading every call site individually.
export const PRIVILEGED_ROLES = ["owner", "admin"] as const;
export const HR_ROLES = ["owner", "admin", "hr"] as const;

export function hasPrivilegedRole(
  tenantRole: string | null | undefined,
  allowed: readonly string[] = PRIVILEGED_ROLES,
): boolean {
  return !!tenantRole && allowed.includes(tenantRole);
}

// Employee statuses that may no longer sign in — refused at Google sign-in
// (auth-service googleOAuthCallback) and on every MCP call (api-gateway
// mcp/principal.ts). "Pending" is deliberately absent: a new sign-up has to
// reach the join-request/org-setup screens before anyone admits them.
export const BLOCKED_EMPLOYEE_STATUSES: readonly string[] = [
  "Terminated",
  "Absconded",
  "Resigned",
];

export enum LeaveTypeEnum {
  ANNUAL = "annual",
  SICK = "sick",
  CASUAL = "casual",
  MATERNITY = "maternity",
  PATERNITY = "paternity",
  UNPAID = "unpaid",
}

export enum AttendanceStatusEnum {
  PRESENT = "present",
  ABSENT = "absent",
  LATE = "late",
  HALF_DAY = "half_day",
  ON_LEAVE = "on_leave",
  HOLIDAY = "holiday",
}

export enum ApplicationStatusEnum {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
  CANCELLED = "cancelled",
}
