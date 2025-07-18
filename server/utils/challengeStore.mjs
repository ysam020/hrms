// server/utils/challengeStore.mjs - Redis Implementation
import Redis from "ioredis";

// Create Redis client (adjust config based on your Redis setup)
const redis = new Redis({
  host: process.env.REDIS_HOST || "localhost",
  port: process.env.REDIS_PORT || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: process.env.REDIS_DB || 0,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  lazyConnect: true,
});

export async function storeChallenge(username, challenge) {
  try {
    const key = `webauthn:challenge:${username}`;
    const ttl = 300; // 5 minutes in seconds

    await redis.setex(key, ttl, challenge);

    // Verify it was stored
    await redis.get(key);
    await redis.ttl(key);

    return challenge;
  } catch (error) {
    console.error("Error storing challenge in Redis:", error);
    throw new Error(`Failed to store challenge: ${error.message}`);
  }
}

export async function getAndDeleteChallenge(username) {
  try {
    const key = `webauthn:challenge:${username}`;

    // Get all challenge keys for debugging
    const allKeys = await redis.keys("webauthn:challenge:*");

    // Use Redis pipeline for atomic get-and-delete
    const pipeline = redis.pipeline();
    pipeline.get(key);
    pipeline.del(key);

    const results = await pipeline.exec();

    if (!results) {
      return null;
    }

    const [getResult, delResult] = results;
    const challenge = getResult[1]; // [error, result] format
    const deleteCount = delResult[1];

    if (!challenge) {
      return null;
    }

    return challenge;
  } catch (error) {
    console.error("Error retrieving challenge from Redis:", error);
    throw new Error(`Failed to retrieve challenge: ${error.message}`);
  }
}

// Graceful shutdown
export async function closeChallengeStore() {
  try {
    await redis.quit();
  } catch (error) {
    console.error("Error closing Redis connection:", error);
  }
}

export async function storeVerificationResult(username, result) {
  try {
    const key = `webauthn:verified:${username}`;
    const ttl = 60; // 1 minute - short TTL for security

    await redis.setex(key, ttl, JSON.stringify(result));

    return result;
  } catch (error) {
    throw error;
  }
}

export async function getAndDeleteVerificationResult(username) {
  try {
    const key = `webauthn:verified:${username}`;

    // Use Lua script for atomic get-and-delete
    const luaScript = `
      local result = redis.call('GET', KEYS[1])
      if result then
        redis.call('DEL', KEYS[1])
        return result
      else
        return nil
      end
    `;

    const result = await redis.eval(luaScript, 1, key);

    if (result) {
      return JSON.parse(result);
    }

    return null;
  } catch (error) {
    console.error("Error retrieving verification result:", error);
    return null;
  }
}

export { redis };
