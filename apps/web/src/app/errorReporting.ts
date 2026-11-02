import type { ErrorInfo } from "react";

// Root error handlers (React 19 createRoot options). React 19 reports each
// render error once, here, instead of re-throwing caught errors and logging
// them twice. In production the report is redacted first: an HRMS error can
// carry tokens (in URLs or headers), email addresses or ID numbers, and
// whatever reaches the console can end up in a support screenshot.

export interface ErrorReport {
  kind: "caught" | "uncaught" | "recoverable";
  name: string;
  message: string;
  componentStack: string | null;
  path: string;
}

const PATTERNS: [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9\-_.=]+/g, "Bearer [redacted]"],
  [/\beyJ[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]+\.[A-Za-z0-9\-_]*/g, "[jwt]"],
  [/([?&](?:access_token|token|code|csrf[^=]*)=)[^&\s#]+/gi, "$1[redacted]"],
  [/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]"],
  [/\b\d{4}\s?\d{4}\s?\d{4}\b/g, "[id-number]"], // Aadhaar-shaped
  [/\b[A-Z]{5}\d{4}[A-Z]\b/g, "[id-number]"], // PAN-shaped
  [/\b\d{9,18}\b/g, "[number]"], // phone / bank account numbers
];

export function redact(text: string): string {
  return PATTERNS.reduce((t, [re, sub]) => t.replace(re, sub), text);
}

export type ReportSink = (report: ErrorReport, original: unknown) => void;

const consoleSink: ReportSink = (r, original) => {
  if (import.meta.env.DEV) {
    // Local development: the full error, for its stack.
    console.error(`[${r.kind}]`, original, r.componentStack ?? "");
    return;
  }
  console.error(`[${r.kind}] ${r.name}: ${r.message}`, r.componentStack ?? "");
};

export function createErrorHandlers(sink: ReportSink = consoleSink) {
  const report =
    (kind: ErrorReport["kind"]) =>
    (error: unknown, info: Pick<ErrorInfo, "componentStack">) => {
      const err = error instanceof Error ? error : new Error(String(error));
      sink(
        {
          kind,
          name: err.name,
          message: redact(err.message),
          componentStack: info.componentStack
            ? redact(info.componentStack)
            : null,
          // Path only: query strings can carry tokens and record IDs.
          path:
            typeof location === "undefined" ? "" : redact(location.pathname),
        },
        error,
      );
    };
  return {
    onCaughtError: report("caught"),
    onUncaughtError: report("uncaught"),
    onRecoverableError: report("recoverable"),
  };
}
