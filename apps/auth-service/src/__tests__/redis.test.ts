// Full behavioral coverage for storeRefreshToken/rotateRefreshToken/
// revokeRefreshToken/markOrgSetupComplete now lives in
// packages/cache/src/__tests__/refreshTokenStore.test.ts — this file is the
// single shared implementation both auth-service and api-gateway import.
// This test only confirms the re-export wiring in ../services/redis stays
// intact so every handler's `from "../services/redis"` import keeps working.
import * as cacheModule from "@hrms/cache";
import * as redisReexport from "../services/redis";

jest.mock("@hrms/cache", () => ({
  getRedisClient: jest.fn(),
  storeRefreshToken: jest.fn(),
  rotateRefreshToken: jest.fn(),
  revokeRefreshToken: jest.fn(),
  markOrgSetupComplete: jest.fn(),
}));

describe("services/redis re-export", () => {
  it("re-exports every refresh-token function from @hrms/cache", () => {
    expect(redisReexport.getRedisClient).toBe(cacheModule.getRedisClient);
    expect(redisReexport.storeRefreshToken).toBe(cacheModule.storeRefreshToken);
    expect(redisReexport.rotateRefreshToken).toBe(
      cacheModule.rotateRefreshToken,
    );
    expect(redisReexport.revokeRefreshToken).toBe(
      cacheModule.revokeRefreshToken,
    );
    expect(redisReexport.markOrgSetupComplete).toBe(
      cacheModule.markOrgSetupComplete,
    );
  });
});
