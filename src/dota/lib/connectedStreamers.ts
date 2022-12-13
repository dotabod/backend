import RedisClient from '../../db/redis.js'
import { SocketClient } from '../../types.js'

const { client } = RedisClient.getInstance()

// await redis.set('key', '$', { test: 'values' })

export default async function findUser(token?: string) {
  if (!token) return null

  const user = (await client.json.get(`users:${token}`)) as unknown as SocketClient
  return user
}

export async function findUserByTwitchId(twitchId: string) {
  if (!twitchId) return null

  const doc = await client.ft.search(`idx:users`, `@twitchId:(${twitchId})`)
  if (!doc.total) return null
  const user = doc.documents[0].value as unknown as SocketClient
  return user
}

export async function findUserByName(name: string) {
  if (!name) return null

  // TODO: check lowercase name if needed
  const doc = await client.ft.search(`idx:users`, `@name:(${name})`)
  if (!doc.total) return null
  const user = doc.documents[0].value as unknown as SocketClient
  return user
}
