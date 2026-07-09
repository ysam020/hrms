import { sendUnaryData, ServerUnaryCall, status } from "@grpc/grpc-js";
import { prismaWithTenant as prisma, getTenantId } from "@hrms/db";
import { logger } from "@hrms/logger";
import { MESSAGES } from "../constants/messages";
import { deriveFromComponents, toWireSalaryStructure } from "@hrms/common";

export const createSalaryStructure = async (
  call: ServerUnaryCall<any, any>,
  callback: sendUnaryData<any>,
) => {
  try {
    const {
      userId,
      basicPay,
      hra,
      conveyance,
      incentive,
      pf,
      esi,
      pt,
      deductions,
      month,
      year,
      components,
    } = call.request;

    if (!userId || (!basicPay && !components?.length) || !month || !year) {
      return callback(null, {
        message: MESSAGES.USERNAME_BASIC_MONTH_YEAR_REQUIRED,
        status: status.INVALID_ARGUMENT,
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
      const basic = parseFloat(basicPay) || 0;
      const hraAmt = parseFloat(hra) || 0;
      const conv = parseFloat(conveyance) || 0;
      const inc = parseFloat(incentive) || 0;
      const pfAmt = parseFloat(pf) || 0;
      const esiAmt = parseFloat(esi) || 0;
      const ptAmt = parseFloat(pt) || 0;
      const deductAmt = parseFloat(deductions) || 0;

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

    const salaryStructure = await prisma.salaryStructure.create({
      data: {
        tenantId: getTenantId()!,
        userId,
        month: parseInt(String(month)),
        year: parseInt(String(year)),
        ...(salaryData as any),
      },
    });

    return callback(null, {
      message: MESSAGES.SALARY_STRUCTURE_CREATED,
      status: status.OK,
      data: toWireSalaryStructure(salaryStructure),
    });
  } catch (err) {
    logger.error("CreateSalaryStructure error:", { err });
    return callback(null, {
      message: MESSAGES.INTERNAL_SERVER_ERROR,
      status: status.INTERNAL,
    });
  }
};
