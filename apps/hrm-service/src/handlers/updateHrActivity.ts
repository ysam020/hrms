import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { getNotificationQueue } from "@hrms/queue";
import { MESSAGES } from "../constants/messages";
import dayjs from "dayjs";

export const updateHrActivity = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, updatedBy, ...updateData } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.ACTIVITY_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existing = await prisma.hrActivity.findUnique({ where: { id } });

    if (!existing) {
      return callback(null, {
        message: MESSAGES.HR_ACTIVITY_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    if (existing.status === "deleted") {
      return callback(null, {
        message: MESSAGES.CANNOT_UPDATE_DELETED_ACTIVITY,
        status: status.FAILED_PRECONDITION,
      });
    }

    const cleanedData: Record<string, any> = {
      lastUpdatedOn: new Date(),
      lastUpdatedBy: updatedBy || "",
    };

    if (updateData.title !== undefined && updateData.title !== null)
      cleanedData.title = updateData.title;
    if (updateData.description !== undefined && updateData.description !== null)
      cleanedData.description = updateData.description;
    if (
      updateData.activityStatus !== undefined &&
      updateData.activityStatus !== null
    )
      cleanedData.status = updateData.activityStatus;

    if (updateData.date !== undefined || updateData.time !== undefined) {
      const baseDate =
        updateData.date || dayjs(existing.scheduledAt).format("YYYY-MM-DD");
      const baseTime =
        updateData.time || dayjs(existing.scheduledAt).format("HH:mm");
      cleanedData.scheduledAt = dayjs(`${baseDate}T${baseTime}`).toDate();
    }

    const updated = await prisma.hrActivity.update({
      where: { id },
      data: cleanedData,
    });

    await cacheManager.invalidatePattern("hrActivities:*");

    const displayDate = dayjs(updated.scheduledAt).format("YYYY-MM-DD");
    const displayTime = dayjs(updated.scheduledAt).format("HH:mm");

    // Notify all employees (fire-and-forget, skip for deleted activities)
    if (updated.status !== "deleted") {
      prisma.user
        .findMany({ select: { id: true, username: true } })
        .then((users) => {
          if (users.length === 0) return;
          return getNotificationQueue().add("hrActivityUpdated", {
            title: "HR Activity",
            message: `There is an activity- ${updated.title} on ${displayDate} at ${displayTime}`,
            recipients: users.map((u) => u.id),
            pushTargets: users.map((u) => u.username),
            eventType: "hr_activity_notification",
            priority: "medium",
          });
        })
        .catch((err) =>
          logger.warn("[updateHrActivity] Notification enqueue failed:", {
            err,
          }),
        );
    }

    return callback(null, {
      message: MESSAGES.HR_ACTIVITY_UPDATED,
      status: status.OK,
      data: {
        id: updated.id,
        title: updated.title,
        description: updated.description || "",
        scheduledAt: updated.scheduledAt.toISOString(),
        date: displayDate,
        time: displayTime,
        status: updated.status || "",
        createdBy: updated.createdBy || "",
        createdOn: updated.createdOn ? updated.createdOn.toISOString() : "",
      },
    });
  } catch (err) {
    logger.error("UpdateHrActivity error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
