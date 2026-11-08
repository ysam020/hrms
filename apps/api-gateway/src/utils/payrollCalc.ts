export interface ProfessionalTaxSlabRow {
  state: string;
  minGross: number;
  maxGross: number | null;
  monthlyPT: number;
}

/** Flat approximate slab used when a tenant hasn't configured state-wise PT. */
export function calcPtFallback(gross: number): number {
  if (gross < 6000) return 0;
  if (gross < 9000) return 80;
  if (gross < 12000) return 150;
  return 200;
}

/**
 * State-wise Professional Tax — looks up the employee's work-state slabs when
 * the tenant has configured them (Settings → Payroll Components), falling
 * back to the flat approximate slab for states/tenants that haven't. A
 * tenant with zero ProfessionalTaxSlab rows behaves identically to before
 * this existed.
 */
export function calcProfessionalTax(
  gross: number,
  workState: string | null | undefined,
  slabsByState: Map<string, ProfessionalTaxSlabRow[]>,
): number {
  const stateSlabs = workState ? slabsByState.get(workState) : undefined;
  if (!stateSlabs || stateSlabs.length === 0) return calcPtFallback(gross);
  const match = stateSlabs.find(
    (s) => gross >= s.minGross && (s.maxGross == null || gross <= s.maxGross),
  );
  return match ? match.monthlyPT : 0;
}

export function groupSlabsByState(
  slabs: ProfessionalTaxSlabRow[],
): Map<string, ProfessionalTaxSlabRow[]> {
  const map = new Map<string, ProfessionalTaxSlabRow[]>();
  for (const slab of slabs) {
    const list = map.get(slab.state) ?? [];
    list.push(slab);
    map.set(slab.state, list);
  }
  return map;
}

export interface ComponentRateRow {
  code: string; // e.g. "PF", "ESI"
  percentValue: number | null;
}

const DEFAULT_PF_PERCENT = 12;
const DEFAULT_ESI_PERCENT = 1.75;

/**
 * PF/ESI/PT statutory deductions.
 *
 * `componentRates` — the tenant's configured PF/ESI SalaryComponentDefinition
 * rows (Settings → Payroll Components) — lets a tenant override the 12%/1.75%
 * defaults. Omitted or missing a code falls back to that code's default rate,
 * so a tenant with no configuration behaves exactly as before this existed.
 */
export function calcStatutoryDeductions(
  gross: number,
  basicPay: number,
  workState: string | null | undefined,
  slabsByState: Map<string, ProfessionalTaxSlabRow[]>,
  componentRates?: ComponentRateRow[],
): { pf: number; esi: number; pt: number } {
  const pfPercent =
    componentRates?.find((c) => c.code === "PF")?.percentValue ??
    DEFAULT_PF_PERCENT;
  const esiPercent =
    componentRates?.find((c) => c.code === "ESI")?.percentValue ??
    DEFAULT_ESI_PERCENT;
  return {
    pf: Math.round(basicPay * (pfPercent / 100)),
    esi: gross <= 21000 ? Math.round(gross * (esiPercent / 100)) : 0,
    pt: calcProfessionalTax(gross, workState, slabsByState),
  };
}

export { classifyImpliedNonWorkingDays } from "@hrms/common";

/**
 * The inclusive days of a month an employee was employed, so a mid-month
 * joiner or leaver isn't credited days outside their employment.
 */
export function employmentWindow(
  joiningDate: Date | string | null | undefined,
  exitDate: Date | string | null | undefined,
  year: number,
  month: number,
  totalMonthDays: number,
): { startDay: number; endDay: number } {
  const inMonth = (d: Date) =>
    d.getFullYear() === year && d.getMonth() + 1 === month;
  const join = joiningDate ? new Date(joiningDate) : null;
  const exit = exitDate ? new Date(exitDate) : null;
  return {
    startDay: join && inMonth(join) ? join.getDate() : 1,
    endDay: exit && inMonth(exit) ? exit.getDate() : totalMonthDays,
  };
}
