import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma } from "@hrms/db";
import { protectedNumber } from "@hrms/db/values";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { deriveFromComponents, toWireSalaryStructure } from "@hrms/common";

export const updateSalaryStructure = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      id,
      basicPay,
      hra,
      conveyance,
      incentive,
      pf,
      esi,
      pt,
      deductions,
      components,
    } = call.request;

    if (!id) {
      return callback(null, {
        message: MESSAGES.SALARY_STRUCTURE_ID_REQUIRED,
        status: status.INVALID_ARGUMENT,
      });
    }

    const existing = await prisma.salaryStructure.findUnique({ where: { id } });
    if (!existing) {
      return callback(null, {
        message: MESSAGES.SALARY_STRUCTURE_NOT_FOUND,
        status: status.NOT_FOUND,
      });
    }

    let salaryData: Record<string, unknown>;

    if (components?.length) {
      const { legacy, grossEarnings, totalDeductions } =
        deriveFromComponents(components);
      salaryData = {
        ...legacy,
        grossEarnings,
        grossSalary: grossEarnings,
        netPayable: grossEarnings - totalDeductions,
        componentBreakdown: components,
      };
    } else {
      const basic =
        basicPay !== undefined
          ? parseFloat(basicPay)
          : (protectedNumber(existing.basicPay) ?? 0);
      const hraAmt =
        hra !== undefined
          ? parseFloat(hra)
          : (protectedNumber(existing.hra) ?? 0);
      const conv =
        conveyance !== undefined
          ? parseFloat(conveyance)
          : (protectedNumber(existing.conveyance) ?? 0);
      const inc =
        incentive !== undefined
          ? parseFloat(incentive)
          : (protectedNumber(existing.incentive) ?? 0);
      const pfAmt =
        pf !== undefined ? parseFloat(pf) : (protectedNumber(existing.pf) ?? 0);
      const esiAmt =
        esi !== undefined
          ? parseFloat(esi)
          : (protectedNumber(existing.esi) ?? 0);
      const ptAmt =
        pt !== undefined ? parseFloat(pt) : (protectedNumber(existing.pt) ?? 0);

      const deductAmt =
        deductions !== undefined
          ? parseFloat(deductions)
          : (protectedNumber(existing.deductions) ?? 0);

      const grossEarnings = basic + hraAmt + conv + inc;
      const netPayable = grossEarnings - (pfAmt + esiAmt + ptAmt + deductAmt);

      salaryData = {
        basicPay: basic,
        hra: hraAmt,
        conveyance: conv,
        incentive: inc,
        pf: pfAmt,
        esi: esiAmt,
        pt: ptAmt,
        deductions: deductAmt,
        grossEarnings,
        grossSalary: grossEarnings,
        netPayable,
      };
    }

    const updated = await prisma.salaryStructure.update({
      where: { id },
      data: salaryData as any,
    });

    return callback(null, {
      message: MESSAGES.SALARY_STRUCTURE_UPDATED,
      status: status.OK,
      data: toWireSalaryStructure(updated),
    });
  } catch (err) {
    logger.error("UpdateSalaryStructure error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
