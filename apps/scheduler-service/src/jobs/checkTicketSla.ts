/**
 * checkTicketSla.ts
 *
 * Marks a helpdesk ticket as SLA-breached if it hasn't been resolved
 * by the time this job fires (scheduled at ticket.slaDeadline).
 *
 * Called by the BullMQ delayed job registered at ticket creation.
 */

import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";

export async function checkTicketSla(data?: {
  ticketId?: string;
}): Promise<void> {
  const ticketId = data?.ticketId;
  if (!ticketId) {
    // Called as a cron job (retryFailedWebhooks path) — do bulk sweep instead.
    const now = new Date();
    const result = await prisma.ticket.updateMany({
      where: {
        slaBreached: false,
        slaDeadline: { lte: now },
        status: { notIn: ["resolved", "closed"] },
      },
      data: { slaBreached: true },
    });
    if (result.count > 0) {
      logger.info(`SLA sweep: marked ${result.count} tickets as breached`);
    }
    return;
  }

  // Targeted check for a specific ticket.
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { id: true, status: true, slaBreached: true, slaDeadline: true },
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
}
