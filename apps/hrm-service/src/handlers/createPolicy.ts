import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";

export const createPolicy = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { policyType, policyName, content, createdBy } = call.request;

    if (!policyType || !content) {
      return callback(null, {
        message: MESSAGES.POLICY_TYPE_CONTENT_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    // Check if a non-deleted policy of the same type already exists
    const matchQuery: Record<string, any> = {
      status: { not: "deleted" },
      policyType,
    };
    if (policyType === "Other" && policyName) {
      matchQuery.policyName = policyName;
    }

    const existing = await prisma.policy.findFirst({ where: matchQuery });

    if (existing) {
      // Upsert: update existing
      const updated = await prisma.policy.update({
        where: { id: existing.id },
        data: {
          content,
          policyName: policyName || existing.policyName,
          lastUpdatedOn: new Date(),
          lastUpdatedBy: createdBy || "",
        },
      });

      return callback(null, {
        message: MESSAGES.POLICY_UPDATED,
        status: status.OK,
        data: updated,
      });
    }

    const policy = await prisma.policy.create({
      data: {
        tenantId: getTenantId()!,
        policyType,
        policyName: policyName || policyType,
        content,
        status: "active",
        createdBy: createdBy || "",
        createdOn: new Date(),
      },
    });

    return callback(null, {
      message: MESSAGES.POLICY_CREATED,
      status: status.OK,
      data: policy,
    });
  } catch (err) {
    logger.error("CreatePolicy error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
