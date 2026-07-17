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
    const {
      page = 1,
      limit = 10,
      userId,
      status: filterStatus,
      username,
    } = call.request;

    const pageNum = parseInt(String(page)) || 1;
    const limitNum = parseInt(String(limit)) || 10;
    const skip = (pageNum - 1) * limitNum;

    const tenantId = getTenantId();
    const cacheKey = `t:${tenantId ?? "global"}:resignations:${userId || ""}:${filterStatus || "all"}:${username || ""}:p${pageNum}:l${limitNum}`;
    const cached = await cacheManager.get(cacheKey);
    if (cached) return callback(null, cached);

    // tenantId always applied — without it, tenants sharing the fallback
    // master DB (no dedicated Tenant.dbName) would see every other tenant's
    // resignations mixed into this list. (tenantId is a nullable ObjectId
    // column — never pass the "global" cache-key placeholder here.)
    const where: any = { tenantId };
    if (userId) where.userId = userId;
    if (filterStatus) where.status = filterStatus;

    if (username) {
      // Resignations only store a bare userId — resolve the search term
      // against the shared User table (same DB/Prisma client) instead of
      // requiring a cross-service call.
      const matchingUsers = await prisma.user.findMany({
        where: {
          tenantId,
          OR: [
            { first_name: { contains: username, mode: "insensitive" } },
            { last_name: { contains: username, mode: "insensitive" } },
            { username: { contains: username, mode: "insensitive" } },
          ],
        },
        select: { id: true },
      });
      const matchingIds = matchingUsers.map((u) => u.id);
      if (where.userId) {
        // Already scoped to one specific user (privileged pick, or the
        // caller's own id) — keep that scoping only if it also matches the
        // search, otherwise there's nothing to return.
        if (!matchingIds.includes(where.userId)) {
          where.userId = "__no_match__";
        }
      } else {
        where.userId = { in: matchingIds };
      }
    }

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
