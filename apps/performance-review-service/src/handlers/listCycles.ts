import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toPerformanceReviewCycleProto } from "./serializers";

export const listCycles = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    // Set by the gateway only for non-privileged callers — restricts the
    // list to cycles they're actually enrolled in (as reviewee or
    // reviewer), instead of every cycle the tenant has ever run.
    const requesterId: string | undefined =
      call.request?.requesterId || undefined;
    const { search, status: statusFilter } = call.request as {
      search?: string;
      status?: string;
    };
    const page = parseInt(String(call.request?.page)) || 1;
    const limit = parseInt(String(call.request?.limit)) || 10;
    const skip = (page - 1) * limit;

    const normalizedStatus = (statusFilter || "").toLowerCase();

    const where: any = {
      tenantId: getTenantId()!,
      ...(!normalizedStatus || normalizedStatus === "all"
        ? { status: { not: "deleted" } }
        : { status: normalizedStatus }),
      ...(requesterId && {
        reviews: {
          some: {
            OR: [{ userId: requesterId }, { reviewerId: requesterId }],
          },
        },
      }),
      ...(search && {
        name: { contains: search, mode: "insensitive" },
      }),
    };

    const [cycles, total] = await Promise.all([
      prisma.performanceReviewCycle.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
      }),
      prisma.performanceReviewCycle.count({ where }),
    ]);

    return callback(null, {
      message: MESSAGES.CYCLES_FETCHED,
      status: status.OK,
      data: cycles.map(toPerformanceReviewCycleProto),
      total,
    });
  } catch (err) {
    logger.error("ListCycles error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
      data: [],
      total: 0,
    });
  }
};
