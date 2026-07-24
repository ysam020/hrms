import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import {
  prismaWithTenant as prisma,
  prisma as masterPrisma,
  getTenantId,
  getAuditActor,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { notify } from "@hrms/notifications";
import { tenantFrom, tenantReplyTo, renderEmailHtml } from "@hrms/common";
import { MESSAGES } from "../constants/messages";
import { toPerformanceReviewCycleProto } from "./serializers";
import { resolveReviewerId } from "./resolveReviewer";

export const createCycle = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { name, periodStart, periodEnd, ratingScale, userIds } = call.request;

    if (!name || !periodStart || !periodEnd) {
      return callback(null, {
        message: MESSAGES.NAME_PERIOD_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const tenantId = getTenantId()!;
    const createdBy = getAuditActor()?.userId ?? "";

    const cycle = await prisma.performanceReviewCycle.create({
      data: {
        tenantId,
        name,
        periodStart: new Date(periodStart),
        periodEnd: new Date(periodEnd),
        ratingScale: ratingScale || 5,
        createdBy,
        status: "active",
      },
    });

    const employeeIds: string[] = Array.isArray(userIds) ? userIds : [];
    const assignedUserIds: string[] = [];

    // The cycle itself is already committed above — one bad userId (stale
    // reference, duplicate submission, etc.) must not fail the whole
    // request and leave the caller thinking no cycle was created at all
    // while it silently sits in the DB with zero reviews.
    for (const userId of employeeIds) {
      try {
        const reviewerId = await resolveReviewerId(tenantId, userId, createdBy);
        await prisma.performanceReview.create({
          data: {
            tenantId,
            cycleId: cycle.id,
            userId,
            reviewerId,
            status: "draft",
          },
        });
        assignedUserIds.push(userId);
      } catch (err) {
        logger.error("CreateCycle: failed to create review for user", {
          cycleId: cycle.id,
          userId,
          err,
        });
      }
    }

    // Notify assigned employees (fire-and-forget, in-app + email).
    if (assignedUserIds.length > 0) {
      Promise.all([
        prisma.user.findMany({
          where: { id: { in: assignedUserIds } },
          select: { email: true },
        }),
        masterPrisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true, helpEmail: true },
        }),
      ])
        .then(([employees, tenant]) => {
          const tenantName = tenant?.name ?? "your organisation";
          const emails = employees
            .map((e) => e.email)
            .filter((e): e is string => !!e);
          return notify({
            tenantId,
            event: "performanceReviewAssigned",
            recipients: assignedUserIds,
            inApp: {
              title: "Performance Review",
              message: `You've been assigned a performance review: ${name}`,
              eventType: "performance_review_notification",
              priority: "medium",
            },
            email:
              emails.length > 0
                ? {
                    to: emails,
                    subject: `Performance review assigned: ${name}`,
                    html: renderEmailHtml({
                      title: "Performance Review Assigned",
                      tenantName,
                      bodyHtml: `<h2>Hello,</h2><p>You've been assigned a performance review for <strong>${name}</strong>.</p>`,
                    }),
                    from: tenantFrom(tenantName),
                    replyTo: tenantReplyTo(tenant?.helpEmail),
                  }
                : undefined,
          });
        })
        .catch((err) => logger.warn("[createCycle] notify failed:", { err }));
    }

    return callback(null, {
      message: MESSAGES.CYCLE_CREATED,
      status: status.OK,
      data: toPerformanceReviewCycleProto(cycle),
    });
  } catch (err) {
    logger.error("CreateCycle error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
