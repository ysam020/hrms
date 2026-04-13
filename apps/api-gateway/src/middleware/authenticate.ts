import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { prisma } from "@hrms/db";
import { errorMessage } from "@hrms/common";

export interface AuthRequest extends Request {
  user?: { userId: string; role: string; email: string };
}

export const authenticate = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  const token =
    req.headers.authorization?.split(" ")[1] || req.cookies?.access_token;
  if (!token)
    return res
      .status(401)
      .json({ message: errorMessage.AUTH.UNAUTHORIZED_SHORT });

  try {
    const payload = jwt.verify(token, process.env.ACCESS_JWT_TOKEN!, {
      algorithms: ["HS256"],
    }) as any;
    req.user = payload;
    next();
  } catch {
    return res.status(401).json({ message: errorMessage.AUTH.INVALID_TOKEN });
  }
};

export const authorize = (...roles: string[]) => {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      return res.status(403).json({ message: errorMessage.AUTH.FORBIDDEN });
    }
    next();
  };
};

// Middleware that requires the authenticated user to have isSuperUser=true.
// Uses a DB lookup so role changes take effect immediately without re-login.
export const requireSuperUser = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  if (!req.user) {
    res.status(401).json({ message: errorMessage.AUTH.UNAUTHORIZED_SHORT });
    return;
  }
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isSuperUser: true },
    });
    if (!user?.isSuperUser) {
      res.status(403).json({ message: errorMessage.AUTH.FORBIDDEN });
      return;
    }
    next();
  } catch {
    res.status(500).json({ message: errorMessage.GENERAL.INTERNAL_ERROR });
  }
};
