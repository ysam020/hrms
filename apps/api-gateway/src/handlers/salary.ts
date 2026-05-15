import { Request, Response } from "express";
import { salaryClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { jsPDF } from "jspdf";

async function isSuperUser(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isSuperUser: true },
  });
  return user?.isSuperUser === true;
}

export async function updateSalary(req: Request, res: Response) {
  try {
    const { userId, year, month, salaryStructure } = req.body;
    const { basicPay, hra, conveyance, incentive, pf, esi, pt, deductions } =
      salaryStructure;
    const yearInt = parseInt(year);
    const monthInt = parseInt(month);
    const flatFields = {
      basicPay,
      hra,
      conveyance,
      incentive,
      pf,
      esi,
      pt,
      deductions,
    };

    // Check if a record exists for this period
    const existing: any = await grpcCall(salaryClient, "getSalaryStructure", {
      userId,
      year: yearInt,
      month: monthInt,
    });

    if (existing?.data?.id) {
      await grpcCall(salaryClient, "updateSalaryStructure", {
        id: existing.data.id,
        ...flatFields,
      });
    } else {
      await grpcCall(salaryClient, "createSalaryStructure", {
        userId,
        ...flatFields,
        month: monthInt,
        year: yearInt,
      });
    }

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, {
      message: "Salary updated successfully",
    });
  } catch (error: unknown) {
    logger.error("updateSalary error:", { error });
    return handleError(res, error);
  }
}

export async function getUserSalary(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const requestedUserId = req.params.userId as string;
    const superUser = await isSuperUser(user!.userId);

    if (!superUser && requestedUserId !== user!.userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const year = parseInt(String(req.params.year));
    const month = parseInt(String(req.params.month));

    const response: any = await grpcCall(salaryClient, "getSalaryStructure", {
      userId: requestedUserId,
      year,
      month,
    });

    return apiResponse(res, RESPONSE_STATUS.SUCCESS, response);
  } catch (error: unknown) {
    logger.error("getUserSalary error:", { error });
    return handleError(res, error);
  }
}

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

export async function generateSalarySlip(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const requestedUserId = req.params.userId as string;
    const superUser = await isSuperUser(user!.userId);

    if (!superUser && requestedUserId !== user!.userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const year = parseInt(String(req.params.year));
    const month = parseInt(String(req.params.month));

    const response: any = await grpcCall(salaryClient, "getPayslip", {
      userId: requestedUserId,
      year,
      month,
    });

    if (!response?.data?.salaryStructure) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "No salary data found for the selected period",
      });
    }

    const { employee, salaryStructure, attendanceSummary } = response.data;
    const employeeName =
      [employee?.first_name, employee?.last_name].filter(Boolean).join(" ") ||
      employee?.username ||
      "Employee";
    const monthLabel = `${MONTH_NAMES[(month - 1) % 12]} ${year}`;

    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const pageW = doc.internal.pageSize.getWidth();
    const marginX = 15;
    const contentW = pageW - marginX * 2;

    const navy: [number, number, number] = [15, 45, 96];
    const blue: [number, number, number] = [41, 105, 176];
    const lightGray: [number, number, number] = [240, 243, 248];
    const textDark: [number, number, number] = [25, 30, 50];
    const textMid: [number, number, number] = [80, 90, 110];
    const green: [number, number, number] = [34, 139, 34];

    // Header bar
    doc.setFillColor(...navy);
    doc.rect(0, 0, pageW, 28, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("SALARY SLIP", marginX, 13);
    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(monthLabel, marginX, 21);
    doc.text("Praesto HRMS", pageW - marginX, 13, { align: "right" });

    // Employee info box
    doc.setFillColor(...lightGray);
    doc.rect(marginX, 33, contentW, 28, "F");
    doc.setTextColor(...textMid);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    const infoY = 40;
    doc.text("EMPLOYEE NAME", marginX + 4, infoY);
    doc.text("DEPARTMENT", marginX + contentW / 2, infoY);
    doc.setTextColor(...textDark);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(employeeName, marginX + 4, infoY + 7);
    doc.text(employee?.department || "-", marginX + contentW / 2, infoY + 7);
    doc.setTextColor(...textMid);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("DESIGNATION", marginX + 4, infoY + 15);
    doc.text("USERNAME", marginX + contentW / 2, infoY + 15);
    doc.setTextColor(...textDark);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(employee?.designation || "-", marginX + 4, infoY + 22);
    doc.text(employee?.username || "-", marginX + contentW / 2, infoY + 22);

    // Salary components table
    let y = 70;
    const col1 = marginX;
    const col2 = marginX + contentW * 0.55;
    const col3 = pageW - marginX;

    // Table header
    doc.setFillColor(...navy);
    doc.rect(col1, y, contentW, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("COMPONENT", col1 + 3, y + 5.5);
    doc.text("TYPE", col2, y + 5.5);
    doc.text("AMOUNT (₹)", col3, y + 5.5, { align: "right" });
    y += 10;

    const rows: Array<{ label: string; type: string; value: number }> = [
      {
        label: "Basic Pay",
        type: "Earning",
        value: salaryStructure.basicPay ?? 0,
      },
      { label: "HRA", type: "Earning", value: salaryStructure.hra ?? 0 },
      {
        label: "Conveyance",
        type: "Earning",
        value: salaryStructure.conveyance ?? 0,
      },
      {
        label: "Incentive",
        type: "Earning",
        value: salaryStructure.incentive ?? 0,
      },
      { label: "PF", type: "Deduction", value: salaryStructure.pf ?? 0 },
      { label: "ESI", type: "Deduction", value: salaryStructure.esi ?? 0 },
      { label: "PT", type: "Deduction", value: salaryStructure.pt ?? 0 },
      {
        label: "Other Deductions",
        type: "Deduction",
        value: salaryStructure.deductions ?? 0,
      },
    ];

    rows.forEach((row, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(...lightGray);
        doc.rect(col1, y - 3, contentW, 9, "F");
      }
      doc.setTextColor(...textDark);
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.text(row.label, col1 + 3, y + 3);
      const isEarning = row.type === "Earning";
      doc.setTextColor(
        isEarning ? blue[0] : 180,
        isEarning ? blue[1] : 50,
        isEarning ? blue[2] : 50,
      );
      doc.text(row.type, col2, y + 3);
      doc.setTextColor(...textDark);
      doc.text(row.value.toFixed(2), col3, y + 3, { align: "right" });
      y += 9;
    });

    // Summary
    y += 5;
    doc.setDrawColor(...navy);
    doc.setLineWidth(0.5);
    doc.line(col1, y, col3, y);
    y += 7;

    const totalDeductions =
      (salaryStructure.pf ?? 0) +
      (salaryStructure.esi ?? 0) +
      (salaryStructure.pt ?? 0) +
      (salaryStructure.deductions ?? 0);

    const summaryRows: Array<{
      label: string;
      value: number;
      bold?: boolean;
      color?: [number, number, number];
    }> = [
      { label: "Gross Earnings", value: salaryStructure.grossEarnings ?? 0 },
      { label: "Total Deductions", value: totalDeductions },
      {
        label: "Net Payable",
        value: salaryStructure.netPayable ?? 0,
        bold: true,
        color: green,
      },
    ];

    summaryRows.forEach((row) => {
      doc.setFont("helvetica", row.bold ? "bold" : "normal");
      doc.setFontSize(row.bold ? 11 : 9);
      doc.setTextColor(...(row.color ?? textDark));
      doc.text(row.label, col1, y);
      doc.text(`₹ ${row.value.toFixed(2)}`, col3, y, { align: "right" });
      y += 9;
    });

    if (attendanceSummary) {
      y += 4;
      doc.setFillColor(...lightGray);
      doc.rect(col1, y, contentW, 18, "F");
      doc.setTextColor(...textMid);
      doc.setFontSize(8);
      doc.setFont("helvetica", "normal");
      doc.text("ATTENDANCE SUMMARY", col1 + 3, y + 5);
      doc.setTextColor(...textDark);
      doc.setFontSize(9);
      doc.text(
        `Present: ${attendanceSummary.presentDays ?? 0} days   Absent: ${attendanceSummary.absentDays ?? 0} days`,
        col1 + 3,
        y + 13,
      );
    }

    // Footer
    const pageH = doc.internal.pageSize.getHeight();
    doc.setFillColor(...lightGray);
    doc.rect(0, pageH - 15, pageW, 15, "F");
    doc.setTextColor(...textMid);
    doc.setFontSize(8);
    doc.setFont("helvetica", "italic");
    doc.text(
      "This is a system-generated salary slip and does not require a signature.",
      pageW / 2,
      pageH - 7,
      { align: "center" },
    );

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="salary_slip_${employee?.username ?? requestedUserId}_${year}_${String(month).padStart(2, "0")}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error: unknown) {
    logger.error("generateSalarySlip error:", { error });
    return handleError(res, error);
  }
}
