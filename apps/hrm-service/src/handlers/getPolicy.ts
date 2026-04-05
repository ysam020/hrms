import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const getPolicy = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.POLICY_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const policy = await prisma.policy.findUnique({ where: { id } });

    if (!policy) {
      return callback(null, {
        message: MESSAGES.POLICY_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    if (policy.status === "deleted") {
      return callback(null, {
        message: MESSAGES.POLICY_DELETED,
        status: status.NOT_FOUND,
      });
    }

    return callback(null, {
      message: MESSAGES.POLICY_FETCHED,
      status: status.OK,
      data: policy,
    });
  } catch (err) {
    logger.error("GetPolicy error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
