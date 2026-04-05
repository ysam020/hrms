import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const listRules = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { category, ruleStatus, page = 1, limit = 10 } = call.request;

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 10;
    const skip = (pageNum - 1) * limitNum;

    const where: Record<string, any> = {};
    if (category) where.category = category;
    if (ruleStatus) where.status = ruleStatus;

    const [rules, total] = await Promise.all([
      prisma.rule.findMany({ where, skip, take: limitNum }),
      prisma.rule.count({ where }),
    ]);

    return callback(null, {
      message: MESSAGES.RULES_LISTED,
      status: status.OK,
      data: rules,
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    logger.error("ListRules error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
