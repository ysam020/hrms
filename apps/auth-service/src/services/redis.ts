// Refresh-token storage and the shared Redis client now live in @hrms/cache
// so api-gateway and auth-service can't drift into two independently
// hand-copied implementations again (see packages/cache/src/refreshTokenStore.ts).
// Re-exported here so existing imports (`from "../services/redis"`) don't
// need to change across every handler in this service.
export {
  getRedisClient,
  storeRefreshToken,
  rotateRefreshToken,
  revokeRefreshToken,
  markOrgSetupComplete,
  type RefreshTokenMeta,
  type TokenValidation,
} from "@hrms/cache";
