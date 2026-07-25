import jwt from "jsonwebtoken";

export interface SocketAuthPayload {
  userId: string;
  tenantId: string | null;
  dbName: string | null;
  // Unix seconds — lets configureSocketIO schedule a disconnect at the
  // token's actual expiry instead of trusting the handshake-time check
  // forever. HTTP re-verifies the JWT on every request; a socket otherwise
  // only ever gets checked once, at connect.
  exp?: number;
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
      exp: typeof payload.exp === "number" ? payload.exp : undefined,
    };
  } catch {
    return null;
  }
}
