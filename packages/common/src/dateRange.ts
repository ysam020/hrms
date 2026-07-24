// Formats a leave/WFH calendar date (or date range) for notification/email
// bodies. Always rendered in UTC — these fields store a calendar date (the
// day itself is what matters, e.g. "24 Jul 2026"), not a moment in time, so
// formatting must not drift with the server's local timezone.
function formatDate(date: Date): string {
  return date.toLocaleDateString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
}

export function formatDateOrRange(from: Date, to: Date): string {
  const fromStr = formatDate(from);
  const toStr = formatDate(to);
  return fromStr === toStr ? fromStr : `${fromStr} – ${toStr}`;
}
