import './events/gsiEventLoader.js'

import GSIServer from './GSIServer.js'

// Here's where we force wait for the redis to connect before starting the server
// Server depends on redis to be alive
// const redisClient = RedisClient.getInstance()
// await redisClient.connectClient()
// await redisClient.connectSubscriber()

// Then setup the dota gsi server & websocket server
export const server = new GSIServer()
