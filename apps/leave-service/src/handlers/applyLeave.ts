import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";

function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

function calculateWorkingDays(from: string, to: string): number {
  const start = new Date(from);
  const end = new Date(to);
  let count = 0;
  const current = new Date(start);
  while (current <= end) {
    if (!isWeekend(current)) count++;
    current.setDate(current.getDate() + 1);
  }
  return count;
}

export const applyLeave = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, leaveType, from, to, reason, sickLeave } = call.request;

    if (!userId || !leaveType || !from || !to) {
      return callback(null, {
        message: MESSAGES.USERNAME_LEAVE_TYPE_FROM_TO_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const start = new Date(from);
    const end = new Date(to);

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return callback(null, {
        message: MESSAGES.INVALID_DATE_FORMAT,
        status: status.INVALID_ARGUMENT,
      });
    }

    if (end < start) {
      return callback(null, {
        message: MESSAGES.END_DATE_BEFORE_START,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existing = await prisma.leaveApplication.findMany({
      where: { userId, status: { in: ["Pending", "Approved"] } },
    });

    const overlap = existing.some((l) => {
      const lStart = new Date(l.from);
      const lEnd = new Date(l.to);
      return start <= lEnd && end >= lStart;
    });

    if (overlap) {
      return callback(null, {
        message: MESSAGES.LEAVE_ALREADY_APPLIED,
        status: status.ALREADY_EXISTS,
      });
    }

    const days = calculateWorkingDays(from, to);

    const leaveApplication = await prisma.leaveApplication.create({
      data: {
        userId,
        leaveType,
        from,
        to,
        days,
        reason: reason || "",
        sickLeave: sickLeave || false,
        status: "Pending",
        appliedOn: new Date().toISOString(),
      },
    });

    await cacheManager.invalidatePattern("leaves:*");

    // Notify HR + team leaders (fire-and-forget)
    Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { username: true },
      }),
      prisma.user.findMany({
        where: { department: "HUMAN RESOURCES" },
        select: { id: true, username: true },
      }),
      prisma.team.findMany({
        where: {
          OR: [{ members: { has: userId } }, { teamLeaderId: userId }],
        },
        select: { teamLeaderId: true },
      }),
    ])
      .then(async ([applicant, hrUsers, teams]) => {
        const applicantUsername = applicant?.username || userId;
        const teamLeaderIds = [
          ...new Set(
            teams.map((t) => t.teamLeaderId).filter((id) => id !== userId),
          ),
        ];
        const teamLeaderUsers =
          teamLeaderIds.length > 0
            ? await prisma.user.findMany({
                where: { id: { in: teamLeaderIds } },
                select: { id: true, username: true },
              })
            : [];
        const allTargets = [...hrUsers, ...teamLeaderUsers];
        const uniqueIds = [...new Set(allTargets.map((u) => u.id))];
        const uniqueUsernames = [...new Set(allTargets.map((u) => u.username))];
        if (uniqueUsernames.length === 0) return;
        await getNotificationQueue().add("leaveApplied", {
          title: "Leave",
          message: `${applicantUsername} has applied for leave from ${from} to ${to}`,
          recipients: uniqueIds,
          pushTargets: uniqueUsernames,
          eventType: "leave_notification",
          priority: "medium",
        });
      })
      .catch((err) =>
        logger.warn("[applyLeave] Notification enqueue failed:", { err }),
      );

    return callback(null, {
      message: MESSAGES.LEAVE_APPLIED,
      status: status.OK,
      data: leaveApplication,
    });
  } catch (err) {
    logger.error("ApplyLeave error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
