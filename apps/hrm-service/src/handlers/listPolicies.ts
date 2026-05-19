import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const listPolicies = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { page = 1, limit = 10 } = call.request;

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 10;
    const skip = (pageNum - 1) * limitNum;

    const where = { status: { not: "deleted" } };

    const [policies, total] = await Promise.all([
      prisma.policy.findMany({
        where,
        orderBy: { createdOn: "desc" },
        skip,
        take: limitNum,
      }),
      prisma.policy.count({ where }),
    ]);

    return callback(null, {
      message: MESSAGES.POLICIES_LISTED,
      status: status.OK,
      data: policies.map((p) => ({
        id: p.id,
        title: p.policyName || "",
        content: p.content || "",
        category: p.policyType || "",
        createdAt: p.createdOn ? p.createdOn.toISOString() : "",
        updatedAt: p.lastUpdatedOn ? p.lastUpdatedOn.toISOString() : "",
      })),
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (err) {
    logger.error("ListPolicies error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
