import { prisma } from './db/prisma.js'
import { SubscribeEvents } from './SubscribeEvents.js'
import BotAPI from './twitch/lib/BotApiSingleton.js'

const botApi = BotAPI.getInstance()
export async function handleNewUser(providerAccountId: string) {
  console.log("[TWITCHEVENTS] New user, let's get their info", { userId: providerAccountId })

  if (!providerAccountId) {
    console.log("[TWITCHEVENTS] This should never happen, user doesn't have a providerAccountId", {
      providerAccountId,
    })
    return
  }

  try {
    const stream = await botApi.streams.getStreamByUserId(providerAccountId)
    const streamer = await botApi.users.getUserById(providerAccountId)
    const follows = botApi.users.getFollowsPaginated({
      followedUser: providerAccountId,
    })
    const totalFollowerCount = await follows.getTotalCount()

    const data = {
      displayName: streamer?.displayName,
      name: streamer?.name,
      followers: totalFollowerCount,
      stream_online: !!stream?.startDate,
      stream_start_date: stream?.startDate ?? null,
    }

    // remove falsy values from data (like displayName: undefined)
    const filteredData = Object.fromEntries(
      Object.entries(data).filter(([key, value]) => Boolean(value)),
    )

    prisma.account
      .update({
        data: {
          user: {
            update: filteredData,
          },
        },
        where: {
          provider_providerAccountId: {
            provider: 'twitch',
            providerAccountId: providerAccountId,
          },
        },
      })
      .then(() => {
        console.log('[TWITCHEVENTS] updated user info for', providerAccountId)
      })
      .catch((e) => {
        console.log('[TWITCHEVENTS] error saving new user info for', {
          e,
          providerAccountId: e.broadcasterId,
        })
      })
  } catch (e) {
    console.log('[TWITCHEVENTS] error on getStreamByUserId', { e })
  }

  try {
    SubscribeEvents([providerAccountId])
  } catch (e) {
    console.log('[TWITCHEVENTS] error on handlenewuser', { e })
  }
}
