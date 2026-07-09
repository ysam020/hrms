import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { cacheManager } from "@hrms/cache";
import { MESSAGES } from "../constants/messages";
import { toJobOpeningProto } from "./jobOpeningSerializer";

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
      pipelineTemplateId,
      visibility,
      branchIds,
    } = call.request;

    if (!jobTitle || !applicationDeadline) {
      return callback(null, {
        message: MESSAGES.JOB_TITLE_DEADLINE_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const jobOpening = await prisma.jobOpening.create({
      data: {
        tenantId: getTenantId()!,
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
        status: jobStatus || "Active",
        createdBy: createdBy || "",
        pipelineTemplateId: pipelineTemplateId || null,
        visibility: visibility || "external",
        branchIds: Array.isArray(branchIds) ? branchIds : [],
      },
    });

    await cacheManager.invalidatePattern("jobOpenings:*");
    return callback(null, {
      message: MESSAGES.JOB_OPENING_CREATED,
      status: status.OK,
      data: toJobOpeningProto(jobOpening),
    });
  } catch (err) {
    logger.error("CreateJobOpening error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
