import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";
import { toLeaveApplicationProto } from "./leaveApplicationSerializer";

export const getLeaves = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, status: leaveStatus, page = 1, limit = 10 } = call.request;

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 10;
    const skip = (pageNum - 1) * limitNum;

    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:leaves:${userId || ""}:${leaveStatus || "all"}:p${pageNum}:l${limitNum}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: Record<string, any> = {};
    if (userId) where.userId = userId;
    if (leaveStatus && leaveStatus.toLowerCase() !== "all")
      where.status = leaveStatus;

    const [leaves, total] = await Promise.all([
      prisma.leaveApplication.findMany({ where, skip, take: limitNum }),
      prisma.leaveApplication.count({ where }),
    ]);

    const data = leaves.map((l) => toLeaveApplicationProto(l));

    const response = {
      message: MESSAGES.LEAVE_APPLICATIONS_FETCHED,
      status: status.OK,
      data,
      total,
    };
    await cacheManager.set(cacheKey, response, "leave");
    return callback(null, response);
  } catch (err) {
    logger.error("GetLeaves error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
    });
  }
};
