// Legacy fixed-column mapping — kept in sync so anything still reading the
// flat basicPay/hra/... columns (User denormalized fields, payroll's
// fixed-column fallback path) continues to work. INCENTIVE/OTHER_DEDUCTIONS
// are pseudo-codes standing in for the old freeform incentive/deductions
// fields, which aren't part of SalaryComponentDefinition.
const LEGACY_CODE_TO_KEY: Record<string, string> = {
  BASIC: "basicPay",
  HRA: "hra",
  CONVEYANCE: "conveyance",
  PF: "pf",
  ESI: "esi",
  PT: "pt",
  INCENTIVE: "incentive",
  OTHER_DEDUCTIONS: "deductions",
};

export interface ComponentAmountInput {
  code: string;
  name?: string;
  type: string; // "earning" | "deduction"
  amount: number | string;
}

export function deriveFromComponents(components: ComponentAmountInput[]) {
  const legacy: Record<string, number> = {
    basicPay: 0,
    hra: 0,
    conveyance: 0,
    incentive: 0,
    pf: 0,
    esi: 0,
    pt: 0,
    deductions: 0,
  };
  let grossEarnings = 0;
  let totalDeductions = 0;

  for (const c of components) {
    const amt = parseFloat(String(c.amount)) || 0;
    const legacyKey = LEGACY_CODE_TO_KEY[c.code];
    if (legacyKey) legacy[legacyKey] = amt;

    if (c.type === "earning") grossEarnings += amt;
    else if (c.type === "deduction") totalDeductions += amt;
  }

  return { legacy, grossEarnings, totalDeductions };
}

// The salary.proto SalaryStructure message field is named `components`
// (matching CreateSalaryRequest/UpdateSalaryRequest), while the Prisma
// column is `componentBreakdown`. ts-proto's generated encode() only reads
// fields by their exact proto name, so a raw Prisma row passed straight
// through a gRPC callback silently loses componentBreakdown on the wire —
// every salary-service handler that returns a SalaryStructure row must
// route it through this before handing it to `callback()`.
export function toWireSalaryStructure<T extends object>(
  row: T,
): T & { components: unknown } {
  const componentBreakdown = (row as { componentBreakdown?: unknown })
    .componentBreakdown;
  return { ...row, components: componentBreakdown ?? [] };
}
