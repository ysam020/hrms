import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

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
      data: {
        id: jobOpening.id,
        jobTitle: jobOpening.jobTitle,
        numberOfVacancies: jobOpening.numberOfVacancies ?? 0,
        jobPostingDate: jobOpening.jobPostingDate
          ? jobOpening.jobPostingDate.toISOString()
          : "",
        applicationDeadline: jobOpening.applicationDeadline
          ? jobOpening.applicationDeadline.toISOString()
          : "",
        jobDescription: jobOpening.jobDescription || "",
        requiredSkills: jobOpening.requiredSkills || "",
        experience: jobOpening.experience ?? 0,
        budget: Array.isArray(jobOpening.budget) ? jobOpening.budget : [],
        department: jobOpening.department || "",
        hiringManager: jobOpening.hiringManager || "",
        candidatesHired: jobOpening.candidatesHired ?? 0,
        status: jobOpening.status || "",
        createdBy: jobOpening.createdBy || "",
        createdOn: jobOpening.createdOn
          ? jobOpening.createdOn.toISOString()
          : "",
      },
    });
  } catch (err) {
    logger.error("GetJobOpening error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
