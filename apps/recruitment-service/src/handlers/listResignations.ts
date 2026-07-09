import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";
import { toResignationProto } from "./resignationSerializer";

export const listResignations = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { page = 1, limit = 10, userId, status: filterStatus } = call.request;

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 10;
    const skip = (pageNum - 1) * limitNum;

    const tenantId = getTenantId() ?? "global";
    const cacheKey = `t:${tenantId}:resignations:${userId || ""}:${filterStatus || "all"}:p${pageNum}:l${limitNum}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    const where: any = {};
    if (userId) where.userId = userId;
    if (filterStatus) where.status = filterStatus;

    const [resignations, totalCount] = await Promise.all([
      prisma.resignation.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { submittedOn: "desc" },
      }),
      prisma.resignation.count({ where }),
    ]);

    const totalPages = Math.ceil(totalCount / limitNum);

    const response = {
      message: MESSAGES.RESIGNATIONS_FETCHED,
      status: status.OK,
      data: resignations.map((r) => toResignationProto(r)),
      totalCount,
      page: pageNum,
      limit: limitNum,
      totalPages,
    };
    await cacheManager.set(cacheKey, response, "resignation");
    return callback(null, response);
  } catch (err) {
    logger.error("ListResignations error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
    });
  }
};
