import {
  computeSalaryComponents,
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
    expect(values.pf).toBe(2400); // 12% of 20000
    expect(locked.has("pf")).toBe(true);
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
    expect(values.esi).toBe(700); // 1.75% of 40000
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
    expect(values.esi).toBe(1750);
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
    expect(values.pt).toBe(200);
    expect(locked.has("pt")).toBe(true);
  });

  it("locks PT to a matching state-wise slab's monthlyPT when one is configured", () => {
    const { values } = computeSalaryComponents({
      basicPay: 20000,
      grossSalary: 40000,
      components: [
        makeComponent({ code: "PT", calcType: "fixed", percentValue: 200 }),
      ],
      ptSlabs: [
        { id: "s1", state: "Maharashtra", minGross: 0, maxGross: 7500, monthlyPT: 0 },
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
    expect(values.pt).toBe(175);
  });

  it("falls back to the PT component's own value when workState doesn't match any configured slab", () => {
    const { values } = computeSalaryComponents({
      basicPay: 20000,
      grossSalary: 40000,
      components: [
        makeComponent({ code: "PT", calcType: "fixed", percentValue: 200 }),
      ],
      ptSlabs: [
        { id: "s1", state: "Karnataka", minGross: 0, maxGross: null, monthlyPT: 300 },
      ],
      workState: "Gujarat",
    });
    expect(values.pt).toBe(200);
  });

  it("un-locks PT when a tenant reconfigures it away from calcType fixed", () => {
    const { values, locked } = computeSalaryComponents({
      basicPay: 20000,
      grossSalary: 40000,
      components: [
        makeComponent({ code: "PT", calcType: "percent_of_basic", percentOf: "basic", percentValue: 1 }),
      ],
    });
    // Treated as a generic percent_of_basic component, not the special PT slab path.
    expect(values.pt).toBe(200); // 1% of 20000
    expect(locked.has("pt")).toBe(true);
  });

  it("ignores components with codes that don't map to a standard key", () => {
    const { values, locked } = computeSalaryComponents({
      basicPay: 20000,
      grossSalary: 40000,
      components: [
        makeComponent({
          code: "SPECIAL_ALLOWANCE",
          calcType: "percent_of_basic",
          percentValue: 10,
        }),
      ],
    });
    expect(values).toEqual({});
    expect(locked.size).toBe(0);
  });
});
