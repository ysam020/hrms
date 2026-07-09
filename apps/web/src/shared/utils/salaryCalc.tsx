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
  /** Keys (from CODE_TO_KEY) whose input should be disabled — they're auto-derived. */
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
    const key = CODE_TO_KEY[c.code];
    if (!key) continue; // custom/non-standard component — not yet applied to payroll

    if (c.code === "PT" && c.calcType === "fixed") {
      const slab = findPtSlab(ptSlabs, workState, grossSalary);
      values[key] = slab ? slab.monthlyPT : (c.percentValue ?? 0);
      locked.add(key);
      continue;
    }

    if (c.calcType === "percent_of_basic") {
      const base = c.percentOf === "gross" ? grossSalary : basicPay;
      values[key] = Math.round(base * ((c.percentValue ?? 0) / 100));
      locked.add(key);
    }
    // calcType "fixed" (non-PT) or "formula" (not yet supported): manual entry.
  }

  return { values, locked };
}
