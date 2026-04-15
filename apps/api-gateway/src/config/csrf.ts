import { doubleCsrf } from "csrf-csrf";
import jwt from "jsonwebtoken";

type CsrfResult = ReturnType<typeof doubleCsrf>;

const csrfResult = doubleCsrf({
  getSecret: () => process.env.CSRF_SECRET!,
  getSessionIdentifier: (req) => {
    // Tie the CSRF token to the authenticated user when possible
    const auth = req.headers.authorization;
    if (auth?.startsWith("Bearer ")) {
      try {
        const payload = jwt.decode(auth.slice(7)) as any;
        if (payload?.userId) return payload.userId as string;
      } catch {}
    }
    return req.ip ?? "";
  },
  cookieName: "csrf-token",
  cookieOptions: {
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
  },
  size: 64,
  getCsrfTokenFromRequest: (req) => req.headers["x-csrf-token"],
});

export const generateCsrfToken: CsrfResult["generateCsrfToken"] =
  csrfResult.generateCsrfToken;
export const doubleCsrfProtection: CsrfResult["doubleCsrfProtection"] =
  csrfResult.doubleCsrfProtection;
