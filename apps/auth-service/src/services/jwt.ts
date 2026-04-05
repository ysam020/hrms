import jwt from "jsonwebtoken";
import { logger } from "@hrms/logger";

export const signAccessToken = (userId: string): string => {
  return jwt.sign({ userId }, process.env.ACCESS_JWT_TOKEN!, {
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

export const verifyAccessToken = (token: string): any => {
  try {
    return jwt.verify(token, process.env.ACCESS_JWT_TOKEN!, {
      algorithms: ["HS256"],
    });
  } catch {
    return null;
  }
};

export const verifyRefreshToken = (token: string): any => {
  try {
    return jwt.verify(token, process.env.REFRESH_TOKEN!, {
      algorithms: ["HS256"],
    });
  } catch {
    return null;
  }
};
