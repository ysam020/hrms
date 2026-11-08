import {
  isNonProductionOnSharedDatabase,
  outboundSideEffectsAllowed,
  assertLivePaymentAllowed,
  DevSideEffectBlockedError,
} from "../runtimeSafety";

const SHARED = "mongodb+srv://u:p@cluster.example.mongodb.net/db";
const env = (over: object) => over as NodeJS.ProcessEnv;

describe("isNonProductionOnSharedDatabase", () => {
  it("is true for dev on a remote database", () => {
    expect(
      isNonProductionOnSharedDatabase(env({ DEV_MONGODB_URI: SHARED })),
    ).toBe(true);
  });
  it("is false in production", () => {
    expect(
      isNonProductionOnSharedDatabase(
        env({ DEV_MONGODB_URI: SHARED, NODE_ENV: "production" }),
      ),
    ).toBe(false);
  });
  it.each([
    "mongodb://127.0.0.1:37017/x",
    "mongodb://localhost/x",
    "mongodb://hrms-dev-mongodb:27017/x",
    "",
  ])("is false for local database %p", (uri) => {
    expect(isNonProductionOnSharedDatabase(env({ DEV_MONGODB_URI: uri }))).toBe(
      false,
    );
  });
});

describe("outboundSideEffectsAllowed", () => {
  it("blocks dev on a shared database", () => {
    expect(outboundSideEffectsAllowed(env({ DEV_MONGODB_URI: SHARED }))).toBe(
      false,
    );
  });
  it("can be overridden deliberately", () => {
    expect(
      outboundSideEffectsAllowed(
        env({ DEV_MONGODB_URI: SHARED, ALLOW_DEV_SIDE_EFFECTS: "true" }),
      ),
    ).toBe(true);
  });
});

describe("assertLivePaymentAllowed", () => {
  it("blocks live keys from dev", () => {
    expect(() =>
      assertLivePaymentAllowed(
        env({ DEV_MONGODB_URI: SHARED, RAZORPAY_KEY_ID: "rzp_live_x" }),
      ),
    ).toThrow(DevSideEffectBlockedError);
  });
  it("allows test keys from dev", () => {
    expect(() =>
      assertLivePaymentAllowed(
        env({ DEV_MONGODB_URI: SHARED, RAZORPAY_KEY_ID: "rzp_test_x" }),
      ),
    ).not.toThrow();
  });
  it("allows live keys in production", () => {
    expect(() =>
      assertLivePaymentAllowed(
        env({
          DEV_MONGODB_URI: SHARED,
          RAZORPAY_KEY_ID: "rzp_live_x",
          NODE_ENV: "production",
        }),
      ),
    ).not.toThrow();
  });
});
