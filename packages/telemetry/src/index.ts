/**
 * @hrms/telemetry — OpenTelemetry SDK bootstrap.
 *
 * IMPORTANT: This module MUST be imported before any other import in every
 * service's bootstrap entry-point. OTel works by patching require/import hooks
 * at load time; importing it late means many spans will be missed.
 *
 * Usage (in bootstrap.ts):
 *   import "@hrms/telemetry";          // ← must be first
 *   import { loadSecrets } from "@hrms/common";
 *   ...
 *
 * Configuration via environment variables (set in .env / docker-compose):
 *
 *   OTEL_ENABLED          true | false (default: false in test, true otherwise)
 *   OTEL_SERVICE_NAME     e.g. "api-gateway" | "leave-service"
 *   OTEL_EXPORTER_URL     OTLP HTTP endpoint, e.g. http://jaeger:4318/v1/traces
 *                         Set to empty string to disable trace export (metrics only).
 *   OTEL_METRICS_PORT     Port for Prometheus /metrics scrape (default: 9464)
 *                         Each service already exposes its own METRICS_PORT via
 *                         prom-client; this is an additional OTel-managed endpoint.
 *   NODE_ENV              production → AWS X-Ray compatible OTLP headers added.
 *
 * Trace propagation: W3C TraceContext + Baggage (default in OTel Node SDK).
 * gRPC metadata: propagated automatically by @opentelemetry/instrumentation-grpc.
 * HTTP headers: propagated automatically by @opentelemetry/instrumentation-http.
 *
 * What gets auto-instrumented (via @opentelemetry/auto-instrumentations-node):
 *   – Express routes and middleware
 *   – HTTP/HTTPS outgoing requests
 *   – gRPC client and server calls
 *   – Redis (ioredis) commands
 *   – DNS lookups
 *   – Prisma (via @prisma/instrumentation — must be enabled separately; see below)
 *
 * Note on Prisma: @prisma/instrumentation is NOT part of auto-instrumentations-node.
 * Enable it by setting `previewFeatures = ["tracing"]` in schema.prisma and
 * adding PrismaInstrumentation below.
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import {
  Resource,
  detectResourcesSync,
  envDetectorSync,
  hostDetectorSync,
  processDetectorSync,
} from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from "@opentelemetry/semantic-conventions";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";

// ─────────────────────────────────────────────────────────────────────────────
// Configuration
// ─────────────────────────────────────────────────────────────────────────────

const ENABLED =
  process.env.OTEL_ENABLED === "true" ||
  (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== undefined);

const SERVICE_NAME =
  process.env.OTEL_SERVICE_NAME ??
  process.env.npm_package_name ??
  "hrms-unknown-service";

const SERVICE_VERSION = process.env.npm_package_version ?? "0.0.0";

const OTLP_ENDPOINT =
  process.env.OTEL_EXPORTER_URL ?? "http://localhost:4318/v1/traces";

const METRICS_PORT = parseInt(process.env.OTEL_METRICS_PORT ?? "9464", 10);

// ─────────────────────────────────────────────────────────────────────────────
// Resource (service identity attached to every span and metric)
// ─────────────────────────────────────────────────────────────────────────────

const detectedResources = detectResourcesSync({
  detectors: [envDetectorSync, hostDetectorSync, processDetectorSync],
});

const serviceResource = new Resource({
  [ATTR_SERVICE_NAME]: SERVICE_NAME,
  [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV ?? "development",
});

const resource = serviceResource.merge(detectedResources);

// ─────────────────────────────────────────────────────────────────────────────
// Exporters
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Trace exporter — OTLP/HTTP.
 *
 * Local dev:  → Jaeger (add to docker-compose.monitoring.yml)
 * Production: → AWS Distro for OpenTelemetry (ADOT) collector → X-Ray
 *
 * Configure with OTEL_EXPORTER_URL. If empty, traces are dropped.
 */
function buildTraceExporter() {
  if (!OTLP_ENDPOINT) return undefined;

  const headers: Record<string, string> = {};

  // AWS X-Ray in production: ADOT sidecar accepts standard OTLP but needs
  // the X-Ray propagator (set via OTEL_PROPAGATORS=xray env var at runtime).
  if (process.env.NODE_ENV === "production" && process.env.AWS_REGION) {
    headers["x-otlp-api-key"] = process.env.OTEL_API_KEY ?? "";
  }

  return new OTLPTraceExporter({
    url: OTLP_ENDPOINT,
    headers,
    // Compress payloads in production.
    compression:
      process.env.NODE_ENV === "production" ? ("gzip" as any) : undefined,
  });
}

/**
 * Metrics exporter — Prometheus pull model.
 * Exposes /metrics on OTEL_METRICS_PORT for Prometheus to scrape.
 * This is additive to the existing prom-client /metrics endpoint.
 */
const prometheusExporter = new PrometheusExporter({
  port: METRICS_PORT,
  // Suppress the default start log to keep logs clean.
  preventServerStart: false,
});

// ─────────────────────────────────────────────────────────────────────────────
// Instrumentation
// ─────────────────────────────────────────────────────────────────────────────

const instrumentations = getNodeAutoInstrumentations({
  // HTTP: record full URL and method for span names.
  "@opentelemetry/instrumentation-http": {
    enabled: true,
    // Exclude health-check and metrics scrape endpoints from tracing
    // to avoid flooding Jaeger with noise.
    ignoreIncomingRequestHook: (req) => {
      const url = req.url ?? "";
      return (
        url === "/health" || url === "/metrics" || url.startsWith("/metrics?")
      );
    },
    // Record response body sizes as span attributes.
    applyCustomAttributesOnSpan: (span, req, res) => {
      const contentLength = (res as any).getHeader?.("content-length");
      if (contentLength) {
        span.setAttribute(
          "http.response_content_length",
          Number(contentLength),
        );
      }
    },
  },

  // Express: record route templates (not filled-in URLs) for cardinality safety.
  "@opentelemetry/instrumentation-express": {
    enabled: true,
    // Record the route pattern e.g. /users/:id rather than /users/abc123.
    ignoreLayers: ["middleware - query", "middleware - expressInit"],
  },

  // gRPC: trace both gateway outgoing calls and service incoming calls.
  "@opentelemetry/instrumentation-grpc": {
    enabled: true,
    ignoreGrpcMethods: ["grpc.health.v1.Health.Check"],
  },

  // ioredis: record Redis commands as spans.
  "@opentelemetry/instrumentation-ioredis": {
    enabled: true,
    // Don't record values (may contain PII or large payloads).
    dbStatementSerializer: (cmd, args) => `${cmd} ${args[0] ?? ""}`.trim(),
  },

  // DNS: enabled to catch slow resolution issues.
  "@opentelemetry/instrumentation-dns": { enabled: true },

  // MongoDB / Mongoose: disable — Prisma already handles DB layer.
  "@opentelemetry/instrumentation-mongodb": { enabled: false },
  "@opentelemetry/instrumentation-mongoose": { enabled: false },

  // BullMQ / generic worker jobs: disable noisy fs instrumentation.
  "@opentelemetry/instrumentation-fs": { enabled: false },
});

// ─────────────────────────────────────────────────────────────────────────────
// SDK initialisation
// ─────────────────────────────────────────────────────────────────────────────

let sdk: NodeSDK | null = null;

if (ENABLED) {
  const traceExporter = buildTraceExporter();

  sdk = new NodeSDK({
    resource,
    instrumentations,
    // Batch processor — buffers spans and flushes every 5 s or when the
    // buffer hits 512 spans (whichever comes first).
    spanProcessors: traceExporter
      ? [
          new BatchSpanProcessor(traceExporter, {
            maxQueueSize: 2048,
            maxExportBatchSize: 512,
            scheduledDelayMillis: 5000,
            exportTimeoutMillis: 30_000,
          }),
        ]
      : [],
    metricReader: prometheusExporter,
  });

  sdk.start();

  // Flush all pending spans/metrics before the process exits.
  const shutdown = async () => {
    try {
      await sdk!.shutdown();
    } catch {
      // Ignore shutdown errors — process is exiting anyway.
    }
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
  process.on("beforeExit", shutdown);
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API — helpers for manual span creation in business handlers
// ─────────────────────────────────────────────────────────────────────────────

export { trace, context, SpanStatusCode } from "@opentelemetry/api";

/**
 * withSpan — wraps an async function in a custom child span.
 *
 * Usage:
 *   const result = await withSpan("payroll.computeLineItems", async (span) => {
 *     span.setAttribute("payroll.employeeCount", employees.length);
 *     return computeLineItems(employees);
 *   });
 */
export async function withSpan<T>(
  name: string,
  fn: (span: import("@opentelemetry/api").Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const tracer = (await import("@opentelemetry/api")).trace.getTracer(
    SERVICE_NAME,
    SERVICE_VERSION,
  );
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      for (const [k, v] of Object.entries(attributes)) {
        span.setAttribute(k, v);
      }
    }
    try {
      const result = await fn(span);
      span.setStatus({
        code: (await import("@opentelemetry/api")).SpanStatusCode.OK,
      });
      return result;
    } catch (err: any) {
      span.setStatus({
        code: (await import("@opentelemetry/api")).SpanStatusCode.ERROR,
        message: err?.message ?? String(err),
      });
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}

export { sdk };
