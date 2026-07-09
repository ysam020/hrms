import { prismaWithTenant as prisma } from "@hrms/db";

/**
 * Resolves the notice period (in days) for a resigning employee.
 * Priority: matching probation-tier policy (if still within probation) >
 * matching tenure/designation/department band > TenantSettings.noticePeriodDays
 * flat fallback. A tenant with zero NoticePeriodPolicy rows gets the flat
 * fallback for everyone, exactly matching today's behavior.
 */
export async function resolveNoticePeriodDays(
  tenantId: string,
  user: {
    joining_date: Date | null;
    designation: string | null;
    department: string | null;
  },
): Promise<number> {
  const settingsRow = await (prisma as any).tenantSettings.findFirst({
    where: { tenantId, effectiveFrom: { lte: new Date() } },
    orderBy: { effectiveFrom: "desc" },
    select: { noticePeriodDays: true, probationPeriodDays: true },
  });
  const fallbackDays = settingsRow?.noticePeriodDays ?? 30;

  const policies = await (prisma as any).noticePeriodPolicy.findMany({
    where: { tenantId },
    orderBy: { priority: "desc" },
  });
  if (policies.length === 0) return fallbackDays;

  const tenureMonths = user.joining_date
    ? Math.floor(
        (Date.now() - new Date(user.joining_date).getTime()) /
          (1000 * 60 * 60 * 24 * 30),
      )
    : 0;
  const stillOnProbation =
    user.joining_date != null &&
    Date.now() - new Date(user.joining_date).getTime() <
      (settingsRow?.probationPeriodDays ?? 90) * 24 * 60 * 60 * 1000;

  const matches = (p: any) =>
    (!p.designation || p.designation === user.designation) &&
    (!p.department || p.department === user.department) &&
    tenureMonths >= p.minTenureMonths &&
    (p.maxTenureMonths == null || tenureMonths <= p.maxTenureMonths);

  if (stillOnProbation) {
    const probationMatch = policies.find(
      (p: any) => p.isProbationPolicy && matches(p),
    );
    if (probationMatch) return probationMatch.noticePeriodDays;
  }

  const tenureMatch = policies.find(
    (p: any) => !p.isProbationPolicy && matches(p),
  );
  return tenureMatch ? tenureMatch.noticePeriodDays : fallbackDays;
}
