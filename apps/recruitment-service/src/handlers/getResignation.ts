import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toResignationProto } from "./resignationSerializer";

export const getResignation = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    // findFirst (not findUnique) so tenantId is enforced in the query itself —
    // tenants without a dedicated DB share the master DB, where `id` alone
    // isn't enough to prevent reading another tenant's resignation.
    const resignation = await prisma.resignation.findFirst({
      where: { id, tenantId: getTenantId() },
    });

    if (!resignation) {
      return callback(null, {
        message: MESSAGES.RESIGNATION_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    return callback(null, {
      message: MESSAGES.RESIGNATIONS_FETCHED,
      status: status.OK,
      data: toResignationProto(resignation),
    });
  } catch (err) {
    logger.error("GetResignation error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
