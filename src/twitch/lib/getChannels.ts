import { prisma } from '../../db/prisma.js'

export async function getChannels() {
  console.log('[TWITCHSETUP] Running getChannels')

  if (process.env.NODE_ENV === 'development') {
    return process.env.DEV_CHANNELS?.split(',') ?? []
  }

  return prisma.user
    .findMany({
      select: { name: true },
      where: {
        NOT: {
          name: {
            in: process.env.DEV_CHANNELS?.split(',') ?? [],
          },
        },
      },
    })
    .then((users) => users.map((user) => user.name))
}
