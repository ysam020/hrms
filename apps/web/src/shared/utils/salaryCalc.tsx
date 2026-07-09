export interface SalaryComponentDef {
  id: string;
  code: string;
  name: string;
  type: "earning" | "deduction";
  calcType: "fixed" | "percent_of_basic" | "formula";
  percentOf?: "basic" | "gross" | null;
  percentValue?: number | null;
  isStatutory: boolean;
  displayOrder: number;
}

export interface PtSlab {
  id: string;
  state: string;
  minGross: number;
  maxGross: number | null;
  monthlyPT: number;
}

// Maps the six standard component DB codes (SalaryComponentDefinition.code)
// to the flat `salaryStructure.{basicPay,hra,conveyance,pf,esi,pt}` key shape
// used throughout the employee/salary UIs and the SalaryStructure model.
export const CODE_TO_KEY: Record<string, string> = {
  BASIC: "basicPay",
  HRA: "hra",
  CONVEYANCE: "conveyance",
  PF: "pf",
  ESI: "esi",
  PT: "pt",
};

// Pseudo-components standing in for the old freeform incentive/deductions
// fields, which aren't part of SalaryComponentDefinition. Appended after the
// tenant's real components so they always sort last.
export const PSEUDO_COMPONENTS: SalaryComponentDef[] = [
  {
    id: "pseudo-incentive",
    code: "INCENTIVE",
    name: "Incentive",
    type: "earning",
    calcType: "fixed",
    isStatutory: false,
    displayOrder: 1000,
  },
  {
    id: "pseudo-other-deductions",
    code: "OTHER_DEDUCTIONS",
    name: "Deductions",
    type: "deduction",
    calcType: "fixed",
    isStatutory: false,
    displayOrder: 1001,
  },
];

/** Active tenant components (sorted) + the incentive/deductions pseudo-rows. */
export function getMergedComponents(
  tenantComponents: SalaryComponentDef[],
): SalaryComponentDef[] {
  return [
    ...tenantComponents
      .filter((c) => c.code !== "INCENTIVE" && c.code !== "OTHER_DEDUCTIONS")
      .slice()
      .sort((a, b) => a.displayOrder - b.displayOrder),
    ...PSEUDO_COMPONENTS,
  ];
}

const KEY_TO_CODE: Record<string, string> = {
  ...Object.fromEntries(
    Object.entries(CODE_TO_KEY).map(([code, key]) => [key, code]),
  ),
  incentive: "INCENTIVE",
  deductions: "OTHER_DEDUCTIONS",
};

/**
 * Converts a legacy fixed-column salary structure (basicPay/hra/.../
 * incentive/deductions) into a code-keyed values map — used as the fallback
 * when an employee's SalaryStructure row predates componentBreakdown.
 */
export function legacyFieldsToComponentValues(
  data: Record<string, unknown> | null | undefined,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!data) return result;
  for (const [key, code] of Object.entries(KEY_TO_CODE)) {
    if (data[key] != null) result[code] = Number(data[key]) || 0;
  }
  return result;
}

/** Converts a componentBreakdown wire array into a code-keyed values map. */
export function componentsArrayToValues(
  components: { code: string; amount: number | string }[] | null | undefined,
): Record<string, number> {
  const result: Record<string, number> = {};
  if (!components) return result;
  for (const c of components) result[c.code] = Number(c.amount) || 0;
  return result;
}

interface ComputeArgs {
  basicPay: number;
  grossSalary: number;
  components: SalaryComponentDef[];
  ptSlabs?: PtSlab[];
  workState?: string | null;
}

interface ComputeResult {
  /** Derived values for components that are computed rather than manually entered. */
  values: Record<string, number>;
  /** Component codes whose input should be disabled — they're auto-derived. */
  locked: Set<string>;
}

function findPtSlab(
  ptSlabs: PtSlab[],
  workState: string | null | undefined,
  grossSalary: number,
): PtSlab | undefined {
  if (!workState) return undefined;
  return ptSlabs.find(
    (s) =>
      s.state === workState &&
      grossSalary >= s.minGross &&
      (s.maxGross == null || grossSalary <= s.maxGross),
  );
}

/**
 * Derives auto-computed salary component values from the tenant's configured
 * SalaryComponentDefinition rows (+ ProfessionalTaxSlab for PT), replacing
 * what used to be separate hardcoded formulas duplicated across the employee
 * module, salary module, and payslip PDF generator.
 *
 * PT is always treated as derived (slab match if the tenant has configured
 * one for the employee's workState + gross, else the PT component's own
 * fixed value) unless a tenant has explicitly reconfigured its calcType away
 * from "fixed". Any component with calcType "percent_of_basic" is derived
 * from basic or gross pay per its percentOf. Everything else — including
 * Basic/HRA/Conveyance by default — stays manual entry, matching prior
 * behavior exactly for tenants who haven't customized rates.
 *
 * Keyed by `component.code` directly (not remapped through CODE_TO_KEY), so
 * custom/non-standard components a tenant defines get a slot too instead of
 * being silently dropped.
 */
export function computeSalaryComponents({
  basicPay,
  grossSalary,
  components,
  ptSlabs = [],
  workState,
}: ComputeArgs): ComputeResult {
  const values: Record<string, number> = {};
  const locked = new Set<string>();

  for (const c of components) {
    if (c.code === "PT" && c.calcType === "fixed") {
      const slab = findPtSlab(ptSlabs, workState, grossSalary);
      values[c.code] = slab ? slab.monthlyPT : (c.percentValue ?? 0);
      locked.add(c.code);
      continue;
    }

    if (c.calcType === "percent_of_basic") {
      const base = c.percentOf === "gross" ? grossSalary : basicPay;
      values[c.code] = Math.round(base * ((c.percentValue ?? 0) / 100));
      locked.add(c.code);
    }
    // calcType "fixed" (non-PT) or "formula" (not yet supported): manual entry.
  }

  return { values, locked };
}

/**
 * Redistributes a newly-typed target gross salary across the currently
 * unlocked earning components, preserving their existing relative ratios —
 * backs the editable Gross Salary field in the Employee/Salary modules. If
 * nothing is set yet (fresh structure, sum = 0), puts 100% into the first
 * earning component (by displayOrder) and leaves the rest at 0 for HR to
 * split manually, same pattern the old attendance-based default used.
 *
 * Locked earning components (e.g. a tenant-configured percent_of_basic
 * allowance) are left untouched here — they're recomputed separately by
 * computeSalaryComponents off the resulting Basic/gross, so the actual
 * gross may drift slightly from `newGross` in that (rare) configuration.
 */
export function redistributeGross(
  newGross: number,
  components: SalaryComponentDef[],
  currentValues: Record<string, number>,
  lockedKeys: Set<string>,
): Record<string, number> {
  const earningCodes = components
    .filter((c) => c.type === "earning" && !lockedKeys.has(c.code))
    .map((c) => c.code);

  const result: Record<string, number> = { ...currentValues };
  if (earningCodes.length === 0) return result;

  const currentSum = earningCodes.reduce(
    (sum, code) => sum + (currentValues[code] ?? 0),
    0,
  );

  if (currentSum > 0) {
    const scale = newGross / currentSum;
    for (const code of earningCodes) {
      result[code] = Math.round((currentValues[code] ?? 0) * scale);
    }
  } else {
    earningCodes.forEach((code, i) => {
      result[code] = i === 0 ? Math.round(newGross) : 0;
    });
  }

  return result;
}
