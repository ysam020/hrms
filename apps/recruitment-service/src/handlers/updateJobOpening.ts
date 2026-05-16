import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const updateJobOpening = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { id, updatedBy, ...updateData } = call.request;

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

    if (existing.status === "deleted") {
      return callback(null, {
        message: MESSAGES.CANNOT_UPDATE_DELETED_JOB,
        status: status.FAILED_PRECONDITION,
      });
    }

    const cleanedData: Record<string, any> = {
      lastUpdatedOn: new Date(),
      lastUpdateBy: updatedBy || "",
    };
    const allowedFields = [
      "jobTitle",
      "department",
      "description",
      "requirements",
      "experience",
      "hiringManager",
      "applicationDeadline",
      "budget",
      "location",
      "jobType",
      "jobStatus",
    ];

    for (const field of allowedFields) {
      const val = updateData[field];
      if (val !== undefined && val !== null && val !== "") {
        if (field === "applicationDeadline") {
          cleanedData[field] = new Date(val);
        } else if (field === "jobStatus") {
          cleanedData["status"] = val;
        } else {
          cleanedData[field] = val;
        }
      }
    }

    const updatedJobOpening = await prisma.jobOpening.update({
      where: { id },
      data: cleanedData,
    });

    await cacheManager.invalidatePattern("jobOpenings:*");
    return callback(null, {
      message: MESSAGES.JOB_OPENING_UPDATED,
      status: status.OK,
      data: updatedJobOpening,
    });
  } catch (err) {
    logger.error("UpdateJobOpening error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
