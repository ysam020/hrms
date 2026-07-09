import {
  calcPtFallback,
  calcProfessionalTax,
  calcStatutoryDeductions,
  groupSlabsByState,
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
});
