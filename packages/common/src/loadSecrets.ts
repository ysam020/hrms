import {
  SecretsManagerClient,
  GetSecretValueCommand,
} from "@aws-sdk/client-secrets-manager";

const client = new SecretsManagerClient({ region: "ap-south-1" });

export async function loadSecrets(secretName: string): Promise<void> {
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

  // Prisma schema expects MONGO_URI; secrets are stored as DEV_MONGODB_URI / PROD_MONGODB_URI
  if (!process.env.MONGO_URI) {
    process.env.MONGO_URI =
      process.env.DEV_MONGODB_URI ?? process.env.PROD_MONGODB_URI ?? "";
  }
}
