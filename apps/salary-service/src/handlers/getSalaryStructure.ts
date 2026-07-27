import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { toWireSalaryStructure } from "@hrms/common";

export const getSalaryStructure = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const { userId, month, year } = call.request;

    if (!userId) {
      return callback(null, {
        message: MESSAGES.USERNAME_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const where: any = { userId };
    if (month) where.month = parseInt(String(month));
    if (year) where.year = parseInt(String(year));

    // "Latest" means latest *period* (highest year/month), not latest row
    // last written — createdAt ordering used to let a row touched out of
    // period order (e.g. by disbursement re-upserting an old month) shadow
    // the true current structure. When month/year are given, the (userId,
    // year, month) unique constraint means at most one row matches anyway,
    // so this ordering only matters for the no-month/year "latest" lookup.
    const salaryStructure = await prisma.salaryStructure.findFirst({
      where,
      orderBy: [{ year: "desc" }, { month: "desc" }],
    });

    if (!salaryStructure) {
      return callback(null, {
        message: MESSAGES.NO_SALARY_STRUCTURE_FOUND,
        status: status.NOT_FOUND,
      });
    }

    return callback(null, {
      message: MESSAGES.SALARY_STRUCTURE_FETCHED,
      status: status.OK,
      data: toWireSalaryStructure(salaryStructure),
    });
  } catch (err) {
    logger.error("GetSalaryStructure error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
