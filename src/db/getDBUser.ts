import findUser, { findUserByTwitchId } from '../dota/lib/connectedStreamers.js'
import { SocketClient } from '../types.js'
import { prisma } from './prisma.js'
import RedisClient from './redis.js'

const { client: redis } = RedisClient.getInstance()

export const invalidTokens = new Set()

export default async function getDBUser(token?: string, twitchId?: string) {
  if (invalidTokens.has(token || twitchId)) return null

  // Cache check
  if (token) {
    const client = await findUser(token)
    if (client) return client
  }

  // Cache check
  if (twitchId) {
    const client = await findUserByTwitchId(twitchId)
    if (client) return client
  }

  console.log('[GSI]', 'Havent cached user token yet, checking db', { token: token ?? twitchId })

  return await prisma.user
    .findFirst({
      select: {
        settings: {
          select: {
            key: true,
            value: true,
          },
        },
        Account: {
          select: {
            refresh_token: true,
            access_token: true,
            providerAccountId: true,
          },
        },
        SteamAccount: {
          select: {
            mmr: true,
            steam32Id: true,
            name: true,
          },
        },
        id: true,
        name: true,
        mmr: true,
        steam32Id: true,
      },
      where: {
        Account: {
          providerAccountId: twitchId,
        },
        id: token,
      },
    })
    .then(async (user) => {
      if (!user?.id) {
        console.log('Invalid token', { token })
        invalidTokens.add(token)
        return null
      }

      const client = await findUser(user.id)
      if (client) return client

      const theUser = {
        ...user,
        mmr: user.mmr || user.SteamAccount[0]?.mmr,
        steam32Id: user.steam32Id ?? user.SteamAccount[0]?.steam32Id,
        token: user.id,
      }

      await redis.json.set(
        `users:${user.id}`,
        '$',
        theUser as typeof theUser & {
          settings: { key: string; value: string | boolean }[]
        },
      )

      return theUser as SocketClient
    })
    .catch((e) => {
      console.log('[USER]', 'Error checking auth', { token, e })
      return null
    })
}

export async function getSteamByTwitchId(twitchId: string) {
  return await prisma.user
    .findFirst({
      select: {
        SteamAccount: {
          select: {
            mmr: true,
            steam32Id: true,
            name: true,
          },
        },
      },
      where: {
        Account: {
          providerAccountId: twitchId,
        },
      },
    })
    .catch((e) => {
      console.log('[USER]', 'Error checking auth', { twitchId, e })
      return null
    })
}
