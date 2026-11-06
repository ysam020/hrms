// Where the benchmark points and where it reads monitoring data from.
// Everything targets the isolated loadtest stack (docker-compose.loadtest.yml);
// there is deliberately no entry for the production API.
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
export const ROOT = resolve(here, "..");
export const REPO_ROOT = resolve(ROOT, "..");
export const STATE_DIR = resolve(ROOT, ".state");
export const REPORTS_DIR = resolve(ROOT, "reports");

const env = process.env;

export const environment = {
  name: env.LT_ENV_NAME ?? "local-loadtest-stack",
  // Gateway of the loadtest stack: TLS + HTTP/1.1, as Caddy talks to it in prod.
  baseUrl: env.LT_BASE_URL ?? "https://localhost:29002",
  apiPrefix: "/api/v1",
  composeFile: resolve(REPO_ROOT, "docker-compose.loadtest.yml"),
  composeProject: "hrms-loadtest",
  // Prefix of the stack's Prometheus `service` label and Loki stream label.
  serviceLabelPrefix: "loadtest-",
  prometheusUrl: env.LT_PROMETHEUS_URL ?? "http://localhost:9090",
  lokiUrl: env.LT_LOKI_URL ?? "http://localhost:3100",
  grafanaUrl: env.LT_GRAFANA_URL ?? "http://localhost:3000",
  // The stack's own Redis (published on the host for INFO sampling only).
  redis: { host: "localhost", port: Number(env.LT_REDIS_PORT ?? 26379) },
  // Shared Atlas cluster: read from local-secrets.json, never printed.
  secretsFile: resolve(REPO_ROOT, "local-secrets.json"),
  // Host the containers reach Prometheus targets on (scrape config).
  metricsPorts: {
    "api-gateway": 29003,
    "auth-service": 29101,
    "user-service": 29102,
    "employee-service": 29103,
    "attendance-service": 29104,
    "leave-service": 29105,
    "recruitment-service": 29106,
    "hrm-service": 29107,
    "salary-service": 29108,
    "analytics-service": 29109,
    "notification-service": 29110,
    "performance-review-service": 29112,
  },
};

// Guard against pointing the runner at anything public by mistake.
const host = new URL(environment.baseUrl).hostname;
if (
  !["localhost", "127.0.0.1", "::1"].includes(host) &&
  env.LT_ALLOW_REMOTE_TARGET !== "true"
) {
  throw new Error(
    `Refusing to load-test ${host}: only the local loadtest stack is allowed (set LT_ALLOW_REMOTE_TARGET=true for another isolated stack).`,
  );
}
