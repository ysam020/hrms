import { prismaWithTenant as prisma } from "@hrms/db";

/**
 * Everyone who can act on a given KYC action: superusers, users explicitly
 * holding BasicKYCDetails:<permissionAction>:all (the same permission
 * apps/api-gateway/.../employee.ts's canManageKyc checks for that action),
 * and owners/admins/HR for this tenant specifically — tenant role lives on
 * TenantMembership, not User, so that's a separate lookup. Shared by
 * submitKyc.ts ("approve_kyc" — who to notify on a fresh submission),
 * requestKycEditAccess.ts ("request_kyc_revision" — who to notify on an
 * edit-access request), and allowKycEdit.ts ("request_kyc_revision" — who
 * else to notify once one of them has acted).
 */
export async function getKycApprovers(
  tenantId: string,
  permissionAction: "approve_kyc" | "request_kyc_revision",
): Promise<{ id: string; username: string }[]> {
  const [permittedOrSuper, privilegedMemberships] = await Promise.all([
    prisma.user.findMany({
      where: {
        tenantId,
        OR: [
          { isSuperUser: true },
          {
            permissions: {
              has: `BasicKYCDetails:${permissionAction}:all`,
            },
          },
        ],
      },
      select: { id: true, username: true },
    }),
    (prisma as any).tenantMembership.findMany({
      where: { tenantId, role: { in: ["owner", "admin", "hr"] } },
      select: { userId: true },
    }),
  ]);

  const seen = new Set(permittedOrSuper.map((u) => u.id));
  const missingIds = (privilegedMemberships as { userId: string }[])
    .map((m) => m.userId)
    .filter((id) => !seen.has(id));

  const privilegedUsers = missingIds.length
    ? await prisma.user.findMany({
        where: { id: { in: missingIds } },
        select: { id: true, username: true },
      })
    : [];

  return [...permittedOrSuper, ...privilegedUsers];
}
