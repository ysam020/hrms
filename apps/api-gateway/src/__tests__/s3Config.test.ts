/**
 * Staging isolation: the S3 bucket is configuration. Only a production
 * deployment may fall back to the historical production bucket; anything
 * else without S3_BUCKET gets a non-existent bucket (uploads fail closed).
 */
const PROD = "praesto-189923011190";

function loadWith(env: Record<string, string | undefined>) {
  const saved = { ...process.env };
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  let mod: typeof import("../config/s3") | undefined;
  jest.isolateModules(() => {
    mod = jest.requireActual("../config/s3");
  });
  process.env = saved;
  return mod!;
}

describe("S3 bucket configuration", () => {
  it("uses S3_BUCKET / S3_REGION when set", () => {
    const m = loadWith({
      S3_BUCKET: "praesto-staging",
      S3_REGION: "eu-west-1",
      DEPLOY_ENV: "staging",
    });
    expect(m.S3_BUCKET).toBe("praesto-staging");
    expect(m.s3FileUrl("k")).toBe(
      "https://praesto-staging.s3.eu-west-1.amazonaws.com/k",
    );
  });

  it("keeps the production bucket for DEPLOY_ENV=production without S3_BUCKET", () => {
    expect(
      loadWith({ S3_BUCKET: undefined, DEPLOY_ENV: "production" }).S3_BUCKET,
    ).toBe(PROD);
  });

  it.each(["staging", "development", undefined])(
    "never resolves to the production bucket for DEPLOY_ENV=%s without S3_BUCKET",
    (env) => {
      const m = loadWith({ S3_BUCKET: undefined, DEPLOY_ENV: env });
      expect(m.S3_BUCKET).not.toBe(PROD);
      expect(m.S3_BUCKET).toBe("s3-bucket-not-configured");
    },
  );
});
