// Guard for maintenance scripts that write in bulk (seeds, fixes,
// migrations). Development and production share one database connection
// string, so "am I in local dev?" checks based on the app URL or NODE_ENV say
// nothing about where the writes go — that is how a demo-data seed wrote two
// concurrent copies of synthetic attendance into production on 2026-07-09
// (docs/performance/attendance-backfill-root-cause.md).
//
// The guard keys on the actual database host and requires the operator to
// name it: CONFIRM_DB_WRITE_HOST must equal the host the script is about to
// write to. The host is printed so the operator can see the target; the
// credentials in the URI are never printed.

export function databaseHost(uri: string | undefined): string | null {
  if (!uri) return null;
  const m = uri.match(/^mongodb(?:\+srv)?:\/\/(?:[^@/]*@)?([^/?]+)/);
  return m ? m[1] : null;
}

export function assertConfirmedWriteTarget(
  script: string,
  uri: string | undefined = process.env.DEV_MONGODB_URI,
  confirmed: string | undefined = process.env.CONFIRM_DB_WRITE_HOST,
): void {
  const host = databaseHost(uri);
  if (!host) {
    throw new Error(
      `${script} refused: DEV_MONGODB_URI is missing or not a MongoDB URI.`,
    );
  }
  if (confirmed !== host) {
    throw new Error(
      `${script} refused: it would write to "${host}". ` +
        `Re-run with CONFIRM_DB_WRITE_HOST=${host} if that is really intended ` +
        "(dev and production share this database).",
    );
  }
}
