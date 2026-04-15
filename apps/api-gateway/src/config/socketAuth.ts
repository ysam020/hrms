import jwt from "jsonwebtoken";
import { prisma } from "@hrms/db";

// Verifies a WebSocket JWT access token and resolves it to the user's username.
// Returns null for any invalid/expired token or unknown user.
export async function resolveSocketUsername(
  token: string,
): Promise<string | null> {
  try {
    const payload = jwt.verify(token, process.env.ACCESS_JWT_TOKEN!, {
      algorithms: ["HS256"],
    }) as any;
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { username: true },
    });
    return user?.username ?? null;
  } catch {
    return null;
  }
}
