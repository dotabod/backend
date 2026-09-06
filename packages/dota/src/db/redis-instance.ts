import RedisClient from './redis-client'

// Singleton instance of RedisClient
export const redisClient = RedisClient.getInstance()
