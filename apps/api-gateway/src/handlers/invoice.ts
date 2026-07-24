import { jsPDF } from "jspdf";
import { formatINR } from "./salary";

export interface InvoiceDetails {
  tenantName: string;
  plan: string;
  billing: "monthly" | "annual" | string;
  amountPaise: number;
  paymentMethodSummary?: string | null;
  billingPeriodStart: Date;
  billingPeriodEnd: Date;
  invoiceDate: Date;
}

/**
 * Builds a simple subscription invoice PDF — not a general invoicing/ledger
 * system, just the one-page receipt attached to each renewal email. Not
 * password-protected (unlike salary slips/TDS worksheets): this goes to the
 * tenant owner about their own billing, not third-party employee PII.
 */
export function buildInvoicePdf(details: InvoiceDetails): Buffer {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const marginX = 20;
  const contentW = pageW - marginX * 2;

  const textDark: [number, number, number] = [30, 30, 30];
  const textGray: [number, number, number] = [110, 110, 110];
  const borderGray: [number, number, number] = [205, 205, 205];
  const accentGreen: [number, number, number] = [56, 142, 60];

  let curY = 22;

  doc.setTextColor(...textDark);
  doc.setFontSize(18);
  doc.setFont("helvetica", "bold");
  doc.text("Praesto", marginX, curY);
  curY += 8;
  doc.setDrawColor(...borderGray);
  doc.setLineWidth(0.3);
  doc.line(marginX, curY, marginX + contentW, curY);
  curY += 10;

  doc.setFontSize(13);
  doc.setFont("helvetica", "bold");
  doc.text("Subscription Invoice", marginX, curY);
  curY += 10;

  const row = (label: string, value: string) => {
    doc.setTextColor(...textGray);
    doc.setFontSize(9.5);
    doc.setFont("helvetica", "normal");
    doc.text(label, marginX, curY);
    doc.setTextColor(...textDark);
    doc.setFont("helvetica", "bold");
    doc.text(value, marginX + 60, curY);
    curY += 8;
  };

  row("Billed to", details.tenantName);
  row("Invoice date", details.invoiceDate.toLocaleDateString("en-IN"));
  row(
    "Billing period",
    `${details.billingPeriodStart.toLocaleDateString("en-IN")} – ${details.billingPeriodEnd.toLocaleDateString("en-IN")}`,
  );
  row("Plan", `${details.plan} (${details.billing})`);
  row("Payment method", details.paymentMethodSummary || "-");

  curY += 4;
  doc.setDrawColor(...borderGray);
  doc.line(marginX, curY, marginX + contentW, curY);
  curY += 10;

  doc.setTextColor(...textDark);
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Amount Paid", marginX, curY);
  doc.setTextColor(...accentGreen);
  doc.setFontSize(13);
  doc.text(formatINR(details.amountPaise / 100), marginX + contentW, curY, {
    align: "right",
  });
  curY += 16;

  doc.setTextColor(...textGray);
  doc.setFontSize(8);
  doc.setFont("helvetica", "normal");
  doc.text("-- This is a system-generated invoice. --", pageW / 2, curY, {
    align: "center",
  });

  return Buffer.from(doc.output("arraybuffer"));
}
