/**
 * Tenant support — access rules, lifecycle and tenant-safe serialisation.
 * Pure functions only, so every rule here is unit-tested directly
 * (__tests__/supportPolicy.test.ts) and the handlers stay thin.
 *
 * Who can do what, inside an organisation:
 *  - Raise tickets: owner/admin/hr, superusers, or Support:raise_tickets.
 *  - See their own tickets (reporter) and tickets they've replied on: always.
 *  - See the whole organisation's tickets: owner/admin, superusers, or
 *    Support:view_org_tickets — except Security Concern tickets, which also
 *    need owner, superuser or Support:view_security_tickets. An admin with
 *    org-wide access does not see another person's security report.
 * Platform staff are a separate grant (SupportAgent) and never pass through
 * these checks.
 */
import { hasPrivilegedRole, HR_ROLES } from "@hrms/common";
import {
  REOPEN_WINDOW_DAYS,
  STAFF_TRANSITIONS,
  type SupportStatus,
} from "../config/support";

export interface TenantActor {
  userId: string;
  tenantId: string;
  tenantRole: string | null;
  isSuperUser: boolean;
  permissions: string[];
}

export interface SupportCapabilities {
  canRaise: boolean;
  canViewOrg: boolean;
  canViewSecurity: boolean;
}

const has = (a: TenantActor, perm: string) =>
  a.permissions.includes(perm) || a.permissions.includes("*:*:*");

export function capabilitiesOf(a: TenantActor): SupportCapabilities {
  const role = a.tenantRole ?? "";
  return {
    canRaise:
      hasPrivilegedRole(role, HR_ROLES) ||
      a.isSuperUser ||
      has(a, "Support:raise_tickets"),
    canViewOrg:
      hasPrivilegedRole(role) ||
      a.isSuperUser ||
      has(a, "Support:view_org_tickets"),
    canViewSecurity:
      role === "owner" ||
      a.isSuperUser ||
      has(a, "Support:view_security_tickets"),
  };
}

interface TicketAccessFields {
  tenantId: string;
  reporterId: string;
  category: string;
  participantIds?: string[] | null;
}

/** Whether a tenant user may see this ticket at all. */
export function canViewTicket(a: TenantActor, t: TicketAccessFields): boolean {
  if (t.tenantId !== a.tenantId) return false;
  if (t.reporterId === a.userId) return true;
  if ((t.participantIds ?? []).includes(a.userId)) return true;
  const caps = capabilitiesOf(a);
  if (!caps.canViewOrg) return false;
  return t.category !== "security" || caps.canViewSecurity;
}

/** Replying/reopening: the reporter always; others need to be able to raise. */
export function canActOnTicket(a: TenantActor, t: TicketAccessFields): boolean {
  return (
    canViewTicket(a, t) &&
    (t.reporterId === a.userId || capabilitiesOf(a).canRaise)
  );
}

/**
 * The Prisma `where` for a tenant list. tenantId always comes from the
 * verified token (the actor), never from the request.
 */
export function tenantListScope(
  a: TenantActor,
  scope: "mine" | "org",
): Record<string, unknown> | null {
  if (scope === "mine") {
    return { tenantId: a.tenantId, reporterId: a.userId };
  }
  const caps = capabilitiesOf(a);
  if (!caps.canViewOrg) return null;
  if (caps.canViewSecurity) return { tenantId: a.tenantId };
  return {
    tenantId: a.tenantId,
    OR: [{ category: { not: "security" } }, { reporterId: a.userId }],
  };
}

// ── Lifecycle ───────────────────────────────────────────────────────────────

export function canStaffTransition(from: string, to: string): boolean {
  return (STAFF_TRANSITIONS[from as SupportStatus] ?? []).includes(
    to as SupportStatus,
  );
}

/**
 * What a tenant reply does to the status: wakes a ticket that was waiting on
 * the tenant; leaves open/in-progress alone. Resolved tickets must be
 * reopened explicitly, and closed ones accept nothing.
 */
export function statusAfterTenantReply(
  status: string,
): { ok: true; next: SupportStatus } | { ok: false; reason: string } {
  switch (status) {
    case "waiting_for_tenant":
      return { ok: true, next: "in_progress" };
    case "open":
    case "in_progress":
      return { ok: true, next: status };
    case "resolved":
      return {
        ok: false,
        reason: "This ticket is resolved. Reopen it to continue.",
      };
    default:
      return { ok: false, reason: "This ticket is closed." };
  }
}

export function reopenEligibility(
  t: { status: string; resolvedAt?: Date | string | null },
  now = new Date(),
): { ok: true } | { ok: false; reason: string } {
  if (t.status !== "resolved") {
    return { ok: false, reason: "Only a resolved ticket can be reopened." };
  }
  const resolvedAt = t.resolvedAt ? new Date(t.resolvedAt) : null;
  const windowMs = REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  if (!resolvedAt || now.getTime() - resolvedAt.getTime() > windowMs) {
    return {
      ok: false,
      reason: `Resolved tickets can be reopened for ${REOPEN_WINDOW_DAYS} days. Please raise a new ticket.`,
    };
  }
  return { ok: true };
}

/** Timestamp fields a move to `to` sets, beyond status itself. */
export function statusSideEffects(
  to: SupportStatus,
  now = new Date(),
): Record<string, Date | null> {
  if (to === "resolved") return { resolvedAt: now, closedAt: null };
  if (to === "closed") return { closedAt: now };
  // Back in play: the earlier resolution no longer stands (the activity
  // history keeps it), so resolution metrics only count real resolutions.
  if (to === "in_progress" || to === "waiting_for_tenant")
    return { resolvedAt: null, closedAt: null };
  return {};
}

// ── Serialisation ───────────────────────────────────────────────────────────
// Tenant responses are built field by field (allow-list), so a field added to
// the model later — or an internal one like assigneeId — never leaks by
// default. Internal messages/activities/attachments are excluded at the query
// level as well; filterPublic is the second line of defence.

export function tenantTicketView(t: any) {
  return {
    id: t.id,
    ticketNo: t.ticketNo,
    subject: t.subject,
    description: t.description,
    category: t.category,
    module: t.module ?? null,
    details: t.details ?? null,
    requestedPriority: t.requestedPriority,
    priority: t.priority,
    status: t.status,
    reporterId: t.reporterId,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    resolvedAt: t.resolvedAt ?? null,
    closedAt: t.closedAt ?? null,
    reopenCount: t.reopenCount ?? 0,
  };
}

export function filterPublic<T extends { visibility?: string }>(
  rows: T[],
): T[] {
  return rows.filter((r) => r.visibility === "public");
}

export function attachmentView(a: any) {
  return {
    id: a.id,
    messageId: a.messageId ?? null,
    fileName: a.fileName,
    contentType: a.contentType,
    size: a.size,
    visibility: a.visibility,
    createdAt: a.createdAt,
  };
}
