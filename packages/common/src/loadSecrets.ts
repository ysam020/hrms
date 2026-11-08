import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { readFileSync } from "fs";

const client = new SecretsManagerClient({
  region: process.env.AWS_REGION || "ap-south-1",
});

/**
 * Keys every backend service needs before it can start. A secret (or local
 * file) missing any of them stops startup instead of letting a service run
 * half-configured — e.g. a staging secret created without REDIS_URL would
 * otherwise leave the service on a default/inherited host.
 */
export const REQUIRED_SECRET_KEYS = [
  "DEV_MONGODB_URI",
  "REDIS_URL",
  "ACCESS_JWT_TOKEN",
  "REFRESH_TOKEN",
] as const;

/** The only accepted DEPLOY_ENV / SECRET_ENV values. */
export const DEPLOY_ENVIRONMENTS = [
  "production",
  "staging",
  "development",
  "test",
] as const;

export class SecretsConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SecretsConfigError";
  }
}

function apply(secrets: Record<string, unknown>): void {
  for (const [key, value] of Object.entries(secrets)) {
    // Values already set in the environment win (compose/ECS overrides).
    if (process.env[key] === undefined) {
      process.env[key] = String(value);
    }
  }
}

/**
 * Loads configuration into process.env, FAIL-CLOSED:
 *
 *  1. Source — LOCAL_SECRETS_FILE (local development only) or the AWS
 *     Secrets Manager secret named by AWS_SECRET_NAME. There is NO default
 *     secret name: a deployment that forgets AWS_SECRET_NAME used to load
 *     the production secret silently; now it refuses to start.
 *  2. Environment tag — DEPLOY_ENV (set by the deployment, e.g. compose)
 *     must equal SECRET_ENV (a key stored INSIDE the secret). A staging host
 *     handed the production secret (or the reverse) refuses to start.
 *  3. Required keys — every REQUIRED_SECRET_KEYS entry must be present.
 *
 * `_legacyDefaultName` is kept only so existing call sites
 * (`loadSecrets("hrms/config")`) compile unchanged; it is never used as a
 * fallback.
 */
export async function loadSecrets(_legacyDefaultName?: string): Promise<void> {
  const deployEnv = process.env.DEPLOY_ENV;
  if (!deployEnv) {
    throw new SecretsConfigError(
      "DEPLOY_ENV is not set — refusing to start (set it explicitly: production | staging | development | test)",
    );
  }
  if (!(DEPLOY_ENVIRONMENTS as readonly string[]).includes(deployEnv)) {
    throw new SecretsConfigError(
      `DEPLOY_ENV "${deployEnv}" is not one of ${DEPLOY_ENVIRONMENTS.join(" | ")} — refusing to start`,
    );
  }

  const localFile = process.env.LOCAL_SECRETS_FILE;
  let secrets: Record<string, unknown>;

  if (localFile) {
    if (deployEnv === "production" || deployEnv === "staging") {
      throw new SecretsConfigError(
        `LOCAL_SECRETS_FILE is not allowed when DEPLOY_ENV=${deployEnv}`,
      );
    }
    secrets = JSON.parse(readFileSync(localFile, "utf-8")) as Record<
      string,
      unknown
    >;
  } else {
    const secretName = process.env.AWS_SECRET_NAME;
    if (!secretName) {
      throw new SecretsConfigError(
        "AWS_SECRET_NAME is not set — refusing to start (there is no default secret)",
      );
    }
    const response = await client.send(
      new GetSecretValueCommand({ SecretId: secretName }),
    );
    if (!response.SecretString) {
      throw new SecretsConfigError("Secret has no string value");
    }
    try {
      secrets = JSON.parse(response.SecretString) as Record<string, unknown>;
    } catch {
      throw new SecretsConfigError("Secret contains invalid JSON");
    }
  }

  // Read from the secret ONLY — an environment variable must not be able to
  // vouch for a secret it didn't come from.
  const secretEnv = secrets.SECRET_ENV;
  if (String(secretEnv ?? "") !== deployEnv) {
    throw new SecretsConfigError(
      `Secret environment "${secretEnv ?? "<missing SECRET_ENV>"}" does not match DEPLOY_ENV "${deployEnv}" — refusing to start`,
    );
  }

  apply(secrets);

  const missing = REQUIRED_SECRET_KEYS.filter((k) => !process.env[k]);
  if (missing.length) {
    throw new SecretsConfigError(
      `Missing required configuration: ${missing.join(", ")}`,
    );
  }
}
