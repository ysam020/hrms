#!/usr/bin/env node
/**
 * Staging isolation pre-flight. READ-ONLY: opens no connection and prints
 * only masked hosts, booleans and short hash prefixes, never a secret value.
 * Exit code 0 = every check passed; 1 = at least one FAIL (or a required
 * input is missing).
 *
 * Inputs (all produced ON THE STAGING HOST, by the staging role):
 *   LOCAL_SECRETS_FILE   the staging secret exported to a file (tmpfs), resolved
 *                        exactly like packages/common/src/loadSecrets.ts
 *                        (process env wins, then the file)
 *   --compose <file>     `docker compose -f docker-compose.prod.yml
 *                        -f docker-compose.staging.yml config --format json`
 *   --aws-identity <f>   `aws sts get-caller-identity` output
 *   --expect-env <name>  environment the stack must be (default: staging)
 *
 *   PROD_DENYLIST            comma-separated production identifiers (Atlas host,
 *                            Redis host, bucket, Firebase project id, hostnames)
 *   PROD_ACCOUNT_ID          the production AWS account id
 *   PROD_SECRET_FINGERPRINTS optional "KEY=sha256prefix,…" supplied out of band by
 *                            the production owner; a staging secret with the same
 *                            fingerprint fails (values are never compared in clear)
 *
 *   node integration/staging/verifyIsolation.cjs --compose rendered.json \
 *     --aws-identity identity.json            # with the env vars above
 */
const { readFileSync } = require("node:fs");
const { createHash } = require("node:crypto");
const path = require("node:path");

const args = process.argv.slice(2);
const arg = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const expectEnv = arg("--expect-env") || "staging";

const env = { ...process.env };
let secretFile = {};
if (env.LOCAL_SECRETS_FILE) {
  secretFile = JSON.parse(readFileSync(env.LOCAL_SECRETS_FILE, "utf8"));
  for (const [k, v] of Object.entries(secretFile))
    if (env[k] === undefined) env[k] = String(v);
}
const deny = (env.PROD_DENYLIST || "")
  .split(",")
  .map((x) => x.trim().toLowerCase())
  .filter(Boolean);
// Production hostnames that are public anyway (exact match: a staging
// subdomain of the same root domain is allowed).
const PROD_HOSTS = new Set([
  "api.praesto.in",
  "grafana.praesto.in",
  "praesto.in",
]);
const PROD_SECRET_NAMES = new Set([
  "hrms/config",
  "hrms/config-production",
  "hrms/config-grafana-basic-auth",
]);

const hostOf = (v) =>
  (/^[a-z+]+:\/\/(?:[^@/]*@)?([^/?:,]+)/i.exec(String(v || "")) || [])[1] ||
  String(v || "");
const mask = (h) => (h ? `${String(h).slice(0, 10)}…` : "<unset>");
const isProd = (v) => {
  const s = String(v || "").toLowerCase();
  return (
    PROD_HOSTS.has(hostOf(s).toLowerCase()) ||
    deny.some((d) => s.includes(d)) ||
    (!!env.PROD_ACCOUNT_ID && s.includes(env.PROD_ACCOUNT_ID))
  );
};

const results = [];
const check = (group, name, ok, detail) =>
  results.push({ group, name, ok: !!ok, detail });

// ── Inputs ────────────────────────────────────────────────────────────────
check(
  "inputs",
  "PROD_DENYLIST provided",
  deny.length > 0,
  `${deny.length} entries`,
);
check(
  "inputs",
  "PROD_ACCOUNT_ID provided",
  !!env.PROD_ACCOUNT_ID,
  env.PROD_ACCOUNT_ID ? "set" : "<unset>",
);
check(
  "inputs",
  "staging secret provided (LOCAL_SECRETS_FILE)",
  Object.keys(secretFile).length > 0,
  env.LOCAL_SECRETS_FILE ? "file" : "<unset>",
);

// ── Secret: environment tag ───────────────────────────────────────────────
check(
  "secret",
  `SECRET_ENV = "${expectEnv}" (read from the secret only)`,
  secretFile.SECRET_ENV === expectEnv,
  secretFile.SECRET_ENV || "<missing>",
);

// ── MongoDB (master + every tenant DB share this host) ────────────────────
const mongo = env.DEV_MONGODB_URI;
check("mongodb", "DEV_MONGODB_URI set", !!mongo, mask(hostOf(mongo)));
check(
  "mongodb",
  "Mongo host is not production",
  !!mongo && !isProd(hostOf(mongo)),
  mask(hostOf(mongo)),
);

// ── Redis (REDIS_URL: cache/rate limit/refresh; REDIS_HOST: BullMQ, sockets) ─
check(
  "redis",
  "REDIS_URL host is not production",
  !!env.REDIS_URL && !isProd(hostOf(env.REDIS_URL)),
  mask(hostOf(env.REDIS_URL)),
);
check(
  "redis",
  "REDIS_HOST is not production",
  !!env.REDIS_HOST && !isProd(env.REDIS_HOST),
  mask(env.REDIS_HOST),
);

// ── S3 (every service's config/s3.ts) ─────────────────────────────────────
for (const svc of ["api-gateway", "recruitment-service"]) {
  const file = `apps/${svc}/src/config/s3.ts`;
  try {
    const s3 = readFileSync(path.join(__dirname, "../..", file), "utf8");
    const constant = (/S3_BUCKET\s*=\s*"([^"]+)"/.exec(s3) || [])[1];
    const configurable = /process\.env\.S3_BUCKET/.test(s3);
    if (constant && !configurable) {
      check(
        "s3",
        `S3 bucket (${svc}) is configurable / not production`,
        !isProd(constant),
        `hardcoded ${mask(constant)}`,
      );
    } else {
      check(
        "s3",
        `S3_BUCKET set for ${svc} and not production`,
        !!env.S3_BUCKET && !isProd(env.S3_BUCKET),
        env.S3_BUCKET ? mask(env.S3_BUCKET) : "<unset — uploads fail closed>",
      );
    }
  } catch {
    check("s3", `S3 config readable (${svc})`, false, `${file} not found`);
  }
}

// ── Firebase / payments / email / logs ────────────────────────────────────
check(
  "firebase",
  "FIREBASE_PROJECT_ID set and not production",
  !!env.FIREBASE_PROJECT_ID && !isProd(env.FIREBASE_PROJECT_ID),
  env.FIREBASE_PROJECT_ID ? "set" : "<unset>",
);
for (const k of ["RAZORPAY_KEY_ID", "RAZORPAY_X_KEY_ID"]) {
  const v = env[k];
  check(
    "razorpay",
    `${k} unset or a test-mode key`,
    !v || String(v).startsWith("rzp_test"),
    v ? (String(v).startsWith("rzp_live") ? "LIVE" : "test/other") : "<unset>",
  );
}
check(
  "email",
  "RESEND_API_KEY unset or explicitly a staging key",
  !env.RESEND_API_KEY || env.STAGING_EMAIL_SANDBOX === "true",
  env.RESEND_API_KEY ? "set" : "<unset>",
);
check(
  "logs",
  "CloudWatch log group is not production",
  !env.AWS_CLOUDWATCH_LOG_GROUP ||
    (!isProd(env.AWS_CLOUDWATCH_LOG_GROUP) &&
      !/production|prod\b/i.test(env.AWS_CLOUDWATCH_LOG_GROUP)),
  env.AWS_CLOUDWATCH_LOG_GROUP ||
    "<unset (per-service, labelled by DEPLOY_ENV)>",
);

// ── Secret material must differ from production (fingerprints only) ───────
const prodFp = Object.fromEntries(
  (env.PROD_SECRET_FINGERPRINTS || "")
    .split(",")
    .map((x) => x.trim().split("="))
    .filter((p) => p.length === 2),
);
for (const k of [
  "ACCESS_JWT_TOKEN",
  "REFRESH_TOKEN",
  "CRYPTO_ENCRYPTION_KEY",
  "AES_SECRET_KEY",
  "CSRF_SECRET",
]) {
  const v = secretFile[k];
  const fp = v
    ? createHash("sha256").update(String(v)).digest("hex").slice(0, 12)
    : null;
  const known = prodFp[k];
  check(
    "secrets",
    `${k} set${known ? " and differs from production" : " (production fingerprint not supplied)"}`,
    !!v && (!known || (!fp.startsWith(known) && !known.startsWith(fp))),
    v ? `sha256:${fp.slice(0, 6)}…` : "<unset>",
  );
}

// ── Rendered compose configuration ────────────────────────────────────────
const composePath = arg("--compose");
if (!composePath) {
  check(
    "compose",
    "rendered compose config provided (--compose)",
    false,
    "<missing>",
  );
} else {
  const c = JSON.parse(readFileSync(composePath, "utf8"));
  const services = c.services || {};
  const backend = Object.entries(services).filter(
    ([, s]) => s && s.environment && s.environment.SERVICE_NAME,
  );
  check(
    "compose",
    "backend services found",
    backend.length >= 13,
    String(backend.length),
  );
  for (const [name, s] of backend) {
    const e = s.environment;
    const ok =
      e.DEPLOY_ENV === expectEnv &&
      !!e.AWS_SECRET_NAME &&
      !PROD_SECRET_NAMES.has(e.AWS_SECRET_NAME) &&
      !("LOCAL_SECRETS_FILE" in e) &&
      e.SCHEDULER_ENABLED !== "true" &&
      e.ATTENDANCE_RECONCILE_ENABLED !== "true";
    check(
      "compose",
      `${name}: DEPLOY_ENV=${expectEnv}, own secret, no local secrets, scheduler/reconcile off`,
      ok,
      `${e.DEPLOY_ENV || "<unset>"} / ${e.AWS_SECRET_NAME || "<unset>"}`,
    );
  }
  const caddy =
    (c.configs && c.configs.caddyfile && c.configs.caddyfile.content) || "";
  const sites = caddy
    .split("\n")
    .filter((l) => /^\S.*\{\s*$/.test(l))
    .map((l) => l.replace(/\{\s*$/, "").trim());
  check(
    "hostnames",
    "Caddy serves at least the API and Grafana sites",
    sites.length >= 2,
    sites.map(mask).join(", ") || "<none>",
  );
  for (const h of sites)
    check(
      "hostnames",
      `Caddy site is not a production hostname`,
      !isProd(h),
      h,
    );
  const gfRoot =
    services.grafana &&
    services.grafana.environment &&
    services.grafana.environment.GF_SERVER_ROOT_URL;
  check(
    "hostnames",
    "Grafana root URL is not production",
    !!gfRoot && !isProd(gfRoot),
    gfRoot || "<unset>",
  );
  const gaCmd = JSON.stringify((services["grafana-auth"] || {}).command || "");
  const gaSecret = (/--secret-id\s+\\?"?([A-Za-z0-9/_+=.@-]+)/.exec(gaCmd) ||
    [])[1];
  check(
    "hostnames",
    "Grafana basic-auth secret is not the production secret",
    !!gaSecret && !PROD_SECRET_NAMES.has(gaSecret),
    gaSecret || "<unparsed>",
  );
  check(
    "compose",
    "no production hostname anywhere in the rendered config",
    !/(^|[^.\w-])(api|grafana)\.praesto\.in\b/.test(JSON.stringify(c)),
    "scan",
  );
}

// ── AWS account and role ──────────────────────────────────────────────────
const idPath = arg("--aws-identity");
if (!idPath) {
  check("aws", "caller identity provided (--aws-identity)", false, "<missing>");
} else {
  const id = JSON.parse(readFileSync(idPath, "utf8"));
  check(
    "aws",
    "AWS account is not the production account",
    !!id.Account && id.Account !== env.PROD_ACCOUNT_ID,
    mask(id.Account),
  );
  const role = (/:assumed-role\/([^/]+)\//.exec(id.Arn || "") || [])[1] || "";
  check(
    "aws",
    "running as an assumed (instance) role, not a user or root",
    !!role,
    role ? mask(role) : "<not an assumed role>",
  );
}

let failed = 0;
for (const r of results) {
  if (!r.ok) failed++;
  console.log(
    `${r.ok ? "PASS" : "FAIL"}  [${r.group}] ${r.name}  [${r.detail}]`,
  );
}
console.log(`\n${results.length - failed}/${results.length} passed`);
process.exit(failed ? 1 : 0);
