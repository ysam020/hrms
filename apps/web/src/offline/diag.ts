// Offline diagnostics. Structured events with counts, codes and timings only
// — never payloads, tokens, names, file contents or URLs with record data.
// Kept in a small ring buffer for the Pending Changes panel and logged to the
// console in development (the web app has no remote client logging).

export type DiagEvent = {
  at: number;
  event: string;
  detail?: Record<string, string | number | boolean | undefined>;
};

const MAX = 100;
const events: DiagEvent[] = [];

export function diag(event: string, detail?: DiagEvent["detail"]) {
  const e = { at: Date.now(), event, detail };
  events.push(e);
  if (events.length > MAX) events.shift();
  if (import.meta.env?.DEV) console.info(`[offline] ${event}`, detail ?? "");
}

export function recentDiagnostics(): readonly DiagEvent[] {
  return events;
}
