import { z } from "zod";

/**
 * All of these are read via a non-null assertion somewhere in this service
 * (jwt.ts, googleOAuthCallback.ts) — a missing value today crashes with a
 * bare TypeError the first time that code path runs, rather than at boot.
 */
export const envSchema = z.object({
  DEV_MONGODB_URI: z
    .string()
    .min(1, "required — Prisma cannot connect without it"),
  ACCESS_JWT_TOKEN: z.string().min(1, "required for JWT signing/verification"),
  REFRESH_TOKEN: z
    .string()
    .min(1, "required for refresh-token signing/verification"),
  GOOGLE_CLIENT_ID: z.string().min(1, "required for Google OAuth login"),
  GOOGLE_CLIENT_SECRET: z.string().min(1, "required for Google OAuth login"),
  GOOGLE_CALLBACK_URL: z.string().min(1, "required for Google OAuth login"),
});
