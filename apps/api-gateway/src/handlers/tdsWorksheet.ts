import { Request, Response } from "express";
import { jsPDF } from "jspdf";
import { salaryClient, grpcCall } from "../grpc/clients";
import { AuthRequest } from "../middleware/authenticate";
import { prismaWithTenant as prisma } from "@hrms/db";
import { apiResponse, RESPONSE_STATUS } from "@hrms/common";
import { logger } from "@hrms/logger";
import { handleError } from "../utils/handleError";
import { isSuperUser } from "../utils/user";
import { MONTH_NAMES, formatINR, derivePdfPassword } from "./salary";
import {
  computeTdsWorksheet,
  aggregateEarningsByCode,
  buildThisMonthComponents,
  getFinancialYear,
  remainingMonthsInFinancialYear,
  NEW_REGIME_REBATE_THRESHOLD,
  OLD_REGIME_REBATE_THRESHOLD,
  NEW_REGIME_MAX_REBATE,
  OLD_REGIME_MAX_REBATE,
} from "../utils/tdsCalc";

export async function generateTdsWorksheet(req: Request, res: Response) {
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
    const tenantId = user!.tenantId;

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
    const { employee, salaryStructure } = response.data;
    const employeeName =
      [employee?.firstName, employee?.lastName].filter(Boolean).join(" ") ||
      employee?.username ||
      "Employee";
    const monthLabel = `${MONTH_NAMES[(month - 1) % 12]} ${year}`;

    const pdfPassword = derivePdfPassword(employee?.panNo, employee?.dob);
    if (!pdfPassword) {
      return apiResponse(res, RESPONSE_STATUS.BAD_REQUEST, {
        message:
          "Cannot generate this worksheet: PAN and date of birth must both be on file (used to password-protect the PDF). Complete KYC first.",
      });
    }

    // Disbursed months use the exact amounts actually paid; an as-yet-undisbursed
    // month previews off the configured SalaryStructure at face value — the
    // worksheet projects full months forward regardless, so (unlike the payslip)
    // it doesn't need attendance-based proration for "this month"'s amount.
    const disbursedRun = tenantId
      ? await prisma.payrollRun.findFirst({
          where: { tenantId, month, year, status: "disbursed" },
          select: { id: true },
        })
      : null;
    const disbursedLineItem = disbursedRun
      ? await prisma.payrollLineItem.findFirst({
          where: { payrollRunId: disbursedRun.id, userId: requestedUserId },
        })
      : null;

    const thisMonthBreakdown: Array<{
      code: string;
      name?: string;
      type: string;
      amount: number;
    }> | null =
      (disbursedLineItem as any)?.componentBreakdown ??
      (!disbursedLineItem ? (salaryStructure as any).components : null) ??
      null;

    // Component definitions (labels + isRecurring) for the tenant, keyed by code.
    const componentDefs = tenantId
      ? await (prisma as any).salaryComponentDefinition.findMany({
          where: { tenantId, type: "earning" },
          select: { code: true, name: true, isRecurring: true },
        })
      : [];

    const legacySrc: any = disbursedLineItem ?? salaryStructure;
    const components = buildThisMonthComponents(
      thisMonthBreakdown,
      {
        basicPay: legacySrc.basicPay,
        hra: legacySrc.hra,
        conveyance: legacySrc.conveyance,
        incentive: legacySrc.incentive,
      },
      componentDefs,
    );

    // ── Financial-year-to-date state — same shape as the TDS line already
    // computed in generateSalarySlip, extended to per-component granularity.
    const financialYear = getFinancialYear(month, year);
    const fyStartYear = parseInt(financialYear.split("-")[0], 10);
    const remainingMonths = remainingMonthsInFinancialYear(month, year);

    const [taxSlabs, priorRuns, declarationRow] = await Promise.all([
      tenantId
        ? (prisma as any).incomeTaxSlab.findMany({
            where: { tenantId, financialYear },
          })
        : Promise.resolve([]),
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
        ? (prisma as any).taxDeclaration.findFirst({
            where: {
              tenantId,
              userId: requestedUserId,
              financialYear,
              status: { in: ["Declared", "ProofsSubmitted", "Verified"] },
            },
          })
        : Promise.resolve(null),
    ]);
    const priorRunIds = (priorRuns as any[])
      .filter((r) => r.year < year || (r.year === year && r.month < month))
      .map((r) => r.id);
    const priorLineItems = priorRunIds.length
      ? await prisma.payrollLineItem.findMany({
          where: { payrollRunId: { in: priorRunIds }, userId: requestedUserId },
          select: {
            componentBreakdown: true,
            basicPay: true,
            hra: true,
            conveyance: true,
            incentive: true,
            tds: true,
          },
        })
      : [];
    const ytdByCode = aggregateEarningsByCode(priorLineItems as any[]);
    const ytdTds = (priorLineItems as any[]).reduce(
      (s, li) => s + (li.tds ?? 0),
      0,
    );

    const regime: "old" | "new" = declarationRow ? "old" : "new";
    const worksheet = computeTdsWorksheet({
      regime,
      components,
      ytdByCode,
      ytdTds,
      remainingMonths,
      slabs: taxSlabs,
      declaration: declarationRow
        ? {
            monthlyRent: (declarationRow as any).monthlyRent,
            isMetroCity: (declarationRow as any).isMetroCity,
            lineItems: (declarationRow as any).lineItems ?? [],
          }
        : undefined,
    });

    const tenant = tenantId
      ? await prisma.tenant.findUnique({
          where: { id: tenantId },
          select: { name: true },
        })
      : null;

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

    // Same subtle palette as the payslip PDF (generateSalarySlip), for visual
    // consistency between the two payroll documents.
    const textDark: [number, number, number] = [30, 30, 30];
    const textGray: [number, number, number] = [110, 110, 110];
    const borderLight: [number, number, number] = [222, 222, 222];
    const borderDark: [number, number, number] = [205, 205, 205];
    const headerFill: [number, number, number] = [232, 247, 236];
    const accentGreen: [number, number, number] = [56, 142, 60];

    let curY = 18;

    // The itemized table spans multiple pages for a real employee — jsPDF's
    // rect() only draws on the page active when it's called, so one rect from
    // the table's start to its end (possibly on a later page) draws garbage.
    // Track one segment per page the table touches and box each separately.
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

    // ── Company header — name only, no address/logo (matches the payslip) ──────
    doc.setTextColor(...textDark);
    doc.setFontSize(17);
    doc.setFont("helvetica", "bold");
    doc.text(tenant?.name || "Company", marginX, curY);
    curY += 8;
    doc.setDrawColor(...borderDark);
    doc.setLineWidth(0.3);
    doc.line(marginX, curY, marginX + contentW, curY);
    curY += 10;

    // ── Title — bold heading + gray subtitle on the same baseline ───────────────
    doc.setTextColor(...textDark);
    doc.setFontSize(14.5);
    doc.setFont("helvetica", "bold");
    doc.text("TDS WORK SHEET", marginX, curY);
    const titleW = doc.getTextWidth("TDS WORK SHEET");
    doc.setTextColor(...textGray);
    doc.setFontSize(10.5);
    doc.setFont("helvetica", "normal");
    doc.text(` for the month of ${monthLabel}`, marginX + titleW, curY);
    curY += 10;

    // ── Employee info row — 4 columns, gray caption over bold value ─────────────
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
    infoField(1, "PAN", employee?.panNo || "-");
    infoField(2, "Designation", employee?.designation || "-");
    infoField(3, "Tax Regime", regime === "new" ? "New Regime" : "Old Regime");
    curY += 11;
    dottedDivider();
    curY += 9;

    doc.setTextColor(...accentGreen);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "bold");
    doc.text(
      "DETAILS OF SALARY PAID AND ANY OTHER INCOME AND TAX DEDUCTED",
      marginX,
      curY,
    );
    curY += 6;

    // ── Table helpers — collapsed-border "card" look: header fill, a bottom
    // rule per row, and one outer box drawn once the whole table is done ────────
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
      opts: { shaded?: boolean } = {},
    ) => {
      ensureSpace(rowH + 1);
      if (opts.shaded) {
        doc.setFillColor(...headerFill);
        doc.rect(marginX, curY, contentW, rowH, "F");
      }
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

    // 4-column layout for the Gross Earnings table; steps 2+ use a single
    // value column (c3) with the label spanning the rest.
    const c0x = marginX,
      c0w = contentW * 0.4;
    const c1x = c0x + c0w,
      c1w = contentW * 0.2;
    const c2x = c1x + c1w,
      c2w = contentW * 0.2;
    const c3x = c2x + c2w,
      c3w = contentW - c0w - c1w - c2w;

    const tableStartY = curY;
    beginTableBox();

    tableHeader([
      { label: "Particulars", x: c0x, w: c0w },
      { label: "Actual (YTD)", x: c1x, w: c1w, align: "right" },
      { label: "Projection", x: c2x, w: c2w, align: "right" },
      { label: "Total", x: c3x, w: c3w, align: "right" },
    ]);
    dataRow([{ text: "1) Gross Earnings", x: c0x, w: c0w, bold: true }]);
    for (const row of worksheet.earnings) {
      dataRow([
        { text: row.label, x: c0x, w: c0w, indent: true },
        { text: formatINR(row.actual), x: c1x, w: c1w, align: "right" },
        { text: formatINR(row.projection), x: c2x, w: c2w, align: "right" },
        { text: formatINR(row.total), x: c3x, w: c3w, align: "right" },
      ]);
    }
    dataRow([
      { text: "Total Income", x: c0x, w: c0w, bold: true },
      { text: "", x: c1x, w: c1w },
      { text: "", x: c2x, w: c2w },
      {
        text: formatINR(worksheet.totalIncome),
        x: c3x,
        w: c3w,
        align: "right",
        bold: true,
      },
    ]);

    // Column dividers only run the height of the 4-column earnings table —
    // every row after this point is a single label+value line, not a grid.
    const section1EndY = curY;
    doc.setDrawColor(...borderLight);
    doc.setLineWidth(0.2);
    doc.line(c1x, tableStartY, c1x, section1EndY);
    doc.line(c2x, tableStartY, c2x, section1EndY);
    doc.line(c3x, tableStartY, c3x, section1EndY);

    // Steps 2–15: label + value rows (3rd column carries the running total).
    const stepRow = (
      label: string,
      value: number | null,
      opts: { bold?: boolean; indent?: boolean; shaded?: boolean } = {},
    ) => {
      dataRow(
        [
          {
            text: label,
            x: c0x,
            w: c0w + c1w + c2w,
            bold: opts.bold,
            indent: opts.indent,
          },
          {
            text: value == null ? "" : formatINR(value),
            x: c3x,
            w: c3w,
            align: "right",
            bold: opts.bold,
          },
        ],
        { shaded: opts.shaded },
      );
    };

    dataRow([
      {
        text: "2) Allowance to the extent exempt under Section 10",
        x: c0x,
        w: c0w,
        bold: true,
      },
    ]);
    stepRow(
      "HRA Exemption — Section 10(13A)",
      worksheet.exemptionUnderSection10,
      {
        indent: true,
      },
    );
    stepRow(
      "Total of Allowance to the extent exempt under Section 10",
      worksheet.exemptionUnderSection10,
      { bold: true },
    );
    stepRow("3) Total After Exemption (1-2)", worksheet.totalAfterExemption, {
      bold: true,
    });

    dataRow([
      {
        text: "4) Taxable Income under Previous Employment",
        x: c0x,
        w: c0w,
        bold: true,
      },
    ]);
    stepRow("i) Income After Exemptions", worksheet.previousEmploymentIncome, {
      indent: true,
    });
    stepRow("ii) Less: Professional Tax", 0, { indent: true });
    stepRow(
      "Total taxable income under Previous Employment",
      worksheet.previousEmploymentIncome,
      { bold: true },
    );
    stepRow("5) Gross Total (3+4)", worksheet.grossTotal, { bold: true });

    dataRow([{ text: "6) Under Section 16", x: c0x, w: c0w, bold: true }]);
    stepRow("a) Entertainment Allowance", 0, { indent: true });
    stepRow("b) Tax on Employment", 0, { indent: true });
    stepRow(
      "c) Standard Deduction — Section 16(ia)",
      worksheet.standardDeduction,
      {
        indent: true,
      },
    );
    stepRow("Total Under Section 16", worksheet.standardDeduction, {
      bold: true,
    });

    stepRow(
      "7) Income Chargeable Under the Head Salaries (5-6)",
      worksheet.incomeChargeableUnderSalaries,
      { bold: true },
    );
    stepRow(
      "8) Any other income reported by the employee",
      worksheet.otherIncome,
      {
        bold: true,
      },
    );
    stepRow("9) Gross Total Income (7+8)", worksheet.grossTotalIncome, {
      bold: true,
    });
    stepRow(
      "10) Deductions under Chapter VI-A",
      worksheet.chapterVIADeduction,
      {
        bold: true,
      },
    );
    stepRow(
      "11) Total Income (Rounded to nearest Rs. 10) (9-10)",
      worksheet.totalIncomeRounded,
      { bold: true },
    );

    // Step 12 — slab breakdown table.
    dataRow([{ text: "12) Tax Calculation", x: c0x, w: c0w, bold: true }]);
    for (const slab of worksheet.slabRows) {
      const range =
        slab.maxIncome != null
          ? `${formatINR(slab.minIncome)} to ${formatINR(slab.maxIncome)} (${slab.ratePercent}%)`
          : `Above ${formatINR(slab.minIncome)} (${slab.ratePercent}%)`;
      stepRow(range, slab.taxAmount, { indent: true });
    }
    stepRow("Tax on Total Income", worksheet.taxOnTotalIncome, { bold: true });
    stepRow("Less: Rebate under Section 87A", worksheet.rebate);

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

    stepRow("13) Total Tax on Income", worksheet.totalTaxOnIncome, {
      bold: true,
    });
    stepRow("Surcharge", worksheet.surcharge);
    stepRow("Health & Education Cess (4%)", worksheet.cess);
    stepRow("Less: Relief under Section 89", worksheet.reliefSection89);
    stepRow(
      "14) Tax Payable including Health & Education Cess, minus Relief under Section 89",
      worksheet.taxPayable,
      { bold: true },
    );

    dataRow([
      { text: "15) Tax Deducted at Source", x: c0x, w: c0w, bold: true },
    ]);
    stepRow("i) TDS till last month", worksheet.tdsTillLastMonth, {
      indent: true,
    });
    stepRow(
      `ii) TDS for ${MONTH_NAMES[(month - 1) % 12]}`,
      worksheet.tdsThisMonth,
      {
        indent: true,
      },
    );
    stepRow("iii) TDS by Previous Employer", worksheet.tdsByPreviousEmployer, {
      indent: true,
    });
    stepRow(
      "A) Total Tax Deducted at Source (i+ii+iii)",
      worksheet.totalTdsDeducted,
      {
        bold: true,
      },
    );
    stepRow(
      "Tax Payable / Refundable (14 - 15(A))",
      worksheet.taxPayableOrRefundable,
      { bold: true },
    );
    stepRow(
      `TDS per month for the next ${Math.max(0, remainingMonths - 1)} months`,
      worksheet.tdsPerMonthGoingForward,
    );

    // Outer card border around the whole itemized table (one rect per page it touches).
    finalizeTableBox();

    // ─── TDS this month — dashed highlight box, same treatment as the
    // payslip's "Total Net Payable" box ─────────────────────────────────────────
    curY += 8;
    ensureSpace(24);
    const tdsBoxH = 18;
    doc.setDrawColor(...accentGreen);
    doc.setLineWidth(0.4);
    doc.setLineDashPattern([1.5, 1.2], 0);
    doc.roundedRect(marginX, curY, contentW, tdsBoxH, 2, 2);
    doc.setLineDashPattern([], 0);

    doc.setTextColor(...textDark);
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.text(
      `TDS for ${MONTH_NAMES[(month - 1) % 12]}  ${formatINR(worksheet.tdsThisMonth)}`,
      pageW / 2,
      curY + 8,
      { align: "center" },
    );
    doc.setFontSize(8);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...textGray);
    doc.text(
      "**Spread evenly across the remaining months of the financial year",
      pageW / 2,
      curY + 13.5,
      { align: "center" },
    );
    curY += tdsBoxH + 12;

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
      `attachment; filename="tds_worksheet_${MONTH_NAMES[(month - 1) % 12]}_${year}.pdf"`,
    );
    return res.send(pdfBuffer);
  } catch (error: unknown) {
    logger.error("generateTdsWorksheet error:", { error });
    return handleError(res, error);
  }
}
