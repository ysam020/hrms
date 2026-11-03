import { logger } from "@hrms/logger";
import { prisma } from "./prismaClient";

/**
 * Opens the master client's connection at startup instead of on the first
 * request. Prisma connects lazily, so the first query in every worker paid
 * for DNS (SRV) lookup, TLS to the replica set and authentication — measured
 * at 0.5–1.1 s against the 35–45 ms of a warm query. One ping per worker;
 * it does not hold extra pool connections open. Tenant clients are created
 * per tenant on demand and are not warmed here.
 *
 * Never throws and is not awaited by callers: if it fails, the first request
 * connects as before.
 */
export async function warmUpDatabase(): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const started = performance.now();
  try {
    await prisma.$runCommandRaw({ ping: 1 });
    logger.info("database warm-up done", {
      ms: Math.round(performance.now() - started),
    });
  } catch (err) {
    logger.warn("database warm-up failed; the first request will connect", {
      err,
    });
  }
}
