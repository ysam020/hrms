/**
 * Guards the recurring demo-data seeder jobs so they only ever do anything
 * in local dev. CLIENT_URL is loaded from AWS Secrets Manager at process
 * start (loadSecrets(), see bootstrap.ts) and is reliably "https://localhost"
 * for the local dev secret (hrms/config/docker) vs the real domain for the
 * production secret (hrms/config) — confirmed by reading both secrets
 * directly. No new env var needed.
 */
export function isLocalDevEnvironment(): boolean {
  return (process.env.CLIENT_URL ?? "").startsWith("https://localhost");
}
