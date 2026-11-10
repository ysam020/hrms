/**
 * Website sales leads.
 *
 *  - submitLead: the public "Book a Demo" / "Contact Sales" form
 *    (POST /public/leads, anonymous, rate-limited per IP in
 *    config/rateLimiters.ts). Always answers the same way, so it never
 *    reveals whether an address is already known.
 *  - Everything else: the Platform Console (/platform/admin/leads*), behind
 *    requirePlatformAdmin("view_leads" | "manage_leads"). Changes are written
 *    to the platform audit log without the prospect's personal details.
 *
 * Leads live in the master DB (model Lead). Rules: config/leads.ts.
 * Retention: a TTL index deletes each lead at purgeAt, which every
 * submission and staff change pushes out (ensureIndexes.ts).
 */
import { createHash, randomUUID } from "crypto";
import { Request, Response } from "express";
import { z } from "zod";
import { prisma, getEmailDomain, isPublicEmailDomain } from "@hrms/db";
import { getRedisClient } from "@hrms/cache";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { AuthRequest } from "../middleware/authenticate";
import {
  CLOSED_LEAD_STATUSES,
  DUPLICATE_WINDOW_MS,
  isWebmail,
  LEAD_KIND_LABELS,
  LEAD_KINDS,
  LEAD_STATUSES,
  NOTES_PER_LEAD_MAX,
  NOTIFY_INTERVAL_MS,
  leadChannel,
  normalizeLeadEmail,
  normalizePhone,
  purgeDateFrom,
  rate,
  sanitizeAttribution,
  stageStamps,
  type LeadKind,
  type LeadStatus,
} from "../config/leads";
import type {
  platformLeadNoteSchema,
  platformLeadUpdateSchema,
  platformLeadsQuerySchema,
  publicLeadSchema,
} from "../schemas";
import { peopleById } from "../services/supportStore";
import { istDate, resolveRange } from "../services/platformMetrics";
import {
  acknowledgeLead,
  leadTeam,
  notifyLeadTeam,
} from "../services/leadNotifications";
import { writePlatformAudit } from "./platformAdmin";

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_STATUSES = LEAD_STATUSES.filter(
  (s) => !CLOSED_LEAD_STATUSES.includes(s),
);
const RECEIVED = {
  message: "Thank you. We’ve received your request and will be in touch.",
};

const received = (res: Response) =>
  apiResponse(res, RESPONSE_STATUS.CREATED, RECEIVED);

function fail(res: Response, where: string, error: unknown) {
  logger.error(`leads.${where} error:`, { error });
  return apiResponse(res, RESPONSE_STATUS.INTERNAL_SERVER_ERROR, {
    message: "Something went wrong. Try again.",
  });
}

/** Today in IST as YYYY-MM-DD. */
function istToday(now = new Date()): string {
  return new Date(now.getTime() + (5 * 60 + 30) * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/**
 * One submission per address at a time: two near-simultaneous submits (a
 * double click, a retry) can't both create a lead. Fails open without Redis;
 * the duplicate window below still catches most repeats.
 */
async function claimSubmission(email: string): Promise<boolean> {
  try {
    const key = `lead:submit:${createHash("sha256").update(email).digest("hex")}`;
    const ok = await getRedisClient().set(key, "1", "EX", 15, "NX");
    return ok === "OK";
  } catch (err) {
    logger.warn("lead submission lock unavailable", { err });
    return true;
  }
}

const systemNote = (body: string, now: Date) => ({
  id: randomUUID(),
  authorId: null,
  body,
  createdAt: now,
});

// ── Public form ─────────────────────────────────────────────────────────────

export async function submitLead(req: Request, res: Response) {
  const b = req.body as z.infer<typeof publicLeadSchema>;
  // Honeypot filled in: answer as usual, store nothing.
  if (b.website) {
    logger.info("lead submission discarded (honeypot)");
    return received(res);
  }
  let phone: string | null = null;
  if (b.phone) {
    phone = normalizePhone(b.phone);
    if (!phone)
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "Enter a valid phone number, e.g. 98765 43210 or +44 20 7946 0958",
      });
  }
  const isDemo = b.kind === "demo";
  if (isDemo && b.preferredDate && b.preferredDate < istToday())
    return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
      message: "Choose a preferred date from today onwards",
    });

  const email = normalizeLeadEmail(b.email);
  if (!(await claimSubmission(email))) return received(res);

  try {
    const now = new Date();
    const open = await prisma.lead.findFirst({
      where: { email, status: { in: [...OPEN_STATUSES] } },
      orderBy: { createdAt: "desc" },
    });

    if (open) {
      // The same request again within minutes: nothing new to record.
      if (
        open.kind === b.kind &&
        now.getTime() - new Date(open.lastSubmittedAt).getTime() <
          DUPLICATE_WINDOW_MS
      )
        return received(res);
      const notifyAgain =
        !open.lastNotifiedAt ||
        now.getTime() - new Date(open.lastNotifiedAt).getTime() >=
          NOTIFY_INTERVAL_MS;
      const details = [
        `Submitted again: ${LEAD_KIND_LABELS[b.kind as LeadKind]}.`,
        phone && phone !== open.phone ? `Phone: ${phone}` : null,
        b.companyName !== open.companyName ? `Company: ${b.companyName}` : null,
        b.companySize !== open.companySize
          ? `Company size: ${b.companySize}`
          : null,
        b.designation && b.designation !== open.designation
          ? `Designation: ${b.designation}`
          : null,
        isDemo && b.preferredDate
          ? `Preferred: ${b.preferredDate}${b.preferredTime ? `, ${b.preferredTime}` : ""}`
          : null,
        b.message ? `Message: ${b.message}` : null,
      ].filter(Boolean);
      const canNote = (open.notes?.length ?? 0) < NOTES_PER_LEAD_MAX;
      await prisma.lead.update({
        where: { id: open.id },
        data: {
          submissionCount: { increment: 1 },
          lastSubmittedAt: now,
          purgeAt: purgeDateFrom(now),
          ...(notifyAgain && { lastNotifiedAt: now }),
          ...(canNote && {
            notes: { push: systemNote(details.join("\n"), now) },
          }),
        },
      });
      if (notifyAgain) {
        void notifyLeadTeam({ ...open, kind: b.kind }, { repeat: true });
        void acknowledgeLead({ ...open, kind: b.kind });
      }
      return received(res);
    }

    const lead = await prisma.lead.create({
      data: {
        kind: b.kind,
        name: b.name,
        email,
        phone,
        companyName: b.companyName,
        companySize: b.companySize,
        designation: b.designation ?? null,
        message: b.message ?? null,
        preferredDate: isDemo ? (b.preferredDate ?? null) : null,
        preferredTime: isDemo ? (b.preferredTime ?? null) : null,
        freeEmailDomain: isWebmail(getEmailDomain(email), isPublicEmailDomain),
        ...sanitizeAttribution(b.attribution),
        status: "new",
        ownerId: null,
        submissionCount: 1,
        lastSubmittedAt: now,
        lastNotifiedAt: now,
        consentAt: now,
        notes: [],
        purgeAt: purgeDateFrom(now),
      },
    });
    void notifyLeadTeam(lead);
    void acknowledgeLead(lead);
    return received(res);
  } catch (error) {
    return fail(res, "submitLead", error);
  }
}

// ── Platform Console ────────────────────────────────────────────────────────

const actorId = (req: Request) => (req as AuthRequest).user?.userId ?? null;

function dateWhere(from?: string, to?: string) {
  if (!from && !to) return {};
  return {
    createdAt: {
      ...(from && { gte: istDate(from) }),
      ...(to && { lte: new Date(istDate(to).getTime() + DAY_MS - 1) }),
    },
  };
}

const summaryOf = (l: any, owners: Map<string, { name: string }>) => ({
  id: l.id,
  kind: l.kind,
  name: l.name,
  companyName: l.companyName,
  companySize: l.companySize,
  status: l.status,
  channel: leadChannel(l),
  ownerId: l.ownerId ?? null,
  ownerName: l.ownerId ? (owners.get(l.ownerId)?.name ?? null) : null,
  submissionCount: l.submissionCount,
  lastContactedAt: l.lastContactedAt ?? null,
  nextFollowUpAt: l.nextFollowUpAt ?? null,
  createdAt: l.createdAt,
});

export async function listLeads(req: Request, res: Response) {
  const q = req.query as unknown as z.infer<typeof platformLeadsQuerySchema>;
  try {
    const base: Record<string, unknown> = {
      ...dateWhere(q.from, q.to),
      ...(q.kind && { kind: q.kind }),
      ...(q.owner === "me" && { ownerId: actorId(req) }),
      ...(q.owner === "none" && { ownerId: null }),
      ...(q.owner &&
        q.owner !== "me" &&
        q.owner !== "none" && { ownerId: q.owner }),
      ...(q.search && {
        OR: ["name", "companyName", "email"].map((f) => ({
          [f]: { contains: q.search, mode: "insensitive" },
        })),
      }),
    };
    const where = { ...base, ...(q.status && { status: q.status }) };
    const [rows, total, ...statusCounts] = await Promise.all([
      prisma.lead.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      }),
      prisma.lead.count({ where }),
      ...LEAD_STATUSES.map((status) =>
        prisma.lead.count({ where: { ...base, status } }),
      ),
    ]);
    const owners = await peopleById(rows.map((r) => r.ownerId));
    const counts = Object.fromEntries(
      LEAD_STATUSES.map((s, i) => [s, statusCounts[i] as number]),
    ) as Record<LeadStatus, number>;
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        leads: rows.map((r) => summaryOf(r, owners)),
        total,
        page: q.page,
        limit: q.limit,
        counts: {
          ...counts,
          total: Object.values(counts).reduce((a, b) => a + b, 0),
        },
      },
    });
  } catch (error) {
    return fail(res, "listLeads", error);
  }
}

async function leadDetail(id: string) {
  const lead = await prisma.lead.findUnique({ where: { id } });
  if (!lead) return null;
  const notes = [...(lead.notes ?? [])].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  const people = await peopleById([
    lead.ownerId,
    ...notes.map((n) => n.authorId),
  ]);
  return {
    ...lead,
    channel: leadChannel(lead),
    ownerName: lead.ownerId ? (people.get(lead.ownerId)?.name ?? null) : null,
    notes: notes.map((n) => ({
      ...n,
      authorName: n.authorId
        ? (people.get(n.authorId)?.name ?? "Former team member")
        : "Website form",
    })),
  };
}

const OBJECT_ID = /^[a-f0-9]{24}$/i;
const notFound = (res: Response) =>
  apiResponse(res, RESPONSE_STATUS.NOT_FOUND, { message: "Lead not found" });

export async function getLead(req: Request, res: Response) {
  const { leadId } = req.params as { leadId: string };
  if (!OBJECT_ID.test(leadId)) return notFound(res);
  try {
    const lead = await leadDetail(leadId);
    return lead
      ? apiResponse(res, RESPONSE_STATUS.SUCCESS, { data: lead })
      : notFound(res);
  } catch (error) {
    return fail(res, "getLead", error);
  }
}

export async function updateLead(req: Request, res: Response) {
  const { leadId } = req.params as { leadId: string };
  if (!OBJECT_ID.test(leadId)) return notFound(res);
  const b = req.body as z.infer<typeof platformLeadUpdateSchema>;
  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return notFound(res);
    if (b.ownerId) {
      const team = await leadTeam("manage_leads");
      if (!team.some((p) => p.id === b.ownerId))
        return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
          message: "Leads can only be assigned to someone who manages leads",
        });
    }
    const now = new Date();
    const toDate = (v: string | null | undefined) =>
      v === undefined ? undefined : v === null ? null : new Date(v);
    const data: Record<string, unknown> = { purgeAt: purgeDateFrom(now) };
    const changes: Record<string, unknown> = {};
    if (b.status && b.status !== lead.status) {
      data.status = b.status;
      Object.assign(data, stageStamps(lead, b.status, now));
      changes.status = { from: lead.status, to: b.status };
    }
    if (b.ownerId !== undefined && b.ownerId !== lead.ownerId) {
      data.ownerId = b.ownerId;
      changes.owner = { from: lead.ownerId ?? null, to: b.ownerId };
    }
    for (const field of ["lastContactedAt", "nextFollowUpAt"] as const) {
      const v = toDate(b[field]);
      if (v !== undefined) {
        data[field] = v;
        changes[field] = v ? v.toISOString() : null;
      }
    }
    if (Object.keys(changes).length === 0)
      return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
        data: await leadDetail(leadId),
      });
    await prisma.lead.update({ where: { id: leadId }, data });
    await writePlatformAudit(req, {
      action: "lead_update",
      description: `Updated a ${LEAD_KIND_LABELS[lead.kind as LeadKind]?.toLowerCase() ?? "lead"}`,
      result: "success",
      details: { leadId, changes },
    });
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: await leadDetail(leadId),
    });
  } catch (error) {
    return fail(res, "updateLead", error);
  }
}

export async function addLeadNote(req: Request, res: Response) {
  const { leadId } = req.params as { leadId: string };
  if (!OBJECT_ID.test(leadId)) return notFound(res);
  const { body } = req.body as z.infer<typeof platformLeadNoteSchema>;
  try {
    const lead = await prisma.lead.findUnique({ where: { id: leadId } });
    if (!lead) return notFound(res);
    if ((lead.notes?.length ?? 0) >= NOTES_PER_LEAD_MAX)
      return apiResponse(res, RESPONSE_STATUS.CONFLICT, {
        message: "This lead has reached the note limit",
      });
    const now = new Date();
    const note = {
      id: randomUUID(),
      authorId: actorId(req),
      body,
      createdAt: now,
    };
    await prisma.lead.update({
      where: { id: leadId },
      data: { notes: { push: note }, purgeAt: purgeDateFrom(now) },
    });
    // The note text stays on the lead; the audit log records only the event.
    await writePlatformAudit(req, {
      action: "lead_note",
      description: "Added a note to a lead",
      result: "success",
      details: { leadId, noteId: note.id },
    });
    return apiResponse(res, RESPONSE_STATUS.CREATED, {
      data: await leadDetail(leadId),
    });
  } catch (error) {
    return fail(res, "addLeadNote", error);
  }
}

export async function listLeadOwners(_req: Request, res: Response) {
  try {
    const team = await leadTeam("manage_leads");
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        owners: team
          .map((p) => ({ id: p.id, name: p.name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      },
    });
  } catch (error) {
    return fail(res, "listLeadOwners", error);
  }
}

/**
 * Funnel for leads created in the range: counts by stage reached, by type
 * and by channel, and the conversion rates between stages. Stage reached
 * comes from the first-reached timestamps, so a lead that later went cold
 * still counts as having had its demo.
 */
export async function getLeadMetrics(req: Request, res: Response) {
  const q = req.query as { range?: any; from?: string; to?: string };
  try {
    const now = new Date();
    const first =
      q.range === "all"
        ? await prisma.lead.findFirst({
            orderBy: { createdAt: "asc" },
            select: { createdAt: true },
          })
        : null;
    const range = resolveRange(q, now, first?.createdAt ?? null);
    const rows = await prisma.lead.findMany({
      where: { createdAt: { gte: range.from, lte: range.to } },
      select: {
        kind: true,
        status: true,
        utmSource: true,
        referrerHost: true,
        qualifiedAt: true,
        demoScheduledAt: true,
        convertedAt: true,
      },
      take: 20_000,
    });
    const reached = (l: (typeof rows)[number]) => ({
      qualified: !!(l.qualifiedAt || l.demoScheduledAt || l.convertedAt),
      demo: !!l.demoScheduledAt,
      converted: !!l.convertedAt,
    });
    const totals = { leads: rows.length, qualified: 0, demos: 0, converted: 0 };
    let demoThenConverted = 0;
    const channels = new Map<string, typeof totals>();
    const kinds = Object.fromEntries(LEAD_KINDS.map((k) => [k, 0])) as Record<
      LeadKind,
      number
    >;
    for (const l of rows) {
      const r = reached(l);
      totals.qualified += +r.qualified;
      totals.demos += +r.demo;
      totals.converted += +r.converted;
      if (r.demo && r.converted) demoThenConverted++;
      kinds[l.kind as LeadKind] = (kinds[l.kind as LeadKind] ?? 0) + 1;
      const key = leadChannel(l);
      const c = channels.get(key) ?? {
        leads: 0,
        qualified: 0,
        demos: 0,
        converted: 0,
      };
      c.leads++;
      c.qualified += +r.qualified;
      c.demos += +r.demo;
      c.converted += +r.converted;
      channels.set(key, c);
    }
    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      data: {
        range: { from: range.from, to: range.to },
        totals,
        kinds,
        rates: {
          leadToQualified: rate(totals.qualified, totals.leads),
          leadToDemo: rate(totals.demos, totals.leads),
          demoToCustomer: rate(demoThenConverted, totals.demos),
          leadToCustomer: rate(totals.converted, totals.leads),
        },
        channels: [...channels.entries()]
          .map(([channel, c]) => ({
            channel,
            ...c,
            conversionRate: rate(c.converted, c.leads),
          }))
          .sort((a, b) => b.leads - a.leads),
      },
    });
  } catch (error) {
    return fail(res, "getLeadMetrics", error);
  }
}
