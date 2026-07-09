import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toJobOpeningProto } from "./jobOpeningSerializer";

export const getJobOpening = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.JOB_OPENING_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const jobOpening = await prisma.jobOpening.findUnique({ where: { id } });

    if (!jobOpening) {
      return callback(null, {
        message: MESSAGES.JOB_OPENING_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    if (jobOpening.status === "deleted") {
      return callback(null, {
        message: MESSAGES.JOB_OPENING_DELETED,
        status: status.NOT_FOUND,
      });
    }

    return callback(null, {
      message: MESSAGES.JOB_OPENING_FETCHED,
      status: status.OK,
      data: toJobOpeningProto(jobOpening),
    });
  } catch (err) {
    logger.error("GetJobOpening error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
