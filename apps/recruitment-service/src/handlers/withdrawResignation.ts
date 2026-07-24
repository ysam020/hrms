import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import {
  prismaWithTenant as prisma,
  prisma as masterPrisma,
  getTenantId,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { cancelApproval } from "@hrms/approval-engine";
import { getNotificationQueue, getEmailQueue } from "@hrms/queue";
import { tenantFrom, tenantReplyTo, renderEmailHtml } from "@hrms/common";
import { MESSAGES } from "../constants/messages";

/**
 * Employee-initiated withdrawal, before HR has made a decision. Distinct from
 * rejectResignation — previously the gateway called RejectResignation with a
 * "Withdrawn" status that handler silently ignored (it hardcodes "Rejected"),
 * so withdrawals were incorrectly recorded as rejections. This is the real fix.
 */
export const withdrawResignation = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, userId } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const tenantId = getTenantId();

    // findFirst (not findUnique) so tenantId is enforced — tenants without a
    // dedicated DB share the master DB, where `id` alone doesn't prevent
    // acting on another tenant's resignation.
    const resignation = await prisma.resignation.findFirst({
      where: { id, tenantId },
    });
    if (!resignation) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    // `userId` is the acting employee's own id for self-service withdrawals.
    // The gateway (recruitment.ts withdrawResignation) omits it entirely when
    // the caller is a privileged owner/admin/superuser withdrawing on an
    // employee's behalf — that's the intentional override, not a bypass.
    if (userId && resignation.userId !== userId) {
      return callback(null, {
        message: MESSAGES.CANNOT_WITHDRAW_OTHERS_RESIGNATION,
        status: status.PERMISSION_DENIED,
      });
    }

    if (resignation.status !== "Submitted") {
      return callback(null, {
        message: MESSAGES.ONLY_SUBMITTED_CAN_BE_WITHDRAWN,
        status: status.FAILED_PRECONDITION,
      });
    }

    await prisma.resignation.update({
      where: { id },
      data: {
        status: "Withdrawn",
        withdrawnOn: new Date(),
        lastUpdatedOn: new Date(),
      },
    });

    // Cancels the submit-time ApprovalInstance (see submitResignation.ts) so
    // it stops showing up as a pending approval for a withdrawn resignation.
    if (tenantId) {
      const instance = await (prisma as any).approvalInstance.findFirst({
        where: {
          tenantId,
          module: "resignation",
          entityId: id,
          status: "pending",
        },
      });
      if (instance) {
        await cancelApproval(instance.id).catch((err) =>
          logger.warn(
            "[withdrawResignation] Failed to cancel pending approval instance:",
            { err },
          ),
        );
      }
    }

    await cacheManager.invalidatePattern(`t:${tenantId}:resignations:*`);

    // Notify HR + team leaders (fire-and-forget, in-app + email) — mirrors
    // submitResignation's recipient resolution. No userId on the resignation
    // means there's no one to attribute the withdrawal to — skip.
    const actingUserId = resignation.userId;
    if (!actingUserId) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_WITHDRAWN,
        status: status.OK,
      });
    }
    Promise.all([
      prisma.user.findUnique({
        where: { id: actingUserId },
        select: { username: true },
      }),
      prisma.user.findMany({
        where: { department: "HUMAN RESOURCES" },
        select: { id: true, username: true, email: true },
      }),
      prisma.team.findMany({
        where: {
          OR: [
            { members: { has: actingUserId } },
            { teamLeaderId: actingUserId },
          ],
        },
        select: { teamLeaderId: true },
      }),
      tenantId
        ? masterPrisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true, helpEmail: true },
          })
        : null,
    ])
      .then(async ([employee, hrUsers, teams, tenant]) => {
        const employeeUsername = employee?.username || actingUserId;
        const teamLeaderIds = [
          ...new Set(
            teams
              .map((t) => t.teamLeaderId)
              .filter((id) => id !== actingUserId),
          ),
        ];
        const teamLeaderUsers =
          teamLeaderIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: teamLeaderIds } },
                select: { id: true, username: true, email: true },
              })
            : [];
        const allTargets = [...hrUsers, ...teamLeaderUsers];
        const uniqueIds = [...new Set(allTargets.map((u) => u.id))];
        const uniqueUsernames = [...new Set(allTargets.map((u) => u.username))];
        if (uniqueUsernames.length === 0) return;
        const message = `${employeeUsername} has withdrawn their resignation`;
        await getNotificationQueue().add("resignationWithdrawn", {
          tenantId,
          title: "Resignation",
          message,
          recipients: uniqueIds,
          pushTargets: uniqueUsernames,
          eventType: "resignation_notification",
          priority: "medium",
        });

        const tenantName = tenant?.name ?? "your organisation";
        const from = tenantFrom(tenantName);
        const replyTo = tenantReplyTo(tenant?.helpEmail);
        const uniqueEmails = [
          ...new Set(
            allTargets.map((u) => u.email).filter((e): e is string => !!e),
          ),
        ];
        await Promise.all(
          uniqueEmails.map((to) =>
            getEmailQueue()
              .add("resignationWithdrawn", {
                to,
                subject: `Resignation withdrawn by ${employeeUsername}`,
                html: renderEmailHtml({
                  title: "Resignation Withdrawn",
                  tenantName,
                  bodyHtml: `<h2>Hello,</h2><p>${message}</p>`,
                }),
                from,
                replyTo,
              })
              .catch((e: unknown) =>
                logger.warn("[withdrawResignation] email enqueue failed", {
                  e,
                }),
              ),
          ),
        );
      })
      .catch((err) =>
        logger.warn("[withdrawResignation] Notification enqueue failed:", {
          err,
        }),
      );

    // WithdrawResignation's proto response is BasicResponse (message+status
    // only, no `data` field) — a `data` value here would just be silently
    // dropped by the encoder, so don't bother constructing one.
    return callback(null, {
      message: MESSAGES.RESIGNATION_WITHDRAWN,
      status: status.OK,
    });
  } catch (err) {
    logger.error("WithdrawResignation error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
