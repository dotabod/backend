import { prisma } from '../../db/prisma.js'

export async function getChannels() {
  console.log('[TWITCHSETUP] Running getChannels in chat listener')

  if (process.env.NODE_ENV === 'development') {
    const users = prisma.user
      .findMany({
        select: { settings: true, name: true },
        where: {
          name: {
            in: process.env.DEV_CHANNELS?.split(',') ?? [],
          },
          settings: {
            none: {
              key: 'commandDisable',
              value: {
                equals: true,
              },
            },
          },
        },
        orderBy: {
          followers: 'desc',
        },
      })
      .then((users) => users.map((user) => user.name))

    return users ?? []
  }

  return prisma.user
    .findMany({
      select: { settings: true, name: true },
      where: {
        NOT: {
          name: {
            in: process.env.DEV_CHANNELS?.split(',') ?? [],
          },
        },
      },
      orderBy: {
        followers: 'desc',
      },
    })
    .then((users) => users.map((user) => user.name))
}
