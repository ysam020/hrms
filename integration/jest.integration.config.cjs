/**
 * Real-infrastructure integration suites. NOT part of `npx jest`.
 *
 *   ./integration/up.sh                     # isolated Mongo rs + Redis
 *   npx jest -c integration/jest.integration.config.cjs --runInBand
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
