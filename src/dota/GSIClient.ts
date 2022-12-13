import RedisClient from '../db/redis.js'
import { Packet } from '../types.js'
const { client: redis } = RedisClient.getInstance()

export class GSIClient {
  ip: string
  auth: { token: string }
  token: string
  gsi?: Packet

  constructor(ip: string, auth: { token: string }) {
    this.ip = ip
    this.auth = auth
    this.token = auth.token
  }

  public emit = (event: string, data: any) => {
    void redis.publish(`gsievents:${this.token}:${event}`, JSON.stringify(data))
  }
}
