/**
 * checkTicketSla.ts
 *
 * Marks a helpdesk ticket as SLA-breached if it hasn't been resolved
 * by the time this job fires (scheduled at ticket.slaDeadline), and
 * notifies the assignee (or the raiser, if unassigned) that it happened.
 *
 * Called by the BullMQ delayed job registered at ticket creation.
 */

import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { notify } from "@hrms/notifications";

async function notifySlaBreach(
  tenantId: string,
  ticketId: string,
  ticketNo: string,
  priority: string,
  recipientIds: string[],
): Promise<void> {
  const ids = [...new Set(recipientIds.filter(Boolean))];
  if (ids.length === 0) return;
  try {
    const users = await prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, username: true },
    });
    if (users.length === 0) return;
    await notify({
      tenantId,
      event: "helpdeskSlaBreach",
      recipients: users.map((u) => u.id),
      pushTargets: users.map((u) => u.username),
      inApp: {
        title: "Ticket SLA breached",
        message: `Ticket ${ticketNo} has breached its SLA and is still unresolved.`,
        eventType: "helpdesk_notification",
        priority:
          priority === "critical" || priority === "high" ? "high" : "medium",
      },
      push: { enabled: true },
    });
  } catch (err) {
    logger.warn(`notifySlaBreach failed for ticket ${ticketId}:`, { err });
  }
}

export async function checkTicketSla(data?: {
  ticketId?: string;
}): Promise<void> {
  const ticketId = data?.ticketId;
  if (!ticketId) {
    // Called as the daily cron job (no ticketId) — do a bulk sweep instead.
    const now = new Date();
    const toBreach = await prisma.ticket.findMany({
      where: {
        slaBreached: false,
        slaDeadline: { lte: now },
        status: { notIn: ["resolved", "closed"] },
      },
      select: {
        id: true,
        tenantId: true,
        ticketNo: true,
        priority: true,
        raisedBy: true,
        assignedTo: true,
      },
    });
    if (toBreach.length === 0) return;

    const result = await prisma.ticket.updateMany({
      where: { id: { in: toBreach.map((t) => t.id) } },
      data: { slaBreached: true },
    });
    logger.info(`SLA sweep: marked ${result.count} tickets as breached`);

    await Promise.all(
      toBreach.map((t) =>
        notifySlaBreach(
          t.tenantId ?? "",
          t.id,
          t.ticketNo,
          t.priority,
          [t.assignedTo, t.raisedBy].filter((v): v is string => !!v),
        ),
      ),
    );
    return;
  }

  // Targeted check for a specific ticket.
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: {
      id: true,
      tenantId: true,
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
    logger.warn(`checkTicketSla: ticket ${ticketId} not found`);
    return;
  }

  // Skip if already resolved/closed or already breached.
  if (
    (ticket as any).slaBreached ||
    ["resolved", "closed"].includes((ticket as any).status)
  ) {
    return;
  }

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { slaBreached: true },
  });

  logger.info(`Ticket ${ticketId} SLA breached`, {
    deadline: (ticket as any).slaDeadline,
    status: (ticket as any).status,
  });

  await notifySlaBreach(
    ticket.tenantId ?? "",
    ticket.id,
    ticket.ticketNo,
    ticket.priority,
    [ticket.assignedTo, ticket.raisedBy].filter((v): v is string => !!v),
  );
}
