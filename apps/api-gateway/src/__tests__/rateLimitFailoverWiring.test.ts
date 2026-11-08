/**
 * The gateway's REAL limiter wiring (applyRateLimiters +
 * redisStore → rate-limit-redis over getRedisClient().call) with every Redis
 * command refused, as during an outage. Before the fix every request below
 * returned 500.
 */
jest.mock("@hrms/logger", () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));
const refused = () =>
  Promise.reject(new Error("connect ECONNREFUSED redis:6379"));
jest.mock("@hrms/cache", () => ({
  getRedisClient: () => ({ call: refused }),
}));
jest.mock("@hrms/db", () => ({
  recordExternal: jest.fn(),
  recordStage: jest.fn(),
}));

import express from "express";
import http from "http";
import { AddressInfo } from "net";
import {
  applyRateLimiters,
  rateLimitStoreHealth,
} from "../config/rateLimiters";

let server: http.Server;
let base: string;
beforeAll(async () => {
  const app = express();
  applyRateLimiters(app);
  app.use((_q, r) => r.json({ ok: true }));
  app.use((e: any, _q: any, r: any, _n: any) =>
    r.status(500).json({ err: e.message }),
  );
  server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise((r) => server.close(r)));

it.each([
  "/api/v1/dashboard", // generalLimiter
  "/api/v1/profile", // profileLimiter
  "/api/v1/webauthn-login-options", // authLimiter (strict, still enforced in memory)
  "/api/v1/refresh-token", // authLimiter
  "/api/v1/public/careers/acme", // publicLimiter
])("serves %s while Redis refuses every command", async (path) => {
  const res = await fetch(base + path);
  expect(res.status).toBe(200);
  // express-rate-limit still counts and reports the limit.
  expect(
    res.headers.get("ratelimit-limit") ?? res.headers.get("ratelimit"),
  ).toBeTruthy();
});

it("reports the degradation", () => {
  expect(rateLimitStoreHealth().mode).toBe("memory");
});
