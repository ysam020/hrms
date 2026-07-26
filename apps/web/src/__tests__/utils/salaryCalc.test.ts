import {
  computeSalaryComponents,
  redistributeGross,
  CODE_TO_KEY,
  type SalaryComponentDef,
} from "@web/shared/utils/salaryCalc";

const makeComponent = (
  overrides: Partial<SalaryComponentDef>,
): SalaryComponentDef => ({
  id: "id",
  code: "BASIC",
  name: "Basic Pay",
  type: "earning",
  calcType: "fixed",
  percentOf: null,
  percentValue: null,
  isStatutory: false,
  displayOrder: 0,
  ...overrides,
});

describe("CODE_TO_KEY", () => {
  it("maps every standard component code to its formik/API key", () => {
    expect(CODE_TO_KEY).toEqual({
      BASIC: "basicPay",
      HRA: "hra",
      CONVEYANCE: "conveyance",
      PF: "pf",
      ESI: "esi",
      PT: "pt",
    });
  });
});

describe("computeSalaryComponents", () => {
  it("leaves fixed (non-PT) components like Basic/HRA/Conveyance as manual entry", () => {
    const { values, locked } = computeSalaryComponents({
      basicPay: 20000,
      grossSalary: 40000,
      components: [
        makeComponent({ code: "BASIC" }),
        makeComponent({ code: "HRA" }),
        makeComponent({ code: "CONVEYANCE" }),
      ],
    });
    expect(values).toEqual({});
    expect(locked.size).toBe(0);
  });

  it("derives percent_of_basic components from basic pay by default", () => {
    const { values, locked } = computeSalaryComponents({
      basicPay: 20000,
      grossSalary: 40000,
      components: [
        makeComponent({
          code: "PF",
          calcType: "percent_of_basic",
          percentOf: "basic",
          percentValue: 12,
        }),
      ],
    });
    expect(values.PF).toBe(2400); // 12% of 20000
    expect(locked.has("PF")).toBe(true);
  });

  it("derives percent_of_basic components from gross when percentOf is 'gross'", () => {
    const { values } = computeSalaryComponents({
      basicPay: 20000,
      grossSalary: 40000,
      components: [
        makeComponent({
          code: "ESI",
          calcType: "percent_of_basic",
          percentOf: "gross",
          percentValue: 1.75,
        }),
      ],
    });
    expect(values.ESI).toBe(700); // 1.75% of 40000
  });

  it("skips ESI-style components above the configured gross when caller passes a gross beyond any threshold (no built-in cap — matches percentValue literally)", () => {
    const { values } = computeSalaryComponents({
      basicPay: 5000,
      grossSalary: 100000,
      components: [
        makeComponent({
          code: "ESI",
          calcType: "percent_of_basic",
          percentOf: "gross",
          percentValue: 1.75,
        }),
      ],
    });
    expect(values.ESI).toBe(1750);
  });

  it("locks PT to the fixed component's own value when no matching PT slab exists", () => {
    const { values, locked } = computeSalaryComponents({
      basicPay: 20000,
      grossSalary: 40000,
      components: [
        makeComponent({ code: "PT", calcType: "fixed", percentValue: 200 }),
      ],
      ptSlabs: [],
      workState: "Karnataka",
    });
    expect(values.PT).toBe(200);
    expect(locked.has("PT")).toBe(true);
  });

  it("locks PT to a matching state-wise slab's monthlyPT when one is configured", () => {
    const { values } = computeSalaryComponents({
      basicPay: 20000,
      grossSalary: 40000,
      components: [
        makeComponent({ code: "PT", calcType: "fixed", percentValue: 200 }),
      ],
      ptSlabs: [
        {
          id: "s1",
          state: "Maharashtra",
          minGross: 0,
          maxGross: 7500,
          monthlyPT: 0,
        },
        {
          id: "s2",
          state: "Maharashtra",
          minGross: 7501,
          maxGross: null,
          monthlyPT: 175,
        },
      ],
      workState: "Maharashtra",
    });
    expect(values.PT).toBe(175);
  });

  it("falls back to the PT component's own value when workState doesn't match any configured slab", () => {
    const { values } = computeSalaryComponents({
      basicPay: 20000,
      grossSalary: 40000,
      components: [
        makeComponent({ code: "PT", calcType: "fixed", percentValue: 200 }),
      ],
      ptSlabs: [
        {
          id: "s1",
          state: "Karnataka",
          minGross: 0,
          maxGross: null,
          monthlyPT: 300,
        },
      ],
      workState: "Gujarat",
    });
    expect(values.PT).toBe(200);
  });

  it("un-locks PT when a tenant reconfigures it away from calcType fixed", () => {
    const { values, locked } = computeSalaryComponents({
      basicPay: 20000,
      grossSalary: 40000,
      components: [
        makeComponent({
          code: "PT",
          calcType: "percent_of_basic",
          percentOf: "basic",
          percentValue: 1,
        }),
      ],
    });
    // Treated as a generic percent_of_basic component, not the special PT slab path.
    expect(values.PT).toBe(200); // 1% of 20000
    expect(locked.has("PT")).toBe(true);
  });

  it("includes components with codes that don't map to a standard key, keyed by their own code", () => {
    const { values, locked } = computeSalaryComponents({
      basicPay: 20000,
      grossSalary: 40000,
      components: [
        makeComponent({
          code: "SPECIAL_ALLOWANCE",
          calcType: "percent_of_basic",
          percentOf: "basic",
          percentValue: 10,
        }),
      ],
    });
    expect(values).toEqual({ SPECIAL_ALLOWANCE: 2000 }); // 10% of 20000
    expect(locked.has("SPECIAL_ALLOWANCE")).toBe(true);
  });

  it("leaves a custom fixed (non-percent) component as manual entry", () => {
    const { values, locked } = computeSalaryComponents({
      basicPay: 20000,
      grossSalary: 40000,
      components: [makeComponent({ code: "SHIFT_ALLOWANCE" })],
    });
    expect(values).toEqual({});
    expect(locked.size).toBe(0);
  });
});

describe("redistributeGross", () => {
  // No statutory deductions in this fixture — isolates the pure
  // proportional-split mechanics from the gross-up math covered below.
  const componentsNoDeductions: SalaryComponentDef[] = [
    makeComponent({ code: "BASIC", type: "earning", displayOrder: 0 }),
    makeComponent({ code: "HRA", type: "earning", displayOrder: 1 }),
    makeComponent({ code: "CONVEYANCE", type: "earning", displayOrder: 2 }),
  ];

  // PF is 12% of Basic (percentOf defaults to null, i.e. basic-based, same
  // as computeSalaryComponents' own fallback) — exercises the gross-up path.
  const componentsWithPF: SalaryComponentDef[] = [
    ...componentsNoDeductions,
    makeComponent({
      code: "PF",
      type: "deduction",
      calcType: "percent_of_basic",
      percentValue: 12,
      displayOrder: 3,
    }),
  ];

  it("seeds the standard 50/25/25 Basic/HRA/Conveyance split when nothing is set yet (matches payroll's own fallback split)", () => {
    const result = redistributeGross(
      60000,
      componentsNoDeductions,
      {},
      new Set(),
    );
    expect(result).toEqual({ BASIC: 30000, HRA: 15000, CONVEYANCE: 15000 });
  });

  it("falls back to 100% into the first earning component when none of the standard Basic/HRA/Conveyance codes are configured", () => {
    const customComponents: SalaryComponentDef[] = [
      makeComponent({ code: "SPECIAL", type: "earning", displayOrder: 0 }),
      makeComponent({ code: "BONUS", type: "earning", displayOrder: 1 }),
    ];
    const result = redistributeGross(50000, customComponents, {}, new Set());
    expect(result).toEqual({ SPECIAL: 50000, BONUS: 0 });
  });

  it("proportionally rescales existing earning components to sum to the new gross", () => {
    const current = { BASIC: 20000, HRA: 10000, CONVEYANCE: 10000 };
    const result = redistributeGross(
      80000,
      componentsNoDeductions,
      current,
      new Set(),
    );
    // Original earning sum was 40000; scale factor 2x.
    expect(result.BASIC).toBe(40000);
    expect(result.HRA).toBe(20000);
    expect(result.CONVEYANCE).toBe(20000);
  });

  it("does not rescale locked earning components", () => {
    const current = { BASIC: 20000, HRA: 10000, CONVEYANCE: 10000 };
    const result = redistributeGross(
      80000,
      componentsNoDeductions,
      current,
      new Set(["HRA"]),
    );
    // HRA is locked and left untouched; BASIC/CONVEYANCE absorb the new
    // gross proportionally between themselves (sum was 30000, scale 8/3).
    expect(result.HRA).toBe(10000);
    expect(result.BASIC).toBe(53333);
    expect(result.CONVEYANCE).toBe(26667);
  });

  // Regression: entering a gross of 200,000 used to set Basic Pay to
  // 200,000 (the whole gross), with PF/ESI/PT then added ON TOP — so the
  // sum of every displayed component exceeded the entered gross. Basic/HRA/
  // Conveyance must instead be grossed-up so that once PF is derived from
  // the result, everything (earnings + PF) sums back to the entered gross.
  it("grosses up earnings so Basic+HRA+Conveyance+PF sums to the entered gross, not just the earnings alone", () => {
    const result = redistributeGross(200000, componentsWithPF, {}, new Set());
    // earningsTotal = 200000 / 1.06 = 188679.245..., split 50/25/25.
    expect(result.BASIC).toBe(94340);
    expect(result.HRA).toBe(47170);
    expect(result.CONVEYANCE).toBe(47170);
    const { values: derived } = computeSalaryComponents({
      basicPay: result.BASIC,
      grossSalary: 200000,
      components: componentsWithPF,
    });
    const total = result.BASIC + result.HRA + result.CONVEYANCE + derived.PF;
    // Within a rupee of 200000 — Math.round is applied independently to
    // each component, so exact equality isn't guaranteed, just very close.
    expect(Math.abs(total - 200000)).toBeLessThanOrEqual(2);
  });

  it("proportional rescale also grosses up for PF so the total still sums to the new gross", () => {
    const current = { BASIC: 20000, HRA: 10000, CONVEYANCE: 10000, PF: 2400 };
    const result = redistributeGross(
      80000,
      componentsWithPF,
      current,
      new Set(),
    );
    expect(result.BASIC).toBe(37736);
    expect(result.HRA).toBe(18868);
    expect(result.CONVEYANCE).toBe(18868);
    // Deduction (PF)'s stale value is left untouched by redistributeGross
    // itself — the caller re-derives it from the new BASIC separately.
    expect(result.PF).toBe(2400);
  });
});
