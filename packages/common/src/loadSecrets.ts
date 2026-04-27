import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";
import { readFileSync } from "fs";

const client = new SecretsManagerClient({ region: "ap-south-1" });

export async function loadSecrets(secretName: string): Promise<void> {
  const localFile = process.env.LOCAL_SECRETS_FILE;
  if (localFile) {
    const secrets = JSON.parse(readFileSync(localFile, "utf-8")) as Record<
      string,
      unknown
    >;
    for (const [key, value] of Object.entries(secrets)) {
      if (process.env[key] === undefined) {
        process.env[key] = String(value);
      }
    }
    return;
  }

  const response = await client.send(
    new GetSecretValueCommand({ SecretId: secretName }),
  );

  if (!response.SecretString) {
    throw new Error(`Secret "${secretName}" has no string value`);
  }

  const secrets = JSON.parse(response.SecretString) as Record<string, unknown>;

  for (const [key, value] of Object.entries(secrets)) {
    // Don't override values already set in the environment
    if (process.env[key] === undefined) {
      process.env[key] = String(value);
    }
  }
}
