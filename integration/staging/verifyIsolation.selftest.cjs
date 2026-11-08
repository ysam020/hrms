#!/usr/bin/env node
/**
 * Self-test for verifyIsolation.cjs: a fully isolated staging fixture must
 * PASS; changing any single item to a production value must FAIL with that
 * item named. Synthetic values only (no real hosts, keys or accounts).
 *
 *   node integration/staging/verifyIsolation.selftest.cjs
 */
const { mkdtempSync, writeFileSync } = require("node:fs");
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const path = require("node:path");
const os = require("node:os");

const dir = mkdtempSync(path.join(os.tmpdir(), "verify-isolation-"));
const VERIFY = path.join(__dirname, "verifyIsolation.cjs");
const PROD = {
  account: "111111111111",
  atlas: "prod-cluster.example-atlas.net",
  redis: "prod-redis.internal",
  bucket: "praesto-111111111111",
  firebase: "praesto-prod-fcm",
};
const SERVICES = [
  "api-gateway",
  "auth-service",
  "user-service",
  "employee-service",
  "attendance-service",
  "leave-service",
  "recruitment-service",
  "hrm-service",
  "salary-service",
  "analytics-service",
  "notification-service",
  "performance-review-service",
  "scheduler-service",
];

const goodSecret = () => ({
  SECRET_ENV: "staging",
  DEV_MONGODB_URI:
    "mongodb+srv://svc:pw@staging-cluster.example-atlas.net/hrms-staging",
  REDIS_URL: "redis://redis:6379",
  REDIS_HOST: "redis",
  S3_BUCKET: "praesto-staging-222222222222",
  FIREBASE_PROJECT_ID: "praesto-staging-fcm",
  RAZORPAY_KEY_ID: "rzp_test_abc",
  ACCESS_JWT_TOKEN: "staging-access",
  REFRESH_TOKEN: "staging-refresh",
  CRYPTO_ENCRYPTION_KEY: "staging-crypto",
  AES_SECRET_KEY: "staging-aes",
  CSRF_SECRET: "staging-csrf",
});
const goodCompose = () => ({
  services: {
    ...Object.fromEntries(
      SERVICES.map((s) => [
        s,
        {
          environment: {
            SERVICE_NAME: s,
            DEPLOY_ENV: "staging",
            AWS_SECRET_NAME: "hrms/config/staging",
            SCHEDULER_ENABLED: "false",
          },
        },
      ]),
    ),
    grafana: {
      environment: {
        GF_SERVER_ROOT_URL: "https://grafana.staging.example.test",
      },
    },
    "grafana-auth": {
      command: [
        'hash=$(aws secretsmanager get-secret-value --region ap-south-1 --secret-id "hrms/config/staging-grafana-basic-auth" --query SecretString)',
      ],
    },
  },
  configs: {
    caddyfile: {
      content:
        "api.staging.example.test {\n\treverse_proxy https://api-gateway:9002\n}\n\ngrafana.staging.example.test {\n\treverse_proxy grafana:3000\n}\n",
    },
  },
});
const goodIdentity = () => ({
  Account: "222222222222",
  Arn: "arn:aws:sts::222222222222:assumed-role/hrms-staging-HrmsInstanceRole/i-0abc",
});
const sha = (v) => createHash("sha256").update(v).digest("hex").slice(0, 12);

function run(secret, compose, identity, extraEnv = {}, argv = null) {
  const f = (n, o) => {
    const p = path.join(dir, n);
    writeFileSync(p, JSON.stringify(o));
    return p;
  };
  const a = argv ?? [
    "--compose",
    f("c.json", compose),
    "--aws-identity",
    f("i.json", identity),
  ];
  try {
    const out = execFileSync("node", [VERIFY, ...a], {
      env: {
        PATH: process.env.PATH,
        LOCAL_SECRETS_FILE: f("s.json", secret),
        PROD_DENYLIST: [
          PROD.atlas,
          PROD.redis,
          PROD.bucket,
          PROD.firebase,
        ].join(","),
        PROD_ACCOUNT_ID: PROD.account,
        ...extraEnv,
      },
      encoding: "utf8",
    });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status, out: e.stdout };
  }
}

const cases = [
  [
    "MongoDB host is production",
    (s) => (s.DEV_MONGODB_URI = `mongodb+srv://u:p@${PROD.atlas}/hrms`),
    "Mongo host is not production",
  ],
  [
    "REDIS_URL is production",
    (s) => (s.REDIS_URL = `redis://${PROD.redis}:6379`),
    "REDIS_URL host is not production",
  ],
  [
    "REDIS_HOST is production",
    (s) => (s.REDIS_HOST = PROD.redis),
    "REDIS_HOST is not production",
  ],
  [
    "S3 bucket is production",
    (s) => (s.S3_BUCKET = PROD.bucket),
    "S3_BUCKET set for api-gateway",
  ],
  [
    "S3 bucket missing",
    (s) => delete s.S3_BUCKET,
    "S3_BUCKET set for api-gateway",
  ],
  [
    "Firebase project is production",
    (s) => (s.FIREBASE_PROJECT_ID = PROD.firebase),
    "FIREBASE_PROJECT_ID",
  ],
  [
    "Razorpay live key",
    (s) => (s.RAZORPAY_KEY_ID = "rzp_live_xyz"),
    "RAZORPAY_KEY_ID",
  ],
  [
    "Secret tagged production",
    (s) => (s.SECRET_ENV = "production"),
    "SECRET_ENV",
  ],
  ["Secret untagged", (s) => delete s.SECRET_ENV, "SECRET_ENV"],
  [
    "Log group is production",
    (s) => (s.AWS_CLOUDWATCH_LOG_GROUP = "/hrms/production"),
    "CloudWatch log group",
  ],
  [
    "Service DEPLOY_ENV production",
    (_s, c) =>
      (c.services["api-gateway"].environment.DEPLOY_ENV = "production"),
    "api-gateway: DEPLOY_ENV",
  ],
  [
    "Service uses the production secret",
    (_s, c) =>
      (c.services["auth-service"].environment.AWS_SECRET_NAME = "hrms/config"),
    "auth-service: DEPLOY_ENV",
  ],
  [
    "Service mounts local secrets",
    (_s, c) =>
      (c.services["user-service"].environment.LOCAL_SECRETS_FILE =
        "/app/local-secrets.json"),
    "user-service: DEPLOY_ENV",
  ],
  [
    "Scheduler enabled",
    (_s, c) =>
      (c.services["scheduler-service"].environment.SCHEDULER_ENABLED = "true"),
    "scheduler-service: DEPLOY_ENV",
  ],
  [
    "Attendance reconciliation enabled",
    (_s, c) =>
      (c.services[
        "scheduler-service"
      ].environment.ATTENDANCE_RECONCILE_ENABLED = "true"),
    "scheduler-service: DEPLOY_ENV",
  ],
  [
    "Caddy API hostname is production",
    (_s, c) =>
      (c.configs.caddyfile.content = c.configs.caddyfile.content.replace(
        "api.staging.example.test",
        "api.praesto.in",
      )),
    "Caddy site is not a production hostname",
  ],
  [
    "Caddy Grafana hostname is production",
    (_s, c) =>
      (c.configs.caddyfile.content = c.configs.caddyfile.content.replace(
        "grafana.staging.example.test",
        "grafana.praesto.in",
      )),
    "Caddy site is not a production hostname",
  ],
  [
    "Grafana root URL is production",
    (_s, c) =>
      (c.services.grafana.environment.GF_SERVER_ROOT_URL =
        "https://grafana.praesto.in"),
    "Grafana root URL",
  ],
  [
    "Grafana auth secret is production",
    (_s, c) =>
      (c.services["grafana-auth"].command[0] = c.services[
        "grafana-auth"
      ].command[0].replace(
        "hrms/config/staging-grafana-basic-auth",
        "hrms/config-grafana-basic-auth",
      )),
    "Grafana basic-auth secret",
  ],
  [
    "AWS account is production",
    (_s, _c, i) => (i.Account = PROD.account),
    "AWS account is not the production account",
  ],
  [
    "Running as an IAM user/root",
    (_s, _c, i) => (i.Arn = "arn:aws:iam::222222222222:root"),
    "assumed (instance) role",
  ],
];

let failures = 0;
const base = run(goodSecret(), goodCompose(), goodIdentity());
if (base.code !== 0) {
  failures++;
  console.log("FAIL  isolated staging fixture should pass:\n" + base.out);
} else console.log("PASS  isolated staging fixture passes");
for (const [name, mutate, expectCheck] of cases) {
  const s = goodSecret(),
    c = goodCompose(),
    i = goodIdentity();
  mutate(s, c, i);
  const r = run(s, c, i);
  const named = (r.out || "")
    .split("\n")
    .some((l) => l.startsWith("FAIL") && l.includes(expectCheck));
  const ok = r.code === 1 && named;
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name} → verifier fails${named ? "" : ` (expected a FAIL naming "${expectCheck}")`}`,
  );
}
// Secret identical to production (fingerprint supplied out of band).
{
  const r = run(goodSecret(), goodCompose(), goodIdentity(), {
    PROD_SECRET_FINGERPRINTS: `ACCESS_JWT_TOKEN=${sha("staging-access")}`,
  });
  const ok = r.code === 1 && r.out.includes("FAIL  [secrets] ACCESS_JWT_TOKEN");
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  JWT secret equal to production (fingerprint) → verifier fails`,
  );
}
// Missing inputs fail closed.
{
  const r = run(goodSecret(), goodCompose(), goodIdentity(), {}, []);
  const ok =
    r.code === 1 &&
    r.out.includes("--compose") &&
    r.out.includes("--aws-identity");
  if (!ok) failures++;
  console.log(
    `${ok ? "PASS" : "FAIL"}  missing compose/identity inputs → verifier fails`,
  );
}
// No secret value ever printed.
{
  const r = run(goodSecret(), goodCompose(), goodIdentity());
  const leaked = [
    "staging-access",
    "staging-refresh",
    "svc:pw",
    "rzp_test_abc",
  ].filter((v) => (r.out || "").includes(v));
  if (leaked.length) failures++;
  console.log(
    `${leaked.length ? "FAIL" : "PASS"}  no secret values in the output${leaked.length ? ` (leaked: ${leaked.length})` : ""}`,
  );
}
console.log(`\n${failures === 0 ? "all checks passed" : `${failures} FAILED`}`);
process.exit(failures ? 1 : 0);
