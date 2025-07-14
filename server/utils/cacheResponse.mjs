import redisClient from "../config/redisConfig.mjs";

export const cacheResponse = async (cacheKey, data) => {
  await redisClient.set(cacheKey, JSON.stringify(data), "EX", 3600);
};

export const getCachedData = async (cacheKey) => {
  const cachedData = await redisClient.get(cacheKey);
  return cachedData ? JSON.parse(cachedData) : null;
};
