import RedisClient from '../../db/redis.js'
import { SocketClient } from '../../types.js'

const { client: redis } = RedisClient.getInstance()

export default async function findUser(token?: string) {
  if (!token) return null

  const user = (await redis.json.get(`users:${token}`)) as unknown as SocketClient
  return user
}

export async function findUserByTwitchId(twitchId: string) {
  if (!twitchId) return null

  const doc = await redis.ft.search(`idx:users`, `@twitchId:(${twitchId})`)
  if (!doc.total) return null
  const user = doc.documents[0].value as unknown as SocketClient
  return user
}
