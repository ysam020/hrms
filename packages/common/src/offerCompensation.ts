export interface OfferCompensationBreakup {
  basic: number;
  hra: number;
  transportAllowance: number;
  employerPF: number;
  specialAllowance: number;
  totalCTC: number;
}

// EPF statutory wage ceiling is Rs. 15,000/month — employer PF contribution
// is capped at 12% of that even when Basic exceeds it.
const EPF_WAGE_CEILING_ANNUAL = 180000;

// Hiring only captures a single gross annual salary figure, but an offer
// letter needs a Basic/HRA/etc. breakup. No such split exists elsewhere in
// the codebase (createSalaryStructure.ts takes flat amounts, it doesn't
// derive them from CTC), so this applies a standard indicative formula.
// specialAllowance is the balancing figure so the breakup always sums to
// exactly the entered CTC.
export function deriveOfferCompensationBreakup(
  annualCTC: number,
): OfferCompensationBreakup {
  const basic = Math.round(annualCTC * 0.4);
  const hra = Math.round(basic * 0.5);
  const transportAllowance = Math.round(annualCTC * 0.05);
  const employerPF = Math.round(
    Math.min(basic, EPF_WAGE_CEILING_ANNUAL) * 0.12,
  );
  const specialAllowance = Math.max(
    0,
    annualCTC - basic - hra - transportAllowance - employerPF,
  );
  return {
    basic,
    hra,
    transportAllowance,
    employerPF,
    specialAllowance,
    totalCTC: annualCTC,
  };
}

export const OFFER_COMPENSATION_DISCLAIMER =
  "This is an indicative annual compensation breakup for reference purposes. The final salary structure will be confirmed as per company policy at the time of onboarding.";
