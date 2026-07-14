import { Request, Response } from "express";
import { jsPDF } from "jspdf";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { isSuperUser } from "../utils/user";
import { MONTH_NAMES, formatINR, derivePdfPassword } from "./salary";
import {
  computeForm16,
  aggregateEarningsByCode,
  NEW_REGIME_REBATE_THRESHOLD,
  OLD_REGIME_REBATE_THRESHOLD,
  NEW_REGIME_MAX_REBATE,
  OLD_REGIME_MAX_REBATE,
  type Form16ComponentRow,
} from "../utils/tdsCalc";

// Same labels the payslip/TDS worksheet use for these codes.
const LEGACY_LABELS: Record<string, string> = {
  BASIC: "Basic Pay",
  HRA: "HRA",
  CONVEYANCE: "Conveyance Allowance",
  INCENTIVE: "Incentive",
};

/** FY "2026-27" → AY "2027-28". */
function assessmentYearFor(financialYear: string): string {
  const [fyStart] = financialYear.split("-");
  const ayStart = parseInt(fyStart, 10) + 1;
  const ayEndShort = String((ayStart + 1) % 100).padStart(2, "0");
  return `${ayStart}-${ayEndShort}`;
}

export async function generateForm16(req: Request, res: Response) {
  const { user } = req as AuthRequest;
  try {
    const requestedUserId = req.params.userId as string;
    const superUser = await isSuperUser(user!.userId);
    if (!superUser && requestedUserId !== user!.userId) {
      return apiResponse(res, RESPONSE_STATUS.FORBIDDEN, {
        message: "Forbidden",
      });
    }

    const financialYear = req.params.financialYear as string;
    const fyStartYear = parseInt(financialYear.split("-")[0], 10);
    if (!financialYear.includes("-") || isNaN(fyStartYear)) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message: 'financialYear must look like "2026-27"',
      });
    }
    const tenantId = user!.tenantId;

    const employee = await prisma.user.findUnique({
      where: { id: requestedUserId },
      select: {
        first_name: true,
        last_name: true,
        username: true,
        designation: true,
        pan_no: true,
        dob: true,
      },
    });
    if (!employee) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: "Employee not found",
      });
    }
    const employeeName =
      [employee.first_name, employee.last_name].filter(Boolean).join(" ") ||
      employee.username;

    const pdfPassword = derivePdfPassword(
      employee.pan_no,
      employee.dob?.toISOString(),
    );
    if (!pdfPassword) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "Cannot generate Form 16: PAN and date of birth must both be on file (used to password-protect the PDF). Complete KYC first.",
      });
    }

    // Every finalized run this financial year (Apr–Mar).
    const [runs, taxSlabs, declarationRow, tenant] = await Promise.all([
      tenantId
        ? prisma.payrollRun.findMany({
            where: {
              tenantId,
              status: { in: ["approved", "disbursed"] },
              OR: [
                { year: fyStartYear, month: { gte: 4 } },
                { year: fyStartYear + 1, month: { lte: 3 } },
              ],
            },
            select: { id: true, month: true, year: true },
          })
        : Promise.resolve([]),
      tenantId
        ? (prisma as any).incomeTaxSlab.findMany({
            where: { tenantId, financialYear },
          })
        : Promise.resolve([]),
      tenantId
        ? (prisma as any).taxDeclaration.findFirst({
            where: {
              tenantId,
              userId: requestedUserId,
              financialYear,
              status: { in: ["Declared", "ProofsSubmitted", "Verified"] },
            },
          })
        : Promise.resolve(null),
      tenantId
        ? prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { name: true, tan: true },
          })
        : Promise.resolve(null),
    ]);

    const runIds = (runs as any[]).map((r) => r.id);
    if (runIds.length === 0) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: `No finalized payroll runs found for FY ${financialYear}.`,
      });
    }
    const monthByRunId = new Map((runs as any[]).map((r) => [r.id, r.month]));

    const lineItems = await prisma.payrollLineItem.findMany({
      where: { payrollRunId: { in: runIds }, userId: requestedUserId },
      select: {
        payrollRunId: true,
        componentBreakdown: true,
        basicPay: true,
        hra: true,
        conveyance: true,
        incentive: true,
        tds: true,
      },
    });
    if (lineItems.length === 0) {
      return apiResponse(res, RESPONSE_STATUS.NOT_FOUND, {
        message: `No payslips found for this employee in FY ${financialYear}.`,
      });
    }

    // Component definitions (for labels beyond the legacy fixed set).
    const componentDefs = tenantId
      ? await (prisma as any).salaryComponentDefinition.findMany({
          where: { tenantId, type: "earning" },
          select: { code: true, name: true },
        })
      : [];
    const labelByCode = new Map(
      (componentDefs as any[]).map((d) => [d.code, d.name]),
    );

    const annualByCode = aggregateEarningsByCode(lineItems as any[]);
    const components: Form16ComponentRow[] = Object.entries(annualByCode).map(
      ([code, annualAmount]) => ({
        code,
        label: LEGACY_LABELS[code] ?? labelByCode.get(code) ?? code,
        annualAmount,
      }),
    );
    const totalTdsDeducted = (lineItems as any[]).reduce(
      (s, li) => s + (li.tds ?? 0),
      0,
    );

    const monthsCovered = lineItems.length;
    const isProvisional = monthsCovered < 12;

    const regime: "old" | "new" = declarationRow ? "old" : "new";
    const form16 = computeForm16({
      regime,
      components,
      totalTdsDeducted,
      slabs: taxSlabs,
      declaration: declarationRow
        ? {
            monthlyRent: (declarationRow as any).monthlyRent,
            isMetroCity: (declarationRow as any).isMetroCity,
            lineItems: (declarationRow as any).lineItems ?? [],
          }
        : undefined,
    });

    // Month-wise TDS breakup, in financial-year (Apr→Mar) order.
    const monthTds = new Map<number, number>();
    for (const li of lineItems as any[]) {
      const month = monthByRunId.get(li.payrollRunId);
      if (month != null)
        monthTds.set(month, (monthTds.get(month) ?? 0) + (li.tds ?? 0));
    }
    const fyMonthOrder = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
    const monthTdsRows = fyMonthOrder
      .filter((m) => monthTds.has(m))
      .map((m) => ({ month: m, tds: monthTds.get(m)! }));

    const assessmentYear = assessmentYearFor(financialYear);

    // ── PDF ──────────────────────────────────────────────────────────────────────
    const doc = new jsPDF({
      unit: "mm",
      format: "a4",
      encryption: {
        userPassword: pdfPassword,
        ownerPassword: pdfPassword,
        userPermissions: ["print", "copy"],
      },
    });
    const pageW = doc.internal.pageSize.getWidth();
    const pageH = doc.internal.pageSize.getHeight();
    const marginX = 15;
    const contentW = pageW - marginX * 2;

    const textDark: [number, number, number] = [30, 30, 30];
    const textGray: [number, number, number] = [110, 110, 110];
    const borderLight: [number, number, number] = [222, 222, 222];
    const borderDark: [number, number, number] = [205, 205, 205];
    const headerFill: [number, number, number] = [232, 247, 236];
    const accentGreen: [number, number, number] = [56, 142, 60];

    let curY = 18;

    let tableBoxSegments: { page: number; startY: number }[] = [];
    let tableBoxActive = false;

    const ensureSpace = (needed: number) => {
      if (curY + needed > pageH - 15) {
        doc.addPage();
        curY = 18;
        if (tableBoxActive) {
          tableBoxSegments.push({ page: doc.getNumberOfPages(), startY: curY });
        }
      }
    };

    const beginTableBox = () => {
      tableBoxSegments = [{ page: doc.getNumberOfPages(), startY: curY }];
      tableBoxActive = true;
    };

    const finalizeTableBox = () => {
      const lastPage = doc.getNumberOfPages();
      tableBoxSegments.forEach((seg, i) => {
        const isLast = i === tableBoxSegments.length - 1;
        const endY = isLast ? curY : pageH - 15;
        doc.setPage(seg.page);
        doc.setDrawColor(...borderDark);
        doc.setLineWidth(0.3);
        doc.rect(marginX, seg.startY, contentW, endY - seg.startY);
      });
      doc.setPage(lastPage);
      tableBoxActive = false;
    };

    const dottedDivider = () => {
      doc.setDrawColor(...borderDark);
      doc.setLineWidth(0.3);
      doc.setLineDashPattern([0.6, 0.8], 0);
      doc.line(marginX, curY, marginX + contentW, curY);
      doc.setLineDashPattern([], 0);
    };

    // ── Company header — name + TAN, solid divider (matches the payslip) ───────
    doc.setTextColor(...textDark);
    doc.setFontSize(17);
    doc.setFont("helvetica", "bold");
    doc.text(tenant?.name || "Company", marginX, curY);
    curY += 6;
    doc.setTextColor(...textGray);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text(`TAN: ${tenant?.tan || "-"}`, marginX, curY);
    curY += 5;
    doc.setDrawColor(...borderDark);
    doc.setLineWidth(0.3);
    doc.line(marginX, curY, marginX + contentW, curY);
    curY += 10;

    // ── Title ─────────────────────────────────────────────────────────────────────
    doc.setTextColor(...textDark);
    doc.setFontSize(14.5);
    doc.setFont("helvetica", "bold");
    doc.text("FORM 16 (PART B)", marginX, curY);
    const titleW = doc.getTextWidth("FORM 16 (PART B)");
    doc.setTextColor(...textGray);
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "normal");
    doc.text(
      ` — FY ${financialYear} (AY ${assessmentYear})`,
      marginX + titleW,
      curY,
    );
    curY += 8;

    if (isProvisional) {
      doc.setTextColor(...accentGreen);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      doc.text(
        `PROVISIONAL — ${monthsCovered} of 12 months finalized so far this financial year.`,
        marginX,
        curY,
      );
      curY += 7;
    }

    // ── Employee info row ────────────────────────────────────────────────────────
    const infoColW = contentW / 4;
    const infoField = (i: number, label: string, value: string) => {
      const x = marginX + i * infoColW;
      doc.setTextColor(...textGray);
      doc.setFontSize(7.5);
      doc.setFont("helvetica", "normal");
      doc.text(label.toUpperCase(), x, curY);
      doc.setTextColor(...textDark);
      doc.setFontSize(10);
      doc.setFont("helvetica", "bold");
      doc.text(value || "-", x, curY + 5.5);
    };
    infoField(0, "Employee Name", employeeName);
    infoField(1, "PAN", employee.pan_no || "-");
    infoField(2, "Designation", employee.designation || "-");
    infoField(3, "Tax Regime", regime === "new" ? "New Regime" : "Old Regime");
    curY += 11;
    dottedDivider();
    curY += 9;

    doc.setTextColor(...accentGreen);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.text(
      "DETAILS OF SALARY PAID AND TAX DEDUCTED (WHOLE FINANCIAL YEAR)",
      marginX,
      curY,
    );
    curY += 6;

    // ── Table helpers (same collapsed-border card style as the TDS worksheet) ──
    const rowH = 6.2;
    const indentPad = 6;

    const tableHeader = (
      cols: { label: string; x: number; w: number; align?: "left" | "right" }[],
    ) => {
      ensureSpace(rowH + 2);
      doc.setFillColor(...headerFill);
      doc.rect(marginX, curY, contentW, rowH, "F");
      doc.setTextColor(...textDark);
      doc.setFontSize(8.5);
      doc.setFont("helvetica", "bold");
      for (const c of cols) {
        doc.text(
          c.label,
          c.align === "right" ? c.x + c.w - 2 : c.x + 2,
          curY + 4.3,
          {
            align: c.align === "right" ? "right" : "left",
          },
        );
      }
      curY += rowH;
    };

    const dataRow = (
      cols: {
        text: string;
        x: number;
        w: number;
        align?: "left" | "right";
        bold?: boolean;
        indent?: boolean;
      }[],
    ) => {
      ensureSpace(rowH + 1);
      doc.setTextColor(...textDark);
      doc.setFontSize(8.5);
      for (const c of cols) {
        doc.setFont("helvetica", c.bold ? "bold" : "normal");
        const padLeft = c.indent ? indentPad : 2;
        doc.text(
          c.text,
          c.align === "right" ? c.x + c.w - 2 : c.x + padLeft,
          curY + 4.3,
          { align: c.align === "right" ? "right" : "left" },
        );
      }
      doc.setDrawColor(...borderLight);
      doc.setLineWidth(0.2);
      doc.line(marginX, curY + rowH, marginX + contentW, curY + rowH);
      curY += rowH;
    };

    const c0x = marginX,
      c0w = contentW * 0.75;
    const c1x = c0x + c0w,
      c1w = contentW - c0w;

    const tableStartY = curY;
    beginTableBox();

    tableHeader([
      { label: "Particulars", x: c0x, w: c0w },
      { label: "Amount", x: c1x, w: c1w, align: "right" },
    ]);

    const stepRow = (
      label: string,
      value: number | null,
      opts: { bold?: boolean; indent?: boolean } = {},
    ) => {
      dataRow([
        { text: label, x: c0x, w: c0w, bold: opts.bold, indent: opts.indent },
        {
          text: value == null ? "" : formatINR(value),
          x: c1x,
          w: c1w,
          align: "right",
          bold: opts.bold,
        },
      ]);
    };

    dataRow([
      { text: "1) Gross Salary — Section 17(1)", x: c0x, w: c0w, bold: true },
    ]);
    for (const row of form16.earnings) {
      stepRow(row.label, row.annualAmount, { indent: true });
    }
    stepRow("Gross Salary", form16.grossSalary, { bold: true });

    dataRow([
      {
        text: "2) Allowance to the extent exempt under Section 10",
        x: c0x,
        w: c0w,
        bold: true,
      },
    ]);
    stepRow("HRA Exemption — Section 10(13A)", form16.exemptionUnderSection10, {
      indent: true,
    });
    stepRow("3) Total After Exemption (1-2)", form16.totalAfterExemption, {
      bold: true,
    });

    dataRow([
      { text: "4) Deductions under Section 16", x: c0x, w: c0w, bold: true },
    ]);
    stepRow("a) Entertainment Allowance", 0, { indent: true });
    stepRow("b) Tax on Employment", 0, { indent: true });
    stepRow(
      "c) Standard Deduction — Section 16(ia)",
      form16.standardDeduction,
      { indent: true },
    );
    stepRow("Total Under Section 16", form16.standardDeduction, { bold: true });

    stepRow(
      "5) Income Chargeable Under the Head Salaries (3-4)",
      form16.incomeChargeableUnderSalaries,
      { bold: true },
    );
    stepRow("6) Income (or Loss) from Other Sources reported", 0, {
      bold: true,
    });
    stepRow(
      "7) Gross Total Income (5+6)",
      form16.incomeChargeableUnderSalaries,
      { bold: true },
    );
    stepRow("8) Deductions under Chapter VI-A", form16.chapterVIADeduction, {
      bold: true,
    });
    stepRow(
      "9) Total Taxable Income (Rounded to nearest Rs. 10) (7-8)",
      form16.totalIncomeRounded,
      { bold: true },
    );

    dataRow([{ text: "10) Tax Calculation", x: c0x, w: c0w, bold: true }]);
    for (const slab of form16.slabRows) {
      const range =
        slab.maxIncome != null
          ? `${formatINR(slab.minIncome)} to ${formatINR(slab.maxIncome)} (${slab.ratePercent}%)`
          : `Above ${formatINR(slab.minIncome)} (${slab.ratePercent}%)`;
      stepRow(range, slab.taxAmount, { indent: true });
    }
    stepRow("Tax on Total Income", form16.taxOnTotalIncome, { bold: true });
    stepRow("Less: Rebate under Section 87A", form16.rebate);

    const rebateThreshold =
      regime === "new"
        ? NEW_REGIME_REBATE_THRESHOLD
        : OLD_REGIME_REBATE_THRESHOLD;
    const maxRebate =
      regime === "new" ? NEW_REGIME_MAX_REBATE : OLD_REGIME_MAX_REBATE;
    ensureSpace(rowH + 2);
    doc.setTextColor(...textGray);
    doc.setFontSize(7);
    doc.setFont("helvetica", "italic");
    const note = `Note: If taxable income is less than ${formatINR(rebateThreshold)}, a tax rebate of up to ${formatINR(maxRebate)} is provided under Section 87A.`;
    const noteLines = doc.splitTextToSize(note, contentW - 4);
    doc.text(noteLines, c0x + 2, curY + 4);
    curY += noteLines.length * 3.6 + 2;

    stepRow("11) Total Tax on Income", form16.totalTaxOnIncome, { bold: true });
    stepRow("Surcharge", 0);
    stepRow("Health & Education Cess (4%)", form16.cess);
    stepRow("Less: Relief under Section 89", 0);
    stepRow("12) Net Tax Payable", form16.taxPayable, { bold: true });

    dataRow([
      {
        text: "13) Tax Deducted at Source — month-wise",
        x: c0x,
        w: c0w,
        bold: true,
      },
    ]);
    for (const row of monthTdsRows) {
      stepRow(`${MONTH_NAMES[(row.month - 1) % 12]}`, row.tds, {
        indent: true,
      });
    }
    stepRow("Total Tax Deducted at Source", form16.totalTdsDeducted, {
      bold: true,
    });

    const balanceLabel =
      form16.taxPayableOrRefundable > 0
        ? "14) Balance Tax Payable (12-13)"
        : form16.taxPayableOrRefundable < 0
          ? "14) Refund Due (13-12)"
          : "14) Tax Payable / Refundable (12-13)";
    stepRow(balanceLabel, Math.abs(form16.taxPayableOrRefundable), {
      bold: true,
    });

    finalizeTableBox();

    // ── Verification block ──────────────────────────────────────────────────────
    curY += 10;
    ensureSpace(30);
    doc.setTextColor(...textDark);
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.text(
      "I certify that the information given above is true, complete, and correct based on the records maintained.",
      marginX,
      curY,
    );
    curY += 12;
    doc.text("Place: _______________", marginX, curY);
    doc.text(
      `Date: ${new Date().toLocaleDateString("en-GB")}`,
      marginX + contentW / 2,
      curY,
    );
    curY += 12;
    doc.setFont("helvetica", "bold");
    doc.text(`For ${tenant?.name || "Company"}`, marginX, curY);
    curY += 10;
    doc.text("(Authorized Signatory)", marginX, curY);

    curY += 12;
    doc.setTextColor(...textGray);
    doc.setFontSize(7.5);
    doc.setFont("helvetica", "italic");
    doc.text("-- This is a system-generated document. --", pageW / 2, curY, {
      align: "center",
    });

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="form16_${financialYear}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error: unknown) {
    logger.error("generateForm16 error:", { error });
    return handleError(res, error);
  }
}
