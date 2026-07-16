import { ZodSchema } from "zod";

/**
 * Validates `process.env` against `schema` and exits the process with a
 * single, readable list of every missing/invalid variable if it fails —
 * instead of the default behavior of crashing on first use deep inside a
 * request handler (e.g. `process.env.ACCESS_JWT_TOKEN!` throwing a bare
 * TypeError only once the first request needing it comes in).
 *
 * Call this after secrets have been loaded into `process.env` (e.g. after
 * `loadSecrets`) and before importing anything that reads them.
 */
export function validateEnv<T>(schema: ZodSchema<T>, serviceName: string): T {
  const result = schema.safeParse(process.env);
  if (!result.success) {
    const issues = result.error.errors
      .map((e) => `  - ${e.path.join(".")}: ${e.message}`)
      .join("\n");
    // eslint-disable-next-line no-console
    console.error(
      `[${serviceName}] Invalid environment configuration:\n${issues}`,
    );
    process.exit(1);
  }
  return result.data;
}
