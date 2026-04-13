import { prisma } from "@hrms/db";
import { cacheManager } from "@hrms/cache";

/**
 * Returns the username for a given userId.
 * Result is cached under the "user" namespace to avoid redundant DB round-trips.
 */
export async function resolveUsername(userId: string): Promise<string | null> {
  const cacheKey = `user:username:${userId}`;
  const cached = await cacheManager.get<string>(cacheKey);
  if (cached) return cached;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { username: true },
  });
  if (user?.username) {
    await cacheManager.set(cacheKey, user.username, "user");
  }
  return user?.username ?? null;
}

/**
 * Returns the userId (ObjectId string) for a given username.
 */
export async function resolveUserId(username: string): Promise<string | null> {
  const user = await prisma.user.findUnique({
    where: { username },
    select: { id: true },
  });
  return user?.id ?? null;
}

/**
 * Returns true when the given userId belongs to a super-user account.
 */
export async function isSuperUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true },
  });
  return user?.isSuperUser === true;
}
