// Points every client at the ISOLATED containers from up.sh — never at the
// shared Atlas cluster. Throws (before any client is created) if a host is
// not local, whatever the caller's environment says.
const MONGO =
  "mongodb://127.0.0.1:37017/it_master?replicaSet=rs0&directConnection=true";
process.env.DEV_MONGODB_URI = process.env.IT_MONGODB_URI || MONGO;
process.env.REDIS_URL = process.env.IT_REDIS_URL || "redis://127.0.0.1:36379";
// BullMQ and the websocket publisher read host/port, not REDIS_URL.
process.env.REDIS_HOST = "127.0.0.1";
process.env.REDIS_PORT = "36379";
delete process.env.REDIS_PASSWORD;
delete process.env.REDIS_TLS;
delete process.env.LOCAL_SECRETS_FILE;
delete process.env.AWS_SECRET_NAME;
for (const [k, v] of Object.entries({
  DEV_MONGODB_URI: process.env.DEV_MONGODB_URI,
  REDIS_URL: process.env.REDIS_URL,
  REDIS_HOST: `redis://${process.env.REDIS_HOST}`,
})) {
  const host = String(v)
    .replace(/^[a-z+]+:\/\/(?:[^@/]*@)?/, "")
    .split(/[/:?]/)[0];
  if (!["127.0.0.1", "localhost"].includes(host)) {
    throw new Error(`integration suites refuse non-local ${k} host "${host}"`);
  }
}
process.env.ACCESS_JWT_TOKEN = "it-access-secret";
process.env.REFRESH_TOKEN = "it-refresh-secret";
process.env.ACCOUNT_CHECK_TIMEOUT_MS =
  process.env.ACCOUNT_CHECK_TIMEOUT_MS || "1500";
process.env.NODE_ENV = "test";
// Field encryption: a throwaway key-encryption key, never used elsewhere.
process.env.FIELD_KEK_HEX = "4".repeat(64);
process.env.CRYPTO_ENCRYPTION_KEY =
  process.env.CRYPTO_ENCRYPTION_KEY || "c".repeat(64);
delete process.env.FIELD_KMS_KEY_ID;
delete process.env.FIELD_KMS_ENDPOINT;
