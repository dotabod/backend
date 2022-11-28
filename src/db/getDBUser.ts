import { prisma } from './prisma'

export default async function getDBUser(token: string) {
  return await prisma.user
    .findFirst({
      select: {
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
