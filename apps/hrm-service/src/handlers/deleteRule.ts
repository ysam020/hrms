import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const deleteRule = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.RULE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existing = await prisma.rule.findUnique({ where: { id } });

    if (!existing) {
      return callback(null, {
        message: MESSAGES.BUSINESS_RULE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    await prisma.rule.delete({ where: { id } });

    return callback(null, {
      message: MESSAGES.BUSINESS_RULE_DELETED,
      status: status.OK,
    });
  } catch (err) {
    logger.error("DeleteRule error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
