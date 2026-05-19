import { Request, Response } from "express";
import { salaryClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma } from "@hrms/db";
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
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 15;
    const contentW = pageW - marginX * 2;

    const navyD: [number, number, number] = [15, 45, 96];
    const steel: [number, number, number] = [88, 148, 199];
    const powder: [number, number, number] = [176, 210, 235];
    const altRow: [number, number, number] = [240, 245, 252];
    const textDark: [number, number, number] = [25, 30, 50];
    const textMid: [number, number, number] = [80, 90, 110];
    const textLight: [number, number, number] = [150, 155, 170];

    const fillPoly = (pts: number[][], color: [number, number, number]) => {
      doc.setFillColor(...color);
      const [sx, sy] = pts[0];
      const moves: number[][] = [];
      for (let i = 1; i < pts.length; i++) {
        moves.push([pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]]);
      }
      doc.lines(moves, sx, sy, [1, 1], "F", true);
    };

    // ─── Header bar ────────────────────────────────────────────────────────────
    doc.setFillColor(...navyD);
    doc.rect(0, 0, pageW, 20, "F");
    doc.setFillColor(...steel);
    doc.rect(0, 18, pageW, 2, "F");

    // Top-right corner decoration (on top of header)
    fillPoly(
      [
        [pageW - 38, 0],
        [pageW, 0],
        [pageW, 38],
      ],
      steel,
    );
    fillPoly(
      [
        [pageW - 48, 0],
        [pageW - 38, 0],
        [pageW, 38],
        [pageW, 48],
      ],
      powder,
    );

    // Logo: white circle with "P"
    doc.setFillColor(255, 255, 255);
    doc.circle(marginX + 5, 10, 5, "F");
    doc.setTextColor(...navyD);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text("P", marginX + 5, 13, { align: "center" });

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text("Praesto", marginX + 12, 10.5);
    doc.setFontSize(7);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...powder);
    doc.text("HRMS", marginX + 12, 15.5);

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(13);
    doc.setFont("helvetica", "bold");
    doc.text("SALARY SLIP", pageW - marginX - 52, 10.5);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...powder);
    doc.text(monthLabel.toUpperCase(), pageW - marginX - 52, 16);

    // ─── Employee name strip ────────────────────────────────────────────────────
    let curY = 26;

    doc.setFillColor(...powder);
    doc.rect(marginX, curY, contentW, 18, "F");
    doc.setFillColor(...steel);
    doc.rect(marginX, curY, 4, 18, "F");

    doc.setTextColor(...navyD);
    doc.setFontSize(14);
    doc.setFont("helvetica", "bold");
    doc.text(employeeName, marginX + 8, curY + 8);

    const subLine = [employee?.designation, employee?.department]
      .filter(Boolean)
      .join(" • ");
    if (subLine) {
      doc.setTextColor(...textMid);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "normal");
      doc.text(subLine, marginX + 8, curY + 14.5);
    }

    curY += 22;

    // ─── Employee info grid (2 × 2) ─────────────────────────────────────────────
    const infoItems = [
      { label: "USERNAME", value: employee?.username || "-" },
      { label: "PAY PERIOD", value: monthLabel },
      { label: "DEPARTMENT", value: employee?.department || "-" },
      { label: "DESIGNATION", value: employee?.designation || "-" },
    ];
    const cellW = contentW / 2;
    const cellH = 15;

    doc.setDrawColor(...powder);
    doc.setLineWidth(0.4);
    doc.rect(marginX, curY, contentW, 2 * cellH);

    infoItems.forEach((item, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = marginX + col * cellW;
      const y = curY + row * cellH;

      if (row > 0 && col === 0) {
        doc.setDrawColor(...powder);
        doc.setLineWidth(0.3);
        doc.line(marginX, y, marginX + contentW, y);
      }

      doc.setTextColor(...textLight);
      doc.setFontSize(7);
      doc.setFont("helvetica", "normal");
      doc.text(item.label, x + 4, y + 5.5);

      doc.setTextColor(...textDark);
      doc.setFontSize(9.5);
      doc.setFont("helvetica", "bold");
      doc.text(item.value, x + 4, y + 12);
    });

    doc.setDrawColor(...powder);
    doc.setLineWidth(0.3);
    doc.line(marginX + cellW, curY, marginX + cellW, curY + 2 * cellH);

    curY += 2 * cellH + 10;

    // ─── Two-column salary table ─────────────────────────────────────────────────
    const colGap = 5;
    const halfW = (contentW - colGap) / 2;
    const leftX = marginX;
    const rightX = marginX + halfW + colGap;
    const rowH = 10;

    // Column headers
    doc.setFillColor(...steel);
    doc.rect(leftX, curY, halfW, 8, "F");
    doc.setFillColor(...navyD);
    doc.rect(rightX, curY, halfW, 8, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "bold");
    doc.text("EARNINGS", leftX + 4, curY + 5.5);
    doc.text("AMOUNT", leftX + halfW - 4, curY + 5.5, { align: "right" });
    doc.text("DEDUCTIONS", rightX + 4, curY + 5.5);
    doc.text("AMOUNT", rightX + halfW - 4, curY + 5.5, { align: "right" });

    curY += 8;

    const earningsRows = [
      { label: "Basic Pay", value: salaryStructure.basicPay ?? 0 },
      { label: "HRA", value: salaryStructure.hra ?? 0 },
      { label: "Conveyance Allowance", value: salaryStructure.conveyance ?? 0 },
      { label: "Incentive", value: salaryStructure.incentive ?? 0 },
    ];

    const deductionRows = [
      { label: "Provident Fund (PF)", value: salaryStructure.pf ?? 0 },
      { label: "ESI", value: salaryStructure.esi ?? 0 },
      { label: "Professional Tax (PT)", value: salaryStructure.pt ?? 0 },
      { label: "Other Deductions", value: salaryStructure.deductions ?? 0 },
    ];

    const maxRows = Math.max(earningsRows.length, deductionRows.length);

    for (let i = 0; i < maxRows; i++) {
      if (i % 2 === 0) {
        doc.setFillColor(...altRow);
        doc.rect(leftX, curY, halfW, rowH, "F");
        doc.rect(rightX, curY, halfW, rowH, "F");
      }

      const textY = curY + 6.5;

      if (i < earningsRows.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...textDark);
        doc.text(earningsRows[i].label, leftX + 4, textY);
        doc.setFont("helvetica", "bold");
        doc.text(earningsRows[i].value.toFixed(2), leftX + halfW - 4, textY, {
          align: "right",
        });
      }

      if (i < deductionRows.length) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(...textDark);
        doc.text(deductionRows[i].label, rightX + 4, textY);
        doc.setFont("helvetica", "bold");
        doc.text(deductionRows[i].value.toFixed(2), rightX + halfW - 4, textY, {
          align: "right",
        });
      }

      curY += rowH;
    }

    // Totals row
    const grossEarnings =
      salaryStructure.grossEarnings ??
      (salaryStructure.basicPay ?? 0) +
        (salaryStructure.hra ?? 0) +
        (salaryStructure.conveyance ?? 0) +
        (salaryStructure.incentive ?? 0);
    const totalDeductions =
      (salaryStructure.pf ?? 0) +
      (salaryStructure.esi ?? 0) +
      (salaryStructure.pt ?? 0) +
      (salaryStructure.deductions ?? 0);

    doc.setFillColor(...powder);
    doc.rect(leftX, curY, halfW, 9, "F");
    doc.rect(rightX, curY, halfW, 9, "F");
    doc.setTextColor(...navyD);
    doc.setFontSize(9);
    doc.setFont("helvetica", "bold");
    doc.text("Gross Earnings", leftX + 4, curY + 6);
    doc.text(grossEarnings.toFixed(2), leftX + halfW - 4, curY + 6, {
      align: "right",
    });
    doc.text("Total Deductions", rightX + 4, curY + 6);
    doc.text(totalDeductions.toFixed(2), rightX + halfW - 4, curY + 6, {
      align: "right",
    });

    curY += 9;

    // ─── Net payable banner ─────────────────────────────────────────────────────
    const netPayable =
      salaryStructure.netPayable ?? grossEarnings - totalDeductions;
    curY += 6;

    doc.setFillColor(...navyD);
    doc.rect(marginX, curY, contentW, 18, "F");
    doc.setFillColor(...steel);
    doc.rect(marginX, curY, contentW, 2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8.5);
    doc.setFont("helvetica", "normal");
    doc.text("NET PAYABLE FOR", marginX + 5, curY + 9);
    doc.setFontSize(10);
    doc.setFont("helvetica", "bold");
    doc.text(monthLabel.toUpperCase(), marginX + 5, curY + 15);

    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...powder);
    doc.text(
      `Rs. ${netPayable.toFixed(2)}`,
      marginX + contentW - 5,
      curY + 13,
      { align: "right" },
    );

    curY += 18;

    // ─── Attendance summary ─────────────────────────────────────────────────────
    if (attendanceSummary) {
      curY += 8;
      doc.setFillColor(245, 248, 253);
      doc.rect(marginX, curY, contentW, 18, "F");
      doc.setFillColor(...steel);
      doc.rect(marginX, curY, 3, 18, "F");

      doc.setTextColor(...textMid);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "bold");
      doc.text("ATTENDANCE SUMMARY", marginX + 7, curY + 6);

      const attItems = [
        {
          label: "DAYS PRESENT",
          value: String(attendanceSummary.presentDays ?? 0),
        },
        {
          label: "DAYS ABSENT",
          value: String(attendanceSummary.absentDays ?? 0),
        },
      ];
      const attColW = (contentW - 3) / attItems.length;
      attItems.forEach((item, i) => {
        const x = marginX + 7 + i * attColW;
        doc.setTextColor(...textLight);
        doc.setFontSize(7);
        doc.setFont("helvetica", "normal");
        doc.text(item.label, x, curY + 11);
        doc.setTextColor(...textDark);
        doc.setFontSize(10);
        doc.setFont("helvetica", "bold");
        doc.text(item.value, x, curY + 16);
      });

      curY += 18;
    }

    // ─── Signature section ──────────────────────────────────────────────────────
    const sigY = pageH - 50;
    doc.setDrawColor(...powder);
    doc.setLineWidth(0.4);
    doc.line(marginX, sigY, marginX + 55, sigY);
    doc.line(pageW - marginX - 55, sigY, pageW - marginX, sigY);

    doc.setTextColor(...textLight);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text("Employee Signature", marginX, sigY + 5);
    doc.text("Authorized Signatory", pageW - marginX, sigY + 5, {
      align: "right",
    });

    // ─── Footer bar ─────────────────────────────────────────────────────────────
    fillPoly(
      [
        [0, pageH - 28],
        [0, pageH],
        [28, pageH],
      ],
      powder,
    );
    fillPoly(
      [
        [0, pageH - 35],
        [0, pageH - 28],
        [28, pageH],
        [35, pageH],
      ],
      steel,
    );

    doc.setFillColor(...navyD);
    doc.rect(0, pageH - 13, pageW, 13, "F");
    doc.setFillColor(...steel);
    doc.rect(0, pageH - 15, pageW, 2, "F");

    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "italic");
    doc.text(
      "This is a system-generated salary slip and does not require a signature.",
      pageW / 2,
      pageH - 5,
      { align: "center" },
    );
    doc.setFont("helvetica", "normal");
    doc.text("Confidential – For Internal Use Only", marginX, pageH - 5);

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
