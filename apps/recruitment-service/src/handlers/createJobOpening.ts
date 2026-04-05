import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";

export const createJobOpening = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      jobTitle,
      jobDescription,
      requiredSkills,
      experience,
      hiringManager,
      applicationDeadline,
      budget,
      numberOfVacancies,
      jobStatus,
      createdBy,
    } = call.request;

    if (!jobTitle || !applicationDeadline) {
      return callback(null, {
        message: MESSAGES.JOB_TITLE_DEADLINE_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const jobOpening = await prisma.jobOpening.create({
      data: {
        jobTitle,
        jobDescription: jobDescription || "",
        requiredSkills: requiredSkills || "",
        experience: experience ? parseFloat(experience) : 0,
        hiringManager: hiringManager || "",
        applicationDeadline: new Date(applicationDeadline),
        budget: budget || [],
        numberOfVacancies: numberOfVacancies
          ? parseInt(String(numberOfVacancies))
          : null,
        status: jobStatus || "Open",
        createdBy: createdBy || "",
      },
    });

    await cacheManager.invalidatePattern("jobOpenings:*");
    return callback(null, {
      message: MESSAGES.JOB_OPENING_CREATED,
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
    logger.error("CreateJobOpening error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
