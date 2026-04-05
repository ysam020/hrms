import jwt, { SignOptions } from "jsonwebtoken";

export const tokenFns = {
  generateToken: (
    payload: Record<string, any>,
    secret: string,
    options?: SignOptions,
  ): string => {
    return jwt.sign(payload, secret, options);
  },
  verifyToken: (token: string, secret: string): any => {
    try {
      return jwt.verify(token, secret);
    } catch {
      return null;
    }
  },
};
