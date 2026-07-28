import { prisma } from "./prismaClient";

// Shared by both the Google OAuth signup path (googleOAuthCallback.ts) and
// the bulk onboarding import — a single definition so the two never drift
// into producing usernames with different uniqueness/formatting rules for
// what's otherwise the same `User.username` column.
export async function generateUniqueUsername(email: string): Promise<string> {
  const base = email
    .split("@")[0]
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/, "");

  let username = base;
  let counter = 1;
  while (
    await prisma.user.findFirst({ where: { username }, select: { id: true } })
  ) {
    username = `${base}${counter}`;
    counter++;
  }
  return username;
}
