import { prisma } from '../../db/prisma.js'

const dev_channelids = process.env.DEV_CHANNELIDS?.split(',') ?? []
export async function getAccountIds() {
  console.log('[TWITCHSETUP] Running getAccountIds')

  if (process.env.NODE_ENV === 'development') {
    if (!dev_channelids.length) throw new Error('Missing DEV_CHANNELIDS')
    return dev_channelids
  }

  return prisma.account
    .findMany({
      select: { providerAccountId: true },
      where: {
        NOT: {
          providerAccountId: {
            in: dev_channelids,
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
