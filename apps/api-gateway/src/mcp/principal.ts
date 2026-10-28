import jwt from "jsonwebtoken";
import { prisma, runWithTenant, getClientForDb, AuditActor } from "@hrms/db";
import { BLOCKED_EMPLOYEE_STATUSES } from "@hrms/common";
import { logger } from "@hrms/logger";
import { gatewayTenantStorage } from "../middleware/tenantContext";
import { getSubscriptionAccess } from "../middleware/requireActiveSubscription";
import { issuerUrl, isMcpScope, mcpSigningKey, resourceUrl } from "./config";
import type { McpScope } from "./config";

/**
 * Who an MCP call acts as. Every field comes from the verified token and the
 * database — never from tool arguments — so a model can't name a different
 * user or organisation to act as.
 */
export interface McpPrincipal {
  userId: string;
  username: string | null;
  tenantId: string;
  tenantRole: string;
  dbName: string;
  scopes: ReadonlySet<McpScope>;
  clientId: string;
  clientName: string;
  grantId: string;
}

export class McpAuthError extends Error {
  constructor(
    // invalid_token → 401 (the client should re-authorize);
    // access_denied → 403 (re-authorizing won't help, e.g. lapsed plan).
    public readonly code: "invalid_token" | "access_denied",
    message: string,
  ) {
    super(message);
  }
}

interface AccessTokenClaims {
  sub: string;
  tid: string;
  gid: string;
  cid: string;
  scope: string;
  token_use: "mcp";
}

export function signMcpAccessToken(
  claims: Omit<AccessTokenClaims, "token_use">,
  expiresInSeconds: number,
): string {
  return jwt.sign({ ...claims, token_use: "mcp" }, mcpSigningKey(), {
    algorithm: "HS256",
    expiresIn: expiresInSeconds,
    issuer: issuerUrl(),
    audience: resourceUrl(),
  });
}

/** Verified claims, or null for anything expired, forged or not ours. */
export function verifyMcpAccessToken(token: string): AccessTokenClaims | null {
  try {
    const claims = jwt.verify(token, mcpSigningKey(), {
      algorithms: ["HS256"],
      issuer: issuerUrl(),
      audience: resourceUrl(),
    }) as Partial<AccessTokenClaims>;
    if (
      claims.token_use !== "mcp" ||
      typeof claims.sub !== "string" ||
      typeof claims.tid !== "string" ||
      typeof claims.gid !== "string" ||
      typeof claims.cid !== "string" ||
      typeof claims.scope !== "string"
    ) {
      return null;
    }
    return claims as AccessTokenClaims;
  } catch {
    return null;
  }
}

/**
 * The person's standing in the organisation right now: still an employee
 * who may sign in, still a member, and the organisation still active with a
 * usable plan. Checked when a grant is created, on every refresh, and on
 * every tool call, so offboarding someone (or their organisation lapsing)
 * cuts their assistant off at once rather than when a token expires.
 */
export async function loadAccountContext(
  userId: string,
  tenantId: string,
): Promise<{ tenantRole: string; dbName: string; username: string | null }> {
  const [user, membership, tenant] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { username: true, employeeStatus: true },
    }),
    prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId } },
      select: { role: true },
    }),
    prisma.tenant.findUnique({
      where: { id: tenantId },
      select: { isActive: true, dbName: true },
    }),
  ]);

  if (!user || BLOCKED_EMPLOYEE_STATUSES.includes(user.employeeStatus)) {
    throw new McpAuthError("invalid_token", "This account can't sign in.");
  }
  if (!membership) {
    throw new McpAuthError(
      "invalid_token",
      "This account is no longer a member of the organisation.",
    );
  }
  if (!tenant?.isActive || !tenant.dbName) {
    throw new McpAuthError(
      "invalid_token",
      "This organisation is no longer active.",
    );
  }

  let access;
  try {
    access = await getSubscriptionAccess(tenantId);
  } catch {
    // Same as requireActiveSubscription: a DB hiccup doesn't lock people out.
    access = { allowed: true as const };
  }
  if (!access.allowed) {
    throw new McpAuthError("access_denied", access.message);
  }

  return {
    tenantRole: membership.role,
    dbName: tenant.dbName,
    username: user.username,
  };
}

// lastUsedAt is for the connected-apps list, not security, so it's written
// at most this often per grant instead of on every call.
const LAST_USED_RESOLUTION_MS = 5 * 60 * 1000;

/** Resolves an `Authorization: Bearer …` header to a principal, or throws. */
export async function authenticateMcpRequest(
  authorization: string | undefined,
): Promise<McpPrincipal> {
  const match = /^Bearer\s+(\S+)$/i.exec(authorization ?? "");
  if (!match) {
    throw new McpAuthError("invalid_token", "Missing bearer token.");
  }
  const claims = verifyMcpAccessToken(match[1]);
  if (!claims) {
    throw new McpAuthError("invalid_token", "Invalid or expired token.");
  }

  const grant = await prisma.mcpGrant.findUnique({
    where: { id: claims.gid },
  });
  if (
    !grant ||
    grant.revokedAt ||
    grant.expiresAt <= new Date() ||
    grant.userId !== claims.sub ||
    grant.tenantId !== claims.tid ||
    grant.clientId !== claims.cid
  ) {
    throw new McpAuthError(
      "invalid_token",
      "This connection has been revoked or has expired.",
    );
  }

  const account = await loadAccountContext(grant.userId, grant.tenantId);

  // The token's scopes, but never more than the grant still holds.
  const granted = new Set(grant.scopes);
  const scopes = new Set(
    claims.scope
      .split(" ")
      .filter((s): s is McpScope => isMcpScope(s) && granted.has(s)),
  );

  if (
    !grant.lastUsedAt ||
    Date.now() - grant.lastUsedAt.getTime() > LAST_USED_RESOLUTION_MS
  ) {
    prisma.mcpGrant
      .update({ where: { id: grant.id }, data: { lastUsedAt: new Date() } })
      .catch((error: unknown) =>
        logger.warn("mcp: failed to record grant lastUsedAt", { error }),
      );
  }

  return {
    userId: grant.userId,
    username: account.username,
    tenantId: grant.tenantId,
    tenantRole: account.tenantRole,
    dbName: account.dbName,
    scopes,
    clientId: grant.clientId,
    clientName: grant.clientName,
    grantId: grant.id,
  };
}

/**
 * Runs `fn` inside the same two request contexts `authenticate` sets up for
 * a web request, so grpcCall forwards this tenant to the services and
 * prismaWithTenant reads this tenant's own database — the MCP path gets
 * exactly the isolation every other route relies on.
 */
export function runAsTenant<T>(
  tenant: { tenantId: string; dbName: string | null },
  actor: AuditActor | undefined,
  fn: () => Promise<T>,
): Promise<T> {
  const tenantClient = tenant.dbName ? getClientForDb(tenant.dbName) : null;
  return gatewayTenantStorage.run(
    { tenantId: tenant.tenantId, dbName: tenant.dbName, actor },
    () => runWithTenant(tenant.tenantId, tenantClient, fn, actor),
  );
}
