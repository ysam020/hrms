import {
  deriveFromComponents,
  toWireSalaryStructure,
} from "../salaryComponents";

describe("deriveFromComponents", () => {
  it("maps known legacy codes into the legacy object", () => {
    const result = deriveFromComponents([
      { code: "BASIC", type: "earning", amount: 30000 },
      { code: "HRA", type: "earning", amount: 12000 },
      { code: "PF", type: "deduction", amount: 1800 },
    ]);

    expect(result.legacy).toEqual({
      basicPay: 30000,
      hra: 12000,
      conveyance: 0,
      incentive: 0,
      pf: 1800,
      esi: 0,
      pt: 0,
      deductions: 0,
    });
  });

  it("sums earning components into grossEarnings and deduction components into totalDeductions", () => {
    const result = deriveFromComponents([
      { code: "BASIC", type: "earning", amount: 30000 },
      { code: "HRA", type: "earning", amount: 12000 },
      { code: "PF", type: "deduction", amount: 1800 },
      { code: "ESI", type: "deduction", amount: 400 },
    ]);

    expect(result.grossEarnings).toBe(42000);
    expect(result.totalDeductions).toBe(2200);
  });

  it("parses string amounts", () => {
    const result = deriveFromComponents([
      { code: "BASIC", type: "earning", amount: "30000" },
    ]);
    expect(result.legacy.basicPay).toBe(30000);
    expect(result.grossEarnings).toBe(30000);
  });

  it("treats a non-numeric amount as 0 instead of NaN", () => {
    const result = deriveFromComponents([
      { code: "BASIC", type: "earning", amount: "not-a-number" },
    ]);
    expect(result.legacy.basicPay).toBe(0);
    expect(result.grossEarnings).toBe(0);
  });

  it("ignores unknown component codes for the legacy mapping but still totals them", () => {
    const result = deriveFromComponents([
      {
        code: "SPECIAL_ALLOWANCE",
        name: "Special Allowance",
        type: "earning",
        amount: 5000,
      },
    ]);
    expect(result.legacy).toEqual({
      basicPay: 0,
      hra: 0,
      conveyance: 0,
      incentive: 0,
      pf: 0,
      esi: 0,
      pt: 0,
      deductions: 0,
    });
    expect(result.grossEarnings).toBe(5000);
  });

  it("ignores a component whose type is neither earning nor deduction", () => {
    const result = deriveFromComponents([
      { code: "BASIC", type: "info", amount: 1000 },
    ]);
    expect(result.grossEarnings).toBe(0);
    expect(result.totalDeductions).toBe(0);
  });

  it("returns all zeros for an empty component list", () => {
    const result = deriveFromComponents([]);
    expect(result.grossEarnings).toBe(0);
    expect(result.totalDeductions).toBe(0);
    expect(Object.values(result.legacy).every((v) => v === 0)).toBe(true);
  });

  it("uses the last occurrence when the same legacy code appears twice", () => {
    const result = deriveFromComponents([
      { code: "BASIC", type: "earning", amount: 1000 },
      { code: "BASIC", type: "earning", amount: 2000 },
    ]);
    expect(result.legacy.basicPay).toBe(2000);
    expect(result.grossEarnings).toBe(3000);
  });
});

describe("toWireSalaryStructure", () => {
  it("copies componentBreakdown into a components field", () => {
    const row = {
      id: "s1",
      componentBreakdown: [{ code: "BASIC", amount: 1000 }],
    };
    const wire = toWireSalaryStructure(row);
    expect(wire.components).toEqual([{ code: "BASIC", amount: 1000 }]);
    expect(wire.id).toBe("s1");
  });

  it("defaults components to an empty array when componentBreakdown is missing", () => {
    const row = { id: "s1" };
    const wire = toWireSalaryStructure(row);
    expect(wire.components).toEqual([]);
  });

  it("defaults components to an empty array when componentBreakdown is null", () => {
    const row = { id: "s1", componentBreakdown: null };
    const wire = toWireSalaryStructure(row);
    expect(wire.components).toEqual([]);
  });

  it("does not mutate the original row", () => {
    const row = {
      id: "s1",
      componentBreakdown: [{ code: "BASIC", amount: 1000 }],
    };
    toWireSalaryStructure(row);
    expect(row).not.toHaveProperty("components");
  });
});
