import { EventSubHttpListener } from '@twurple/eventsub-http'

import supabase from './db/supabase.js'
import { SubscribeEvents } from './SubscribeEvents.js'
import BotAPI from './twitch/lib/BotApiSingleton.js'

const botApi = BotAPI.getInstance()
export async function handleNewUser(providerAccountId: string, listener: EventSubHttpListener) {
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

    await supabase
      .from('users')
      .update(filteredData as typeof data)
      .eq('accounts.providerAccountId', providerAccountId)
  } catch (e) {
    console.log('[TWITCHEVENTS] error on getStreamByUserId', { e })
  }

  try {
    SubscribeEvents([providerAccountId], listener)
  } catch (e) {
    console.log('[TWITCHEVENTS] error on handlenewuser', { e })
  }
}
