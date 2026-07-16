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

    const cycles = await prisma.performanceReviewCycle.findMany({
      where: {
        tenantId: getTenantId()!,
        status: { not: "deleted" },
        ...(requesterId && {
          reviews: {
            some: {
              OR: [{ userId: requesterId }, { reviewerId: requesterId }],
            },
          },
        }),
      },
      orderBy: { createdAt: "desc" },
    });

    return callback(null, {
      message: MESSAGES.CYCLES_FETCHED,
      status: status.OK,
      data: cycles.map(toPerformanceReviewCycleProto),
    });
  } catch (err) {
    logger.error("ListCycles error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
