import { prismaWithTenant as prisma } from "@hrms/db";

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
