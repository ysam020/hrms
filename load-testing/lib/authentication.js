// Access tokens for the seeded LOADTEST_ users, signed with the loadtest
// stack's own per-run secret (lib/stack.js). The payload matches what
// auth-service issues at login (apps/auth-service/src/services/jwt.ts), so
// the benchmark goes through the real authenticate → requireTenant →
// requireActiveSubscription chain. No login, refresh or session write
// happens: the GET-only workload stays GET-only.
//
// Tokens are kept in memory and in .state/plan.json (mode 600, gitignored);
// they are never printed or written into reports.
import jwt from "jsonwebtoken";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { STATE_DIR } from "../config/environments.js";
import { readStackEnv } from "./stack.js";

export function readManifest() {
  const p = resolve(STATE_DIR, "manifest.json");
  if (!existsSync(p))
    throw new Error("No seed manifest: run the seeder first (README, step 2).");
  return JSON.parse(readFileSync(p, "utf8"));
}

export function mintToken(user, org, { ttlSeconds = 6 * 3600 } = {}) {
  const secret = readStackEnv().LOADTEST_JWT_SECRET;
  if (!secret)
    throw new Error(
      "No LOADTEST_JWT_SECRET: start the stack first (scripts/stack.js up).",
    );
  return jwt.sign(
    {
      userId: user.id,
      tenantId: org.tenantId,
      tenantRole: user.role,
      pendingSetup: false,
      orgSetupComplete: true,
      dbName: org.dbName,
    },
    secret,
    { algorithm: "HS256", expiresIn: ttlSeconds },
  );
}

/** Every seeded user with a fresh token, grouped by org. */
export function authenticatedOrgs() {
  const manifest = readManifest();
  return manifest.orgs.map((org) => ({
    ...org,
    users: org.users.map((u) => ({ ...u, token: mintToken(u, org) })),
  }));
}
