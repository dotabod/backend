import { prisma } from '../db/prisma.js'
import { getBotAPI } from '../twitch/lib/getBotAPI.js'

export async function updateUsernameForId(userId: string) {
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

  if (!user?.Account?.providerAccountId) return null
  const providerId = user.Account.providerAccountId

  const twitchApi = getBotAPI()
  const twitchUser = await twitchApi.users.getUserById(providerId)

  if (!twitchUser?.name || !twitchUser.displayName) return null

  console.log('updating', twitchUser.name, twitchUser.displayName)
  await prisma.account.update({
    where: {
      provider_providerAccountId: {
        provider: 'twitch',
        providerAccountId: twitchUser.id,
      },
    },
    data: {
      user: {
        update: {
          displayName: twitchUser.displayName,
          name: twitchUser.name,
        },
      },
    },
  })

  return twitchUser.name as string
}
