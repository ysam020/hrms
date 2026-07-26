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

// Fixed Basic/HRA/Conveyance split of gross used whenever there's no
// existing structure to scale from — matches the payroll module's own
// fallback for employees with no configured rates (see the
// `emp.salaryBasicPay != null ? ... : Math.round(gross * 0.5)` /
// `* 0.25` / `* 0.25` branch in payroll.ts's line-item builder), so a
// fresh hire's default split agrees with what payroll would compute if it
// ever had to fall back for them.
const DEFAULT_GROSS_SHARE: Record<string, number> = {
  BASIC: 0.5,
  HRA: 0.25,
  CONVEYANCE: 0.25,
};

/**
 * Solves for the earnings total (Basic+HRA+Conveyance+...) that, once the
 * locked/derived deductions computeSalaryComponents would compute from it
 * are added back on, sums to exactly `targetTotal` — so "Monthly Gross
 * Salary" means the same thing everywhere in the app: the full sum of every
 * component (earnings AND PF/ESI/PT), not just the earnings alone.
 *
 * Each locked component (earning or deduction — the same rule
 * computeSalaryComponents uses, which doesn't distinguish by type either) is
 * linear in either `targetTotal` directly (percentOf "gross", and PT's
 * slab/fixed lookup — both independent of how earnings get split) or in
 * Basic (percentOf "basic", e.g. PF) — and Basic is always a fixed
 * `basicShare` fraction of the earnings total by construction (see
 * redistributeGross), so this reduces to one linear equation:
 * E + independent + basicDependentRate * basicShare * E = target,
 * i.e. E = (target - independent) / (1 + basicDependentRate * basicShare).
 */
function computeGrossUpEarnings(
  targetTotal: number,
  components: SalaryComponentDef[],
  basicShare: number,
  ptSlabs: PtSlab[],
  workState: string | null | undefined,
): number {
  let independent = 0;
  let basicDependentRate = 0;

  for (const c of components) {
    if (c.code === "PT" && c.calcType === "fixed") {
      const slab = findPtSlab(ptSlabs, workState, targetTotal);
      independent += slab ? slab.monthlyPT : (c.percentValue ?? 0);
      continue;
    }
    if (c.calcType === "percent_of_basic") {
      const rate = (c.percentValue ?? 0) / 100;
      if (c.percentOf === "gross") {
        independent += targetTotal * rate;
      } else {
        basicDependentRate += rate;
      }
    }
  }

  const denominator = 1 + basicDependentRate * basicShare;
  const earnings =
    denominator > 0
      ? (targetTotal - independent) / denominator
      : targetTotal - independent;
  return Math.max(0, earnings);
}

/**
 * Redistributes a newly-typed target gross salary across the currently
 * unlocked earning components, preserving their existing relative ratios,
 * after first grossing up for the locked deductions (PF/ESI/PT) that will be
 * derived from the result — so Basic+HRA+Conveyance+...+PF+ESI+PT always
 * sums back to `newGross`, not just the earning components alone. Backs the
 * editable Gross Salary field in the Employee/Salary modules.
 *
 * If nothing is set yet (fresh structure, sum = 0), seeds the standard
 * Basic/HRA/Conveyance 50/25/25 split (see DEFAULT_GROSS_SHARE above) when
 * those components exist; otherwise falls back to putting 100% into the
 * first earning component (by displayOrder) and leaving the rest at 0 for
 * HR to split manually, for tenants whose components don't include any of
 * the standard three.
 *
 * Locked earning components (e.g. a tenant-configured percent_of_basic
 * allowance) are left untouched here — they're recomputed separately by
 * computeSalaryComponents off the resulting Basic/gross.
 */
export function redistributeGross(
  newGross: number,
  components: SalaryComponentDef[],
  currentValues: Record<string, number>,
  lockedKeys: Set<string>,
  ptSlabs: PtSlab[] = [],
  workState?: string | null,
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
  const usesDefaultShare =
    currentSum <= 0 && earningCodes.some((code) => code in DEFAULT_GROSS_SHARE);
  const basicShare =
    currentSum > 0
      ? (currentValues.BASIC ?? 0) / currentSum
      : usesDefaultShare
        ? (DEFAULT_GROSS_SHARE.BASIC ?? 0)
        : 0;

  const earningsTotal = computeGrossUpEarnings(
    newGross,
    components,
    basicShare,
    ptSlabs,
    workState,
  );

  if (currentSum > 0) {
    const scale = earningsTotal / currentSum;
    for (const code of earningCodes) {
      result[code] = Math.round((currentValues[code] ?? 0) * scale);
    }
  } else if (usesDefaultShare) {
    for (const code of earningCodes) {
      result[code] = Math.round(
        earningsTotal * (DEFAULT_GROSS_SHARE[code] ?? 0),
      );
    }
  } else {
    earningCodes.forEach((code, i) => {
      result[code] = i === 0 ? Math.round(earningsTotal) : 0;
    });
  }

  return result;
}
