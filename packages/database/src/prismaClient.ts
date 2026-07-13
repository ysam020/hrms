import { PrismaClient } from "@prisma/client";
import { attachMasterAuditLogging } from "./auditMiddleware";

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
  attachMasterAuditLogging(client);
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
