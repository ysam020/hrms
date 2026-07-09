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
 * PF/ESI/PT statutory deductions. Contractors are exempt under Indian law
 * (subject to TDS u/s 194J instead, not modelled here yet) — every other
 * employee keeps the exact original calculation by default.
 *
 * `componentRates` — the tenant's configured PF/ESI SalaryComponentDefinition
 * rows (Settings → Payroll Components) — lets a tenant override the 12%/1.75%
 * defaults. Omitted or missing a code falls back to that code's default rate,
 * so a tenant with no configuration behaves exactly as before this existed.
 */
export function calcStatutoryDeductions(
  gross: number,
  basicPay: number,
  employmentType: string | null | undefined,
  workState: string | null | undefined,
  slabsByState: Map<string, ProfessionalTaxSlabRow[]>,
  componentRates?: ComponentRateRow[],
): { pf: number; esi: number; pt: number } {
  if (employmentType === "contractor") {
    return { pf: 0, esi: 0, pt: 0 };
  }
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

/**
 * Holiday/weekly-off pay does not depend on reconcileAttendance.ts having
 * already backfilled an explicit "Holiday"/"Week Off" AttendanceRecord for
 * every past non-working date — that only happens once the nightly job has
 * caught up (or not at all in an environment where the scheduler isn't
 * running). Any calendar date in the month with no AttendanceRecord at all
 * is still an implicit, paid day off if it's either (a) in the tenant's
 * configured Holiday calendar, or (b) not a working day per the tenant's
 * workWeekPattern — so both are counted directly here from the calendar
 * instead of requiring a pre-seeded record. Holiday takes precedence over
 * weekly-off when a configured holiday happens to fall on a working day,
 * matching reconcileAttendance.ts's own classification order.
 */
export function classifyImpliedNonWorkingDays(
  year: number,
  month: number, // 1-indexed
  totalMonthDays: number,
  workingDays: number[],
  holidayDateKeys: Set<string>,
  recordedDateKeys: Set<string>,
): { impliedHolidays: number; impliedWeekOffs: number } {
  let impliedHolidays = 0;
  let impliedWeekOffs = 0;
  for (let day = 1; day <= totalMonthDays; day++) {
    const d = new Date(Date.UTC(year, month - 1, day));
    const key = d.toISOString().slice(0, 10);
    if (recordedDateKeys.has(key)) continue; // already has a real AttendanceRecord
    if (holidayDateKeys.has(key)) impliedHolidays++;
    else if (!workingDays.includes(d.getUTCDay())) impliedWeekOffs++;
  }
  return { impliedHolidays, impliedWeekOffs };
}
