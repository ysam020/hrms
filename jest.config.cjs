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
    "^@hrms/cache$": "<rootDir>/packages/cache/dist/index.js",
    "^@hrms/queue$": "<rootDir>/packages/queue/dist/index.js",
    "^@hrms/logger$": "<rootDir>/packages/logger/dist/index.js",
    "^@hrms/crypto$": "<rootDir>/packages/crypto/dist/index.js",
    "^@hrms/firebase$": "<rootDir>/packages/firebase/dist/index.js",
    "^@hrms/common$": "<rootDir>/packages/common/dist/index.js",
  },
  clearMocks: true,
  testTimeout: 10000,
};
