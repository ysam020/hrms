import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const getMyResignation = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId } = call.request;

    if (!userId) {
      return callback(null, {
        message: MESSAGES.USERNAME_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const resignation = await prisma.resignation.findFirst({
      where: { userId },
      orderBy: { submittedOn: "desc" },
    });

    if (!resignation) {
      return callback(null, {
        message: MESSAGES.NO_RESIGNATION_FOUND,
        status: status.NOT_FOUND,
        data: null,
      });
    }

    return callback(null, {
      message: MESSAGES.RESIGNATION_FETCHED,
      status: status.OK,
      data: resignation,
    });
  } catch (err) {
    logger.error("GetMyResignation error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
