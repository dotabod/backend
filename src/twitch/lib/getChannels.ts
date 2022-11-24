import { prisma } from '../../db/prisma'

export async function getChannels() {
  console.log('[TWITCHSETUP] Running getChannels')

  if (process.env.NODE_ENV === 'development') {
    return process.env.DEV_CHANNELS?.split(',') ?? []
  }

  return prisma.user
    .findMany({ select: { name: true } })
    .then((users) => users.map((user) => user.name))
}
