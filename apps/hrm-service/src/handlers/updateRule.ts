import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const updateRule = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, updatedBy, ...updateData } = call.request;

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

    const cleanedData: Record<string, any> = {
      lastUpdatedOn: new Date(),
      lastUpdatedBy: updatedBy || "",
    };

    const allowedFields = [
      "name",
      "category",
      "conditions",
      "actions",
      "isActive",
    ];
    for (const field of allowedFields) {
      if (updateData[field] !== undefined && updateData[field] !== null) {
        cleanedData[field] = updateData[field];
      }
    }

    const updated = await prisma.rule.update({
      where: { id },
      data: cleanedData,
    });

    return callback(null, {
      message: MESSAGES.BUSINESS_RULE_UPDATED,
      status: status.OK,
      data: updated,
    });
  } catch (err) {
    logger.error("UpdateRule error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
