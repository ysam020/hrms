export const DEFAULT_MONTHLY_PAID_LEAVES = 1;
export const DEFAULT_CARRY_FORWARD_LEAVES = 15;

export const getLeaveConfig = () => ({
  monthlyPaidLeaves:
    Number(process.env.PAID_LEAVES) || DEFAULT_MONTHLY_PAID_LEAVES,
  carryForwardLeaves:
    Number(process.env.CARRY_FORWARD_LEAVES) || DEFAULT_CARRY_FORWARD_LEAVES,
});
