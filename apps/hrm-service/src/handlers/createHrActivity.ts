import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";

export const createHrActivity = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      title,
      description,
      date,
      time,
      activityType,
      location,
      createdBy,
    } = call.request;

    if (!title || !date) {
      return callback(null, {
        message: MESSAGES.TITLE_DATE_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const activity = await prisma.hrActivity.create({
      data: {
        title,
        description: description || "",
        date,
        time: time || "",
        status: activityType || "active",
        createdBy: createdBy || "",
        createdOn: new Date(),
      },
    });

    await cacheManager.invalidatePattern("hrActivities:*");

    // Notify all employees (fire-and-forget)
    prisma.user
      .findMany({ select: { id: true, username: true } })
      .then((users) => {
        if (users.length === 0) return;
        return getNotificationQueue().add("hrActivityCreated", {
          title: "HR Activity",
          message: `There is an activity- ${activity.title} on ${activity.date} at ${activity.time}`,
          recipients: users.map((u) => u.id),
          pushTargets: users.map((u) => u.username),
          eventType: "hr_activity_notification",
          priority: "medium",
        });
      })
      .catch((err) =>
        logger.warn("[createHrActivity] Notification enqueue failed:", { err }),
      );

    return callback(null, {
      message: MESSAGES.HR_ACTIVITY_CREATED,
      status: status.OK,
      data: {
        id: activity.id,
        title: activity.title,
        description: activity.description || "",
        date: activity.date || "",
        time: activity.time || "",
        status: activity.status || "",
        createdBy: activity.createdBy || "",
        createdOn: activity.createdOn ? activity.createdOn.toISOString() : "",
      },
    });
  } catch (err) {
    logger.error("CreateHrActivity error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
