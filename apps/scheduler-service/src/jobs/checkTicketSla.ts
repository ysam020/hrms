/**
 * checkTicketSla.ts
 *
 * Marks a helpdesk ticket as SLA-breached if it hasn't been resolved
 * by the time this job fires (scheduled at ticket.slaDeadline), and
 * notifies the assignee (or the raiser, if unassigned) that it happened.
 *
 * Called by the BullMQ delayed job registered at ticket creation, and as a
 * daily sweep. Tickets live in each tenant's own database, so every query
 * runs bound to a tenant.
 */

import {
  prisma,
  prismaWithTenant,
  runForTenant,
  runWithTenant,
  getClientForDb,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { notify } from "@hrms/notifications";
import { forEachActiveTenant } from "../utils/forEachTenant";
import {
  isNotificationDue,
  logBacklogRun,
  planBacklogNotifications,
} from "../utils/backlogNotifications";

const OPEN_STATUSES_EXCLUDED = ["resolved", "closed"];
// A ticket the sweep (or its per-ticket job) may still flag: open, not yet
// flagged, and past its deadline at `now`.
const stillDue = (now: Date) => ({
  slaBreached: false,
  slaDeadline: { lte: now },
  status: { notIn: OPEN_STATUSES_EXCLUDED },
});

async function notifySlaBreach(
  tenantId: string,
  ticketId: string,
  ticketNo: string,
  priority: string,
  recipientIds: string[],
): Promise<boolean> {
  const ids = [...new Set(recipientIds.filter(Boolean))];
  if (ids.length === 0) return false;
  try {
    // Scoped to this tenant by prismaWithTenant.
    const users = await prismaWithTenant.user.findMany({
      where: { id: { in: ids } },
      select: { id: true },
    });
    if (users.length === 0) return false;
    await notify({
      tenantId,
      event: "helpdeskSlaBreach",
      link: `/helpdesk/${ticketId}`,
      category: "helpdesk",
      recipients: users.map((u) => u.id),
      inApp: {
        title: "Ticket SLA breached",
        message: `Ticket ${ticketNo} has breached its SLA and is still unresolved.`,
        eventType: "helpdesk_notification",
        priority:
          priority === "critical" || priority === "high" ? "high" : "medium",
      },
      push: { enabled: true },
    });
    return true;
  } catch (err) {
    logger.warn(`notifySlaBreach failed for ticket ${ticketId}:`, { err });
    return false;
  }
}

async function sweepTenant(tenantId: string): Promise<number> {
  const now = new Date();
  const due = await prismaWithTenant.ticket.findMany({
    where: stillDue(now),
    select: {
      id: true,
      ticketNo: true,
      priority: true,
      raisedBy: true,
      assignedTo: true,
      slaDeadline: true,
    },
  });

  // Tickets that went overdue long ago (e.g. while this job was broken) are
  // flagged without notifying; deferred ones are left for the next run.
  const plan = await planBacklogNotifications(
    "checkTicketSla",
    tenantId,
    due,
    (t) => t.slaDeadline,
  );
  // Planned even when nothing is due, so the owed list is cleared.
  if (due.length === 0) return 0;
  // Every write repeats the "still due" condition: a ticket resolved (or
  // breached by its own delayed job) since the read above is left alone and
  // not notified.
  const silent = plan.silent.length
    ? await prismaWithTenant.ticket.updateMany({
        where: { id: { in: plan.silent.map((t) => t.id) }, ...stillDue(now) },
        data: { slaBreached: true },
      })
    : { count: 0 };

  const outcomes = await Promise.all(
    plan.notify.map(async (t) => {
      const { count } = await prismaWithTenant.ticket.updateMany({
        where: { id: t.id, ...stillDue(now) },
        data: { slaBreached: true },
      });
      if (count === 0) return null;
      return notifySlaBreach(
        tenantId,
        t.id,
        t.ticketNo,
        t.priority,
        [t.assignedTo, t.raisedBy].filter((v): v is string => !!v),
      );
    }),
  );
  const breached = outcomes.filter((o) => o !== null);
  const notified = breached.filter(Boolean).length;
  logBacklogRun("checkTicketSla", tenantId, {
    examined: due.length,
    silentlyUpdated: silent.count,
    alreadyChanged:
      plan.silent.length - silent.count + plan.notify.length - breached.length,
    notified,
    deferred: plan.deferred.length,
    notNotified: breached.length - notified,
  });
  return silent.count + breached.length;
}

// Must run inside the ticket's tenant context.
async function breachTicket(tenantId: string, ticketId: string): Promise<void> {
  const ticket = await prismaWithTenant.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      ticketNo: true,
      priority: true,
      status: true,
      slaBreached: true,
      slaDeadline: true,
      raisedBy: true,
      assignedTo: true,
    },
  });

  if (!ticket) {
    logger.warn(
      `checkTicketSla: ticket ${ticketId} not found in tenant ${tenantId}`,
    );
    return;
  }

  // Skip if already resolved/closed or already breached.
  if (ticket.slaBreached || OPEN_STATUSES_EXCLUDED.includes(ticket.status)) {
    return;
  }

  // Conditional, like the sweep: whichever of the two gets there first
  // flags and notifies; the other changes nothing.
  const { count } = await prismaWithTenant.ticket.updateMany({
    where: { id: ticketId, ...stillDue(new Date()) },
    data: { slaBreached: true },
  });
  if (count === 0) return;

  logger.info(`Ticket ${ticketId} SLA breached`, {
    tenantId,
    deadline: ticket.slaDeadline,
    status: ticket.status,
  });

  // A job that fires long after the deadline (e.g. a delayed job left over
  // from before the fix) flags the ticket without notifying, like the sweep.
  if (
    !(await isNotificationDue(
      "checkTicketSla",
      tenantId,
      ticket.id,
      ticket.slaDeadline,
    ))
  ) {
    logger.info(
      `Ticket ${ticketId} SLA breach not notified: deadline is older than the notification window`,
      { tenantId },
    );
    return;
  }
  await notifySlaBreach(
    tenantId,
    ticket.id,
    ticket.ticketNo,
    ticket.priority,
    [ticket.assignedTo, ticket.raisedBy].filter((v): v is string => !!v),
  );
}

// Delayed jobs enqueued before producers added tenantId carry only the
// ticket id, and can still be days from firing. Find the tenant that holds
// the ticket rather than dropping the check.
async function findTicketTenant(ticketId: string): Promise<string | null> {
  const tenants = await prisma.tenant.findMany({
    where: { isActive: true, dbName: { not: null } },
    select: { id: true, dbName: true },
  });
  for (const tenant of tenants) {
    const found = await runWithTenant(
      tenant.id,
      getClientForDb(tenant.dbName!),
      () =>
        prismaWithTenant.ticket.findUnique({
          where: { id: ticketId },
          select: { id: true },
        }),
    );
    if (found) return tenant.id;
  }
  return null;
}

export async function checkTicketSla(data?: {
  ticketId?: string;
  tenantId?: string;
}): Promise<void> {
  const ticketId = data?.ticketId;
  if (!ticketId) {
    // Called as the daily cron job (no ticketId) — do a bulk sweep instead.
    let breached = 0;
    try {
      await forEachActiveTenant("checkTicketSla", async (tenantId) => {
        breached += await sweepTenant(tenantId);
      });
    } finally {
      logger.info(`SLA sweep: marked ${breached} tickets as breached`);
    }
    return;
  }

  // Targeted check for a specific ticket.
  let tenantId = data?.tenantId;
  if (!tenantId) {
    tenantId = (await findTicketTenant(ticketId)) ?? undefined;
    if (!tenantId) {
      logger.warn(
        `checkTicketSla: ticket ${ticketId} (legacy job without tenantId) not found in any active tenant`,
      );
      return;
    }
    logger.info(
      `checkTicketSla: resolved legacy job for ticket ${ticketId} to tenant ${tenantId}`,
    );
  }
  const owner = tenantId;
  // Throws TenantContextError for an unknown tenant or one without a
  // database, failing the job visibly instead of reading the master DB.
  await runForTenant(owner, () => breachTicket(owner, ticketId));
}
