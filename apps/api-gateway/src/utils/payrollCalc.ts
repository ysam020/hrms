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

/**
 * PF/ESI/PT statutory deductions. Contractors are exempt under Indian law
 * (subject to TDS u/s 194J instead, not modelled here yet) — every other
 * employee keeps the exact original calculation.
 */
export function calcStatutoryDeductions(
  gross: number,
  basicPay: number,
  employmentType: string | null | undefined,
  workState: string | null | undefined,
  slabsByState: Map<string, ProfessionalTaxSlabRow[]>,
): { pf: number; esi: number; pt: number } {
  if (employmentType === "contractor") {
    return { pf: 0, esi: 0, pt: 0 };
  }
  return {
    pf: Math.round(basicPay * 0.12),
    esi: gross <= 21000 ? Math.round(gross * 0.0175) : 0,
    pt: calcProfessionalTax(gross, workState, slabsByState),
  };
}
