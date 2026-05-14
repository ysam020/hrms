import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";
import utc from "dayjs/plugin/utc";

dayjs.extend(utc);

function isWeekend(d: dayjs.Dayjs): boolean {
  const dow = d.day();
  return dow === 0 || dow === 6;
}

function calculateWorkingDays(from: dayjs.Dayjs, to: dayjs.Dayjs): number {
  let count = 0;
  let cur = from.startOf("day");
  const end = to.startOf("day");
  while (!cur.isAfter(end)) {
    if (!isWeekend(cur)) count++;
    cur = cur.add(1, "day");
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

    const startDay = dayjs.utc(from).startOf("day");
    const endDay = dayjs.utc(to).startOf("day");

    if (!startDay.isValid() || !endDay.isValid()) {
      return callback(null, {
        message: MESSAGES.INVALID_DATE_FORMAT,
        status: status.INVALID_ARGUMENT,
      });
    }

    if (endDay.isBefore(startDay)) {
      return callback(null, {
        message: MESSAGES.END_DATE_BEFORE_START,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existing = await prisma.leaveApplication.findMany({
      where: { userId, status: { in: ["Pending", "Approved"] } },
    });

    const overlap = existing.some((l) => {
      const lStart = dayjs.utc(l.from);
      const lEnd = dayjs.utc(l.to);
      return !startDay.isAfter(lEnd) && !endDay.isBefore(lStart);
    });

    if (overlap) {
      return callback(null, {
        message: MESSAGES.LEAVE_ALREADY_APPLIED,
        status: status.ALREADY_EXISTS,
      });
    }

    const days = calculateWorkingDays(startDay, endDay);
    const fromDate = startDay.toDate();
    const toDate = endDay.toDate();

    const leaveApplication = await prisma.leaveApplication.create({
      data: {
        userId,
        leaveType,
        from: fromDate,
        to: toDate,
        days,
        reason: reason || "",
        sickLeave: sickLeave || false,
        status: "Pending",
        appliedOn: new Date(),
      },
    });

    await cacheManager.invalidatePattern("leaves:*");

    const fromStr = startDay.format("YYYY-MM-DD");
    const toStr = endDay.format("YYYY-MM-DD");

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
          message: `${applicantUsername} has applied for leave from ${fromStr} to ${toStr}`,
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
