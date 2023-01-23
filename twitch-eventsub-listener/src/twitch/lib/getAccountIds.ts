import { prisma } from '../../db/prisma.js'

export async function getAccountIds() {
  console.log('[TWITCHSETUP] Running getAccountIds')

  if (process.env.NODE_ENV === 'development') {
    if (!process.env.DEV_CHANNELS?.split(',').length) throw new Error('Missing DEV_CHANNELS')

    return prisma.account
      .findMany({
        select: { providerAccountId: true },
        where: {
          user: {
            name: {
              in: process.env.DEV_CHANNELS.split(',') ?? [],
            },
          },
        },
      })
      .then((users) => users.map((user) => user.providerAccountId))
  }

  return prisma.account
    .findMany({
      select: { providerAccountId: true },
      where: {
        NOT: {
          user: {
            name: {
              in: process.env.DEV_CHANNELS?.split(',') ?? [],
            },
          },
        },
      },
      orderBy: {
        user: {
          followers: 'desc',
        },
      },
    })
    .then((users) => users.map((user) => user.providerAccountId))
}
