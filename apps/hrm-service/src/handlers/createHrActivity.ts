import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";

export const createHrActivity = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { title, description, date, time, activityType, createdBy } =
      call.request;

    if (!title || !date) {
      return callback(null, {
        message: MESSAGES.TITLE_DATE_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const scheduledAt = time
      ? dayjs(`${date}T${time}`).toDate()
      : dayjs(date).startOf("day").toDate();

    const activity = await prisma.hrActivity.create({
      data: {
        tenantId: getTenantId()!,
        title,
        description: description || "",
        scheduledAt,
        status: activityType || "Active",
        createdBy: createdBy || "",
        createdOn: new Date(),
      },
    });

    await cacheManager.invalidatePattern(`t:${getTenantId()}:hrActivities:*`);

    const displayDate = dayjs(activity.scheduledAt).format("YYYY-MM-DD");
    const displayTime = dayjs(activity.scheduledAt).format("HH:mm");

    // Notify all employees (fire-and-forget)
    prisma.user
      .findMany({ select: { id: true, username: true } })
      .then((users) => {
        if (users.length === 0) return;
        return getNotificationQueue().add("hrActivityCreated", {
          tenantId: getTenantId()!,
          title: "HR Activity",
          message: `There is an activity- ${activity.title} on ${displayDate} at ${displayTime}`,
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
        scheduledAt: activity.scheduledAt.toISOString(),
        date: displayDate,
        time: displayTime,
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
