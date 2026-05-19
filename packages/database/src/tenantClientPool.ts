import { PrismaClient } from "@prisma/client";
import { logger } from "@hrms/logger";

const pool = new Map<string, PrismaClient>();

function buildUrl(dbName: string): string {
  const base = process.env.DEV_MONGODB_URI!;
  // Replace the database name segment (between last "/" and "?" or end of string)
  return base.replace(/\/([^/?]+)(\?|$)/, `/${dbName}$2`);
}

export function getClientForDb(dbName: string): PrismaClient {
  let client = pool.get(dbName);
  if (!client) {
    client = new PrismaClient({
      datasourceUrl: buildUrl(dbName),
      log: [
        { emit: "stdout", level: "error" },
        { emit: "stdout", level: "warn" },
      ],
    });
    pool.set(dbName, client);
    logger.info(`Tenant DB client created for "${dbName}"`);
  }
  return client;
}

export async function closeAllTenantClients(): Promise<void> {
  await Promise.all([...pool.values()].map((c) => c.$disconnect()));
  pool.clear();
}
