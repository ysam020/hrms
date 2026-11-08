import { BLOCKED_EMPLOYEE_STATUSES } from "@hrms/common";
import { prisma } from "./prismaClient";

/**
 * The single, authoritative answer
 * to "may this person act in this organisation right now?".
 *
 * Read from the database (master DB: users, tenant_memberships, tenants) —
 * never from token claims or the Redis refresh record, which are snapshots
 * taken at login and copied forward on every refresh. Used by:
 *   - the gateway's `authenticate` (every request, behind a short cache),
 *   - auth-service `refreshToken` (every session renewal),
 *   - auth-service WebAuthn login,
 *   - Socket.IO handshake and periodic re-validation.
 *
 * Denies when:
 *   - the user no longer exists,
 *   - their employment status is blocked (Terminated / Absconded / Resigned),
 *   - a tenant is given and they no longer hold a membership in it,
 *   - a tenant is given and it is missing, deactivated, or has no database.
 * With no tenant (a signup still in org setup) only the user checks apply.
 *
 * On success it returns the membership role and the tenant's database as
 * they are NOW, so callers can replace the possibly stale claims.
 */
export type AccountAccessDenial =
  | "user_not_found"
  | "blocked_status"
  | "no_membership"
  | "tenant_inactive";

export type AccountAccess =
  | {
      ok: true;
      tenantRole: string | null;
      dbName: string | null;
      employeeStatus: string;
    }
  | { ok: false; reason: AccountAccessDenial; employeeStatus?: string };

/** Employment statuses that end all access (shared list, @hrms/common). */
export const BLOCKED_STATUSES: readonly string[] = BLOCKED_EMPLOYEE_STATUSES;

export function isBlockedEmployeeStatus(status: string | null | undefined) {
  return !!status && BLOCKED_EMPLOYEE_STATUSES.includes(status);
}

/**
 * The check could not be completed — the database timed out
 * or failed. This is NOT a denial: callers must neither grant access nor
 * treat the person as revoked (no session revocation, no logout signal).
 * They answer "try again" (gRPC UNAVAILABLE / HTTP 503).
 */
export class AccountAccessUnavailableError extends Error {
  readonly kind: "timeout" | "error";
  constructor(kind: "timeout" | "error", cause?: unknown) {
    super(
      kind === "timeout"
        ? "account access check timed out"
        : "account access check failed",
    );
    this.name = "AccountAccessUnavailableError";
    this.kind = kind;
    (this as { cause?: unknown }).cause = cause;
  }
}

export function isAccountAccessUnavailable(
  err: unknown,
): err is AccountAccessUnavailableError {
  return (
    err instanceof AccountAccessUnavailableError ||
    (err as { name?: string })?.name === "AccountAccessUnavailableError"
  );
}

/** Default bound on one check (all three reads together). */
export const ACCOUNT_CHECK_TIMEOUT_MS =
  Number(process.env.ACCOUNT_CHECK_TIMEOUT_MS) || 2_000;

/**
 * Bounded: rejects with AccountAccessUnavailableError("timeout") after
 * `timeoutMs`, or ("error") when a read fails. The driver may still finish
 * the abandoned reads in the background (Prisma has no per-query cancel);
 * callers limit how many they start (see the gateway's breaker).
 */
export async function checkAccountAccess(
  userId: string,
  tenantId: string | null | undefined,
  opts: { timeoutMs?: number } = {},
): Promise<AccountAccess> {
  const timeoutMs = opts.timeoutMs ?? ACCOUNT_CHECK_TIMEOUT_MS;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new AccountAccessUnavailableError("timeout")),
      timeoutMs,
    );
    (timer as { unref?: () => void }).unref?.();
  });
  try {
    return await Promise.race([readAccountAccess(userId, tenantId), timeout]);
  } catch (err) {
    if (isAccountAccessUnavailable(err)) throw err;
    throw new AccountAccessUnavailableError("error", err);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function readAccountAccess(
  userId: string,
  tenantId: string | null | undefined,
): Promise<AccountAccess> {
  const [user, membership, tenant] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: { employeeStatus: true },
    }),
    tenantId
      ? // Unique on (tenantId, userId) — tenant_memberships_tenantId_userId_key.
        prisma.tenantMembership.findFirst({
          where: { tenantId, userId },
          select: { role: true },
        })
      : Promise.resolve(null),
    tenantId
      ? prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { isActive: true, dbName: true },
        })
      : Promise.resolve(null),
  ]);

  if (!user) return { ok: false, reason: "user_not_found" };
  if (isBlockedEmployeeStatus(user.employeeStatus)) {
    return {
      ok: false,
      reason: "blocked_status",
      employeeStatus: user.employeeStatus,
    };
  }
  if (!tenantId) {
    return {
      ok: true,
      tenantRole: null,
      dbName: null,
      employeeStatus: user.employeeStatus,
    };
  }
  if (!membership) return { ok: false, reason: "no_membership" };
  if (!tenant || tenant.isActive === false || !tenant.dbName) {
    return { ok: false, reason: "tenant_inactive" };
  }
  return {
    ok: true,
    tenantRole: membership.role,
    dbName: tenant.dbName,
    employeeStatus: user.employeeStatus,
  };
}
