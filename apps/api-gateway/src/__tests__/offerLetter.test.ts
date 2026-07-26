import { buildCompensationRowsFromComponents } from "../handlers/offerLetter";

describe("buildCompensationRowsFromComponents", () => {
  // Regression: the offer letter used to filter to type === "earning" only,
  // silently dropping PF/ESI/PT — so Total CTC undercounted by exactly
  // those amounts instead of matching the entered gross (×12), which the
  // hiring modal's own redistributeGross grosses up components to sum to.
  it("includes every component — earnings AND deductions like PF/ESI/PT — as a row", () => {
    const components = [
      { code: "BASIC", name: "Basic Pay", type: "earning", amount: 90046 },
      { code: "HRA", name: "HRA", type: "earning", amount: 45023 },
      {
        code: "CONVEYANCE",
        name: "Conveyance",
        type: "earning",
        amount: 45023,
      },
      { code: "PF", name: "Provident Fund", type: "deduction", amount: 16208 },
      { code: "ESI", name: "ESI", type: "deduction", amount: 3500 },
      { code: "PT", name: "Professional Tax", type: "deduction", amount: 200 },
    ];

    const { rows, totalCTC } = buildCompensationRowsFromComponents(components);

    expect(rows).toEqual([
      ["Basic Pay", 1080552],
      ["HRA", 540276],
      ["Conveyance", 540276],
      ["Provident Fund", 194496],
      ["ESI", 42000],
      ["Professional Tax", 2400],
    ]);
    // Monthly total (90046+45023+45023+16208+3500+200) × 12 = 24,00,000 —
    // matches the entered gross, not just the earnings-only 21,61,104.
    expect(totalCTC).toBe(2400000);
  });

  it("returns a zero total for an empty components array", () => {
    const { rows, totalCTC } = buildCompensationRowsFromComponents([]);
    expect(rows).toEqual([]);
    expect(totalCTC).toBe(0);
  });
});
