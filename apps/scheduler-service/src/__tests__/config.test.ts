import { getLeaveConfig } from "../config";

describe("getLeaveConfig", () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    process.env = { ...ORIGINAL_ENV };
    delete process.env.PAID_LEAVES;
    delete process.env.CARRY_FORWARD_LEAVES;
  });

  afterAll(() => {
    process.env = ORIGINAL_ENV;
  });

  it("falls back to the documented defaults when env vars are unset", () => {
    expect(getLeaveConfig()).toEqual({
      monthlyPaidLeaves: 1,
      carryForwardLeaves: 15,
    });
  });

  it("uses env var overrides when set", () => {
    process.env.PAID_LEAVES = "2";
    process.env.CARRY_FORWARD_LEAVES = "20";
    expect(getLeaveConfig()).toEqual({
      monthlyPaidLeaves: 2,
      carryForwardLeaves: 20,
    });
  });

  it("falls back to defaults when an env var is not a valid number", () => {
    process.env.PAID_LEAVES = "not-a-number";
    expect(getLeaveConfig().monthlyPaidLeaves).toBe(1);
  });

  it("falls back to defaults when an env var is an empty string", () => {
    process.env.CARRY_FORWARD_LEAVES = "";
    expect(getLeaveConfig().carryForwardLeaves).toBe(15);
  });
});
