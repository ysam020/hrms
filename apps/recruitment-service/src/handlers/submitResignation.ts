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
      username,
      resignationDate,
      lastDate,
      reason,
      overallJobSatisfaction,
      suggestions,
    } = call.request;

    if (!username || !resignationDate) {
      return callback(null, {
        message: MESSAGES.USERNAME_RESIGNATION_DATE_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existing = await prisma.resignation.findFirst({
      where: { username, status: { in: ["Submitted", "Approved"] } },
    });
    if (existing) {
      return callback(null, {
        message: MESSAGES.ACTIVE_RESIGNATION_EXISTS,
        status: status.ALREADY_EXISTS,
      });
    }

    const resignation = await prisma.resignation.create({
      data: {
        username,
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
      prisma.user.findMany({
        where: { department: "HUMAN RESOURCES" },
        select: { id: true, username: true },
      }),
      prisma.team.findMany({
        where: {
          OR: [{ members: { has: username } }, { teamLeader: username }],
        },
        select: { teamLeader: true },
      }),
    ])
      .then(async ([hrUsers, teams]) => {
        const teamLeaderUsernames = [
          ...new Set(
            teams.map((t) => t.teamLeader).filter((tl) => tl !== username),
          ),
        ];
        const teamLeaderUsers =
          teamLeaderUsernames.length > 0
            ? await prisma.user.findMany({
                where: { username: { in: teamLeaderUsernames } },
                select: { id: true, username: true },
              })
            : [];
        const allTargets = [...hrUsers, ...teamLeaderUsers];
        const uniqueIds = [...new Set(allTargets.map((u) => u.id))];
        const uniqueUsernames = [...new Set(allTargets.map((u) => u.username))];
        if (uniqueUsernames.length === 0) return;
        await getNotificationQueue().add("resignationSubmitted", {
          title: "Resignation",
          message: `${username} has submitted resignation form`,
          recipients: uniqueIds,
          pushTargets: uniqueUsernames,
          eventType: "resignation_notification",
          priority: "medium",
        });
      })
      .catch((err) =>
        logger.warn("[submitResignation] Notification enqueue failed:", {
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
