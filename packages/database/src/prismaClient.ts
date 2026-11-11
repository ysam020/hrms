import { PrismaClient } from "@prisma/client";
import { attachMasterAuditLogging } from "./auditMiddleware";
import { attachQueryTiming } from "./queryTiming";
import { attachFieldProtection } from "./fieldProtection";
import { bindFieldKeyStore, type KeyStoreDb } from "./fieldKeys";

/** Data-key scope of the master database. Tenant databases use their dbName. */
export const MASTER_SCOPE = "master";

declare global {
  var prisma: PrismaClient | undefined;
}

function createClient(): PrismaClient {
  const client = new PrismaClient({
    datasourceUrl: process.env.DEV_MONGODB_URI,
    log: [
      { emit: "stdout", level: "error" },
      { emit: "stdout", level: "warn" },
    ],
  });
  attachQueryTiming(client, "master");
  attachMasterAuditLogging(client);
  // Registered last, so it runs innermost: the audit hook above sees the
  // values this process wrote and read, and the database sees only sealed
  // ones. The audit hook redacts protected fields before storing anything.
  attachFieldProtection(client, MASTER_SCOPE);
  bindFieldKeyStore(() => client as unknown as KeyStoreDb);
  return client;
}

// Only construct (and attach middleware to) a new client when one doesn't
// already exist on `global` — reusing the cached instance across dev
// hot-reloads must not re-run createClient, or $use middleware would stack
// up a duplicate on every reload.
export const prisma = global.prisma || createClient();

if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}
