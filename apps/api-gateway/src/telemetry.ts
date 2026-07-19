/**
 * OpenTelemetry bootstrap for api-gateway.
 * MUST be the very first import in bootstrap.ts.
 *
 * Extends @hrms/telemetry with a gateway-specific request hook that extracts
 * tenant_id, user_id, and role from the incoming JWT and attaches them as span
 * attributes — enabling per-tenant trace filtering in Jaeger / X-Ray.
 *
 * Config env vars:
 *   OTEL_ENABLED=true
 *   OTEL_SERVICE_NAME=api-gateway
 *   OTEL_EXPORTER_URL=http://jaeger:4318/v1/traces
 *   OTEL_METRICS_PORT=9464
 *   NODE_ENV=production               → enables gzip compression
 */

import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { PrometheusExporter } from "@opentelemetry/exporter-prometheus";
import {
  resourceFromAttributes,
  detectResources,
  envDetector,
  hostDetector,
  processDetector,
} from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
  ATTR_DEPLOYMENT_ENVIRONMENT_NAME,
} from "@opentelemetry/semantic-conventions";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-node";

const ENABLED =
  process.env.OTEL_ENABLED === "true" ||
  (process.env.NODE_ENV !== "test" && process.env.NODE_ENV !== undefined);

const SERVICE_NAME = process.env.OTEL_SERVICE_NAME ?? "api-gateway";
const SERVICE_VERSION = process.env.npm_package_version ?? "0.0.0";
const OTLP_ENDPOINT =
  process.env.OTEL_EXPORTER_URL ?? "http://localhost:4318/v1/traces";
const METRICS_PORT = parseInt(process.env.OTEL_METRICS_PORT ?? "9464", 10);

if (ENABLED) {
  const detectedResources = detectResources({
    detectors: [envDetector, hostDetector, processDetector],
  });

  const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
    [ATTR_DEPLOYMENT_ENVIRONMENT_NAME]: process.env.NODE_ENV ?? "development",
    "hrms.isolation_model": "database-per-tenant",
    "hrms.component": "api-gateway",
  }).merge(detectedResources);

  const traceExporter = OTLP_ENDPOINT
    ? new OTLPTraceExporter({
        url: OTLP_ENDPOINT,
        compression:
          process.env.NODE_ENV === "production" ? ("gzip" as any) : undefined,
      })
    : undefined;

  const sdk = new NodeSDK({
    resource,
    spanProcessors: traceExporter
      ? [
          new BatchSpanProcessor(traceExporter, {
            maxQueueSize: 2048,
            maxExportBatchSize: 512,
            scheduledDelayMillis: 5_000,
            exportTimeoutMillis: 30_000,
          }),
        ]
      : [],
    metricReaders: [new PrometheusExporter({ port: METRICS_PORT })],
    instrumentations: [
      getNodeAutoInstrumentations({
        "@opentelemetry/instrumentation-http": {
          enabled: true,
          // Skip health-check and metrics scrape — would flood the trace backend.
          ignoreIncomingRequestHook: (req: any) => {
            const u: string = req.url ?? "";
            return (
              u === "/health" ||
              u === "/metrics" ||
              u.startsWith("/metrics?") ||
              u === "/favicon.ico"
            );
          },
          // Extract tenant context from JWT → every inbound span carries tenant_id.
          requestHook: (span: any, req: any) => {
            const auth: string = req.headers?.["authorization"] ?? "";
            if (!auth.startsWith("Bearer ")) return;
            try {
              const raw = auth.slice(7).split(".")[1] ?? "";
              const decoded = JSON.parse(
                Buffer.from(raw, "base64url").toString(),
              );
              if (decoded.tenantId)
                span.setAttribute("hrms.tenant_id", decoded.tenantId);
              if (decoded.userId)
                span.setAttribute("hrms.user_id", decoded.userId);
              if (decoded.tenantRole)
                span.setAttribute("hrms.role", decoded.tenantRole);
            } catch {
              /* ignore malformed tokens */
            }
          },
        },
        // Record Express route templates (/users/:id) not filled-in URLs.
        "@opentelemetry/instrumentation-express": {
          enabled: true,
          ignoreLayers: ["middleware - query", "middleware - expressInit"],
        },
        // gRPC: trace every call from gateway → microservices.
        "@opentelemetry/instrumentation-grpc": {
          enabled: true,
          ignoreGrpcMethods: ["grpc.health.v1.Health.Check"],
        },
        // ioredis: record command + first key; suppress values (may be PII).
        "@opentelemetry/instrumentation-ioredis": {
          enabled: true,
          dbStatementSerializer: (cmd: string, args: unknown[]) =>
            `${cmd} ${String(args[0] ?? "")}`.trim(),
        },
        // MongoDB disabled — Prisma is the only DB layer.
        "@opentelemetry/instrumentation-mongodb": { enabled: false },
        "@opentelemetry/instrumentation-mongoose": { enabled: false },
        // Too noisy for production; toggle on for local debugging.
        "@opentelemetry/instrumentation-fs": { enabled: false },
        "@opentelemetry/instrumentation-dns": { enabled: false },
      }),
    ],
  });

  sdk.start();

  const shutdown = async () => {
    try {
      await sdk.shutdown();
    } catch {
      /* exiting anyway */
    }
  };
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  // eslint-disable-next-line no-console
  console.log(
    `[OTel] api-gateway  traces → ${OTLP_ENDPOINT}  metrics → :${METRICS_PORT}/metrics`,
  );
}

// Re-export span helpers for handler-level manual instrumentation.
export { trace, context, SpanStatusCode } from "@opentelemetry/api";

export async function withSpan<T>(
  name: string,
  fn: (span: import("@opentelemetry/api").Span) => Promise<T>,
  attributes?: Record<string, string | number | boolean>,
): Promise<T> {
  const { trace: apiTrace, SpanStatusCode: Code } =
    await import("@opentelemetry/api");
  const tracer = apiTrace.getTracer(SERVICE_NAME, SERVICE_VERSION);
  return tracer.startActiveSpan(name, async (span) => {
    if (attributes) {
      for (const [k, v] of Object.entries(attributes)) span.setAttribute(k, v);
    }
    try {
      const result = await fn(span);
      span.setStatus({ code: Code.OK });
      return result;
    } catch (err: any) {
      span.setStatus({
        code: Code.ERROR,
        message: err?.message ?? String(err),
      });
      span.recordException(err);
      throw err;
    } finally {
      span.end();
    }
  });
}
