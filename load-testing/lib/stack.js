// Lifecycle of the isolated loadtest stack: per-run JWT secret, rate-limit
// overrides (applied and ALWAYS restored), Prometheus scrape targets.
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { environment, REPO_ROOT, STATE_DIR } from "../config/environments.js";

export const STACK_ENV = resolve(STATE_DIR, "stack.env");
export const RATE_LIMIT_ENV = resolve(STATE_DIR, "ratelimit.env");
export const RATE_LIMIT_RECORD = resolve(STATE_DIR, "ratelimit-record.json");
const PROM_FILE = resolve(REPO_ROOT, "monitoring/prometheus.yml");
const PROM_BEGIN =
  "  # >>> loadtest stack (added by load-testing/lib/stack.js; removed on `stack down`)";
const PROM_END = "  # <<< loadtest stack";

// Every rate limiter in the gateway, with its coded default (verified by
// reading apps/api-gateway/src/config/rateLimiters.ts and
// middleware/rateLimiter.ts on 2026-11-05). Recorded into
// ratelimit-record.json before any override is applied.
export const RATE_LIMITERS = [
  {
    env: "AUTH",
    name: "authLimiter",
    key: "user or IP",
    window: "15 min",
    max: 1000,
    scope: "login/webauthn/google, /refresh-token",
  },
  {
    env: "PROFILE",
    name: "profileLimiter",
    key: "user or IP",
    window: "1 min",
    max: 300,
    scope: "/api/v1/profile",
  },
  {
    env: "GENERAL",
    name: "generalLimiter",
    key: "user or IP",
    window: "1 min",
    max: 10000,
    scope: "every /api request",
  },
  {
    env: "PUBLIC",
    name: "publicLimiter",
    key: "user or IP",
    window: "15 min",
    max: 2500,
    scope: "public careers routes",
  },
  {
    env: "DRAFT_RECOVERY",
    name: "draftRecoveryLimiter",
    key: "IP",
    window: "15 min",
    max: 10,
    scope: "careers draft recovery",
  },
  {
    env: "APPLY_WRITE",
    name: "applicationWriteLimiter",
    key: "IP",
    window: "15 min",
    max: 60,
    scope: "careers application writes (POST)",
  },
  {
    env: "DEFAULT",
    name: "defaultLimiter",
    key: "IP (no keyGenerator)",
    window: "1 min",
    max: 5000,
    scope: "everything after authRouter (all business routes)",
  },
];

// Raised only for the limiters a GET-only benchmark actually passes through,
// high enough that no stage up to the configured maximum can reach them.
export const LOADTEST_OVERRIDES = {
  DEFAULT: 50_000_000,
  GENERAL: 50_000_000,
  PROFILE: 50_000_000,
};

const compose = (...args) =>
  execFileSync(
    "docker",
    [
      "compose",
      "-f",
      environment.composeFile,
      "-p",
      environment.composeProject,
      ...args,
    ],
    {
      cwd: REPO_ROOT,
      env: { ...process.env, ...readStackEnv() },
      stdio: ["ignore", "pipe", "pipe"],
      encoding: "utf8",
      maxBuffer: 64 * 1024 * 1024,
    },
  );

export function readStackEnv() {
  if (!existsSync(STACK_ENV)) return {};
  return Object.fromEntries(
    readFileSync(STACK_ENV, "utf8")
      .split("\n")
      .filter((l) => l.includes("="))
      .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
  );
}

function ensureStackEnv() {
  mkdirSync(STATE_DIR, { recursive: true });
  if (!existsSync(STACK_ENV)) {
    // Per-run signing key: tokens minted for the benchmark only verify on
    // this stack, never on production or the dev stack.
    writeFileSync(
      STACK_ENV,
      `LOADTEST_JWT_SECRET=${randomBytes(48).toString("base64url")}\n`,
      { mode: 0o600 },
    );
  }
  if (!existsSync(RATE_LIMIT_ENV))
    writeFileSync(RATE_LIMIT_ENV, "", { mode: 0o600 });
}

function promBlock() {
  const lines = [PROM_BEGIN];
  for (const [svc, port] of Object.entries(environment.metricsPorts)) {
    lines.push(
      `  - job_name: loadtest-${svc}`,
      "    static_configs:",
      `      - targets: ["host.docker.internal:${port}"]`,
      "        labels:",
      `          service: loadtest-${svc}`,
      "          stack: loadtest",
    );
  }
  lines.push(PROM_END);
  return lines.join("\n");
}

function stripPromBlock(text) {
  const start = text.indexOf(PROM_BEGIN);
  if (start < 0) return text;
  const end = text.indexOf(PROM_END, start);
  return (
    text.slice(0, start).replace(/\n+$/, "\n") +
    text.slice(end + PROM_END.length).replace(/^\n/, "")
  );
}

async function reloadPrometheus() {
  const res = await fetch(`${environment.prometheusUrl}/-/reload`, {
    method: "POST",
  });
  if (!res.ok) throw new Error(`Prometheus reload failed: ${res.status}`);
}

// writeFileSync truncates in place, keeping the inode the container's
// single-file bind mount points at.
export async function addScrapeTargets() {
  const text = readFileSync(PROM_FILE, "utf8");
  writeFileSync(
    PROM_FILE,
    `${stripPromBlock(text).replace(/\n*$/, "\n")}\n${promBlock()}\n`,
  );
  await reloadPrometheus();
}

export async function removeScrapeTargets() {
  const text = readFileSync(PROM_FILE, "utf8");
  const stripped = stripPromBlock(text);
  if (stripped !== text) {
    writeFileSync(PROM_FILE, stripped);
    await reloadPrometheus();
  }
}

export async function up({ build = false } = {}) {
  ensureStackEnv();
  writeFileSync(RATE_LIMIT_ENV, "", { mode: 0o600 }); // start with coded limits
  compose(
    "up",
    "-d",
    ...(build ? ["--build"] : []),
    "--wait",
    "--wait-timeout",
    "300",
  );
  await addScrapeTargets();
  await waitHealthy();
}

export async function down() {
  try {
    compose("down", "-v", "--remove-orphans");
  } finally {
    if (existsSync(RATE_LIMIT_ENV)) writeFileSync(RATE_LIMIT_ENV, "");
    await removeScrapeTargets();
  }
}

export function status() {
  return compose("ps", "--format", "json");
}

export async function waitHealthy(timeoutMs = 180_000) {
  const t0 = Date.now();
  let last = "";
  while (Date.now() - t0 < timeoutMs) {
    try {
      const res = await fetch(`${environment.baseUrl}/health`, {
        signal: AbortSignal.timeout(3000),
      });
      if (res.ok) return;
      last = `HTTP ${res.status}`;
    } catch (e) {
      last = e.cause?.code ?? e.message;
    }
    await new Promise((r) => setTimeout(r, 2000));
  }
  throw new Error(`Gateway not healthy after ${timeoutMs / 1000}s (${last})`);
}

function recreateGateway() {
  compose(
    "up",
    "-d",
    "--no-deps",
    "--force-recreate",
    "--wait",
    "--wait-timeout",
    "180",
    "api-gateway",
  );
}

/** Raise the limiters for the run; records the originals first. */
export async function applyRateLimitOverrides() {
  writeFileSync(
    RATE_LIMIT_RECORD,
    JSON.stringify(
      {
        recordedAt: new Date().toISOString(),
        originals: RATE_LIMITERS,
        overrides: LOADTEST_OVERRIDES,
      },
      null,
      2,
    ),
  );
  writeFileSync(
    RATE_LIMIT_ENV,
    Object.entries(LOADTEST_OVERRIDES)
      .map(([k, v]) => `RATE_LIMIT_MAX_${k}=${v}`)
      .join("\n") + "\n",
    { mode: 0o600 },
  );
  recreateGateway();
  await waitHealthy();
  const applied = gatewayRateLimitEnv();
  for (const [k, v] of Object.entries(LOADTEST_OVERRIDES)) {
    if (applied[`RATE_LIMIT_MAX_${k}`] !== String(v))
      throw new Error(`Override RATE_LIMIT_MAX_${k} not applied`);
  }
}

/** Restore the coded limits and prove it. Safe to call more than once. */
export async function restoreRateLimits(sampleRequest) {
  writeFileSync(RATE_LIMIT_ENV, "", { mode: 0o600 });
  recreateGateway();
  await waitHealthy();
  return verifyRateLimitsRestored(sampleRequest);
}

function gatewayRateLimitEnv() {
  const id = compose("ps", "-q", "api-gateway").trim();
  if (!id) return {};
  const envList = JSON.parse(
    execFileSync(
      "docker",
      ["inspect", "--format", "{{json .Config.Env}}", id],
      { encoding: "utf8" },
    ),
  );
  return Object.fromEntries(
    envList
      .filter((e) => e.startsWith("RATE_LIMIT_MAX_"))
      .map((e) => [e.slice(0, e.indexOf("=")), e.slice(e.indexOf("=") + 1)]),
  );
}

/**
 * Three independent checks: the override file is empty, the running gateway
 * container has no RATE_LIMIT_MAX_* variables, and a real business GET
 * reports the coded defaultLimiter limit in its RateLimit-Limit header.
 */
export async function verifyRateLimitsRestored(sampleRequest) {
  const fileEmpty = readFileSync(RATE_LIMIT_ENV, "utf8").trim() === "";
  const containerEnv = gatewayRateLimitEnv();
  let headerLimit = null;
  if (sampleRequest) {
    const res = await sampleRequest();
    headerLimit = res.headers.get("ratelimit-limit");
  }
  const expected = String(RATE_LIMITERS.find((l) => l.env === "DEFAULT").max);
  const ok =
    fileEmpty &&
    Object.keys(containerEnv).length === 0 &&
    (headerLimit === null || headerLimit === expected);
  const result = {
    ok,
    fileEmpty,
    containerOverrides: containerEnv,
    businessRouteRateLimitHeader: headerLimit,
    expected,
  };
  writeFileSync(
    RATE_LIMIT_RECORD,
    JSON.stringify(
      {
        ...JSON.parse(readFileSync(RATE_LIMIT_RECORD, "utf8") || "{}"),
        restoredAt: new Date().toISOString(),
        verification: result,
      },
      null,
      2,
    ),
  );
  return result;
}
