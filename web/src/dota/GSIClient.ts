import RedisClient from '../db/redis.js'
import { Packet } from '../types.js'
const { client: redis } = RedisClient.getInstance()

export class GSIClient {
  auth: { token: string }
  token: string
  gsi?: Packet

  constructor(auth: { token: string }) {
    this.auth = auth
    this.token = auth.token
  }

  public emit = (event: string, data: any) => {
    void redis.publish(`gsievents:${this.token}:${event}`, JSON.stringify(data))
  }
}
