import './events/gsiEventLoader.js'

import RedisClient from '../db/redis.js'
import GSIServer from './GSIServer.js'

// Here's where we force wait for the redis to connect before starting the server
const redisClient = RedisClient.getInstance()
await redisClient.connectClient()
await redisClient.connectSubscriber()

// Then set up the dota gsi server & websocket server
export const server = new GSIServer()
