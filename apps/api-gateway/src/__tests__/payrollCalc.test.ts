import {
  calcPtFallback,
  calcProfessionalTax,
  calcStatutoryDeductions,
  groupSlabsByState,
  classifyImpliedNonWorkingDays,
  type ProfessionalTaxSlabRow,
} from "../utils/payrollCalc";

describe("calcPtFallback", () => {
  it("matches the original hardcoded slab exactly", () => {
    expect(calcPtFallback(5000)).toBe(0);
    expect(calcPtFallback(8000)).toBe(80);
    expect(calcPtFallback(11000)).toBe(150);
    expect(calcPtFallback(20000)).toBe(200);
  });
});

describe("calcProfessionalTax", () => {
  it("falls back to the flat slab when no state slabs are configured", () => {
    expect(calcProfessionalTax(8000, "Karnataka", new Map())).toBe(80);
  });

  it("falls back to the flat slab when workState is not set", () => {
    const slabs = groupSlabsByState([
      { state: "Karnataka", minGross: 0, maxGross: 15000, monthlyPT: 200 },
    ]);
    expect(calcProfessionalTax(8000, null, slabs)).toBe(80);
  });

  it("uses the tenant-configured state slab when one matches", () => {
    const rows: ProfessionalTaxSlabRow[] = [
      { state: "Maharashtra", minGross: 0, maxGross: 7500, monthlyPT: 0 },
      { state: "Maharashtra", minGross: 7501, maxGross: 10000, monthlyPT: 175 },
      { state: "Maharashtra", minGross: 10001, maxGross: null, monthlyPT: 200 },
    ];
    const slabs = groupSlabsByState(rows);
    expect(calcProfessionalTax(5000, "Maharashtra", slabs)).toBe(0);
    expect(calcProfessionalTax(9000, "Maharashtra", slabs)).toBe(175);
    expect(calcProfessionalTax(50000, "Maharashtra", slabs)).toBe(200);
  });

  it("returns 0 when the gross falls outside every configured slab for that state", () => {
    const slabs = groupSlabsByState([
      { state: "Gujarat", minGross: 12000, maxGross: null, monthlyPT: 200 },
    ]);
    expect(calcProfessionalTax(5000, "Gujarat", slabs)).toBe(0);
  });
});

describe("calcStatutoryDeductions", () => {
  it("matches today's exact formula for a regular employee (no slabs configured)", () => {
    const result = calcStatutoryDeductions(
      20000,
      10000,
      "employee",
      null,
      new Map(),
    );
    expect(result).toEqual({ pf: 1200, esi: 350, pt: 200 });
  });

  it("skips ESI above the 21000 gross threshold", () => {
    const result = calcStatutoryDeductions(
      25000,
      12500,
      "employee",
      null,
      new Map(),
    );
    expect(result.esi).toBe(0);
  });

  it("exempts contractors from PF, ESI, and PT entirely", () => {
    const result = calcStatutoryDeductions(
      20000,
      10000,
      "contractor",
      "Karnataka",
      new Map(),
    );
    expect(result).toEqual({ pf: 0, esi: 0, pt: 0 });
  });

  it("treats an unset employmentType as a regular employee (backward compatible)", () => {
    const result = calcStatutoryDeductions(20000, 10000, null, null, new Map());
    expect(result).toEqual({ pf: 1200, esi: 350, pt: 200 });
  });

  it("uses tenant-configured PF/ESI rates when provided", () => {
    const result = calcStatutoryDeductions(
      20000,
      10000,
      "employee",
      null,
      new Map(),
      [
        { code: "PF", percentValue: 10 },
        { code: "ESI", percentValue: 1 },
      ],
    );
    expect(result).toEqual({ pf: 1000, esi: 200, pt: 200 });
  });

  it("falls back to the default rate for a code missing from the tenant's configured rows", () => {
    const result = calcStatutoryDeductions(
      20000,
      10000,
      "employee",
      null,
      new Map(),
      [{ code: "PF", percentValue: 10 }],
    );
    expect(result).toEqual({ pf: 1000, esi: 350, pt: 200 }); // ESI defaults to 1.75%
  });
});

describe("classifyImpliedNonWorkingDays", () => {
  // January 2020: 31 days, starting on a Wednesday. Jan 4/5, 11/12, 18/19,
  // 25/26 are the Saturdays/Sundays (8 weekend days total).
  const MON_FRI = [1, 2, 3, 4, 5];

  it("counts every unrecorded weekend day as an implied week off, given a Mon-Fri work week", () => {
    const { impliedHolidays, impliedWeekOffs } = classifyImpliedNonWorkingDays(
      2020,
      1,
      31,
      MON_FRI,
      new Set(),
      new Set(), // no dates have any AttendanceRecord
    );
    expect(impliedHolidays).toBe(0);
    expect(impliedWeekOffs).toBe(8);
  });

  it("does not double-count a weekend day that already has an explicit AttendanceRecord", () => {
    const { impliedWeekOffs } = classifyImpliedNonWorkingDays(
      2020,
      1,
      31,
      MON_FRI,
      new Set(),
      new Set(["2020-01-04", "2020-01-05"]), // already backfilled by reconciliation
    );
    expect(impliedWeekOffs).toBe(6); // 8 weekend days minus the 2 already recorded
  });

  it("counts an unrecorded configured-holiday date as an implied holiday, even on a working weekday", () => {
    const { impliedHolidays, impliedWeekOffs } = classifyImpliedNonWorkingDays(
      2020,
      1,
      31,
      MON_FRI,
      new Set(["2020-01-15"]), // a Wednesday
      new Set(),
    );
    expect(impliedHolidays).toBe(1);
    expect(impliedWeekOffs).toBe(8); // weekends still counted independently
  });

  it("gives holiday precedence over week-off when a holiday falls on a weekend", () => {
    const { impliedHolidays, impliedWeekOffs } = classifyImpliedNonWorkingDays(
      2020,
      1,
      31,
      MON_FRI,
      new Set(["2020-01-05"]), // a Sunday
      new Set(),
    );
    expect(impliedHolidays).toBe(1);
    expect(impliedWeekOffs).toBe(7); // the other 7 weekend days, not 8
  });

  it("honors a custom work-week pattern (e.g. mon_sat) instead of hardcoding Sat/Sun", () => {
    const { impliedWeekOffs } = classifyImpliedNonWorkingDays(
      2020,
      1,
      31,
      [1, 2, 3, 4, 5, 6], // Saturday is a working day
      new Set(),
      new Set(),
    );
    expect(impliedWeekOffs).toBe(4); // only the 4 Sundays are off
  });

  it("counts nothing for a fully-recorded month", () => {
    const recorded = new Set<string>();
    for (let day = 1; day <= 31; day++) {
      recorded.add(`2020-01-${String(day).padStart(2, "0")}`);
    }
    const { impliedHolidays, impliedWeekOffs } = classifyImpliedNonWorkingDays(
      2020,
      1,
      31,
      MON_FRI,
      new Set(["2020-01-15"]),
      recorded,
    );
    expect(impliedHolidays).toBe(0);
    expect(impliedWeekOffs).toBe(0);
  });
});
