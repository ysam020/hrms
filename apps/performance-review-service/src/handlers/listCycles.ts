import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toPerformanceReviewCycleProto } from "./serializers";

export const listCycles = async (
  _call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const cycles = await prisma.performanceReviewCycle.findMany({
      where: { tenantId: getTenantId()!, status: { not: "deleted" } },
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
