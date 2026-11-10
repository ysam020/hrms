/**
 * Who handles website leads, and the notifications a new lead sends — on the
 * existing notify() → BullMQ pipeline (in-app + push via the notification
 * worker, email via the email worker, both with the queue's retries).
 *
 *  - The team: members of Praesto's own organisation who hold the
 *    PraestoAdmin action (owner, superusers, or the explicit permission),
 *    excluding former employees — the same rule as platformAdminGrants.
 *  - Team notifications carry the company, its size and the request type,
 *    never the prospect's name, email or phone: those stay in the console.
 *  - The prospect gets one plain acknowledgement. No promised response time.
 *  - Callers fire and forget: failures are logged, never thrown.
 */
import { notify } from "@hrms/notifications";
import {
  BLOCKED_EMPLOYEE_STATUSES,
  PLATFORM_FROM,
  renderEmailHtml,
} from "@hrms/common";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { platformTenantId } from "../config/platform";
import { LEAD_KIND_LABELS, type LeadKind } from "../config/leads";
import { platformPermission, type PlatformAdminAction } from "./platformAccess";
import { peopleById, type PersonSummary } from "./supportStore";

/** Praesto team members who hold `action` for leads. */
export async function leadTeam(
  action: Extract<PlatformAdminAction, "view_leads" | "manage_leads">,
): Promise<PersonSummary[]> {
  const platform = platformTenantId();
  if (!platform) return [];
  const [owners, users] = await Promise.all([
    prisma.tenantMembership.findMany({
      where: { tenantId: platform, role: "owner" },
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
  const ownerIds = new Set(owners.map((m) => m.userId));
  const ids = users
    .filter(
      (u) => !BLOCKED_EMPLOYEE_STATUSES.includes(u.employeeStatus as string),
    )
    .filter((u) => {
      const perms: string[] = (u.permissions as string[] | null) ?? [];
      return (
        ownerIds.has(u.id) ||
        u.isSuperUser ||
        perms.includes("*:*:*") ||
        perms.includes(platformPermission(action))
      );
    })
    .map((u) => u.id);
  return [...(await peopleById(ids)).values()];
}

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

export interface NotifyLead {
  id: string;
  kind: string;
  name: string;
  email: string;
  companyName: string;
  companySize: string;
}

const kindLabel = (k: string) => LEAD_KIND_LABELS[k as LeadKind] ?? "Enquiry";

/** New lead (or a repeat after a day): tell the people who can see it. */
export async function notifyLeadTeam(
  lead: NotifyLead,
  opts: { repeat?: boolean } = {},
): Promise<boolean> {
  try {
    const team = await leadTeam("view_leads");
    if (team.length === 0) {
      logger.warn("lead received but nobody holds PraestoAdmin:view_leads", {
        leadId: lead.id,
      });
      return false;
    }
    const platform = platformTenantId() ?? "platform";
    const what = kindLabel(lead.kind);
    const title = opts.repeat ? `${what} (repeat)` : `New ${what}`;
    const summary = `${lead.companyName} · ${lead.companySize} employees`;
    const link = appUrl(`/platform-admin/leads/${lead.id}`);
    const usernames = team.map((p) => p.username).filter(Boolean);
    const emails = team.map((p) => p.email).filter(Boolean) as string[];
    const jobs: Promise<unknown>[] = [
      notify({
        tenantId: platform,
        event: "leadReceived",
        recipients: team.map((p) => p.id),
        pushTargets: usernames,
        inApp: {
          title,
          message: summary,
          eventType: "lead_notification",
          priority: "medium",
        },
        push: { enabled: usernames.length > 0 },
      }),
    ];
    if (emails.length > 0)
      jobs.push(
        notify({
          tenantId: platform,
          event: "leadReceived",
          email: {
            to: emails,
            subject: `${title}: ${lead.companyName}`,
            from: PLATFORM_FROM,
            html: renderEmailHtml({
              title,
              preheader: summary,
              bodyHtml: `<h2>${escapeHtml(title)}</h2><p>${escapeHtml(
                summary,
              )}</p><p>Contact details are in the Platform Console.</p><p><a href="${link}">Open the lead</a></p>`,
              signature: "Praesto",
            }),
          },
        }),
      );
    await Promise.all(jobs);
    return true;
  } catch (err) {
    logger.warn("lead team notification failed", { leadId: lead.id, err });
    return false;
  }
}

/** A short acknowledgement to the person who submitted the form. */
export async function acknowledgeLead(lead: NotifyLead): Promise<boolean> {
  try {
    const first = lead.name.trim().split(/\s+/)[0] || "there";
    const isDemo = lead.kind === "demo";
    const subject = isDemo
      ? "We’ve received your Praesto demo request"
      : "We’ve received your message to Praesto";
    const body = isDemo
      ? "Thank you for your interest in Praesto. We’ve received your demo request, and someone from our team will be in touch to arrange a time."
      : "Thank you for your interest in Praesto. We’ve received your message, and someone from our team will be in touch.";
    await notify({
      tenantId: platformTenantId() ?? "platform",
      event: "leadAcknowledged",
      email: {
        to: [lead.email],
        subject,
        from: PLATFORM_FROM,
        html: renderEmailHtml({
          title: subject,
          preheader: body,
          bodyHtml: `<p>Hi ${escapeHtml(first)},</p><p>${escapeHtml(
            body,
          )}</p><p>If you didn’t send this request, you can ignore this email.</p>`,
          signature: "The Praesto Team",
        }),
      },
    });
    return true;
  } catch (err) {
    logger.warn("lead acknowledgement failed", { leadId: lead.id, err });
    return false;
  }
}
