import jwt from "jsonwebtoken";

export interface SocketAuthPayload {
  userId: string;
  tenantId: string | null;
  dbName: string | null;
}

// Verifies a WebSocket JWT access token and returns userId + tenantId + dbName.
// Returns null for any invalid/expired token.
export async function resolveSocketUserId(
  token: string,
): Promise<SocketAuthPayload | null> {
  try {
    const payload = jwt.verify(token, process.env.ACCESS_JWT_TOKEN!, {
      algorithms: ["HS256"],
    }) as any;
    if (!payload.userId) return null;
    return {
      userId: payload.userId,
      tenantId: payload.tenantId ?? null,
      dbName: payload.dbName ?? null,
    };
  } catch {
    return null;
  }
}
