/**
 * Real-infrastructure integration suites. NOT part of `npx jest`.
 *
 *   ./integration/up.sh                     # isolated Mongo rs + Redis + KMS emulator
 *   pnpm test:integration
 *
 * (pnpm test:integration = jest with this config, --runInBand and
 * NODE_OPTIONS=--experimental-vm-modules, which the AWS SDK's dynamic
 * imports need inside Jest's VM — the KMS envelope suite fails without it.)
 *
 * setupEnv.cjs refuses to run unless every database/Redis host is local.
 */
const base = require("../jest.config.cjs");
module.exports = {
  ...base,
  rootDir: "..",
  testMatch: ["<rootDir>/integration/**/*.it.test.ts"],
  testPathIgnorePatterns: ["/node_modules/"],
  setupFiles: ["<rootDir>/integration/setupEnv.cjs"],
  testTimeout: 120000,
  maxWorkers: 1,
  // Real clients (ioredis, Prisma, the tenant pool) keep sockets open.
  forceExit: true,
};
