import { prisma } from '../db/prisma.js'
import { getBotAPI } from '../twitch/lib/getBotAPI.js'

async function updateFollows(userId: string, providerAccountId: string) {
  console.log('Updating follows for', userId)

  const twitchApi = getBotAPI()
  const follows = twitchApi.users.getFollowsPaginated({
    followedUser: providerAccountId,
  })
  const totalFollowerCount = await follows.getTotalCount()
  await prisma.user.update({
    where: {
      id: userId,
    },
    data: {
      followers: totalFollowerCount,
    },
  })
}

export async function updateFollowsForAll() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      Account: {
        select: {
          providerAccountId: true,
        },
      },
    },
    where: {
      followers: null,
    },
  })

  for (const user of users) {
    if (!user.Account?.providerAccountId) continue
    await updateFollows(user.id, user.Account.providerAccountId)
  }
}

export async function updateFollowForUser(userId: string) {
  const user = await prisma.user.findFirst({
    select: {
      id: true,
      Account: {
        select: {
          providerAccountId: true,
        },
      },
    },
    where: {
      id: userId,
    },
  })

  if (!user?.Account?.providerAccountId) return
  await updateFollows(user.id, user.Account.providerAccountId)
}
