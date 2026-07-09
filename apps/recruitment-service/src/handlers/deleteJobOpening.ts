import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";
import { toJobOpeningProto } from "./jobOpeningSerializer";

export const deleteJobOpening = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, deletedBy } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.JOB_OPENING_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existing = await prisma.jobOpening.findUnique({ where: { id } });

    if (!existing) {
      return callback(null, {
        message: MESSAGES.JOB_OPENING_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    if (existing.status === "Deleted" || existing.status === "deleted") {
      return callback(null, {
        message: MESSAGES.JOB_OPENING_ALREADY_DELETED,
        status: status.ALREADY_EXISTS,
      });
    }

    const deleted = await prisma.jobOpening.update({
      where: { id },
      data: {
        status: "Deleted",
        deletedBy: deletedBy || "",
        deletedOn: new Date(),
        lastUpdatedOn: new Date(),
      },
    });

    await cacheManager.invalidatePattern(`t:${getTenantId()}:jobOpenings:*`);
    return callback(null, {
      message: MESSAGES.JOB_OPENING_DELETED,
      status: status.OK,
      data: toJobOpeningProto(deleted),
    });
  } catch (err) {
    logger.error("DeleteJobOpening error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
