import jwt from "jsonwebtoken";

// Verifies a WebSocket JWT access token and returns the userId from the payload.
// Returns null for any invalid/expired token.
export async function resolveSocketUserId(
  token: string,
): Promise<string | null> {
  try {
    const payload = jwt.verify(token, process.env.ACCESS_JWT_TOKEN!, {
      algorithms: ["HS256"],
    }) as any;
    return payload.userId ?? null;
  } catch {
    return null;
  }
}
