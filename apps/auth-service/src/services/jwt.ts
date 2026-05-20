import jwt from "jsonwebtoken";

export interface AccessTokenPayload {
  userId: string;
  tenantId: string | null;
  tenantRole: string | null;
  // true when the user has authenticated but hasn't joined/created an org yet
  pendingSetup: boolean;
  // MongoDB database name for the tenant's isolated database (e.g. "hrms-acme-corp")
  dbName: string | null;
}

export const signAccessToken = (payload: AccessTokenPayload): string => {
  return jwt.sign(payload, process.env.ACCESS_JWT_TOKEN!, {
    algorithm: "HS256",
    expiresIn: (process.env.ACCESS_JWT_EXPIRE || "1h") as any,
  });
};

export const signRefreshToken = (userId: string): string => {
  return jwt.sign({ userId }, process.env.REFRESH_TOKEN!, {
    algorithm: "HS256",
    expiresIn: (process.env.REFRESH_TOKEN_EXPIRE || "7d") as any,
  });
};

export const verifyAccessToken = (token: string): AccessTokenPayload | null => {
  try {
    return jwt.verify(token, process.env.ACCESS_JWT_TOKEN!, {
      algorithms: ["HS256"],
    }) as AccessTokenPayload;
  } catch {
    return null;
  }
};

export const verifyRefreshToken = (
  token: string,
): { userId: string } | null => {
  try {
    return jwt.verify(token, process.env.REFRESH_TOKEN!, {
      algorithms: ["HS256"],
    }) as { userId: string };
  } catch {
    return null;
  }
};
