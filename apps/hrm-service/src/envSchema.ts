import { z } from "zod";

/**
 * DEV_MONGODB_URI is read via a non-null assertion in
 * packages/database/src/tenantClientPool.ts — a missing value today
 * crashes with a bare TypeError the first time a tenant DB is resolved,
 * rather than at boot.
 */
export const envSchema = z.object({
  DEV_MONGODB_URI: z
    .string()
    .min(1, "required — Prisma cannot connect without it"),
});
