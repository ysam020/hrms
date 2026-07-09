/**
 * OpenTelemetry bootstrap for scheduler-service.
 * MUST be the very first import in bootstrap.ts.
 *
 * All configuration is driven by environment variables (see @hrms/telemetry):
 *   OTEL_ENABLED=true
 *   OTEL_SERVICE_NAME=scheduler-service
 *   OTEL_EXPORTER_URL=http://jaeger:4318/v1/traces
 *   OTEL_METRICS_PORT=9465          # avoid collision with api-gateway on 9464
 */

// Re-export helpers (withSpan, trace, context, SpanStatusCode) for any job
// that wants to create manual child spans.
export * from "@hrms/telemetry";
