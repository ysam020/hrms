import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import {
  prismaWithTenant as prisma,
  prisma as masterPrisma,
  getTenantId,
} from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { notify } from "@hrms/notifications";
import {
  tenantFrom,
  tenantReplyTo,
  renderEmailHtml,
  formatDateOrRange,
} from "@hrms/common";
import { MESSAGES } from "../constants/messages";
import { toLeaveApplicationProto } from "./leaveApplicationSerializer";

export const rejectLeave = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.LEAVE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const leave = await prisma.leaveApplication.findUnique({ where: { id } });

    if (!leave) {
      return callback(null, {
        message: MESSAGES.LEAVE_APPLICATION_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    if (leave.status !== "Pending") {
      return callback(null, {
        message: MESSAGES.ONLY_PENDING_CAN_BE_REJECTED,
        status: status.FAILED_PRECONDITION,
      });
    }

    const updatedLeave = await prisma.leaveApplication.update({
      where: { id },
      data: { status: "Rejected" },
    });

    await cacheManager.invalidatePattern(
      `t:${getTenantId() ?? "global"}:leaves:*`,
    );

    Promise.all([
      prisma.user.findUnique({
        where: { id: updatedLeave.userId },
        select: { email: true },
      }),
      masterPrisma.tenant.findUnique({
        where: { id: getTenantId()! },
        select: { name: true, helpEmail: true },
      }),
    ])
      .then(([employee, tenant]) => {
        const tenantName = tenant?.name ?? "your organisation";
        const dateRange = formatDateOrRange(updatedLeave.from, updatedLeave.to);
        return notify({
          tenantId: getTenantId()!,
          event: "leaveRejected",
          targetUser: updatedLeave.userId,
          inApp: {
            title: "Leave",
            message: MESSAGES.LEAVE_REJECTED,
            eventType: "leave_notification",
            priority: "medium",
          },
          email: employee?.email
            ? {
                to: employee.email,
                subject: "Your leave request was rejected",
                html: renderEmailHtml({
                  title: "Leave Rejected",
                  tenantName,
                  bodyHtml: `<h2>Hello,</h2><p>Your <strong>${updatedLeave.leaveType}</strong> leave request has been rejected.</p><p><strong>Dates:</strong> ${dateRange}</p>`,
                }),
                from: tenantFrom(tenantName),
                replyTo: tenantReplyTo(tenant?.helpEmail),
              }
            : undefined,
        });
      })
      .catch((err) => logger.warn("[rejectLeave] notify failed:", { err }));

    return callback(null, {
      message: MESSAGES.LEAVE_REJECTED,
      status: status.OK,
      data: toLeaveApplicationProto(updatedLeave),
    });
  } catch (err) {
    logger.error("RejectLeave error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
