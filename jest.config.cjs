"use strict";
/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: "node",
  transform: {
    "^.+\\.tsx?$": [
      "ts-jest",
      {
        diagnostics: false,
        tsconfig: {
          isolatedModules: true,
          module: "commonjs",
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          target: "ES2022",
          resolveJsonModule: true,
        },
      },
    ],
  },
  testMatch: [
    "<rootDir>/apps/*/src/__tests__/**/*.test.ts",
    "<rootDir>/packages/*/src/__tests__/**/*.test.ts",
  ],
  testPathIgnorePatterns: [
    "/node_modules/",
    "<rootDir>/apps/web/",
  ],
  moduleNameMapper: {
    "^@hrms/db$": "<rootDir>/packages/database/dist/index.js",
    "^@hrms/approval-engine$": "<rootDir>/packages/approval-engine/dist/index.js",
    "^@hrms/cache$": "<rootDir>/packages/cache/dist/index.js",
    "^@hrms/queue$": "<rootDir>/packages/queue/dist/index.js",
    "^@hrms/logger$": "<rootDir>/packages/logger/dist/index.js",
    "^@hrms/crypto$": "<rootDir>/packages/crypto/dist/index.js",
    "^@hrms/firebase$": "<rootDir>/packages/firebase/dist/index.js",
    "^@hrms/common$": "<rootDir>/packages/common/dist/index.js",
  },
  clearMocks: true,
  testTimeout: 10000,
  // Scoped to hand-written source so the report reflects real gaps instead
  // of being diluted by generated protobuf code, compiled dist output
  // (some tests load the real dist copy of a package transitively — same
  // file, double-counted under a second path), and one-off DB scripts that
  // aren't unit-test targets.
  collectCoverageFrom: [
    "apps/*/src/**/*.ts",
    "packages/*/src/**/*.ts",
    "!apps/web/**", // separate vitest app — see apps/web/vitest.config.ts's own coverage config
    "!**/__tests__/**",
    "!**/*.d.ts",
    "!packages/proto-definitions/src/generated/**",
    "!packages/proto-definitions/src/proto/**",
    "!packages/database/src/{assign-users-to-tenants,fix-bonami-dates,fix-tenant-assignment,migrate-to-silo,push-to-all-tenants,reseed-bonami-orm,seed-bonami,seed-tenants}.ts",
  ],
};
