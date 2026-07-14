import {
  getFinancialYear,
  remainingMonthsInFinancialYear,
  calcAnnualIncomeTax,
  calcAnnualTaxBreakdown,
  calcHraExemption,
  calcOldRegimeDeductions,
  calcMonthlyTds,
  roundToNearest10,
  aggregateEarningsByCode,
  computeTdsWorksheet,
  computeForm16,
  NEW_REGIME_SLAB_FALLBACK,
  OLD_REGIME_SLAB_FALLBACK,
} from "../utils/tdsCalc";

describe("getFinancialYear", () => {
  it("maps Jan-Mar to the financial year that started the previous April", () => {
    expect(getFinancialYear(1, 2026)).toBe("2025-26");
    expect(getFinancialYear(3, 2026)).toBe("2025-26");
  });

  it("maps Apr-Dec to the financial year starting that same April", () => {
    expect(getFinancialYear(4, 2025)).toBe("2025-26");
    expect(getFinancialYear(12, 2025)).toBe("2025-26");
  });
});

describe("remainingMonthsInFinancialYear", () => {
  it("counts April as all 12 months remaining", () => {
    expect(remainingMonthsInFinancialYear(4, 2025)).toBe(12);
  });

  it("counts March as the last 1 month remaining", () => {
    expect(remainingMonthsInFinancialYear(3, 2026)).toBe(1);
  });

  it("counts January as 3 months remaining (Jan/Feb/Mar)", () => {
    expect(remainingMonthsInFinancialYear(1, 2026)).toBe(3);
  });

  it("counts December as 4 months remaining (Dec + Jan/Feb/Mar)", () => {
    expect(remainingMonthsInFinancialYear(12, 2025)).toBe(4);
  });
});

describe("calcAnnualIncomeTax — New Regime", () => {
  it("is nil exactly at the 87A rebate cliff (12L taxable)", () => {
    expect(calcAnnualIncomeTax(1200000, NEW_REGIME_SLAB_FALLBACK, "new")).toBe(
      0,
    );
  });

  it("taxes the full slab progression once past the Sec 87A marginal-relief band", () => {
    // 12.1L taxable falls inside the marginal-relief band (relief phases out
    // around ~12.706L — see the "Section 87A marginal relief" tests below),
    // so this uses 12.9L instead to exercise plain slab progression through
    // the 15% bracket without relief capping it: 60000 (0-12L) + 15% of the
    // 90000 above 12L = 13500 => 73500 slab tax, +4% cess.
    const tax = calcAnnualIncomeTax(1290000, NEW_REGIME_SLAB_FALLBACK, "new");
    expect(tax).toBe(Math.round(73500 * 1.04));
  });

  it("applies the 30% top slab and cess above 24L", () => {
    // 25L taxable: slabs sum to 300000 (4-8L@5=20000, 8-12L@10=40000,
    // 12-16L@15=60000, 16-20L@20=80000, 20-24L@25=100000) + 30% of 100000 above 24L = 30000 => 330000
    const tax = calcAnnualIncomeTax(2500000, NEW_REGIME_SLAB_FALLBACK, "new");
    expect(tax).toBe(Math.round(330000 * 1.04));
  });
});

describe("calcAnnualIncomeTax — Old Regime", () => {
  it("is nil exactly at the 87A rebate cliff (5L taxable)", () => {
    expect(calcAnnualIncomeTax(500000, OLD_REGIME_SLAB_FALLBACK, "old")).toBe(
      0,
    );
  });

  it("taxes normally above the cliff", () => {
    // 6L taxable: 5% of 2.5-5L = 12500, 20% of 5-6L = 20000 => 32500 slab tax
    const tax = calcAnnualIncomeTax(600000, OLD_REGIME_SLAB_FALLBACK, "old");
    expect(tax).toBe(Math.round(32500 * 1.04));
  });
});

describe("calcHraExemption", () => {
  it("returns 0 when no rent is declared", () => {
    expect(calcHraExemption(300000, 150000, null, false)).toBe(0);
    expect(calcHraExemption(300000, 150000, 0, false)).toBe(0);
  });

  it("caps at the lowest of the three legs — rent-minus-10%-basic binding", () => {
    // basic 3L/yr, HRA 1.5L/yr, rent 8000/mo => 96000/yr rent, minus 10% of
    // basic (30000) = 66000; vs HRA 150000; vs 40% of basic (120000, non-metro).
    // Lowest is 66000.
    expect(calcHraExemption(300000, 150000, 8000, false)).toBe(66000);
  });

  it("caps at 50% of basic for a metro city when that's the binding leg", () => {
    // basic 3L/yr, HRA 200000/yr, rent 30000/mo => 360000 rent - 30000 = 330000;
    // vs HRA 200000; vs 50% of basic (150000, metro). Lowest is 150000.
    expect(calcHraExemption(300000, 200000, 30000, true)).toBe(150000);
  });
});

describe("calcOldRegimeDeductions", () => {
  it("caps 80C at 1.5L even when more is declared", () => {
    expect(
      calcOldRegimeDeductions([{ code: "SEC80C", declaredAmount: 200000 }]),
    ).toBe(150000);
  });

  it("prefers the proven amount over the declared amount once proofs are in", () => {
    expect(
      calcOldRegimeDeductions([
        { code: "SEC80C", declaredAmount: 150000, proofAmount: 90000 },
      ]),
    ).toBe(90000);
  });

  it("sums every section with its own cap", () => {
    const total = calcOldRegimeDeductions([
      { code: "SEC80C", declaredAmount: 150000 },
      { code: "SEC80D_SELF", declaredAmount: 30000 }, // capped to 25000
      { code: "SEC80D_PARENTS", declaredAmount: 10000 },
      { code: "HOME_LOAN_INTEREST", declaredAmount: 250000 }, // capped to 200000
      { code: "NPS_80CCD1B", declaredAmount: 60000 }, // capped to 50000
      { code: "OTHER", declaredAmount: 5000 }, // uncapped
    ]);
    expect(total).toBe(150000 + 25000 + 10000 + 200000 + 50000 + 5000);
  });
});

// Splits a flat gross/basic/hra triple (the shape the old aggregate-based
// calcMonthlyTds tests used) into recurring BASIC/HRA/CONVEYANCE components,
// so these tests exercise the exact same totals under the new per-component API.
function recurringComponents(gross: number, basic: number, hra: number) {
  return [
    {
      code: "BASIC",
      label: "Basic",
      thisMonthAmount: basic,
      isRecurring: true,
    },
    { code: "HRA", label: "HRA", thisMonthAmount: hra, isRecurring: true },
    {
      code: "CONVEYANCE",
      label: "Conveyance",
      thisMonthAmount: gross - basic - hra,
      isRecurring: true,
    },
  ];
}

describe("calcMonthlyTds — New Regime true-up", () => {
  it("withholds nothing for an employee whose projected annual gross stays under the rebate cliff", () => {
    const tds = calcMonthlyTds({
      regime: "new",
      components: recurringComponents(80000, 40000, 20000),
      ytdByCode: {},
      ytdTds: 0,
      remainingMonths: 12,
      slabs: [],
    });
    expect(tds).toBe(0); // 80000*12=9.6L gross - 75000 std deduction = 8.85L taxable, under 12L cliff
  });

  it("spreads the annual liability evenly across the remaining months with no prior withholding", () => {
    const tds = calcMonthlyTds({
      regime: "new",
      components: recurringComponents(150000, 75000, 30000),
      ytdByCode: {},
      ytdTds: 0,
      remainingMonths: 12,
      slabs: [],
    });
    // 18L gross - 75000 = 1725000 taxable
    // slab tax: 4-8L@5=20000, 8-12L@10=40000, 12-16L@15=60000, 16-17.25L@20=25000 => 145000
    const annualTax = Math.round(145000 * 1.04);
    expect(tds).toBe(Math.round(annualTax / 12));
  });

  it("trues up mid-year: a raise increases the withholding for remaining months without re-taxing months already paid", () => {
    // 3 months in at 100000/mo gross (300000 YTD, 0 TDS so far since projected
    // annual stayed under the cliff), employee gets a raise to 250000/mo for
    // the remaining 9 months.
    const tds = calcMonthlyTds({
      regime: "new",
      components: recurringComponents(250000, 125000, 50000),
      ytdByCode: { BASIC: 150000, HRA: 60000, CONVEYANCE: 90000 },
      ytdTds: 0,
      remainingMonths: 9,
      slabs: [],
    });
    // projected annual gross = 300000 + 250000*9 = 2550000; taxable = 2475000
    // slab tax: 4-8=20000,8-12=40000,12-16=60000,16-20=80000,20-24=100000,24-24.75@30=22500 => 322500
    const annualTax = Math.round(322500 * 1.04);
    expect(tds).toBe(Math.round(annualTax / 9)); // ytdTds was 0, so full liability spreads over the 9 remaining months
  });

  it("does not project a one-time bonus into the remaining months (regression: this used to over-withhold)", () => {
    // A recurring 60000/mo salary plus a ONE-TIME 500000 bonus this month.
    // Projecting the bonus forward would put projected annual income at
    // roughly (60000+500000)*12 ≈ 67.2L — wildly over the real ~7.7L annual
    // income, and would trigger a huge, wrong withholding this month.
    const withBonus = calcMonthlyTds({
      regime: "new",
      components: [
        {
          code: "BASIC",
          label: "Basic",
          thisMonthAmount: 60000,
          isRecurring: true,
        },
        {
          code: "INCENTIVE",
          label: "Bonus",
          thisMonthAmount: 500000,
          isRecurring: false,
        },
      ],
      ytdByCode: {},
      ytdTds: 0,
      remainingMonths: 12,
      slabs: [],
    });
    const withoutBonus = calcMonthlyTds({
      regime: "new",
      components: [
        {
          code: "BASIC",
          label: "Basic",
          thisMonthAmount: 60000,
          isRecurring: true,
        },
      ],
      ytdByCode: {},
      ytdTds: 0,
      remainingMonths: 12,
      slabs: [],
    });
    // Projected annual = 60000*12 + 500000 (bonus counted once) - 75000 std
    // deduction = 1,145,000 taxable — still under the 12L cliff, so this
    // specific bonus shouldn't trigger any withholding at all. The real
    // regression check is that it doesn't explode into a huge number.
    expect(withBonus).toBe(0);
    expect(withBonus).toBe(withoutBonus); // the one-time bonus alone doesn't change withholding
  });
});

describe("calcMonthlyTds — Old Regime with a declaration", () => {
  it("reduces taxable income by HRA exemption and Chapter VI-A deductions", () => {
    const withDeclaration = calcMonthlyTds({
      regime: "old",
      components: recurringComponents(150000, 60000, 30000),
      ytdByCode: {},
      ytdTds: 0,
      remainingMonths: 12,
      slabs: [],
      declaration: {
        monthlyRent: 20000,
        isMetroCity: true,
        lineItems: [{ code: "SEC80C", declaredAmount: 150000 }],
      },
    });
    const withoutDeclaration = calcMonthlyTds({
      regime: "old",
      components: recurringComponents(150000, 60000, 30000),
      ytdByCode: {},
      ytdTds: 0,
      remainingMonths: 12,
      slabs: [],
    });
    expect(withDeclaration).toBeLessThan(withoutDeclaration);
  });

  it("ignores the declaration entirely for a New Regime employee even if one is passed", () => {
    const tds = calcMonthlyTds({
      regime: "new",
      components: recurringComponents(150000, 60000, 30000),
      ytdByCode: {},
      ytdTds: 0,
      remainingMonths: 12,
      slabs: [],
      declaration: {
        monthlyRent: 20000,
        isMetroCity: true,
        lineItems: [{ code: "SEC80C", declaredAmount: 150000 }],
      },
    });
    // Same as the New Regime "spreads evenly" case above at a different gross —
    // just confirm it doesn't silently apply Old Regime standard deduction/slabs.
    expect(tds).toBeGreaterThan(0);
  });
});

describe("roundToNearest10", () => {
  it("rounds down below the midpoint and up at/above it", () => {
    expect(roundToNearest10(563404)).toBe(563400);
    expect(roundToNearest10(563405)).toBe(563410);
    expect(roundToNearest10(0)).toBe(0);
  });
});

describe("calcAnnualTaxBreakdown", () => {
  it("returns a slab-by-slab row per bracket that actually applies, matching the totals calcAnnualIncomeTax would return", () => {
    const breakdown = calcAnnualTaxBreakdown(
      563400,
      NEW_REGIME_SLAB_FALLBACK,
      "new",
    );
    expect(breakdown.slabRows).toEqual([
      {
        minIncome: 0,
        maxIncome: 400000,
        ratePercent: 0,
        taxableInSlab: 400000,
        taxAmount: 0,
      },
      {
        minIncome: 400000,
        maxIncome: 800000,
        ratePercent: 5,
        taxableInSlab: 163400,
        taxAmount: 8170,
      },
    ]);
    expect(breakdown.taxOnTotalIncome).toBe(8170);
    expect(breakdown.rebate).toBe(8170); // under the 12L cliff
    expect(breakdown.totalTaxOnIncome).toBe(0);
    expect(breakdown.cess).toBe(0);
    expect(breakdown.taxPayable).toBe(0);
    expect(breakdown.taxPayable).toBe(
      calcAnnualIncomeTax(563400, NEW_REGIME_SLAB_FALLBACK, "new"),
    );
  });

  describe("Section 87A marginal relief", () => {
    it("New Regime: caps tax at the excess-over-threshold just above the ₹12L cliff", () => {
      // Slab tax at 12,00,100 = 60000 (up to 12L) + 15% of 100 = 60015 →
      // rounds to 60020. Excess over the 12L threshold is only 100, so
      // marginal relief caps the payable tax at that 100, not the full 60020.
      const breakdown = calcAnnualTaxBreakdown(
        1200100,
        NEW_REGIME_SLAB_FALLBACK,
        "new",
      );
      expect(breakdown.taxOnTotalIncome).toBe(60020);
      expect(breakdown.rebate).toBe(59920);
      expect(breakdown.totalTaxOnIncome).toBe(100);
      expect(breakdown.cess).toBe(0); // 4% of 100 = 4, rounds to nearest 10 → 0
      expect(breakdown.taxPayable).toBe(100);
    });

    it("New Regime: relief phases out once excess-over-threshold exceeds the normal slab tax", () => {
      // At 12,80,000: slab tax = 60000 + 15% of 80000 = 72000; excess over
      // 12L is 80000. 72000 < 80000, so relief no longer applies — full tax.
      const breakdown = calcAnnualTaxBreakdown(
        1280000,
        NEW_REGIME_SLAB_FALLBACK,
        "new",
      );
      expect(breakdown.taxOnTotalIncome).toBe(72000);
      expect(breakdown.rebate).toBe(0);
      expect(breakdown.totalTaxOnIncome).toBe(72000);
      expect(breakdown.cess).toBe(2880);
      expect(breakdown.taxPayable).toBe(74880);
    });

    it("Old Regime: caps tax at the excess-over-threshold just above the ₹5L cliff", () => {
      // Slab tax at 5,00,100 = 12500 (2.5-5L@5%) + 20% of 100 = 20 → 12520.
      // Excess over the 5L threshold is only 100.
      const breakdown = calcAnnualTaxBreakdown(
        500100,
        OLD_REGIME_SLAB_FALLBACK,
        "old",
      );
      expect(breakdown.taxOnTotalIncome).toBe(12520);
      expect(breakdown.rebate).toBe(12420);
      expect(breakdown.totalTaxOnIncome).toBe(100);
      expect(breakdown.taxPayable).toBe(100);
    });
  });
});

describe("aggregateEarningsByCode", () => {
  it("sums componentBreakdown earning entries by code, ignoring deduction entries", () => {
    const totals = aggregateEarningsByCode([
      {
        componentBreakdown: [
          { code: "BASIC", type: "earning", amount: 25000 },
          { code: "HRA", type: "earning", amount: 12500 },
          { code: "PF", type: "deduction", amount: 3000 },
        ],
      },
      {
        componentBreakdown: [
          { code: "BASIC", type: "earning", amount: 25000 },
          { code: "HRA", type: "earning", amount: 12500 },
        ],
      },
    ]);
    expect(totals).toEqual({ BASIC: 50000, HRA: 25000 });
  });

  it("maps legacy fixed columns to synthetic codes when componentBreakdown is absent", () => {
    const totals = aggregateEarningsByCode([
      { basicPay: 25000, hra: 12500, conveyance: 5000, incentive: 0 },
      { basicPay: 25000, hra: 12500, conveyance: 5000, incentive: 10000 },
    ]);
    expect(totals).toEqual({
      BASIC: 50000,
      HRA: 25000,
      CONVEYANCE: 10000,
      INCENTIVE: 10000,
    });
  });
});

describe("computeTdsWorksheet", () => {
  // Reproduces the reference TDS Work Sheet exactly: New Regime, month 3 of
  // the FY (Apr+May already paid, June is "this month" => remainingMonths=10
  // per remainingMonthsInFinancialYear(6, ...)), Basic/HRA/Transport/Special
  // recurring monthly, a one-time Project Incentive paid only this month.
  const components = [
    {
      code: "BASIC",
      label: "Basic",
      thisMonthAmount: 25000,
      isRecurring: true,
    },
    {
      code: "HRA",
      label: "House Rent Allowance",
      thisMonthAmount: 12500,
      isRecurring: true,
    },
    {
      code: "TRANSPORT",
      label: "Transport Allowance",
      thisMonthAmount: 5000,
      isRecurring: true,
    },
    {
      code: "SPECIAL",
      label: "Special Allowance",
      thisMonthAmount: 5700,
      isRecurring: true,
    },
    {
      code: "INCENTIVE",
      label: "Project Incentive",
      thisMonthAmount: 60000,
      isRecurring: false,
    },
  ];
  const ytdByCode = {
    BASIC: 50000,
    HRA: 25000,
    TRANSPORT: 10000,
    SPECIAL: 11400,
  };

  it("matches the reference worksheet's Actual/Projection/Total columns and every downstream figure", () => {
    const result = computeTdsWorksheet({
      regime: "new",
      components,
      ytdByCode,
      ytdTds: 0,
      remainingMonths: 10,
      slabs: NEW_REGIME_SLAB_FALLBACK,
    });

    expect(result.earnings).toEqual([
      {
        code: "BASIC",
        label: "Basic",
        thisMonthAmount: 25000,
        isRecurring: true,
        actual: 75000,
        projection: 225000,
        total: 300000,
      },
      {
        code: "HRA",
        label: "House Rent Allowance",
        thisMonthAmount: 12500,
        isRecurring: true,
        actual: 37500,
        projection: 112500,
        total: 150000,
      },
      {
        code: "TRANSPORT",
        label: "Transport Allowance",
        thisMonthAmount: 5000,
        isRecurring: true,
        actual: 15000,
        projection: 45000,
        total: 60000,
      },
      {
        code: "SPECIAL",
        label: "Special Allowance",
        thisMonthAmount: 5700,
        isRecurring: true,
        actual: 17100,
        projection: 51300,
        total: 68400,
      },
      {
        code: "INCENTIVE",
        label: "Project Incentive",
        thisMonthAmount: 60000,
        isRecurring: false,
        actual: 60000,
        projection: 0,
        total: 60000,
      },
    ]);
    expect(result.totalIncome).toBe(638400);
    expect(result.exemptionUnderSection10).toBe(0); // New Regime — no HRA exemption
    expect(result.incomeChargeableUnderSalaries).toBe(563400);
    expect(result.grossTotalIncome).toBe(563400);
    expect(result.totalIncomeRounded).toBe(563400);
    expect(result.taxOnTotalIncome).toBe(8170);
    expect(result.rebate).toBe(8170);
    expect(result.totalTaxOnIncome).toBe(0);
    expect(result.cess).toBe(0);
    expect(result.taxPayable).toBe(0);
    expect(result.tdsTillLastMonth).toBe(0);
    expect(result.tdsThisMonth).toBe(0);
    expect(result.totalTdsDeducted).toBe(0);
    expect(result.taxPayableOrRefundable).toBe(0);
    expect(result.tdsPerMonthGoingForward).toBe(0);
  });

  it("applies the Old Regime HRA exemption and Chapter VI-A deductions against the same recurring components", () => {
    const result = computeTdsWorksheet({
      regime: "old",
      components,
      ytdByCode,
      ytdTds: 0,
      remainingMonths: 10,
      slabs: OLD_REGIME_SLAB_FALLBACK,
      declaration: {
        monthlyRent: 15000,
        isMetroCity: false,
        lineItems: [{ code: "SEC80C", declaredAmount: 150000 }],
      },
    });

    // Annual basic = 300000, annual HRA = 150000, rent = 180000/yr, non-metro.
    // HRA exemption = min(150000, 180000-30000=150000, 40%*300000=120000) = 120000.
    expect(result.exemptionUnderSection10).toBe(120000);
    expect(result.chapterVIADeduction).toBe(150000);
    expect(result.totalIncomeRounded).toBeLessThan(
      computeTdsWorksheet({
        regime: "old",
        components,
        ytdByCode,
        ytdTds: 0,
        remainingMonths: 10,
        slabs: OLD_REGIME_SLAB_FALLBACK,
      }).totalIncomeRounded,
    );
  });

  it("keeps a one-time component's projection at 0 even when a recurring component of the same total exists", () => {
    const result = computeTdsWorksheet({
      regime: "new",
      components: [
        {
          code: "BASIC",
          label: "Basic",
          thisMonthAmount: 60000,
          isRecurring: true,
        },
        {
          code: "INCENTIVE",
          label: "Project Incentive",
          thisMonthAmount: 60000,
          isRecurring: false,
        },
      ],
      ytdByCode: {},
      ytdTds: 0,
      remainingMonths: 12,
      slabs: NEW_REGIME_SLAB_FALLBACK,
    });
    const basicRow = result.earnings.find((r) => r.code === "BASIC")!;
    const incentiveRow = result.earnings.find((r) => r.code === "INCENTIVE")!;
    expect(basicRow.projection).toBe(60000 * 11);
    expect(incentiveRow.projection).toBe(0);
  });
});

describe("computeForm16", () => {
  it("New Regime, full year, no withholding needed — nil tax and nil payable/refundable", () => {
    const components = [
      { code: "BASIC", label: "Basic", annualAmount: 300000 },
      { code: "HRA", label: "HRA", annualAmount: 150000 },
      { code: "CONVEYANCE", label: "Conveyance", annualAmount: 60000 },
    ];
    const result = computeForm16({
      regime: "new",
      components,
      totalTdsDeducted: 0,
      slabs: NEW_REGIME_SLAB_FALLBACK,
    });

    expect(result.grossSalary).toBe(510000);
    expect(result.exemptionUnderSection10).toBe(0);
    expect(result.incomeChargeableUnderSalaries).toBe(435000); // 510000 - 75000
    expect(result.totalIncomeRounded).toBe(435000);
    expect(result.taxOnTotalIncome).toBe(1750); // 5% of the 35000 above 4L
    expect(result.rebate).toBe(1750);
    expect(result.totalTaxOnIncome).toBe(0);
    expect(result.cess).toBe(0);
    expect(result.taxPayable).toBe(0);
    expect(result.totalTdsDeducted).toBe(0);
    expect(result.taxPayableOrRefundable).toBe(0);
  });

  it("Old Regime with a declaration, under-withheld — positive taxPayableOrRefundable (still owed)", () => {
    const components = [
      { code: "BASIC", label: "Basic", annualAmount: 600000 },
      { code: "HRA", label: "HRA", annualAmount: 300000 },
      { code: "CONVEYANCE", label: "Conveyance", annualAmount: 120000 },
    ];
    const result = computeForm16({
      regime: "old",
      components,
      totalTdsDeducted: 30000,
      slabs: OLD_REGIME_SLAB_FALLBACK,
      declaration: {
        monthlyRent: 20000,
        isMetroCity: true,
        lineItems: [{ code: "SEC80C", declaredAmount: 150000 }],
      },
    });

    expect(result.grossSalary).toBe(1020000);
    expect(result.exemptionUnderSection10).toBe(180000); // min(300000, 240000-60000, 0.5*600000)
    expect(result.chapterVIADeduction).toBe(150000);
    expect(result.totalIncomeRounded).toBe(640000); // 1020000-180000-50000-150000
    expect(result.taxOnTotalIncome).toBe(40500); // 12500 (2.5-5L@5%) + 28000 (5-6.4L@20%)
    expect(result.rebate).toBe(0); // above the 5L old-regime cliff
    expect(result.cess).toBe(1620);
    expect(result.taxPayable).toBe(42120);
    expect(result.taxPayableOrRefundable).toBe(12120); // 42120 - 30000, still owed
  });

  it("flips negative (refund due) when more was withheld than the final annual liability", () => {
    const components = [
      { code: "BASIC", label: "Basic", annualAmount: 600000 },
      { code: "HRA", label: "HRA", annualAmount: 300000 },
      { code: "CONVEYANCE", label: "Conveyance", annualAmount: 120000 },
    ];
    const result = computeForm16({
      regime: "old",
      components,
      totalTdsDeducted: 50000,
      slabs: OLD_REGIME_SLAB_FALLBACK,
      declaration: {
        monthlyRent: 20000,
        isMetroCity: true,
        lineItems: [{ code: "SEC80C", declaredAmount: 150000 }],
      },
    });

    expect(result.taxPayable).toBe(42120);
    expect(result.taxPayableOrRefundable).toBe(-7880); // over-withheld, refund due
  });
});
