/**
 * Tenant support — data helpers shared by the tenant and platform handlers.
 * Everything here uses the master client directly (support data lives in
 * the master DB, see schema.prisma); tenant scoping is the caller's job and
 * is always explicit in the `where`.
 */
import { prisma } from "@hrms/db";
import { BLOCKED_EMPLOYEE_STATUSES, hasPrivilegedRole } from "@hrms/common";
import { ticketNoPrefix } from "../config/support";
import { isPlatformTenant, platformTenantId } from "../config/platform";

const isDuplicateKey = (err: any) =>
  err?.code === "P2002" ||
  err?.code === 11000 ||
  /E11000|duplicate key/i.test(String(err?.message ?? ""));

const asNumber = (v: any): number =>
  Number(v?.$numberInt ?? v?.$numberLong ?? v?.$numberDouble ?? v);

/**
 * Next ticket number for the year, e.g. PRA-2026-000123. One atomic
 * findAndModify $inc on a per-year counter document, so concurrent requests
 * can never draw the same number (a count of existing tickets could). Two
 * first-of-the-year upserts can race on the unique `key` index; the loser
 * retries and increments the document the winner created.
 */
export async function nextTicketNo(now = new Date()): Promise<string> {
  const year = now.getUTCFullYear();
  const key = `ticket:${year}`;
  for (let attempt = 0; ; attempt++) {
    try {
      const res: any = await (prisma as any).$runCommandRaw({
        findAndModify: "support_counters",
        query: { key },
        update: { $inc: { seq: 1 } },
        upsert: true,
        new: true,
      });
      const seq = asNumber(res?.value?.seq);
      if (!Number.isFinite(seq) || seq < 1) {
        throw new Error("Support ticket counter returned no sequence");
      }
      return `${ticketNoPrefix(year)}${String(seq).padStart(6, "0")}`;
    } catch (err) {
      if (isDuplicateKey(err) && attempt < 3) continue;
      throw err;
    }
  }
}

export interface PersonSummary {
  id: string;
  name: string;
  email: string | null;
  username: string;
  tenantId: string | null;
}

export async function peopleById(
  ids: (string | null | undefined)[],
): Promise<Map<string, PersonSummary>> {
  const unique = [...new Set(ids.filter(Boolean) as string[])];
  if (unique.length === 0) return new Map();
  const users = await prisma.user.findMany({
    where: { id: { in: unique } },
    select: {
      id: true,
      username: true,
      email: true,
      first_name: true,
      last_name: true,
      tenantId: true,
    },
  });
  return new Map(
    users.map((u) => [
      u.id,
      {
        id: u.id,
        name:
          [u.first_name, u.last_name].filter(Boolean).join(" ").trim() ||
          u.username,
        email: u.email ?? null,
        username: u.username,
        tenantId: u.tenantId ?? null,
      },
    ]),
  );
}

/** The permission that lets a Praesto team member work the support queue. */
export const SUPPORT_PERMISSION = "PraestoSupport:handle_tickets";

const grantsSupport = (u: { isSuperUser?: boolean; permissions?: string[] }) =>
  !!u.isSuperUser ||
  (u.permissions ?? []).includes(SUPPORT_PERMISSION) ||
  (u.permissions ?? []).includes("*:*:*");

/**
 * Whether this request's user may work the support queue: they must be
 * acting inside Praesto's own organisation (the token's tenant), as its
 * owner/admin, a superuser, or a holder of PraestoSupport:handle_tickets —
 * and not a blocked (former) employee. Nothing about any other organisation
 * counts: an owner or superuser elsewhere has no access.
 */
export async function hasSupportAccess(user: {
  userId: string;
  tenantId: string | null;
  tenantRole?: string | null;
}): Promise<boolean> {
  if (!isPlatformTenant(user.tenantId)) return false;
  const record = await prisma.user.findUnique({
    where: { id: user.userId },
    select: {
      tenantId: true,
      isSuperUser: true,
      permissions: true,
      employeeStatus: true,
    },
  });
  if (!record || record.tenantId !== user.tenantId) return false;
  if (BLOCKED_EMPLOYEE_STATUSES.includes(record.employeeStatus)) return false;
  return (
    hasPrivilegedRole(user.tenantRole ?? "") ||
    grantsSupport(record as { isSuperUser?: boolean; permissions?: string[] })
  );
}

/**
 * Everyone who currently has support access (the same rule as
 * hasSupportAccess, evaluated for the whole Praesto organisation) — the
 * notification audience and the assignee list. Derived from memberships and
 * permissions every time, so there's no separate roster to keep up to date.
 */
export async function supportAgentIds(): Promise<string[]> {
  const platform = platformTenantId();
  if (!platform) return [];
  const [admins, users] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { tenantId: platform, role: { in: ["owner", "admin"] } },
      select: { userId: true },
    }),
    prisma.user.findMany({
      where: { tenantId: platform },
      select: {
        id: true,
        isSuperUser: true,
        permissions: true,
        employeeStatus: true,
      },
    }),
  ]);
  const adminIds = new Set(admins.map((m) => m.userId));
  return users
    .filter((u) => !BLOCKED_EMPLOYEE_STATUSES.includes(u.employeeStatus))
    .filter(
      (u) =>
        adminIds.has(u.id) ||
        grantsSupport(u as { isSuperUser?: boolean; permissions?: string[] }),
    )
    .map((u) => u.id);
}

export async function isSupportAgentUser(userId: string): Promise<boolean> {
  return (await supportAgentIds()).includes(userId);
}

export class SupportError extends Error {
  constructor(
    public status: 400 | 403 | 404 | 409,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Attach verified uploads to a ticket/message. Only the uploader's own
 * "ready" (byte-verified) uploads qualify, so an id lifted from another
 * ticket, another tenant, or a still-unverified upload is refused outright.
 */
export async function claimAttachments(
  tx: any,
  attachmentIds: string[],
  target: {
    uploaderId: string;
    ticketId: string;
    tenantId: string;
    messageId: string | null;
    visibility: "public" | "internal";
  },
): Promise<void> {
  if (attachmentIds.length === 0) return;
  const ids = [...new Set(attachmentIds)];
  const result = await tx.supportAttachment.updateMany({
    where: { id: { in: ids }, uploaderId: target.uploaderId, status: "ready" },
    data: {
      status: "attached",
      ticketId: target.ticketId,
      tenantId: target.tenantId,
      messageId: target.messageId,
      visibility: target.visibility,
    },
  });
  if (result.count !== ids.length) {
    throw new SupportError(
      400,
      "One or more attachments couldn’t be found or haven’t finished uploading.",
    );
  }
}

/**
 * Apply `data` to a ticket only if nobody changed it since `version` was
 * read; bumps the version. Throws a 409 otherwise — the caller reloads.
 */
export async function guardedTicketUpdate(
  tx: any,
  ticketId: string,
  version: number,
  data: Record<string, unknown>,
): Promise<void> {
  const res = await tx.supportTicket.updateMany({
    where: { id: ticketId, version },
    data: { ...data, version: { increment: 1 } },
  });
  if (res.count !== 1) {
    throw new SupportError(
      409,
      "This ticket was just updated by someone else. Reload to see the latest version.",
    );
  }
}

export function recordActivity(
  tx: any,
  ticket: { id: string; tenantId: string },
  entry: {
    actorId: string | null;
    actorType: "tenant" | "staff" | "system";
    type: string;
    fromValue?: string | null;
    toValue?: string | null;
    metadata?: Record<string, unknown>;
    visibility: "public" | "internal";
  },
) {
  return tx.supportActivity.create({
    data: {
      ticketId: ticket.id,
      tenantId: ticket.tenantId,
      actorId: entry.actorId,
      actorType: entry.actorType,
      type: entry.type,
      fromValue: entry.fromValue ?? null,
      toValue: entry.toValue ?? null,
      ...(entry.metadata ? { metadata: entry.metadata } : {}),
      visibility: entry.visibility,
    },
  });
}

/** Run `fn` in a Mongo transaction (Atlas is a replica set). */
export function inTransaction<T>(fn: (tx: any) => Promise<T>): Promise<T> {
  return (prisma as any).$transaction(fn);
}
