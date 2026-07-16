// ⚠️ Telemetry must be the very first import — before express, prisma, grpc.
import "./telemetry";

import { loadSecrets, validateEnv } from "@hrms/common";
import { logger } from "@hrms/logger";
import { envSchema } from "./envSchema";

async function bootstrap() {
  await loadSecrets("hrms/config");
  validateEnv(envSchema, "api-gateway");
  await import("./server");
}

bootstrap().catch((err) => {
  logger.error(
    "Failed to start: could not load secrets from AWS Secrets Manager",
  );
  logger.error(err instanceof Error ? err.name : "unknown error");
  process.exit(1);
});
