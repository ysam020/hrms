import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";

export const submitResignation = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      userId,
      resignationDate,
      lastDate,
      reason,
      overallJobSatisfaction,
      suggestions,
    } = call.request;

    if (!userId || !resignationDate) {
      return callback(null, {
        message: MESSAGES.USERNAME_RESIGNATION_DATE_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existing = await prisma.resignation.findFirst({
      where: { userId, status: { in: ["Submitted", "Approved"] } },
    });
    if (existing) {
      return callback(null, {
        message: MESSAGES.ACTIVE_RESIGNATION_EXISTS,
        status: status.ALREADY_EXISTS,
      });
    }

    const resignation = await prisma.resignation.create({
      data: {
        userId,
        resignationDate,
        lastDate: lastDate || null,
        reason: reason || null,
        overallJobSatisfaction: overallJobSatisfaction
          ? parseFloat(String(overallJobSatisfaction))
          : 0,
        suggestions: suggestions || null,
        status: "Submitted",
        submittedOn: new Date(),
      },
    });

    await cacheManager.invalidatePattern("resignations:*");

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
        await getNotificationQueue().add("resignationSubmitted", {
          title: "Resignation",
          message: `${applicantUsername} has submitted resignation form`,
          recipients: uniqueIds,
          pushTargets: uniqueUsernames,
          eventType: "resignation_notification",
          priority: "medium",
        });
      })
      .catch((err) =>
        logger.error("[submitResignation] Notification enqueue failed:", {
          err,
        }),
      );

    return callback(null, {
      message: MESSAGES.RESIGNATION_SUBMITTED,
      status: status.OK,
      data: resignation,
    });
  } catch (err) {
    logger.error("SubmitResignation error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
