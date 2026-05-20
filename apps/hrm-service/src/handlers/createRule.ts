import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const createRule = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      name,
      category,
      conditions,
      actions,
      ruleStatus,
      createdBy,
      description,
      priority,
      tags,
    } = call.request;

    if (!name || !category) {
      return callback(null, {
        message: MESSAGES.NAME_CATEGORY_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const rule = await prisma.rule.create({
      data: {
        tenantId: getTenantId()!,
        name,
        category,
        description: description || null,
        conditions: conditions || {},
        actions: actions || {},
        status: ruleStatus || "draft",
        createdBy: createdBy || null,
        priority: priority ? parseInt(String(priority)) : 0,
        tags: tags || [],
      },
    });

    return callback(null, {
      message: MESSAGES.RULE_CREATED,
      status: status.OK,
      data: rule,
    });
  } catch (err) {
    logger.error("CreateRule error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
