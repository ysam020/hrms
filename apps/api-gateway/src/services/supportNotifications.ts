/**
 * Tenant support notifications, on the existing notify() → BullMQ pipeline
 * (in-app + WebSocket + push via the notification worker, email via the
 * email worker, both with the queue's retries).
 *
 * Rules:
 *  - Only public events reach tenant users; internal notes and assignment
 *    changes only ever notify support agents.
 *  - Routing on the Praesto side: a ticket with an assignee notifies the
 *    assignee; an unassigned one notifies every active agent.
 *  - Security Concern tickets never carry the subject or message text in a
 *    notification or email — only the ticket number.
 *  - Callers fire and forget: a failure is logged as a warning and reported
 *    as `false`, never as delivered.
 */
import { notify, type NotificationEventType } from "@hrms/notifications";
import { PLATFORM_FROM, renderEmailHtml } from "@hrms/common";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { SUPPORT_CATEGORIES, type SupportCategory } from "../config/support";
import {
  peopleById,
  supportAgentIds,
  type PersonSummary,
} from "./supportStore";
import { platformTenantId } from "../config/platform";

export interface NotifyTicket {
  id: string;
  ticketNo: string;
  tenantId: string;
  subject: string;
  category: string;
  reporterId: string;
  assigneeId?: string | null;
  participantIds?: string[] | null;
}

const STATUS_LABELS: Record<string, string> = {
  open: "Open",
  in_progress: "In Progress",
  waiting_for_tenant: "Waiting for You",
  resolved: "Resolved",
  closed: "Closed",
};

const escapeHtml = (v: string) =>
  v
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;");

function appUrl(path: string): string {
  const base = (process.env.CLIENT_URL || "https://localhost:5173")
    .split(",")[0]
    .trim()
    .replace(/\/+$/, "");
  return `${base}${path}`;
}

const isSecurity = (t: NotifyTicket) => t.category === "security";

/** "PRA-2026-000123: Payroll export fails" — or just the number for security. */
export function ticketHeadline(t: NotifyTicket): string {
  return isSecurity(t) ? t.ticketNo : `${t.ticketNo}: ${t.subject}`;
}

function snippet(body: string, max = 280): string {
  const flat = body.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

interface Message {
  title: string;
  message: string;
  email?: { subject: string; heading: string; lines: string[]; link: string };
}

/** In-app (+push) to each person in their own tenant DB, plus optional email. */
async function deliver(
  event: NotificationEventType,
  people: PersonSummary[],
  msg: Message,
): Promise<void> {
  const byTenant = new Map<string, PersonSummary[]>();
  for (const p of people) {
    if (!p.tenantId) continue;
    byTenant.set(p.tenantId, [...(byTenant.get(p.tenantId) ?? []), p]);
  }
  const jobs: Promise<unknown>[] = [];
  for (const [tenantId, group] of byTenant) {
    const usernames = group.map((p) => p.username).filter(Boolean);
    jobs.push(
      notify({
        tenantId,
        event,
        recipients: group.map((p) => p.id),
        pushTargets: usernames,
        inApp: {
          title: msg.title,
          message: msg.message,
          eventType: "support_notification",
          priority: "medium",
        },
        // Never let push fall back to the worker's all-users broadcast.
        push: { enabled: usernames.length > 0 },
      }),
    );
  }
  const emails = people.map((p) => p.email).filter(Boolean) as string[];
  if (msg.email && emails.length > 0) {
    const { subject, heading, lines, link } = msg.email;
    jobs.push(
      notify({
        tenantId: people[0].tenantId ?? "platform",
        event,
        email: {
          to: emails,
          subject,
          from: PLATFORM_FROM,
          html: renderEmailHtml({
            title: subject,
            preheader: heading,
            bodyHtml: `<h2>${escapeHtml(heading)}</h2>${lines
              .map((l) => `<p>${escapeHtml(l)}</p>`)
              .join("")}<p><a href="${link}">Open the ticket</a></p>`,
            signature: "Praesto Support",
          }),
        },
      }),
    );
  }
  await Promise.all(jobs);
}

/** Wraps a notification so a failure is logged and reported, never thrown. */
export async function safely(
  label: string,
  ticketNo: string,
  fn: () => Promise<void>,
): Promise<boolean> {
  try {
    await fn();
    return true;
  } catch (err) {
    logger.warn(`support notification "${label}" failed for ${ticketNo}`, {
      err,
    });
    return false;
  }
}

async function agentsFor(t: NotifyTicket): Promise<PersonSummary[]> {
  const ids = t.assigneeId ? [t.assigneeId] : await supportAgentIds();
  return [...(await peopleById(ids)).values()];
}

async function tenantAudience(
  t: NotifyTicket,
  excludeUserId?: string,
): Promise<PersonSummary[]> {
  const ids = [t.reporterId, ...(t.participantIds ?? [])].filter(
    (id) => id !== excludeUserId,
  );
  const people = await peopleById(ids);
  // Only people still in the ticket's organisation.
  return [...people.values()].filter((p) => p.tenantId === t.tenantId);
}

async function tenantName(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  return tenant?.name ?? "An organisation";
}

// ── Events ──────────────────────────────────────────────────────────────────

export function notifyTicketCreated(t: NotifyTicket) {
  return safely("created", t.ticketNo, async () => {
    const [agents, org] = await Promise.all([
      agentsFor(t),
      tenantName(t.tenantId),
    ]);
    const kind =
      SUPPORT_CATEGORIES[t.category as SupportCategory]?.label ?? "Ticket";
    await deliver("supportTicketCreated", agents, {
      title: isSecurity(t) ? "New security report" : "New support ticket",
      message: `${org} · ${ticketHeadline(t)}`,
      email: {
        subject: isSecurity(t)
          ? `New security report ${t.ticketNo}`
          : `[${t.ticketNo}] ${kind}: ${t.subject}`,
        heading: `${org} raised ${t.ticketNo}`,
        lines: [`Category: ${kind}`],
        link: appUrl(`/platform/support/tickets/${t.id}`),
      },
    });
  });
}

/** A tenant replied or reopened — tell the assignee (or the whole team). */
export function notifyTenantActivity(
  t: NotifyTicket,
  actorId: string,
  what: "replied" | "reopened",
) {
  return safely(what, t.ticketNo, async () => {
    const agents = (await agentsFor(t)).filter((a) => a.id !== actorId);
    await deliver("supportTicketReply", agents, {
      title: what === "reopened" ? "Ticket reopened" : "Tenant replied",
      message: ticketHeadline(t),
      email: {
        subject: `[${t.ticketNo}] ${what === "reopened" ? "Reopened" : "New reply"}`,
        heading: `${t.ticketNo} was ${what === "reopened" ? "reopened" : "updated"} by the organisation`,
        lines: [],
        link: appUrl(`/platform/support/tickets/${t.id}`),
      },
    });
  });
}

/** A support agent replied publicly — reporter + participants. */
export function notifyStaffReply(t: NotifyTicket, body: string) {
  return safely("staff-reply", t.ticketNo, async () => {
    const people = await tenantAudience(t);
    await deliver("supportTicketReply", people, {
      title: "Praesto Support replied",
      message: ticketHeadline(t),
      email: {
        subject: `[${t.ticketNo}] Praesto Support replied`,
        heading: `New reply on ${t.ticketNo}`,
        lines: isSecurity(t) ? [] : [snippet(body)],
        link: appUrl(`/support/tickets/${t.id}`),
      },
    });
  });
}

/** Status/priority moved by the support team — tenant-visible changes only. */
export function notifyTenantOfChange(
  t: NotifyTicket,
  change: { field: "status" | "priority"; to: string },
) {
  return safely(`${change.field}-change`, t.ticketNo, async () => {
    const people = await tenantAudience(t);
    const to =
      change.field === "status"
        ? (STATUS_LABELS[change.to] ?? change.to)
        : change.to.charAt(0).toUpperCase() + change.to.slice(1);
    const line = `${change.field === "status" ? "Status" : "Priority"} changed to ${to}`;
    await deliver("supportTicketUpdated", people, {
      title: `${t.ticketNo} · ${line}`,
      message: isSecurity(t) ? t.ticketNo : t.subject,
      email:
        change.field === "status"
          ? {
              subject: `[${t.ticketNo}] ${line}`,
              heading: line,
              lines: [],
              link: appUrl(`/support/tickets/${t.id}`),
            }
          : undefined,
    });
  });
}

/** Assignment and internal notes: support team only. */
export function notifyAgent(
  t: NotifyTicket,
  agentId: string,
  what: "assigned" | "note",
) {
  return safely(`agent-${what}`, t.ticketNo, async () => {
    const agent = (await peopleById([agentId])).get(agentId);
    if (!agent) return;
    await deliver("supportTicketUpdated", [agent], {
      title:
        what === "assigned" ? "Ticket assigned to you" : "New internal note",
      message: ticketHeadline(t),
      email:
        what === "assigned"
          ? {
              subject: `[${t.ticketNo}] Assigned to you`,
              heading: `${t.ticketNo} is now assigned to you`,
              lines: [],
              link: appUrl(`/platform/support/tickets/${t.id}`),
            }
          : undefined,
    });
  });
}
