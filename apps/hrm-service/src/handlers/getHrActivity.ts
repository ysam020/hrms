import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const getHrActivity = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.ACTIVITY_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const activity = await prisma.hrActivity.findUnique({ where: { id } });

    if (!activity) {
      return callback(null, {
        message: MESSAGES.HR_ACTIVITY_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    if (activity.status === "deleted") {
      return callback(null, {
        message: MESSAGES.HR_ACTIVITY_DELETED,
        status: status.NOT_FOUND,
      });
    }

    return callback(null, {
      message: MESSAGES.HR_ACTIVITY_FETCHED,
      status: status.OK,
      data: activity,
    });
  } catch (err) {
    logger.error("GetHrActivity error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
