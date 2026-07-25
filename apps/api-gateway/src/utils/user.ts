import { prismaWithTenant as prisma } from "@hrms/db";
import { hasPrivilegedRole, HR_ROLES } from "@hrms/common";

/**
 * Returns true if the given userId belongs to a super-user.
 * Centralised here so leave, salary, and recruitment handlers all share
 * a single implementation instead of copy-pasting the same three lines.
 */
export async function isSuperUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true },
  });
  return user?.isSuperUser === true;
}

/**
 * Owner/admin/hr tenant role, or a global superuser. Used to gate
 * cross-employee visibility of compensation and identity-document fields
 * (salary, aadhar/bank/pan, PF/UAN/ESIC) — HR staff need this for their
 * job, not just superusers. Centralised so employee-detail endpoints don't
 * each hand-roll a slightly different version of the same check.
 */
export async function isHrOrAboveCaller(
  userId: string,
  tenantRole: string | null | undefined,
): Promise<boolean> {
  if (hasPrivilegedRole(tenantRole ?? "", HR_ROLES)) return true;
  return isSuperUser(userId);
}
