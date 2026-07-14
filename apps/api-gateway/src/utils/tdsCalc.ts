export interface IncomeTaxSlabRow {
  regime: "old" | "new";
  minIncome: number;
  maxIncome: number | null;
  ratePercent: number;
}

/** FY2025-26 New Regime slabs — the last Union Budget this can be verified
 * against. Tenants add/edit IncomeTaxSlab rows in Settings once a later
 * Budget changes these, exactly like ProfessionalTaxSlab. */
export const NEW_REGIME_SLAB_FALLBACK: IncomeTaxSlabRow[] = [
  { regime: "new", minIncome: 0, maxIncome: 400000, ratePercent: 0 },
  { regime: "new", minIncome: 400000, maxIncome: 800000, ratePercent: 5 },
  { regime: "new", minIncome: 800000, maxIncome: 1200000, ratePercent: 10 },
  { regime: "new", minIncome: 1200000, maxIncome: 1600000, ratePercent: 15 },
  { regime: "new", minIncome: 1600000, maxIncome: 2000000, ratePercent: 20 },
  { regime: "new", minIncome: 2000000, maxIncome: 2400000, ratePercent: 25 },
  { regime: "new", minIncome: 2400000, maxIncome: null, ratePercent: 30 },
];

/** FY2025-26 Old Regime slabs (unchanged for many years pre-2025). */
export const OLD_REGIME_SLAB_FALLBACK: IncomeTaxSlabRow[] = [
  { regime: "old", minIncome: 0, maxIncome: 250000, ratePercent: 0 },
  { regime: "old", minIncome: 250000, maxIncome: 500000, ratePercent: 5 },
  { regime: "old", minIncome: 500000, maxIncome: 1000000, ratePercent: 20 },
  { regime: "old", minIncome: 1000000, maxIncome: null, ratePercent: 30 },
];

const NEW_REGIME_STANDARD_DEDUCTION = 75000;
const OLD_REGIME_STANDARD_DEDUCTION = 50000;

// Sec 87A rebate — both thresholds happen to zero out tax exactly at the
// cliff (12L taxable produces exactly ₹60,000 new-regime slab tax; 5L taxable
// produces exactly ₹12,500 old-regime slab tax), so "nil tax at/below this
// taxable income" is exact here, not an approximation. Marginal relief just
// above the cliff is not modeled. Exported so callers (e.g. the TDS
// worksheet PDF) can print the explanatory note without duplicating figures.
export const NEW_REGIME_REBATE_THRESHOLD = 1200000;
export const OLD_REGIME_REBATE_THRESHOLD = 500000;
export const NEW_REGIME_MAX_REBATE = 60000;
export const OLD_REGIME_MAX_REBATE = 12500;

/** Apr(4)–Mar(3) financial year, e.g. getFinancialYear(1, 2026) === "2025-26". */
export function getFinancialYear(month: number, year: number): string {
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

/** Months left in the financial year, including the given (calendar) month itself. */
export function remainingMonthsInFinancialYear(
  month: number,
  year: number,
): number {
  return month >= 4 ? 12 - month + 1 + 3 : 3 - month + 1;
}

/** Sec 288A/288B — Income Tax Act requires taxable income and final tax
 * payable to be rounded to the nearest ₹10, not the nearest rupee. */
export function roundToNearest10(n: number): number {
  return Math.round(n / 10) * 10;
}

export function resolveEffectiveSlabs(
  regime: "old" | "new",
  slabs: IncomeTaxSlabRow[],
): IncomeTaxSlabRow[] {
  const regimeSlabs = slabs.filter((s) => s.regime === regime);
  return regimeSlabs.length > 0
    ? regimeSlabs
    : regime === "new"
      ? NEW_REGIME_SLAB_FALLBACK
      : OLD_REGIME_SLAB_FALLBACK;
}

export interface SlabTaxRow {
  minIncome: number;
  maxIncome: number | null;
  ratePercent: number;
  taxableInSlab: number;
  taxAmount: number;
}

export interface AnnualTaxBreakdown {
  slabRows: SlabTaxRow[];
  taxOnTotalIncome: number;
  rebate: number;
  totalTaxOnIncome: number;
  cess: number;
  taxPayable: number;
}

/** Slab-by-slab tax breakdown + Sec 87A rebate + 4% Health & Education Cess,
 * with Sec 288A/288B rounding applied at each stage — the same figures a
 * printed TDS worksheet itemizes, not just the final number. */
export function calcAnnualTaxBreakdown(
  taxableAnnualIncome: number,
  slabs: IncomeTaxSlabRow[],
  regime: "old" | "new",
): AnnualTaxBreakdown {
  const roundedTaxableIncome = roundToNearest10(
    Math.max(0, taxableAnnualIncome),
  );

  const slabRows: SlabTaxRow[] = [];
  let slabTaxTotal = 0;
  for (const slab of slabs) {
    if (roundedTaxableIncome <= slab.minIncome) continue;
    const upper =
      slab.maxIncome != null
        ? Math.min(roundedTaxableIncome, slab.maxIncome)
        : roundedTaxableIncome;
    const taxableInSlab = upper - slab.minIncome;
    if (taxableInSlab <= 0) continue;
    const taxAmount = taxableInSlab * (slab.ratePercent / 100);
    slabRows.push({
      minIncome: slab.minIncome,
      maxIncome: slab.maxIncome,
      ratePercent: slab.ratePercent,
      taxableInSlab,
      taxAmount,
    });
    slabTaxTotal += taxAmount;
  }

  const taxOnTotalIncome = roundToNearest10(slabTaxTotal);
  const rebateThreshold =
    regime === "new"
      ? NEW_REGIME_REBATE_THRESHOLD
      : OLD_REGIME_REBATE_THRESHOLD;
  // Both thresholds happen to zero out tax exactly at the cliff, so "nil tax
  // at/below this taxable income" is exact here, not an approximation.
  //
  // Sec 87A marginal relief: just above the cliff, the law caps total tax at
  // (taxable income − threshold) rather than letting a ₹100 raise trigger the
  // full slab tax — without this, someone earning ₹100 over the ₹12L/₹5L
  // cliff would owe the full ~₹60,000/₹12,500 slab tax on that ₹100. Relief
  // phases out once the excess-over-threshold exceeds the normal slab tax.
  let rebate: number;
  if (roundedTaxableIncome <= rebateThreshold) {
    rebate = taxOnTotalIncome;
  } else {
    const excessOverThreshold = roundedTaxableIncome - rebateThreshold;
    rebate =
      taxOnTotalIncome > excessOverThreshold
        ? taxOnTotalIncome - excessOverThreshold
        : 0;
  }
  const totalTaxOnIncome = taxOnTotalIncome - rebate;
  const cess = roundToNearest10(totalTaxOnIncome * 0.04);
  const taxPayable = roundToNearest10(totalTaxOnIncome + cess);

  return {
    slabRows,
    taxOnTotalIncome,
    rebate,
    totalTaxOnIncome,
    cess,
    taxPayable,
  };
}

/** Slab tax + 4% Health & Education Cess, with the Sec 87A rebate cliff applied. */
export function calcAnnualIncomeTax(
  taxableAnnualIncome: number,
  slabs: IncomeTaxSlabRow[],
  regime: "old" | "new",
): number {
  return calcAnnualTaxBreakdown(taxableAnnualIncome, slabs, regime).taxPayable;
}

/** Sec 10(13A) HRA exemption = min(HRA received, rent - 10% of basic, 50%/40% of basic). */
export function calcHraExemption(
  annualBasic: number,
  annualHraReceived: number,
  monthlyRent: number | null | undefined,
  isMetroCity: boolean | null | undefined,
): number {
  if (!monthlyRent || monthlyRent <= 0) return 0;
  const annualRentPaid = monthlyRent * 12;
  const rentMinusTenPctBasic = Math.max(0, annualRentPaid - 0.1 * annualBasic);
  const pctOfBasic = (isMetroCity ? 0.5 : 0.4) * annualBasic;
  return Math.max(
    0,
    Math.min(annualHraReceived, rentMinusTenPctBasic, pctOfBasic),
  );
}

export interface TaxDeclarationLineItem {
  code: string;
  declaredAmount: number;
  proofAmount?: number | null;
}

function effectiveAmount(
  lineItems: TaxDeclarationLineItem[],
  code: string,
): number {
  const item = lineItems.find((i) => i.code === code);
  if (!item) return 0;
  return item.proofAmount ?? item.declaredAmount ?? 0;
}

/** Chapter VI-A deductions (80C/80D/24b/80CCD(1B)/other), Old Regime only.
 * Sec 80D uses the flat non-senior-citizen caps (₹25,000 each for self and
 * parents) — the senior-citizen ₹50,000 bump would need a DOB on the
 * declaration, out of scope for this pass. */
export function calcOldRegimeDeductions(
  lineItems: TaxDeclarationLineItem[] = [],
): number {
  const sec80c = Math.min(effectiveAmount(lineItems, "SEC80C"), 150000);
  const sec80dSelf = Math.min(effectiveAmount(lineItems, "SEC80D_SELF"), 25000);
  const sec80dParents = Math.min(
    effectiveAmount(lineItems, "SEC80D_PARENTS"),
    25000,
  );
  const homeLoanInterest = Math.min(
    effectiveAmount(lineItems, "HOME_LOAN_INTEREST"),
    200000,
  );
  const nps = Math.min(effectiveAmount(lineItems, "NPS_80CCD1B"), 50000);
  const other = effectiveAmount(lineItems, "OTHER");
  return sec80c + sec80dSelf + sec80dParents + homeLoanInterest + nps + other;
}

export interface TdsDeclarationInput {
  lineItems?: TaxDeclarationLineItem[];
  monthlyRent?: number | null;
  isMetroCity?: boolean | null;
}

/**
 * Computes this month's TDS withholding — a thin wrapper around
 * computeTdsWorksheet (see below), which does the real per-component work:
 * projects full-year income (YTD actual + current month × months remaining,
 * excluding non-recurring components like a one-time bonus from the
 * projection), computes the annual liability net of any Old Regime
 * declaration, subtracts what's already been withheld this year, and spreads
 * the remainder evenly over the remaining months. Re-run every payroll cycle
 * so a mid-year raise, bonus, or new declaration/proof is trued up rather
 * than compounding an earlier estimate.
 *
 * This used to be a separate aggregate-gross implementation that multiplied
 * the *whole* month's gross (bonus included) by every remaining month — kept
 * as a wrapper now specifically so the withholding path and the worksheet
 * display can never diverge again the way they did before.
 */
export function calcMonthlyTds(input: TdsWorksheetInput): number {
  return computeTdsWorksheet(input).tdsThisMonth;
}

// ─── TDS Work Sheet (full itemized breakdown, one PDF per employee/month) ──────

export interface WorksheetComponentInput {
  code: string;
  label: string;
  thisMonthAmount: number;
  /** false = one-time (e.g. a bonus) — not projected into the remaining months. */
  isRecurring: boolean;
}

export interface WorksheetComponentRow extends WorksheetComponentInput {
  /** Cumulative amount paid this financial year through (and including) this month. */
  actual: number;
  /** Projected amount for the remaining months after this one (0 if not recurring). */
  projection: number;
  total: number;
}

export interface EarningsLineItemRow {
  componentBreakdown?: { code: string; type: string; amount: number }[] | null;
  basicPay?: number | null;
  hra?: number | null;
  conveyance?: number | null;
  incentive?: number | null;
}

const LEGACY_EARNING_CODE_TO_FIELD: Record<string, keyof EarningsLineItemRow> =
  {
    BASIC: "basicPay",
    HRA: "hra",
    CONVEYANCE: "conveyance",
    INCENTIVE: "incentive",
  };

/** Sums prior finalized PayrollLineItem rows per earning code — same shape as
 * componentBreakdown when a tenant has configured components, else the
 * legacy fixed BASIC/HRA/CONVEYANCE/INCENTIVE columns. */
export function aggregateEarningsByCode(
  lineItems: EarningsLineItemRow[],
): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const li of lineItems) {
    if (
      Array.isArray(li.componentBreakdown) &&
      li.componentBreakdown.length > 0
    ) {
      for (const c of li.componentBreakdown) {
        if (c.type !== "earning") continue;
        totals[c.code] = (totals[c.code] ?? 0) + (Number(c.amount) || 0);
      }
    } else {
      for (const [code, field] of Object.entries(
        LEGACY_EARNING_CODE_TO_FIELD,
      )) {
        const amt = Number(li[field]) || 0;
        if (amt) totals[code] = (totals[code] ?? 0) + amt;
      }
    }
  }
  return totals;
}

// Same labels/recurring-ness the payslip and TDS worksheet have always used
// for these codes — the freeform legacy "incentive" field is one-time, same
// as the reasoning in aggregateEarningsByCode above.
const LEGACY_EARNING_DEFS: {
  code: string;
  label: string;
  isRecurring: boolean;
}[] = [
  { code: "BASIC", label: "Basic Pay", isRecurring: true },
  { code: "HRA", label: "HRA", isRecurring: true },
  { code: "CONVEYANCE", label: "Conveyance Allowance", isRecurring: true },
  { code: "INCENTIVE", label: "Incentive", isRecurring: false },
];

export interface ComponentDefRow {
  code: string;
  name?: string | null;
  isRecurring?: boolean | null;
}

/**
 * Builds this month's per-component TDS input from either a tenant's
 * componentBreakdown (custom components) or the legacy fixed BASIC/HRA/
 * CONVEYANCE/INCENTIVE columns — the single place this mapping happens, so
 * the withholding calc (calcMonthlyTds), the TDS worksheet, and Form 16 read
 * it identically instead of each re-deriving it (and risking drift, as
 * happened before calcMonthlyTds was rewritten to reuse computeTdsWorksheet).
 */
export function buildThisMonthComponents(
  componentBreakdown:
    | { code: string; name?: string; type: string; amount: number }[]
    | null
    | undefined,
  legacySource: {
    basicPay?: number | null;
    hra?: number | null;
    conveyance?: number | null;
    incentive?: number | null;
  },
  componentDefs: ComponentDefRow[],
): WorksheetComponentInput[] {
  const defByCode = new Map(componentDefs.map((d) => [d.code, d]));
  if (componentBreakdown?.length) {
    return componentBreakdown
      .filter((c) => c.type === "earning")
      .map((c) => ({
        code: c.code,
        label: c.name || defByCode.get(c.code)?.name || c.code,
        thisMonthAmount: Math.round(c.amount ?? 0),
        isRecurring: defByCode.get(c.code)?.isRecurring ?? true,
      }));
  }
  return LEGACY_EARNING_DEFS.map((d) => ({
    code: d.code,
    label: d.label,
    thisMonthAmount: Math.round(
      Number(
        legacySource[
          LEGACY_EARNING_CODE_TO_FIELD[d.code] as keyof typeof legacySource
        ],
      ) || 0,
    ),
    isRecurring: d.isRecurring,
  })).filter((c) => c.thisMonthAmount > 0 || c.code !== "INCENTIVE");
}

export interface TdsWorksheetInput {
  regime: "old" | "new";
  /** This month's per-code earning amounts (must include BASIC/HRA for the
   * Old Regime HRA exemption to compute against the right annualized base). */
  components: WorksheetComponentInput[];
  /** Prior months' sums this financial year, per code (aggregateEarningsByCode). */
  ytdByCode: Record<string, number>;
  ytdTds: number;
  /** Same convention as calcMonthlyTds — counts this month as month 1 of "remaining". */
  remainingMonths: number;
  slabs: IncomeTaxSlabRow[];
  declaration?: TdsDeclarationInput;
}

export interface TdsWorksheetResult {
  earnings: WorksheetComponentRow[];
  totalIncome: number;
  exemptionUnderSection10: number;
  totalAfterExemption: number;
  /** Out of scope this pass — see tdsCalc.ts module notes. Always 0. */
  previousEmploymentIncome: number;
  grossTotal: number;
  standardDeduction: number;
  incomeChargeableUnderSalaries: number;
  /** Out of scope this pass (house property / other sources). Always 0. */
  otherIncome: number;
  grossTotalIncome: number;
  chapterVIADeduction: number;
  totalIncomeRounded: number;
  slabRows: SlabTaxRow[];
  taxOnTotalIncome: number;
  rebate: number;
  totalTaxOnIncome: number;
  /** Out of scope this pass (Sec 89 arrears relief). Always 0. */
  reliefSection89: number;
  /** Out of scope this pass (only relevant above ₹50L annual income). Always 0. */
  surcharge: number;
  cess: number;
  taxPayable: number;
  tdsTillLastMonth: number;
  tdsThisMonth: number;
  /** Out of scope this pass — tied to previousEmploymentIncome. Always 0. */
  tdsByPreviousEmployer: number;
  totalTdsDeducted: number;
  taxPayableOrRefundable: number;
  /** Same figure as tdsThisMonth — the model assumes flat pay for the rest
   * of the year, so there's nothing that would make the two differ. */
  tdsPerMonthGoingForward: number;
}

/**
 * The full itemized TDS Work Sheet computation — same "projected annual
 * income, true up against what's already withheld" model as calcMonthlyTds,
 * but broken out per earning component and exposing every intermediate
 * figure a printed worksheet itemizes (Sec 10 exemption, Chapter VI-A,
 * slab-by-slab tax, rebate, cess, TDS-so-far vs. TDS-this-month).
 */
export function computeTdsWorksheet(
  input: TdsWorksheetInput,
): TdsWorksheetResult {
  const {
    regime,
    components,
    ytdByCode,
    ytdTds,
    remainingMonths,
    slabs,
    declaration,
  } = input;

  const earnings: WorksheetComponentRow[] = components.map((c) => {
    const actual = (ytdByCode[c.code] ?? 0) + c.thisMonthAmount;
    const projection = c.isRecurring
      ? c.thisMonthAmount * Math.max(0, remainingMonths - 1)
      : 0;
    return { ...c, actual, projection, total: actual + projection };
  });

  const totalIncome = earnings.reduce((s, r) => s + r.total, 0);
  const annualBasic = earnings.find((r) => r.code === "BASIC")?.total ?? 0;
  const annualHra = earnings.find((r) => r.code === "HRA")?.total ?? 0;

  const exemptionUnderSection10 =
    regime === "old" && declaration
      ? calcHraExemption(
          annualBasic,
          annualHra,
          declaration.monthlyRent,
          declaration.isMetroCity,
        )
      : 0;
  const totalAfterExemption = totalIncome - exemptionUnderSection10;

  const previousEmploymentIncome = 0;
  const grossTotal = totalAfterExemption + previousEmploymentIncome;

  const standardDeduction =
    regime === "new"
      ? NEW_REGIME_STANDARD_DEDUCTION
      : OLD_REGIME_STANDARD_DEDUCTION;
  const incomeChargeableUnderSalaries = Math.max(
    0,
    grossTotal - standardDeduction,
  );

  const otherIncome = 0;
  const grossTotalIncome = incomeChargeableUnderSalaries + otherIncome;

  const chapterVIADeduction =
    regime === "old" && declaration
      ? calcOldRegimeDeductions(declaration.lineItems ?? [])
      : 0;

  const totalIncomeRounded = roundToNearest10(
    Math.max(0, grossTotalIncome - chapterVIADeduction),
  );

  const effectiveSlabs = resolveEffectiveSlabs(regime, slabs);
  const breakdown = calcAnnualTaxBreakdown(
    totalIncomeRounded,
    effectiveSlabs,
    regime,
  );

  const reliefSection89 = 0;
  const surcharge = 0;
  const taxPayable = Math.max(0, breakdown.taxPayable - reliefSection89);

  const tdsByPreviousEmployer = 0;
  const remainingLiability = Math.max(0, taxPayable - ytdTds);
  const tdsThisMonth =
    remainingMonths > 0 ? Math.round(remainingLiability / remainingMonths) : 0;
  const totalTdsDeducted = ytdTds + tdsThisMonth + tdsByPreviousEmployer;

  return {
    earnings,
    totalIncome,
    exemptionUnderSection10,
    totalAfterExemption,
    previousEmploymentIncome,
    grossTotal,
    standardDeduction,
    incomeChargeableUnderSalaries,
    otherIncome,
    grossTotalIncome,
    chapterVIADeduction,
    totalIncomeRounded,
    slabRows: breakdown.slabRows,
    taxOnTotalIncome: breakdown.taxOnTotalIncome,
    rebate: breakdown.rebate,
    totalTaxOnIncome: breakdown.totalTaxOnIncome,
    reliefSection89,
    surcharge,
    cess: breakdown.cess,
    taxPayable,
    tdsTillLastMonth: ytdTds,
    tdsThisMonth,
    tdsByPreviousEmployer,
    totalTdsDeducted,
    taxPayableOrRefundable: taxPayable - totalTdsDeducted,
    tdsPerMonthGoingForward: tdsThisMonth,
  };
}

// ─── Form 16 Part B (annual salary/tax certificate) ────────────────────────────

export interface Form16ComponentRow {
  code: string;
  label: string;
  /** Sum of this component's amount across every disbursed month this financial year. */
  annualAmount: number;
}

export interface Form16Input {
  regime: "old" | "new";
  /** Full-FY actual sums per earning code (aggregateEarningsByCode across every
   * disbursed PayrollLineItem this financial year) — no projection, this is
   * either the complete year or an explicitly-marked-provisional partial one. */
  components: Form16ComponentRow[];
  /** Actual tds already withheld, summed across every disbursed PayrollLineItem this FY. */
  totalTdsDeducted: number;
  slabs: IncomeTaxSlabRow[];
  declaration?: TdsDeclarationInput;
}

export interface Form16Result {
  earnings: Form16ComponentRow[];
  grossSalary: number;
  exemptionUnderSection10: number;
  totalAfterExemption: number;
  standardDeduction: number;
  incomeChargeableUnderSalaries: number;
  chapterVIADeduction: number;
  totalIncomeRounded: number;
  slabRows: SlabTaxRow[];
  taxOnTotalIncome: number;
  rebate: number;
  totalTaxOnIncome: number;
  cess: number;
  taxPayable: number;
  totalTdsDeducted: number;
  /** Positive = still owed by the employee, negative = refund due. */
  taxPayableOrRefundable: number;
}

/**
 * Annual salary/tax certificate — same slab/exemption/deduction machinery as
 * calcMonthlyTds/computeTdsWorksheet, but against full-year actual totals
 * instead of a YTD-plus-projection estimate, and comparing against what was
 * actually withheld (totalTdsDeducted) rather than a projected monthly split.
 */
export function computeForm16(input: Form16Input): Form16Result {
  const { regime, components, totalTdsDeducted, slabs, declaration } = input;

  const grossSalary = components.reduce((s, c) => s + c.annualAmount, 0);
  const annualBasic =
    components.find((c) => c.code === "BASIC")?.annualAmount ?? 0;
  const annualHra = components.find((c) => c.code === "HRA")?.annualAmount ?? 0;

  const exemptionUnderSection10 =
    regime === "old" && declaration
      ? calcHraExemption(
          annualBasic,
          annualHra,
          declaration.monthlyRent,
          declaration.isMetroCity,
        )
      : 0;
  const totalAfterExemption = grossSalary - exemptionUnderSection10;

  const standardDeduction =
    regime === "new"
      ? NEW_REGIME_STANDARD_DEDUCTION
      : OLD_REGIME_STANDARD_DEDUCTION;
  const incomeChargeableUnderSalaries = Math.max(
    0,
    totalAfterExemption - standardDeduction,
  );

  const chapterVIADeduction =
    regime === "old" && declaration
      ? calcOldRegimeDeductions(declaration.lineItems ?? [])
      : 0;

  const totalIncomeRounded = roundToNearest10(
    Math.max(0, incomeChargeableUnderSalaries - chapterVIADeduction),
  );

  const effectiveSlabs = resolveEffectiveSlabs(regime, slabs);
  const breakdown = calcAnnualTaxBreakdown(
    totalIncomeRounded,
    effectiveSlabs,
    regime,
  );
  const taxPayable = breakdown.taxPayable;

  return {
    earnings: components,
    grossSalary,
    exemptionUnderSection10,
    totalAfterExemption,
    standardDeduction,
    incomeChargeableUnderSalaries,
    chapterVIADeduction,
    totalIncomeRounded,
    slabRows: breakdown.slabRows,
    taxOnTotalIncome: breakdown.taxOnTotalIncome,
    rebate: breakdown.rebate,
    totalTaxOnIncome: breakdown.totalTaxOnIncome,
    cess: breakdown.cess,
    taxPayable,
    totalTdsDeducted,
    taxPayableOrRefundable: taxPayable - totalTdsDeducted,
  };
}
