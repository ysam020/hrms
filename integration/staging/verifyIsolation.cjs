#!/usr/bin/env node
/**
 * Staging isolation pre-flight. READ-ONLY: opens no connection,
 * prints only masked hosts / booleans, never a secret value.
 *
 * Resolves the environment EXACTLY as packages/common/src/loadSecrets.ts
 * does (process env wins; then LOCAL_SECRETS_FILE if set, else the AWS
 * secret — this script only supports the file form, pass the staging secret
 * exported to a file) and fails if anything would reach production.
 *
 *   PROD_DENYLIST="<prod atlas host>,<prod s3 bucket>,<prod firebase id>,<prod redis host>" \
 *   LOCAL_SECRETS_FILE=./staging-secrets.json node integration/staging/verifyIsolation.cjs
 *
 * Exit code 0 = every check passed, 1 = at least one FAIL.
 */
const { readFileSync } = require("node:fs");
const path = require("node:path");

const env = { ...process.env };
if (env.LOCAL_SECRETS_FILE) {
  const s = JSON.parse(readFileSync(env.LOCAL_SECRETS_FILE, "utf8"));
  for (const [k, v] of Object.entries(s))
    if (env[k] === undefined) env[k] = String(v);
}
const deny = (env.PROD_DENYLIST || "")
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);
const hostOf = (v) =>
  (/^[a-z+]+:\/\/(?:[^@/]*@)?([^/?:,]+)/i.exec(String(v || "")) || [])[1] ||
  String(v || "");
const mask = (h) => (h ? `${h.slice(0, 10)}…` : "<unset>");
const hitsDeny = (v) =>
  deny.some((d) =>
    String(v || "")
      .toLowerCase()
      .includes(d),
  );

const results = [];
const check = (name, ok, detail) => results.push({ name, ok, detail });

if (!deny.length)
  check(
    "PROD_DENYLIST provided",
    false,
    "set PROD_DENYLIST to the production identifiers",
  );

// 1. MongoDB — master AND every tenant DB (tenantClientPool rewrites only the
//    database segment of DEV_MONGODB_URI, so the HOST decides isolation).
const mongo = env.DEV_MONGODB_URI;
check("DEV_MONGODB_URI set", !!mongo, mask(hostOf(mongo)));
check(
  "Mongo host is not production (master + all tenant DBs share it)",
  !!mongo && !hitsDeny(hostOf(mongo)),
  mask(hostOf(mongo)),
);

// 2. AWS secret name — loadSecrets falls back to the PRODUCTION secret
//    "hrms/config" when AWS_SECRET_NAME is unset and no LOCAL_SECRETS_FILE.
if (!env.LOCAL_SECRETS_FILE) {
  check(
    "AWS_SECRET_NAME is set and is not the production secret",
    !!env.AWS_SECRET_NAME && env.AWS_SECRET_NAME !== "hrms/config",
    env.AWS_SECRET_NAME || "<unset → hrms/config>",
  );
}

// 3. Redis — REDIS_URL (cache, rate limit, refresh tokens) AND REDIS_HOST
//    (BullMQ, socket publisher) must BOTH be staging.
check(
  "REDIS_URL host is not production",
  !!env.REDIS_URL && !hitsDeny(hostOf(env.REDIS_URL)),
  mask(hostOf(env.REDIS_URL)),
);
check(
  "REDIS_HOST is not production",
  !!env.REDIS_HOST && !hitsDeny(env.REDIS_HOST),
  mask(env.REDIS_HOST),
);

// 4. S3 — the bucket is a CONSTANT in apps/api-gateway/src/config/s3.ts, not
//    configuration; staging uploads go to the production bucket unless the
//    staging IAM role cannot write it.
try {
  const s3 = readFileSync(
    path.join(__dirname, "../../apps/api-gateway/src/config/s3.ts"),
    "utf8",
  );
  const bucket = (/S3_BUCKET\s*=\s*"([^"]+)"/.exec(s3) || [])[1];
  check(
    "S3 bucket is configurable / not production",
    !!bucket && !hitsDeny(bucket),
    bucket ? `hardcoded ${mask(bucket)}` : "configurable",
  );
} catch {
  check(
    "S3 config readable",
    false,
    "apps/api-gateway/src/config/s3.ts not found",
  );
}

// 5. Firebase — a production project would push to real employees' devices.
check(
  "FIREBASE_PROJECT_ID is not production",
  !!env.FIREBASE_PROJECT_ID && !hitsDeny(env.FIREBASE_PROJECT_ID),
  env.FIREBASE_PROJECT_ID ? "set" : "<unset>",
);

// 6. Payments — live keys move real money (RazorpayX payouts!).
for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_X_KEY_ID"]) {
  check(
    `${k} is a test key`,
    !env[k] || String(env[k]).startsWith("rzp_test"),
    env[k]
      ? String(env[k]).startsWith("rzp_live")
        ? "LIVE"
        : "test/other"
      : "<unset>",
  );
}

// 7. Workers / schedulers — crons stay off until staging data is synthetic.
check(
  "SCHEDULER_ENABLED is not 'true'",
  env.SCHEDULER_ENABLED !== "true",
  env.SCHEDULER_ENABLED || "<unset>",
);
check(
  "ATTENDANCE_RECONCILE_ENABLED is not 'true'",
  env.ATTENDANCE_RECONCILE_ENABLED !== "true",
  env.ATTENDANCE_RECONCILE_ENABLED || "<unset>",
);

// 8. Logging — staging must not write into production log groups.
check(
  "CloudWatch log group is not production",
  !env.AWS_CLOUDWATCH_LOG_GROUP ||
    (!hitsDeny(env.AWS_CLOUDWATCH_LOG_GROUP) &&
      !/prod/i.test(env.AWS_CLOUDWATCH_LOG_GROUP)),
  env.AWS_CLOUDWATCH_LOG_GROUP || "<unset>",
);

// 9. Email — real addresses in copied data would receive staging mail.
check(
  "RESEND_API_KEY unset or explicitly a staging key (manual)",
  !env.RESEND_API_KEY || env.STAGING_EMAIL_SANDBOX === "true",
  env.RESEND_API_KEY ? "set" : "<unset>",
);

// 10. Secrets — tokens minted in staging must not verify in production.
for (const k of [
  "ACCESS_JWT_TOKEN",
  "REFRESH_TOKEN",
  "AES_SECRET_KEY",
  "CRYPTO_ENCRYPTION_KEY",
  "CSRF_SECRET",
]) {
  check(
    `${k} set (must differ from production — compare out of band)`,
    !!env[k],
    env[k] ? "set" : "<unset>",
  );
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}  [${r.detail}]`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
