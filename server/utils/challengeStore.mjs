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

// Handle Redis connection events
redis.on("connect", () => {
  console.log("✅ Redis connected for WebAuthn challenges");
});

redis.on("error", (err) => {
  console.error("❌ Redis connection error:", err);
});

export async function storeChallenge(username, challenge) {
  try {
    const key = `webauthn:challenge:${username}`;
    const ttl = 300; // 5 minutes in seconds

    await redis.setex(key, ttl, challenge);

    console.log(`🔑 CHALLENGE STORED IN REDIS:`);
    console.log(`   Username: "${username}"`);
    console.log(`   Key: "${key}"`);
    console.log(`   Challenge: "${challenge}"`);
    console.log(`   TTL: ${ttl} seconds`);

    // Verify it was stored
    const storedValue = await redis.get(key);
    const remainingTTL = await redis.ttl(key);
    console.log(`   Verification - Stored: "${storedValue}"`);
    console.log(`   Verification - TTL: ${remainingTTL} seconds`);

    return challenge;
  } catch (error) {
    console.error("❌ Error storing challenge in Redis:", error);
    throw new Error(`Failed to store challenge: ${error.message}`);
  }
}

export async function getAndDeleteChallenge(username) {
  try {
    const key = `webauthn:challenge:${username}`;

    console.log(`🔍 CHALLENGE LOOKUP FROM REDIS:`);
    console.log(`   Username: "${username}"`);
    console.log(`   Key: "${key}"`);

    // Get all challenge keys for debugging
    const allKeys = await redis.keys("webauthn:challenge:*");
    console.log(`   All challenge keys in Redis: [${allKeys.join(", ")}]`);

    // Use Redis pipeline for atomic get-and-delete
    const pipeline = redis.pipeline();
    pipeline.get(key);
    pipeline.del(key);

    const results = await pipeline.exec();

    if (!results) {
      console.log(`❌ Pipeline execution failed`);
      return null;
    }

    const [getResult, delResult] = results;
    const challenge = getResult[1]; // [error, result] format
    const deleteCount = delResult[1];

    console.log(`   Get result: "${challenge}"`);
    console.log(`   Delete count: ${deleteCount}`);

    if (!challenge) {
      console.log(`❌ No challenge found for key: "${key}"`);
      return null;
    }

    console.log(`✅ Challenge found and deleted: "${challenge}"`);
    return challenge;
  } catch (error) {
    console.error("❌ Error retrieving challenge from Redis:", error);
    throw new Error(`Failed to retrieve challenge: ${error.message}`);
  }
}

// Debug function to see all stored challenges
export async function debugChallenges() {
  try {
    const keys = await redis.keys("webauthn:challenge:*");
    console.log(`📊 DEBUG CHALLENGES IN REDIS:`);
    console.log(`   Total keys: ${keys.length}`);

    if (keys.length > 0) {
      // Get all values in parallel
      const pipeline = redis.pipeline();
      keys.forEach((key) => {
        pipeline.get(key);
        pipeline.ttl(key);
      });

      const results = await pipeline.exec();

      for (let i = 0; i < keys.length; i++) {
        const key = keys[i];
        const value = results[i * 2][1]; // Get result
        const ttl = results[i * 2 + 1][1]; // TTL result
        const username = key.replace("webauthn:challenge:", "");

        console.log(`   ${username}: ${value} (TTL: ${ttl}s)`);
      }
    }
  } catch (error) {
    console.error("❌ Error debugging challenges:", error);
  }
}

// Cleanup function (optional - Redis TTL handles this automatically)
export async function cleanupExpiredChallenges() {
  try {
    const keys = await redis.keys("webauthn:challenge:*");
    let cleanedCount = 0;

    for (const key of keys) {
      const ttl = await redis.ttl(key);
      if (ttl === -1) {
        // Key exists but has no TTL (shouldn't happen but safety check)
        await redis.del(key);
        cleanedCount++;
        console.log(`🧹 Cleaned up challenge key without TTL: ${key}`);
      }
    }

    if (cleanedCount > 0) {
      console.log(`🧹 Cleaned up ${cleanedCount} expired challenge keys`);
    }

    return cleanedCount;
  } catch (error) {
    console.error("❌ Error cleaning up challenges:", error);
    return 0;
  }
}

// Graceful shutdown
export async function closeChallengeStore() {
  try {
    await redis.quit();
    console.log("✅ Redis connection closed gracefully");
  } catch (error) {
    console.error("❌ Error closing Redis connection:", error);
  }
}

export async function storeVerificationResult(username, result) {
  try {
    const key = `webauthn:verified:${username}`;
    const ttl = 60; // 1 minute - short TTL for security

    await redis.setex(key, ttl, JSON.stringify(result));
    console.log(`🔒 Verification result stored for: "${username}"`);

    return result;
  } catch (error) {
    console.error("❌ Error storing verification result:", error);
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
      console.log(`✅ Verification result retrieved for: "${username}"`);
      return JSON.parse(result);
    }

    console.log(`❌ No verification result found for: "${username}"`);
    return null;
  } catch (error) {
    console.error("❌ Error retrieving verification result:", error);
    return null;
  }
}

// Export redis client for other potential uses
export { redis };
