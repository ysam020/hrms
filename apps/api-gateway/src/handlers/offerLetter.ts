import dayjs from "dayjs";
import { jsPDF } from "jspdf";
import { prismaWithTenant as prisma, prisma as masterPrisma } from "@hrms/db";
import {
  deriveOfferCompensationBreakup,
  OFFER_COMPENSATION_DISCLAIMER,
} from "@hrms/common";
import { getActiveSettings, SETTINGS_DEFAULTS } from "./tenantSettings";

const DAY_NAMES = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

/** "Monday to Friday" / "Monday to Saturday" / a joined list for a custom pattern. */
function formatWorkingDays(pattern: {
  type: "mon_fri" | "mon_sat" | "custom";
  workingDays: number[];
}): string {
  if (pattern.type === "mon_fri") return "Monday to Friday";
  if (pattern.type === "mon_sat") return "Monday to Saturday";
  return [...pattern.workingDays]
    .sort((a, b) => a - b)
    .map((d) => DAY_NAMES[d])
    .join(", ");
}

// Same palette as the Salary Slip / TDS Worksheet PDFs (see salary.ts,
// tdsWorksheet.ts) — duplicated locally rather than imported, matching how
// those two files already duplicate it from each other for visual
// consistency without a shared coupling.
const textDark: [number, number, number] = [30, 30, 30];
const textGray: [number, number, number] = [110, 110, 110];
const borderGray: [number, number, number] = [205, 205, 205];
const headerGreen: [number, number, number] = [232, 247, 236];
const accentGreen: [number, number, number] = [56, 142, 60];

/** "Rs." avoids the ₹ glyph — not present in jsPDF's base14 helvetica encoding. */
const formatINR = (n: number): string =>
  `Rs. ${n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const ONES = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
];
const TENS = [
  "",
  "",
  "Twenty",
  "Thirty",
  "Forty",
  "Fifty",
  "Sixty",
  "Seventy",
  "Eighty",
  "Ninety",
];

function numberToWordsIndian(amount: number): string {
  const twoDigits = (n: number): string => {
    if (n < 20) return ONES[n];
    const tens = TENS[Math.floor(n / 10)];
    const ones = n % 10;
    return ones ? `${tens}-${ONES[ones]}` : tens;
  };
  const threeDigits = (n: number): string => {
    if (n >= 100) {
      const rest = n % 100;
      return `${ONES[Math.floor(n / 100)]} Hundred${rest ? ` ${twoDigits(rest)}` : ""}`;
    }
    return twoDigits(n);
  };

  let n = Math.round(Math.abs(amount));
  if (n === 0) return "Zero";

  const crore = Math.floor(n / 10000000);
  n %= 10000000;
  const lakh = Math.floor(n / 100000);
  n %= 100000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${threeDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${threeDigits(thousand)} Thousand`);
  if (hundred) parts.push(threeDigits(hundred));

  return parts.join(" ");
}

export interface OfferLetterResult {
  buffer: Buffer;
  candidateName: string;
  candidateEmail: string;
  tenantName: string;
  tenantHelpEmail: string | null;
  referenceNumber: string;
}

export interface OfferLetterBuildError {
  error: string;
  status: "NOT_FOUND" | "BAD_REQUEST";
}

export interface HiredComponentAmount {
  code: string;
  name: string;
  type: string;
  amount: number;
}

/**
 * Builds the offer letter's compensation table rows + Total CTC from real
 * hire-time components — every captured component (earnings AND PF/ESI/PT),
 * ×12 for the annual framing. Total CTC is always the sum of every row,
 * matching the hiring modal's own "everything sums to the entered gross"
 * rule (see redistributeGross in salaryCalc.tsx) — filtering to earnings
 * only would silently drop PF/ESI/PT and undercount CTC by exactly those
 * amounts.
 */
export function buildCompensationRowsFromComponents(
  hiredComponents: HiredComponentAmount[],
): { rows: [string, number][]; totalCTC: number } {
  const rows: [string, number][] = hiredComponents.map((c) => [
    c.name,
    Math.round((Number(c.amount) || 0) * 12),
  ]);
  const totalCTC = rows.reduce((sum, [, amount]) => sum + amount, 0);
  return { rows, totalCTC };
}

/**
 * Builds the offer letter PDF for a just-hired candidate. Deliberately a
 * simplified single-page letter (designation, joining date, an indicative
 * compensation breakup, signatory) rather than the full employment
 * agreement/indemnity bond — hiring doesn't collect the DOB/PAN/address/
 * father's-name data a legal annexure would need.
 */
export async function buildOfferLetterPdf(
  applicationId: string,
  tenantId: string,
): Promise<OfferLetterResult | OfferLetterBuildError> {
  const application = await prisma.jobApplication.findUnique({
    where: { id: applicationId },
    select: {
      name: true,
      email: true,
      hireSalary: true,
      hireJoiningDate: true,
      hireSalaryComponents: true,
      jobOpening: { select: { jobTitle: true } },
    },
  });

  if (!application) {
    return { error: "Application not found", status: "NOT_FOUND" };
  }
  if (!application.email) {
    return {
      error: "Candidate has no email on file",
      status: "BAD_REQUEST",
    };
  }
  if (!application.hireSalary || !application.hireJoiningDate) {
    return {
      error:
        "Salary and joining date must be set before an offer letter can be generated",
      status: "BAD_REQUEST",
    };
  }

  const tenant = await masterPrisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      name: true,
      cin: true,
      logoUrl: true,
      signatoryName: true,
      signatoryDesignation: true,
      helpEmail: true,
    },
  });

  const settings = await getActiveSettings(tenantId);
  const workStartHour =
    settings?.workStartHour ?? SETTINGS_DEFAULTS.workStartHour;
  const workStartMinute =
    settings?.workStartMinute ?? SETTINGS_DEFAULTS.workStartMinute;
  const fullDayMinHours =
    settings?.fullDayMinHours ?? SETTINGS_DEFAULTS.fullDayMinHours;
  const workWeekPattern =
    settings?.workWeekPattern ?? SETTINGS_DEFAULTS.workWeekPattern;
  const probationPeriodDays =
    settings?.probationPeriodDays ?? SETTINGS_DEFAULTS.probationPeriodDays;
  const noticePeriodDays =
    settings?.noticePeriodDays ?? SETTINGS_DEFAULTS.noticePeriodDays;

  const workStart = dayjs()
    .hour(workStartHour)
    .minute(workStartMinute)
    .second(0);
  const workEnd = workStart.add(fullDayMinHours * 60, "minute");
  const officeTimingsLabel = `${workStart.format("hh:mm A")} to ${workEnd.format("hh:mm A")}`;
  const workingDaysLabel = formatWorkingDays(workWeekPattern);

  const candidateName = application.name || "Candidate";
  const designation = application.jobOpening?.jobTitle || "the offered role";
  const joiningDateLabel = dayjs(application.hireJoiningDate).format(
    "DD MMMM YYYY",
  );
  const tenantName = tenant?.name || "Company";
  const referenceNumber = `OFR-${applicationId.slice(-8).toUpperCase()}`;

  // Real components captured at hire time (monthly amounts) take priority —
  // ×12 for this table's "ANNUAL COMPENSATION" framing. Candidates hired
  // before this field existed fall back to the old formula-derived breakup.
  const hiredComponents = Array.isArray(application.hireSalaryComponents)
    ? (application.hireSalaryComponents as unknown as HiredComponentAmount[])
    : null;
  let compensationRows: [string, number][];
  let totalCTC: number;
  if (hiredComponents && hiredComponents.length > 0) {
    ({ rows: compensationRows, totalCTC } =
      buildCompensationRowsFromComponents(hiredComponents));
  } else {
    const breakup = deriveOfferCompensationBreakup(application.hireSalary);
    compensationRows = [
      ["Basic Salary", breakup.basic],
      ["House Rent Allowance", breakup.hra],
      ["Transport Allowance", breakup.transportAllowance],
      ["Special Allowance", breakup.specialAllowance],
      ["Employer Contribution to PF", breakup.employerPF],
    ];
    totalCTC = breakup.totalCTC;
  }

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 15;
  const contentW = pageW - marginX * 2;
  let curY = 18;

  // ─── Company header — name/address/CIN, optional logo ──────────────────────
  if (tenant?.logoUrl) {
    try {
      const res = await fetch(tenant.logoUrl);
      if (res.ok) {
        const contentType = res.headers.get("content-type") || "";
        const format = contentType.includes("png")
          ? "PNG"
          : contentType.includes("jpeg") || contentType.includes("jpg")
            ? "JPEG"
            : null;
        if (format) {
          const arrayBuffer = await res.arrayBuffer();
          const base64 = Buffer.from(arrayBuffer).toString("base64");
          doc.addImage(
            `data:${contentType};base64,${base64}`,
            format,
            marginX,
            curY - 6,
            18,
            18,
          );
        }
      }
    } catch {
      // Best-effort only — a bad/unreachable logo URL shouldn't block the letter.
    }
  }

  doc.setTextColor(...textDark);
  doc.setFontSize(16);
  doc.setFont("helvetica", "bold");
  doc.text(tenantName, marginX, curY);
  curY += 6;

  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...textGray);
  if (tenant?.cin) {
    doc.text(`CIN: ${tenant.cin}`, marginX, curY);
    curY += 5;
  }

  curY += 3;
  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.3);
  doc.line(marginX, curY, marginX + contentW, curY);
  curY += 9;

  // ─── Title, date, reference ─────────────────────────────────────────────────
  doc.setTextColor(...textDark);
  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Offer Letter", marginX, curY);
  curY += 7;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...textGray);
  doc.text(`Date: ${dayjs().format("DD MMMM YYYY")}`, marginX, curY);
  doc.text(`Reference No: ${referenceNumber}`, marginX + contentW, curY, {
    align: "right",
  });
  curY += 10;

  // ─── Body ────────────────────────────────────────────────────────────────────
  doc.setTextColor(...textDark);
  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text(`Dear ${candidateName},`, marginX, curY);
  curY += 8;

  const bodyText =
    `We are pleased to offer you employment with ${tenantName} as ${designation}. ` +
    `Your employment details and compensation are set out below.`;
  const bodyLines = doc.splitTextToSize(bodyText, contentW);
  doc.text(bodyLines, marginX, curY);
  curY += bodyLines.length * 5 + 6;

  // ─── Employment details ──────────────────────────────────────────────────────
  doc.setTextColor(...accentGreen);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("EMPLOYMENT DETAILS", marginX, curY);
  curY += 6;

  const detailsTop = curY;
  const detailRows: [string, string][] = [
    ["Designation", designation],
    ["Date of Joining", joiningDateLabel],
    ["Office Timings", officeTimingsLabel],
    ["Working Days", workingDaysLabel],
    ["Probation Period", `${probationPeriodDays} days`],
    ["Notice Period", `${noticePeriodDays} days`],
  ];
  const detailRowH = 7.5;
  for (const [label, value] of detailRows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...textGray);
    doc.text(label, marginX + 3, curY + 5.2);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(...textDark);
    doc.text(value, marginX + contentW - 3, curY + 5.2, { align: "right" });
    curY += detailRowH;
  }
  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.4);
  doc.rect(marginX, detailsTop, contentW, curY - detailsTop);
  curY += 10;

  // ─── Compensation table ──────────────────────────────────────────────────────
  doc.setTextColor(...accentGreen);
  doc.setFontSize(9);
  doc.setFont("helvetica", "bold");
  doc.text("ANNUAL COMPENSATION", marginX, curY);
  curY += 6;

  const tableTop = curY;

  doc.setFillColor(...headerGreen);
  doc.rect(marginX, curY, contentW, 8, "F");
  doc.setTextColor(...textDark);
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "bold");
  doc.text("PARTICULARS", marginX + 3, curY + 5.5);
  doc.text("AMOUNT (Rs.)", marginX + contentW - 3, curY + 5.5, {
    align: "right",
  });
  curY += 8;

  const rowH = 7.5;
  for (const [label, value] of compensationRows) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(...textDark);
    doc.text(label, marginX + 3, curY + 5.2);
    doc.setFont("helvetica", "bold");
    doc.text(formatINR(value), marginX + contentW - 3, curY + 5.2, {
      align: "right",
    });
    curY += rowH;
  }

  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.3);
  doc.line(marginX, curY, marginX + contentW, curY);
  curY += 2;

  doc.setFontSize(9.5);
  doc.setFont("helvetica", "bold");
  doc.text("Total CTC", marginX + 3, curY + 5);
  doc.text(formatINR(totalCTC), marginX + contentW - 3, curY + 5, {
    align: "right",
  });
  curY += 7;

  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.4);
  doc.rect(marginX, tableTop, contentW, curY - tableTop);
  curY += 6;

  const ctcWords = `(Indian Rupee ${numberToWordsIndian(totalCTC)} Only)`;
  doc.setFontSize(8.5);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...textGray);
  doc.text(ctcWords, pageW / 2, curY, { align: "center" });
  curY += 6;

  doc.setFontSize(7.5);
  doc.setFont("helvetica", "italic");
  const disclaimerLines = doc.splitTextToSize(
    OFFER_COMPENSATION_DISCLAIMER,
    contentW,
  );
  doc.text(disclaimerLines, marginX, curY);
  curY += disclaimerLines.length * 4 + 10;

  // ─── Closing + signature block ───────────────────────────────────────────────
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...textDark);
  const closingText = tenant?.helpEmail
    ? `Please contact us at ${tenant.helpEmail} to confirm your acceptance of this offer.`
    : "Please contact HR to confirm your acceptance of this offer.";
  const closingLines = doc.splitTextToSize(closingText, contentW);
  doc.text(closingLines, marginX, curY);
  curY += closingLines.length * 5 + 12;

  doc.setFont("helvetica", "normal");
  doc.text(`For ${tenantName}`, marginX, curY);
  curY += 14;

  doc.setFont("helvetica", "bold");
  doc.text(tenant?.signatoryName || "Authorized Signatory", marginX, curY);
  if (tenant?.signatoryName && tenant?.signatoryDesignation) {
    curY += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(tenant.signatoryDesignation, marginX, curY);
  }
  curY += 14;

  // ─── Footer ──────────────────────────────────────────────────────────────────
  doc.setTextColor(...textGray);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("-- This is a system-generated document. --", pageW / 2, curY, {
    align: "center",
  });

  const buffer = Buffer.from(doc.output("arraybuffer"));
  return {
    buffer,
    candidateName,
    candidateEmail: application.email,
    tenantName,
    tenantHelpEmail: tenant?.helpEmail ?? null,
    referenceNumber,
  };
}
