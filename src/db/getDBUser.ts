import findUser, { findUserByTwitchId } from '../dota/lib/connectedStreamers'
import { socketClients } from '../dota/lib/consts'
import { prisma } from './prisma'

export const invalidTokens = new Set()

export default async function getDBUser(token?: string, twitchId?: string) {
  if (invalidTokens.has(token || twitchId)) return null

  if (token) {
    const client = findUser(token || twitchId)
    if (client) return client
  }

  if (twitchId) {
    const client = findUserByTwitchId(twitchId)
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
    .then((user) => {
      if (!user?.id) {
        console.log('Invalid token', { token })
        invalidTokens.add(token)
        return null
      }

      const client = findUser(user.id)
      if (client) return client

      const arrayLength = socketClients.push({
        ...user,
        mmr: user.mmr || user.SteamAccount[0]?.mmr,
        steam32Id: user.steam32Id ?? user.SteamAccount[0]?.steam32Id,
        token: user.id,
        // sockets[] to be filled in by socket connection, so will steamid
        sockets: [],
      })

      return socketClients[arrayLength - 1]
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
