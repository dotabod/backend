import { prisma } from './prisma'

export async function getUserByTwitchId(twitchId?: string | null) {
  if (!twitchId) return null
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
      },
    })
    .catch((e) => {
      console.log('[USER]', 'Error checking auth', { twitchId, e })
      return null
    })
}

export default async function getDBUser(token: string) {
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
        id: token,
      },
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
